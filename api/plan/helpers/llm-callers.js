// --- api/plan/helpers/llm-callers.js ---
// Extracted from generate-full-plan.js (refactor-only, no logic changes)
// Contains: MEAL_PLANNER_SYSTEM_PROMPT, tryGenerateLLMPlan, generateMealPlan_Single, generateGroceryQueries_Batched

const {
    CACHE_PREFIX, TTL_PLAN_MS,
    PLAN_MODEL_NAME_PRIMARY, PLAN_MODEL_NAME_FALLBACK,
} = require('./config');
const { cacheGet, cacheSet, hashString } = require('./cache');
const { fetchLLMWithRetry } = require('./http');
const { normalizeStateHintForItem } = require('./market-helpers');

// Import LLM provider utilities
let buildLLMRequest, parseLLMResponse, detectProvider, validateChefRecipeShape;
try {
    ({ buildLLMRequest, parseLLMResponse, detectProvider, validateChefRecipeShape } = require('../../utils/llm-provider.js'));
} catch (e) {
    try {
        ({ buildLLMRequest, parseLLMResponse, detectProvider, validateChefRecipeShape } = require('../../../utils/llm-provider.js'));
    } catch (e2) {
        console.error("CRITICAL: Failed to import llm-provider in llm-callers.js.", e2.message);
    }
}

// Import grocery matching integrations
let cleanIngredientBatch, ENHANCED_GROCERY_PROMPT;
try {
    ({ cleanIngredientBatch } = require('../../utils/ingredient-query-cleaner'));
    ({ GROCERY_OPTIMIZER_SYSTEM_PROMPT: ENHANCED_GROCERY_PROMPT } = require('../../utils/grocery-prompts'));
} catch (e) {
    try {
        ({ cleanIngredientBatch } = require('../../../utils/ingredient-query-cleaner'));
        ({ GROCERY_OPTIMIZER_SYSTEM_PROMPT: ENHANCED_GROCERY_PROMPT } = require('../../../utils/grocery-prompts'));
    } catch (e2) {
        console.error("CRITICAL: Failed to import grocery matching utils in llm-callers.js.", e2.message);
    }
}


/// ===== API-CALLERS-START ===== \\

// --- LLM System Prompt (Step A1, A2, A3) ---
const MEAL_PLANNER_SYSTEM_PROMPT = (weight, calories, mealMax, day, perMealTargets) => `
You are an expert dietitian. Your SOLE task is to generate the \`meals\` for ONE day (Day ${day}).
RULES:
1.  Generate meals ('meals') & items ('items') used TODAY.
2.  **CRITICAL PROTEIN CAP: Never exceed 3 g/kg total daily protein (User weight: ${weight}kg).**
3.  MEAL PORTIONS: For each meal, populate 'items' with:
    a) 'key': (string) The generic ingredient name.
    b) 'qty_value': (number) The EXACT amount of ingredient. Use realistic household portions.
    c) 'qty_unit': (string) The unit of measurement (must be one of: g, ml, tsp, tbsp, cup, slice, piece, fillet, breast, thigh, egg, rasher, clove).
    d) 'stateHint': (string) One of 'raw', 'cooked', 'dry', 'as_pack'. Default 'raw' for meats, 'dry' for grains/pasta, 'as_pack' for dairy/bread.
    e) 'methodHint': (string|null) Cooking method if relevant (e.g., 'boiled', 'fried', 'baked', 'grilled'). null if eaten raw or as-is.
4.  MEAL TYPES: Use 'B' for breakfast, 'L' for lunch, 'D' for dinner, 'S1'/'S2' for snacks.
5.  Give each meal a 'name': e.g., "Grilled Chicken Salad".
6.  ITEM KEYS must be generic ingredient names (e.g., "chicken breast", "brown rice", "olive oil").
7.  ${perMealTargets ? `PER MAIN MEAL targets: ~${Math.round(perMealTargets.main.calories)} kcal, ~${Math.round(perMealTargets.main.protein)}g protein. PER SNACK targets: ~${Math.round(perMealTargets.snack.calories)} kcal, ~${Math.round(perMealTargets.snack.protein)}g protein.` : `Target ~${calories} kcal total.`}
ABSOLUTELY NO PROSE OR MARKDOWN.

JSON Structure:
{
  "meals": [
    {
      "type": "string",
      "name": "string",
      "items": [
        {
          "key": "string",
          "qty_value": number,
          "qty_unit": "string",
          "stateHint": "string",
          "methodHint": "string|null"
        }
      ]
    }
  ]
}
`;
// --- [END MODIFICATION] ---


// --- tryGenerateLLMPlan (Rewritten V4) ---
async function tryGenerateLLMPlan(modelName, payload, log, logPrefix, expectedJsonShape) {
    log(`${logPrefix}: Attempting model: ${modelName} (${detectProvider(modelName)})`, 'INFO', 'LLM');

    const req = buildLLMRequest(modelName, payload, { agentType: logPrefix.includes('Grocery') ? 'groceryQuery' : 'mealPlan' });

    const response = await fetchLLMWithRetry(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
    }, log, logPrefix);

    const result = await response.json();
    const { text: jsonText, finishReason } = parseLLMResponse(modelName, result);

    if (finishReason === 'MAX_TOKENS') {
        log(`${logPrefix}: Model ${modelName} failed with finishReason: MAX_TOKENS.`, 'WARN', 'LLM');
        throw new Error(`Model ${modelName} failed: MAX_TOKENS.`);
    }
    if (finishReason !== 'STOP') {
        log(`${logPrefix}: Model ${modelName} failed with non-STOP finishReason: ${finishReason}`, 'WARN', 'LLM', { result });
        throw new Error(`Model ${modelName} failed: FinishReason was ${finishReason}.`);
    }

    log(`${logPrefix} Raw JSON Text`, 'DEBUG', 'LLM', { raw: jsonText.substring(0, 300) + '...' });

    try {
        const parsed = JSON.parse(jsonText.trim());
        if (!parsed || typeof parsed !== 'object') throw new Error("Parsed response is not a valid object.");
        for (const key in expectedJsonShape) {
            if (!parsed.hasOwnProperty(key)) {
                throw new Error(`Parsed JSON missing required top-level key: '${key}'.`);
            }
            if (Array.isArray(expectedJsonShape[key]) && !Array.isArray(parsed[key])) {
                throw new Error(`Parsed JSON key '${key}' was not an array.`);
            }
        }
        log(`${logPrefix}: Model ${modelName} succeeded.`, 'SUCCESS', 'LLM');
        return parsed;
    } catch (parseError) {
        log(`Failed to parse/validate ${logPrefix} JSON from ${modelName}: ${parseError.message}`, 'CRITICAL', 'LLM', { jsonText: jsonText.substring(0, 300) });
        throw new Error(`Model ${modelName} failed: Invalid JSON response. ${parseError.message}`);
    }
}


/**
 * Generates a meal plan for a *single* day.
 * (Step A1, A4: Update signature and user query)
 */
async function generateMealPlan_Single(day, formData, nutritionalTargets, log, perMealTargets, primaryModel = PLAN_MODEL_NAME_PRIMARY, fallbackModel = PLAN_MODEL_NAME_FALLBACK) {
    const { name, height, weight, age, gender, goal, dietary, store, eatingOccasions, costPriority, mealVariety, cuisine } = formData;
    const { calories, protein, fat, carbs } = nutritionalTargets;
    
    const mainMealCal = Math.round(perMealTargets.main.calories);
    const mainMealP = Math.round(perMealTargets.main.protein);
    const snackCal = Math.round(perMealTargets.snack.calories);
    const snackP = Math.round(perMealTargets.snack.protein);

    // Change 2.11: Removed plan caching
    // const profileHash = hashString(JSON.stringify({ formData, nutritionalTargets, perMealTargets })); 
    // const cacheKey = `${CACHE_PREFIX}:meals:day${day}:${profileHash}`;
    // const cached = await cacheGet(cacheKey, log);
    // if (cached) return { dayNumber: day, meals: cached.meals }; 
    // log(`Cache MISS for key: ${cacheKey.split(':').pop()}`, 'INFO', 'CACHE');

    // 2. Prepare Prompt
    const mealTypesMap = {'3':['B','L','D'],'4':['B','L','D','S1'],'5':['B','L','D','S1','S2']};
    const requiredMeals = mealTypesMap[eatingOccasions]||mealTypesMap['3'];
    const cuisineInstruction = cuisine && cuisine.trim() ? `Focus: ${cuisine}.` : 'Neutral.';

    // Removed outdated mealAvg/mealMax calculation

    const systemPrompt = MEAL_PLANNER_SYSTEM_PROMPT(weight, calories, 0, day, perMealTargets); // mealMax parameter is now obsolete, passed 0
    let userQuery = `Gen plan Day ${day} for ${name||'Guest'}. Profile: ${age}yo ${gender}, ${height}cm, ${weight}kg. Act: ${formData.activityLevel}. Goal: ${goal}. Store: ${store}. Day ${day} Targets: DAILY ~${calories} kcal. PER MAIN MEAL: ~${mainMealCal} kcal, ~${mainMealP}g protein. PER SNACK: ~${snackCal} kcal, ~${snackP}g protein. Dietary: ${dietary}. Meals: ${eatingOccasions} (${Array.isArray(requiredMeals) ? requiredMeals.join(', ') : '3 meals'}). Spend: ${costPriority}. Cuisine: ${cuisineInstruction}.`;

    const logPrefix = `MealPlannerDay${day}`;
    log(`Meal Planner AI Prompt for Day ${day}`, 'INFO', 'LLM_PROMPT', {
        systemPromptStart: systemPrompt.substring(0, 200) + '...',
        userQuery: userQuery,
        targets: nutritionalTargets,
    });

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            temperature: 0.3, topK: 32, topP: 0.9, responseMimeType: "application/json",
        }
    };
    const expectedShape = { "meals": [] };
    
    // 3. Execute LLM Call (Change 2.6: Added Fallback)
    let parsedResult;
    try {
        parsedResult = await tryGenerateLLMPlan(primaryModel, payload, log, logPrefix, expectedShape);
    } catch (primaryError) {
        log(`${logPrefix}: Primary model ${primaryModel} failed: ${primaryError.message}. Falling back to ${fallbackModel}.`, 'WARN', 'LLM_FALLBACK');
        try {
            parsedResult = await tryGenerateLLMPlan(fallbackModel, payload, log, logPrefix, expectedShape);
        } catch (fallbackError) {
            log(`${logPrefix}: Fallback model ${fallbackModel} also failed: ${fallbackError.message}.`, 'CRITICAL', 'LLM');
            throw new Error(`Meal Plan generation failed for Day ${day}: All models failed. Last error: ${fallbackError.message}`);
        }
    }
    
    // Change 2.11: Removed plan caching
    // if (parsedResult && parsedResult.meals && parsedResult.meals.length > 0) {
    //     await cacheSet(cacheKey, parsedResult, TTL_PLAN_MS, log);
    // }
    return { dayNumber: day, meals: parsedResult.meals || [] };
}


/**
 * Generates grocery query details for the *entire* aggregated list.
 */
// --- [MODIFIED V13.1] Added Preprocessing & Enhanced Prompt ---
async function generateGroceryQueries_Batched(aggregatedIngredients, store, log, primaryModel = PLAN_MODEL_NAME_PRIMARY, fallbackModel = PLAN_MODEL_NAME_FALLBACK) {
    if (!aggregatedIngredients || aggregatedIngredients.length === 0) {
        log("generateGroceryQueries_Batched called with no ingredients. Returning empty.", 'WARN', 'LLM');
        return { ingredients: [] };
    }

    // 1. Check Cache
    // Change 2.13: Keep ingredient-level caching
    const keysHash = hashString(JSON.stringify(aggregatedIngredients));
    const cacheKey = `${CACHE_PREFIX}:queries-batched:${store}:${keysHash}`;
    const cached = await cacheGet(cacheKey, log);
    if (cached) return cached;
    log(`Cache MISS for key: ${cacheKey.split(':').pop()}`, 'INFO', 'CACHE');
    
    // PREPROCESSING (V13.1)
    const preprocessedIngredients = cleanIngredientBatch(aggregatedIngredients);
    const llmInput = preprocessedIngredients.map(item => ({
        originalIngredient: item.originalIngredient,
        cleanName: item._cleanName,
        requested_total_g: item.requested_total_g,
        _autoNegatives: item._autoNegatives
    }));

    // 2. Prepare Prompt
    const isAustralianStore = (store === 'Coles' || store === 'Woolworths');
    const australianTermNote = isAustralianStore ? " Use common Australian terms (e.g., 'spring onion', 'capsicum')." : "";

    // Use ENHANCED_GROCERY_PROMPT imported from utils
    const systemPrompt = ENHANCED_GROCERY_PROMPT(store, australianTermNote);
    
    // Update userQuery to tell LLM to use cleanName
    let userQuery = `Generate query JSON for the following ingredients.
Use "cleanName" for generating queries, but set "originalIngredient" in the output to match the "originalIngredient" field exactly.
If "_autoNegatives" are provided, incorporate them into "negativeKeywords".
\n${JSON.stringify(llmInput)}`;

    const logPrefix = `GroceryOptimizerFullPlan`;
    log(`Grocery Optimizer AI Prompt`, 'INFO', 'LLM_PROMPT', {
        systemPromptStart: systemPrompt.substring(0, 200) + '...',
        userQuery: userQuery,
    });

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            temperature: 0.05, topK: 20, topP: 0.85, responseMimeType: "application/json",
        }
    };
    const expectedShape = { "ingredients": [] };

    // 3. Execute LLM Call (V3.1: GPT-5.1 primary with fallback)
    let parsedResult;
    try {
        parsedResult = await tryGenerateLLMPlan(primaryModel, payload, log, logPrefix, expectedShape);
    } catch (primaryError) {
        if (fallbackModel) {
            log(`${logPrefix}: Primary model ${primaryModel} failed: ${primaryError.message}. Falling back to ${fallbackModel}.`, 'WARN', 'LLM_FALLBACK');
            try {
                parsedResult = await tryGenerateLLMPlan(fallbackModel, payload, log, logPrefix, expectedShape);
            } catch (fallbackError) {
                log(`${logPrefix}: Fallback model ${fallbackModel} also failed: ${fallbackError.message}.`, 'CRITICAL', 'LLM');
                throw new Error(`Grocery Query generation failed: All models failed. Last error: ${fallbackError.message}`);
            }
        } else {
            log(`${logPrefix}: ${primaryModel} failed: ${primaryError.message}. No fallback configured.`, 'CRITICAL', 'LLM');
            throw new Error(`Grocery Query generation failed: ${primaryModel} failed. ${primaryError.message}`);
        }
    }
    
    // 4. Post-process and Cache
    if (parsedResult && parsedResult.ingredients && parsedResult.ingredients.length > 0) {
        // --- Sanity Check & Fix ---
        // The LLM sometimes ignores the 'totalGramsRequired' from the prompt.
        // We must overwrite its estimate with our *actual* aggregated total.
        const inputMap = new Map(aggregatedIngredients.map(item => [item.originalIngredient, item.requested_total_g]));
        parsedResult.ingredients.forEach(ing => {
            const requestedGrams = inputMap.get(ing.originalIngredient);
            if (requestedGrams && ing.totalGramsRequired !== requestedGrams) {
                log(`Grocery Optimizer mismatch for "${ing.originalIngredient}". LLM said ${ing.totalGramsRequired}g, actual is ${requestedGrams}g. Overwriting.`, 'WARN', 'LLM');
                ing.totalGramsRequired = requestedGrams;
            }
        });

        await cacheSet(cacheKey, parsedResult, TTL_PLAN_MS, log);
    }

    return parsedResult;
}

/// ===== API-CALLERS-END ===== ////

module.exports = {
    MEAL_PLANNER_SYSTEM_PROMPT,
    tryGenerateLLMPlan,
    generateMealPlan_Single,
    generateGroceryQueries_Batched,
};
