// --- Cheffy API: /api/plan/generate-full-plan.js ---
// [NEW] Hybrid Batched Orchestrator (V14.1 - Enhanced Grocery Matching)
// REFACTORED: Helper functions extracted to api/plan/helpers/
// Implements the "full plan" architecture:
// 1. Compute Targets (passed in)
// 2. Generate ALL meals
// 3. Aggregate/Dedupe ALL ingredients
// 4. Run ONE Market Run (Enhanced with V13.1 Grocery Matching)
// 5. [NEW] Separate Price Extraction (Mod Zone 3)
// 6. [NEW] Run ONE Ingredient-Centric Nutrition Fetch (Mod Zone 1 & 2)
// 7. Run Solver (V1) in SHADOW mode / Reconciler (V0) as LIVE path
// 8. Assemble and return

/// ===== IMPORTS-START ===== \\
const crypto = require('crypto');

// --- Helper modules (extracted from this file) ---
const {
    GEMINI_API_KEY, TRANSFORM_CONFIG_VERSION,
    USE_SOLVER_V1, ALLOW_PROTEIN_SCALING,
    PLAN_MODEL_NAME_PRIMARY, PLAN_MODEL_NAME_FALLBACK,
    PRIMARY_MODEL, FALLBACK_MODEL, SUPPORTED_MODELS,
    MARKET_RUN_CONCURRENCY, NUTRITION_CONCURRENCY,
    REQUIRED_WORD_SCORE_THRESHOLD, SKIP_STRONG_MATCH_THRESHOLD,
    PRICE_OUTLIER_Z_SCORE, PANTRY_CATEGORIES, MAX_CALORIES_PER_ITEM,
    FAIL_FAST_CATEGORIES,
    TOKEN_BUCKET_CAPACITY, TOKEN_BUCKET_REFILL_PER_SEC, TOKEN_BUCKET_MAX_WAIT_MS,
    MOCK_PRODUCT_TEMPLATE, MOCK_RECIPE_FALLBACK,
    CACHE_PREFIX, TTL_PLAN_MS,
} = require('./helpers/config');
const { cacheGet, cacheSet, hashString, setRunStatus, getRunStatus } = require('./helpers/cache');
const { createLogger } = require('./helpers/logger');
const { delay, getSanitizedFormData, concurrentlyMap } = require('./helpers/utils');
const { fetchLLMWithRetry } = require('./helpers/http');
const {
    calculateUnitPrice, parseSize, passRequiredWords, mean,
    normalizeStateHintForItem, synthTight, synthWide, passSimplePantryChecklist,
} = require('./helpers/market-helpers');
const { generateMealPlan_Single, generateGroceryQueries_Batched } = require('./helpers/llm-callers');

// --- External microservices ---
const { fetchPriceData } = require('../price-search.js');
// MOD ZONE 1.1: Import new ingredient-centric function
const { fetchNutritionData, lookupIngredientNutrition } = require('../nutrition-search.js');

// --- Import utils ---
// Note: Vercel bundles these relative to the project root, hence the `../`
try {
    var { normalizeKey } = require('../scripts/normalize.js');
    var { toAsSold, getAbsorbedOil, TRANSFORM_VERSION, normalizeToGramsOrMl } = require('../utils/transforms.js');
    var { reconcileNonProtein, reconcileMealLevel } = require('../utils/reconcileNonProtein.js'); // FIX: Import reconcileMealLevel
    // Change 2.1: Import LLM provider (Primary path)
    var { buildLLMRequest, parseLLMResponse, detectProvider, validateChefRecipeShape } = require('../utils/llm-provider.js');
} catch (e) {
    console.error("CRITICAL: Failed to import utils. Using local fallbacks.", e.message);
    var { normalizeKey } = require('../../scripts/normalize.js');
    var { toAsSold, getAbsorbedOil, TRANSFORM_VERSION, normalizeToGramsOrMl } = require('../../utils/transforms.js');
    var { reconcileNonProtein, reconcileMealLevel } = require('../../utils/reconcileNonProtein.js'); // FIX: Import reconcileMealLevel
    // Change 2.1: Import LLM provider (Fallback path)
    var { buildLLMRequest, parseLLMResponse, detectProvider, validateChefRecipeShape } = require('../../utils/llm-provider.js');
}

// --- [NEW] Import validation helper (Task 1) ---
const { validateDayPlan } = require('../../utils/validation');

// --- [NEW] Grocery Matching Integrations (V13.1) ---
// Preserved generateFallbackQueries from old preprocessor
const { generateFallbackQueries } = require('../../utils/ingredient-preprocessor');
const { cleanIngredientBatch } = require('../../utils/ingredient-query-cleaner');
const { runEnhancedChecklist } = require('../../utils/product-checker');
const { GROCERY_OPTIMIZER_SYSTEM_PROMPT: ENHANCED_GROCERY_PROMPT } = require('../../utils/grocery-prompts');

// --- [NEW] Match Tracing Integrations (V13.2) ---
const { createMatchTrace } = require('../../utils/product-match-logger');
const { tracedScoring } = require('../../utils/traced-scoring');

/// ===== IMPORTS-END ===== ////

/// ===== MAIN-HANDLER-START ===== \\

/**
 * Main Vercel Serverless Function Handler.
 * Orchestrates the full meal plan generation pipeline over SSE.
 */
module.exports = async function handler(request, response) {
    // --- SSE Setup ---
    const run_id = crypto.randomUUID();
    response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    const { log, getLogs, logErrorAndClose, sendFinalDataAndClose, sendEvent } = createLogger(run_id, response);

    // Timing metrics
    let dietitian_ms = 0, market_run_ms = 0, nutrition_ms = 0, solver_ms = 0;
    const dietitianStartTime = Date.now();

    // Track full meal plan across days
    const fullMealPlan = [];

    // We set a flag so the pipeline continues to run but
    // SSE writes are skipped (they already are via the writableEnded check
    // in writeSseEvent, but this avoids noisy error logs and lets us
    // update the KV status).
    let clientDisconnected = false;

    response.on('close', () => {
        if (!response.writableEnded) {
            clientDisconnected = true;
            console.log(`[SSE] Client disconnected for run ${run_id}. Pipeline will continue.`);
            // Update KV so the poller can distinguish "still running, client left"
            setRunStatus(run_id, 'running_detached', null, (...args) => {
                // Use a no-op SSE logger since the stream is dead
                console.log('[DETACHED]', args[0]);
            }).catch(() => {});
        }
    });

    // --- End SSE Setup ---

    log(`Plan generation request received.`, 'INFO', 'HTTP');

    // FIX (v2): Send run_id to the client immediately — before any processing.
    // This ensures the frontend can persist it to localStorage for recovery
    // even if the stream drops during the first few seconds.
    sendEvent('plan:start', { run_id });

    let finalMealPlan = []; // This will hold the final, processed meals
    let store = ''; // Must be defined outside try block for market run logic scope

    try {
        const { formData, nutritionalTargets, preferredModel } = request.body;
        const numDays = parseInt(formData.days, 10) || 7;

        // --- Model Selection: honour user's preferred model if valid ---
        let requestPrimary = PLAN_MODEL_NAME_PRIMARY;   // default from env / llm-provider
        let requestFallback = PLAN_MODEL_NAME_FALLBACK;
        if (preferredModel && typeof preferredModel === 'string') {
            if (SUPPORTED_MODELS && SUPPORTED_MODELS[preferredModel]) {
                requestPrimary = preferredModel;
                // Set fallback to the "other" model
                requestFallback = (preferredModel === PRIMARY_MODEL) ? FALLBACK_MODEL : PRIMARY_MODEL;
                log(`User selected model: ${preferredModel} (fallback: ${requestFallback})`, 'INFO', 'MODEL_SELECT');
            } else {
                log(`Ignoring unknown preferredModel: "${preferredModel}". Using default: ${requestPrimary}`, 'WARN', 'MODEL_SELECT');
            }
        }

        log(`Plan generation starting for ${numDays} days.`, 'INFO', 'SYSTEM');
        // REMOVED (v2): Old sendEvent call removed to prevent duplicate/delayed run_id
        // sendEvent('plan:start', { run_id, days: numDays, formData: getSanitizedFormData(formData), model: requestPrimary });

        // --- Input Validation ---
        if (!formData || typeof formData !== 'object' || Object.keys(formData).length < 5) {
            throw new Error("Missing or invalid 'formData' in request body.");
        }
        if (!nutritionalTargets || typeof nutritionalTargets !== 'object' || !nutritionalTargets.calories) {
            throw new Error("Missing or invalid 'nutritionalTargets' in request body.");
        }
        // CRITICAL: Define store variable
        store = formData.store;
        if (!store) throw new Error("'store' missing in formData.");

        // --- Phase B: Implement Realistic Meal-Type Target Distribution (B2, B3, B4) ---
        const eatingOccasions = parseInt(formData.eatingOccasions, 10) || 3;
        const mainMealCount = Math.min(eatingOccasions, 3); // B, L, D
        const snackCount = Math.max(0, eatingOccasions - mainMealCount);

        let mainRatio, snackRatio;

        if (eatingOccasions === 4) {
            // B=28%, L=28%, D=28%, S1=16%. Total Main: 84%, Total Snack: 16%
            mainRatio = 0.84;
            snackRatio = 0.16;
        } else if (eatingOccasions >= 5) {
            // B=25%, L=25%, D=25%, S1=12.5%, S2=12.5%. Total Main: 75%, Total Snack: 25%
            mainRatio = 0.75;
            snackRatio = 0.25;
        } else {
            // 3 meals: B=33.3%, L=33.3%, D=33.3%. Total Main: 100%, Total Snack: 0%
            mainRatio = 1.0;
            snackRatio = 0.0;
        }
        
        const mainMealSplit = mainMealCount > 0 ? mainRatio / mainMealCount : 0;
        const snackSplit = snackCount > 0 ? snackRatio / snackCount : 0;

        const targetsPerMealType = {
            main: {
                calories: nutritionalTargets.calories * mainMealSplit,
                protein: nutritionalTargets.protein * mainMealSplit,
                fat: nutritionalTargets.fat * mainMealSplit,
                carbs: nutritionalTargets.carbs * mainMealSplit,
            },
            snack: {
                calories: nutritionalTargets.calories * snackSplit,
                protein: nutritionalTargets.protein * snackSplit,
                fat: nutritionalTargets.fat * snackSplit,
                carbs: nutritionalTargets.carbs * snackSplit,
            },
            // Used for solver macro logging (Phase 5)
            mainCount: mainMealCount,
            snackCount: snackCount
        };


        // --- Phase 1: Generate ALL Meals (Parallelized - Change 2.10) ---
        sendEvent('phase:start', { name: 'meals', description: `Generating ${numDays}-day meal plan...` });
        // CHANGE 4: Persist `lastPhase` to KV
        await setRunStatus(run_id, 'running', null, log, 'meals');

        sendEvent('plan:progress', { message: `Generating ${numDays} days in parallel...` });
        const dayPromises = [];
        
        for (let day = 1; day <= numDays; day++) {
            dayPromises.push(
                generateMealPlan_Single(day, formData, nutritionalTargets, log, targetsPerMealType, requestPrimary, requestFallback)
                .then(dayPlan => {
                    sendEvent('plan:progress', { message: `Day ${day} generated.` });
                    return dayPlan;
                })
                .catch(dayError => {
                    log(`Failed to generate meals for Day ${day}: ${dayError.message}`, 'ERROR', 'LLM');
                    throw new Error(`Meal plan generation failed for Day ${day}: ${dayError.message}`);
                })
            );
        }
        
        const results = await Promise.all(dayPromises);
        results.forEach(dayPlan => {
            if (!dayPlan || !dayPlan.meals || dayPlan.meals.length === 0) {
                 throw new Error(`Meal Planner AI returned no meals.`);
            }
            fullMealPlan.push(dayPlan);
        });
        // Sort by day number to ensure correct order
        fullMealPlan.sort((a, b) => a.dayNumber - b.dayNumber);

        dietitian_ms = Date.now() - dietitianStartTime;
        sendEvent('phase:end', { name: 'meals', duration_ms: dietitian_ms, mealCount: fullMealPlan.reduce((acc, day) => acc + day.meals.length, 0) });
        
        if (fullMealPlan.length !== numDays) {
            throw new Error(`Meal Planner AI failed: Expected ${numDays} days, but processed ${fullMealPlan.length}.`);
        }

        // --- Phase 2: Aggregate Ingredients ---
        sendEvent('phase:start', { name: 'aggregate', description: 'Aggregating ingredient list...' });
        // CHANGE 4: Persist `lastPhase` to KV
        await setRunStatus(run_id, 'running', null, log, 'aggregate');

        const aggregateStartTime = Date.now();
        const ingredientMap = new Map(); // Use normalizedKey as the key

        for (const day of fullMealPlan) {
            for (const meal of day.meals) {
                // Add normalizedKey to all items *early*
                meal.items.forEach(item => { if(item && item.key) { item.normalizedKey = normalizeKey(item.key); } });

                for (const item of meal.items) {
                    // [Step 5] Ensure stateHint is normalized before use in quantity normalization
                    normalizeStateHintForItem(item, log);
                    
                    // This is a "dry run" to get quantities. No log needed.
                    // This function respects item.stateHint now that it is normalized
                    const { value: gramsOrMl } = normalizeToGramsOrMl(item, () => {}); 
                    
                    const existing = ingredientMap.get(item.normalizedKey);
                    if (existing) {
                        existing.requested_total_g += gramsOrMl;
                        existing.dayRefs.add(day.dayNumber);
                        // Carry forward stateHint if not yet set
                        if (!existing.stateHint) existing.stateHint = item.stateHint; 
                    } else {
                        ingredientMap.set(item.normalizedKey, {
                            originalIngredient: item.key, // Use the first-seen name as the "original"
                            normalizedKey: item.normalizedKey,
                            requested_total_g: gramsOrMl,
                            dayRefs: new Set([day.dayNumber]),
                            stateHint: item.stateHint // MOD ZONE 1.3: Pass stateHint
                        });
                    }
                }
            }
        }
        const aggregatedIngredients = Array.from(ingredientMap.values());
        sendEvent('phase:end', { name: 'aggregate', duration_ms: Date.now() - aggregateStartTime, uniqueIngredients: aggregatedIngredients.length });


        // --- Phase 3: Generate Queries & Run Market (Batched) ---
        sendEvent('phase:start', { name: 'market', description: `Querying ${store} for ${aggregatedIngredients.length} items...` });
        // CHANGE 4: Persist `lastPhase` to KV
        await setRunStatus(run_id, 'running', null, log, 'market');

        sendEvent('plan:progress', { pct: 35, message: `Running market search...` });
        const marketStartTime = Date.now();

        // 3a. Generate Queries (LLM call)
        const groceryQueryData = await generateGroceryQueries_Batched(aggregatedIngredients, store, log, requestPrimary, requestFallback);
        const { ingredients: ingredientPlan } = groceryQueryData;
        if (!ingredientPlan || ingredientPlan.length === 0) {
             throw new Error(`Grocery Optimizer AI returned empty ingredients.`);
        }
        
        // Map aggregated plan to full plan details
        const fullIngredientPlan = aggregatedIngredients.map(aggItem => {
            const planDetails = ingredientPlan.find(p => p.originalIngredient === aggItem.originalIngredient);
            if (!planDetails) {
                 log(`No plan details from LLM for "${aggItem.originalIngredient}". Using fallback.`, 'WARN', 'LLM');
                 return {
                     ...aggItem,
                     category: 'misc',
                     normalQuery: `${store} ${aggItem.originalIngredient}`,
                     requiredWords: aggItem.originalIngredient.split(' ').slice(0,1),
                     negativeKeywords: [],
                     allowedCategories: ['pantry', 'produce', 'meat', 'dairy', 'frozen']
                 };
            }
            // CRITICAL: Ensure the store is included in the ingredient object for the market runner's synthTight/synthWide to work
            return {
                ...planDetails, // Contains LLM-generated query data
                normalizedKey: aggItem.normalizedKey,
                totalGramsRequired: aggItem.requested_total_g, // Overwrite LLM estimate with our sum
                dayRefs: aggItem.dayRefs,
                stateHint: aggItem.stateHint, // MOD ZONE 1.3: Pass stateHint
                store: store, // Pass store name explicitly
                category: planDetails.category || 'Uncategorized', // FIX: Ensure category always exists for FE grouping
                // Ensure preprocessed data is carried over (V13.0)
                _preprocessed: planDetails._preprocessed || null
            };
        });
        
        // --- Market Run Logic (Moved inside handler for proper scoping) ---
        /**
         * Runs market search logic for a single ingredient.
         * Note: 'log' and 'store' are now correctly in scope from the enclosing handler.
         */
        const processSingleIngredientOptimized = async (ingredient) => {
            const ingredientKey = ingredient.originalIngredient;
            try {
                const matchTrace = createMatchTrace ? createMatchTrace(ingredientKey) : null;
                const telemetry = { tight: null, normal: null, wide: null, fallback: null, used: null, score: 0 };
                let result = { source: 'failed', allProducts: [], currentSelectionURL: MOCK_PRODUCT_TEMPLATE.url };
                let bestScore = 0;
                let acceptedQueryType = null;

                // Build query variants
                const queries = {
                    tight: synthTight(ingredient, store),
                    normal: ingredient.normalQuery || `${store} ${ingredientKey}`,
                    wide: synthWide(ingredient, store),
                };

                for (const type of ['tight', 'normal', 'wide']) {
                    const query = queries[type];
                    if (!query) { telemetry[type] = 'skipped'; continue; }
                    
                    const currentAttemptLog = { query, status: 'pending' };
                    telemetry[type] = currentAttemptLog;
                    
                    try {
                        const searchResults = await fetchPriceData(query, log);
                        
                        if (searchResults && searchResults.length > 0) {
                            // Filter by required words
                            const filtered = searchResults.filter(p => passRequiredWords(p.name, ingredient.requiredWords));
                            
                            if (filtered.length > 0) {
                                // Run enhanced checklist if available
                                let scored;
                                if (runEnhancedChecklist && tracedScoring) {
                                    scored = tracedScoring(filtered, ingredient, matchTrace);
                                } else {
                                    // Basic scoring fallback
                                    scored = filtered.map(p => ({ ...p, _score: passRequiredWords(p.name, ingredient.requiredWords) ? REQUIRED_WORD_SCORE_THRESHOLD + 0.1 : 0 }));
                                }
                                
                                const best = scored.sort((a, b) => (b._score || 0) - (a._score || 0))[0];
                                const currentBestScore = best?._score || 0;
                                
                                if (currentBestScore >= REQUIRED_WORD_SCORE_THRESHOLD && currentBestScore > bestScore) {
                                    bestScore = currentBestScore;
                                    acceptedQueryType = type;
                                    result = {
                                        source: 'discovery',
                                        allProducts: scored,
                                        currentSelectionURL: best.url,
                                        _matchTrace: matchTrace,
                                    };
                                    currentAttemptLog.status = 'accepted';
                                    currentAttemptLog.score = currentBestScore;

                                    // Skip heuristic: Strong tight match = stop early
                                    if (type === 'tight' && currentBestScore >= SKIP_STRONG_MATCH_THRESHOLD) {
                                        log(`[${ingredientKey}] Skip heuristic hit (Strong tight match). Stopping search.`, 'DEBUG', 'MARKET_RUN');
                                        break;
                                    }
                                    if (type === 'normal') {
                                        log(`[${ingredientKey}] Found valid 'normal' match. Stopping search.`, 'DEBUG', 'MARKET_RUN');
                                        break;
                                    }
                                } else { 
                                    currentAttemptLog.status = 'no_match_post_filter'; 
                                }
                            } else { 
                                currentAttemptLog.status = 'no_match_post_filter'; 
                            }
                        } else { 
                            log(`[${ingredientKey}] No valid products (${type}).`, 'WARN', 'DATA'); 
                            currentAttemptLog.status = 'no_match'; 
                        }
                    } catch (queryErr) {
                        log(`[${ingredientKey}] Query error (${type}): ${queryErr.message}`, 'WARN', 'MARKET_RUN');
                        currentAttemptLog.status = 'error';
                    }
                }

                // --- Fallback queries if all standard queries failed ---
                if (result.source === 'failed' && generateFallbackQueries) {
                    const fallbackQueries = generateFallbackQueries(ingredientKey, store);
                    for (const fbQuery of fallbackQueries) {
                        const fbAttemptLog = { query: fbQuery, status: 'pending' };
                        telemetry.fallback = fbAttemptLog;
                        try {
                            const fbResults = await fetchPriceData(fbQuery, log);
                            if (fbResults && fbResults.length > 0) {
                                const fbFiltered = fbResults.filter(p => passRequiredWords(p.name, ingredient.requiredWords));
                                if (fbFiltered.length > 0) {
                                    result = { source: 'discovery', allProducts: fbFiltered, currentSelectionURL: fbFiltered[0].url };
                                    acceptedQueryType = 'fallback';
                                    fbAttemptLog.status = 'accepted';
                                    break;
                                }
                            }
                            fbAttemptLog.status = fbResults && fbResults.length > 0 ? 'no_match' : fbAttemptLog.status;
                        } catch (fbErr) {
                            log(`[${ingredientKey}] Fallback query error: ${fbErr.message}`, 'WARN', 'MARKET_RUN');
                            fbAttemptLog.status = 'error';
                        }
                    }

                    if (result.source === 'failed') { 
                        log(`[${ingredientKey}] Market Run failed after trying all queries + fallbacks.`, 'WARN', 'MARKET_RUN'); 
                    }
                } else if (result.source !== 'failed') { 
                    log(`[${ingredientKey}] Market Run success via '${acceptedQueryType}' query.`, 'DEBUG', 'MARKET_RUN'); 
                }

                telemetry.used = acceptedQueryType;
                telemetry.score = bestScore;
                log(`[${ingredientKey}] Market Run Telemetry`, 'INFO', 'MARKET_RUN', telemetry);

                return { [ingredientKey]: result };

            } catch(e) {
                log(`CRITICAL Error in processSingleIngredient "${ingredient?.originalIngredient}": ${e.message}`, 'CRITICAL', 'MARKET_RUN', { stack: e.stack?.substring(0, 300) });
                return { _error: true, itemKey: ingredient?.originalIngredient || 'unknown_error', message: `Internal Market Run Error: ${e.message}` };
            }
        };
        // --- End Market Run Logic ---

        // 3b. Execute market run in parallel
        const parallelResultsArray = await concurrentlyMap(fullIngredientPlan, MARKET_RUN_CONCURRENCY, processSingleIngredientOptimized);
        sendEvent('plan:progress', { pct: 50, message: `Market search complete...` });
        
        // Collate market results (fullResultsMap still needed to map key to selected product)
        const fullResultsMap = new Map(); // Map<normalizedKey, result>
        parallelResultsArray.forEach(currentResult => {
             // FIX 1 & 2: Derive normalized key and look up plan item
             const ingredientKey = Object.keys(currentResult)[0];
             const normalizedKey = normalizeKey(ingredientKey);
             const resultData = currentResult[ingredientKey];
             
             // Look up the enriched plan item using the normalized key
             const planItem = fullIngredientPlan.find(i => i.normalizedKey === normalizedKey);

             if (currentResult._error) {
                 log(`Market Run Item Error for "${currentResult.itemKey}": ${currentResult.message}`, 'WARN', 'MARKET_RUN');
                 const baseData = planItem || { originalIngredient: currentResult.itemKey, normalizedKey: normalizeKey(currentResult.itemKey) };
                 fullResultsMap.set(normalizedKey, { ...baseData, source: 'error', error: currentResult.message, allProducts:[], currentSelectionURL: MOCK_PRODUCT_TEMPLATE.url });
                 return;
             }
             
             if (resultData && typeof resultData === 'object' && planItem) {
                 // FIX 3: Merge resultData with the enriched planItem to carry over fields like 'category'
                 fullResultsMap.set(normalizedKey, { ...planItem, ...resultData, normalizedKey: planItem.normalizedKey });

                 // Emit Trace Event if available
                 if (resultData._matchTrace) {
                     sendEvent('ingredient:match_trace', {
                         key: ingredientKey,
                         trace: resultData._matchTrace
                     });
                 }
             } else {
                  log(`Invalid market result structure or missing plan item for "${normalizedKey}"`, 'ERROR', 'SYSTEM', { resultData, planItemExists: !!planItem });
                  const baseData = planItem || { originalIngredient: ingredientKey, normalizedKey: normalizedKey };
                  fullResultsMap.set(normalizedKey, { ...baseData, source: 'error', error: 'Invalid market result structure', allProducts:[], currentSelectionURL: MOCK_PRODUCT_TEMPLATE.url });
             }
        });
        
        market_run_ms = Date.now() - marketStartTime;
        sendEvent('phase:end', { name: 'market', duration_ms: market_run_ms, itemsFound: Array.from(fullResultsMap.values()).filter(v => v.source === 'discovery').length });


        // --- Phase 3.5: Price Extraction (Mod Zone 3) ---
        sendEvent('phase:start', { name: 'price_extract', description: 'Extracting price data...' });
        // CHANGE 4: Persist `lastPhase` to KV
        await setRunStatus(run_id, 'running', null, log, 'price_extract');

        const priceExtractStartTime = Date.now();
        const priceDataMap = new Map(); 

        for (const [normalizedKey, result] of fullResultsMap.entries()) {
            const selected = result.allProducts.find(p => p && p.url === result.currentSelectionURL);
            
            if (selected) {
                priceDataMap.set(normalizedKey, {
                    price: selected.price || 0,
                    url: selected.url,
                    store: store,
                    packSize: selected.size, 
                    unitPrice: selected.unit_price_per_100 || 0,
                    productName: selected.name || result.originalIngredient
                });
            } else {
                 // Even if no product was found, create an entry with zero price data
                 priceDataMap.set(normalizedKey, {
                    price: 0,
                    url: MOCK_PRODUCT_TEMPLATE.url,
                    store: store,
                    packSize: 'N/A', 
                    unitPrice: 0,
                    productName: result.originalIngredient
                });
            }
        }
        sendEvent('phase:end', { name: 'price_extract', duration_ms: Date.now() - priceExtractStartTime });


        // --- Phase 4: Ingredient-Centric Nutrition Fetch (Mod Zone 1 & 2) ---
        sendEvent('phase:start', { name: 'nutrition', description: `Fetching nutrition for ${aggregatedIngredients.length} ingredients...` });
        // CHANGE 4: Persist `lastPhase` to KV
        await setRunStatus(run_id, 'running', null, log, 'nutrition');

        sendEvent('plan:progress', { pct: 60, message: `Running nutrition lookups...` });
        const nutritionStartTime = Date.now();
        const nutritionDataMap = new Map(); // Map<normalizedKey, { per100: {...}, source: string }>

        // MOD ZONE 2: Fetch nutrition per *unique ingredient*, not per meal item
        const nutritionResults = await concurrentlyMap(aggregatedIngredients, NUTRITION_CONCURRENCY, async (aggItem) => {
            try {
                const nData = await lookupIngredientNutrition(aggItem.normalizedKey, aggItem.stateHint, log);
                return { key: aggItem.normalizedKey, data: nData };
            } catch (err) {
                log(`Nutrition lookup failed for "${aggItem.normalizedKey}": ${err.message}`, 'WARN', 'NUTRITION');
                return { key: aggItem.normalizedKey, data: null };
            }
        });
        nutritionResults.forEach(r => {
            if (r && r.key && r.data) {
                nutritionDataMap.set(r.key, r.data);
            }
        });

        nutrition_ms = Date.now() - nutritionStartTime;
        sendEvent('phase:end', { name: 'nutrition', duration_ms: nutrition_ms, found: nutritionDataMap.size, total: aggregatedIngredients.length });


        // --- Phase 5: Solver / Reconciler ---
        sendEvent('phase:start', { name: 'solver', description: 'Running calorie reconciliation...' });
        // CHANGE 4: Persist `lastPhase` to KV
        await setRunStatus(run_id, 'running', null, log, 'solver');
        sendEvent('plan:progress', { pct: 75, message: `Reconciling macros...` });

        const solverStartTime = Date.now();

        // --- Define computeDetailedItemMacros CLOSURE (depends on nutritionDataMap, log) ---
        /**
         * Computes macros for a single item with full debug output.
         * This function returns a detailed object including debug information required for the macroDebug payload.
         */
        const computeDetailedItemMacros = (item, mealItems) => { // Relies on closure 'log' and 'nutritionDataMap'
             const normalizedKey = item.normalizedKey; 
             
             // 1. Get user-facing quantity
             const { value: gramsOrMl } = normalizeToGramsOrMl(item, log);
             const gramsInput = gramsOrMl; // Normalized grams/ml before transforms

             // Initialize debug item structure
             const debugItem = {
                key: item.key,
                displayName: item.key, // Using key as fallback
                qtyValue: item.qty_value || null,
                qtyUnit: item.qty_unit || null,
                stateHint: item.stateHint || null,
                methodHint: item.methodHint || null,
                gramsInput: gramsInput,
                gramsAsSold: null,
                nutritionKey: normalizedKey,
                per100: { kcal: null, protein: null, fat: null, carbs: null },
                computedMacros: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                source: 'missing',
                notes: null,
                lookupMethod: 'ingredient-centric' // MOD ZONE 4.3: Add ingredient-centric flag
             };
             
             if (!Number.isFinite(gramsInput) || gramsInput < 0 || gramsInput === 0) {
                 if (gramsInput !== 0) {
                    log(`[MACRO_DEBUG] Invalid quantity for item '${item.key}'.`, 'ERROR', 'CALC', { item, gramsInput });
                 }
                 return { p: 0, f: 0, c: 0, kcal: 0, key: item.key, debugItem };
             }
             
             // 2. Convert to 'as_sold' (e.g., 200g cooked rice -> 67g dry rice)
             const { grams_as_sold, inferredMethod } = toAsSold(item, gramsInput, log);
             
             debugItem.gramsAsSold = grams_as_sold;
             debugItem.methodHint = item.methodHint || inferredMethod || null;
             
             // 3. Get nutrition from ingredient-centric map (MOD ZONE 4.1)
             const nutritionEntry = nutritionDataMap.get(normalizedKey);
             
             let p = 0, f = 0, c = 0, kcal = 0;
             let nutritionSource = 'missing';

             if (nutritionEntry && nutritionEntry.per100) {
                 const per100 = nutritionEntry.per100;
                 debugItem.per100 = { kcal: per100.kcal, protein: per100.protein, fat: per100.fat, carbs: per100.carbs };
                 debugItem.source = nutritionEntry.source || 'ingredient-centric';
                 nutritionSource = debugItem.source;

                 const factor = grams_as_sold / 100;
                 p = (per100.protein || 0) * factor;
                 f = (per100.fat || 0) * factor;
                 c = (per100.carbs || 0) * factor;
                 
                 // Add absorbed oil if applicable
                 const absorbed_oil_g = getAbsorbedOil(item, grams_as_sold, log);
                 if (absorbed_oil_g > 0) {
                     f += absorbed_oil_g;
                 }
                 
                 kcal = (p * 4) + (f * 9) + (c * 4);
                 debugItem.computedMacros = { calories: Math.round(kcal), protein: Math.round(p * 10) / 10, fat: Math.round(f * 10) / 10, carbs: Math.round(c * 10) / 10 };
             } else {
                 log(`[MACRO_DEBUG] No nutrition data found for '${item.key}' (key: ${normalizedKey}).`, 'WARN', 'CALC');
                 debugItem.source = 'missing';
                 debugItem.notes = 'No nutrition data found for this ingredient.';
             }

             // Sanity check
             if (kcal > MAX_CALORIES_PER_ITEM) {
                 log(`[SANITY] Item '${item.key}' computed ${kcal.toFixed(0)} kcal (exceeds ${MAX_CALORIES_PER_ITEM}). Nullifying.`, 'WARN', 'CALC');
                 p = 0; f = 0; c = 0; kcal = 0;
                 debugItem.computedMacros = { calories: 0, protein: 0, fat: 0, carbs: 0 };
                 debugItem.notes = (debugItem.notes ? debugItem.notes + '; ' : '') + 'Macros nullified due to sanity check failure.';
             }

             return { p, f, c, kcal, key: item.key, debugItem };
        };


        // Redefine the simple helper that calculateTotals and reconcilerGetItemMacros expects.
        // This function replaces the original `computeItemMacros` but maintains the simple return structure.
        const computeItemMacros = (item, mealItems) => {
             const result = computeDetailedItemMacros(item, mealItems);
             return { p: result.p, f: result.f, c: result.c, kcal: result.kcal, key: result.key };
        };


        // Helper to calculate totals for a list of meals
        const calculateTotals = (mealList, dayNum) => {
            let totalKcal = 0, totalP = 0, totalF = 0, totalC = 0;
            let planHasInvalidItems = false;
            for (const meal of mealList) {
                 let mealKcal = 0, mealP = 0, mealF = 0, mealC = 0;
                 for (const item of meal.items) {
                     // Attach normalizedKey again as it was lost in deep copy
                     item.normalizedKey = normalizeKey(item.key); 
                     
                     // Ensure stateHint is normalized before macro calculation
                     normalizeStateHintForItem(item, log);
                     
                     // This is the call to the macro calculator (the getMacros function for validation)
                     const macros = computeItemMacros(item, meal.items);
                     mealKcal += macros.kcal; mealP += macros.p; mealF += macros.f; mealC += macros.c;
                 }
                 meal.subtotal_kcal = mealKcal; meal.subtotal_protein = mealP; meal.subtotal_fat = mealF; meal.subtotal_carbs = mealC;
                 if (meal.subtotal_kcal <= 0 && meal.items.length > 0) { // Only log if not an empty meal
                     log(`[Solver] Meal "${meal.name}" (Day ${dayNum}) has zero/negative kcal.`, 'WARN', 'CALC', { items: meal.items.map(i => i.key) });
                     planHasInvalidItems = true;
                 }
                 totalKcal += mealKcal; totalP += mealP; totalF += mealF; totalC += mealC;
            }
            // Return total object, which serves as the dayTotals input for validation
            return { totalKcal, totalP, totalF, totalC, planHasInvalidItems };
        };


        // --- Run Solver V1 (Shadow) vs Reconciler V0 (Live) ---
        for (const day of fullMealPlan) {
            let mealsForThisDay = JSON.parse(JSON.stringify(day.meals)); // Deep copy for safety
            // nutritionalTargets is the targets object for the current day
            const targetCalories = nutritionalTargets.calories;
            
            // Determine per meal targets for logging (Phase 5)
            const targetsPerMeal = (meal) => {
                const isSnack = meal.type && meal.type.toLowerCase().includes('snack');
                return isSnack ? targetsPerMealType.snack : targetsPerMealType.main;
            };

            // --- Meal-Level Reconciliation (if reconcileMealLevel is available) ---
            if (reconcileMealLevel) {
                for (const meal of mealsForThisDay) {
                    const targetMacros = targetsPerMeal(meal);
                    const mealGetItemMacros = (item) => {
                        item.normalizedKey = normalizeKey(item.key);
                        normalizeStateHintForItem(item, log);
                        return computeItemMacros(item, meal.items);
                    };
                    try {
                        const mealResult = reconcileMealLevel({
                            meal: { ...meal, items: meal.items.map(i => ({ ...i, qty: i.qty_value, unit: i.qty_unit })) },
                            targetKcal: targetMacros.calories,
                            getItemMacros: mealGetItemMacros,
                            tolPct: 5,
                            log: log
                        });
                        if (mealResult && mealResult.items) {
                            meal.items = mealResult.items.map(i => ({ ...i, qty_value: i.qty, qty_unit: i.unit }));
                        }
                    } catch (mealReconcileError) {
                        log(`Meal-level reconcile failed for "${meal.name}": ${mealReconcileError.message}. Recalculating day totals.`, 'INFO', 'SOLVER');
                    }
                }
            }

            // --- 1. Run Solver V1 (Shadow Path) ---
            const solverV1Meals = JSON.parse(JSON.stringify(mealsForThisDay)); // Fresh deep copy (start from possibly reconciled state)
            const solverV1Totals = calculateTotals(solverV1Meals, day.dayNumber);

            // --- 2. Run Reconciler V0 (Live Path by default) ---
            const reconcilerGetItemMacros = (item) => {
                item.normalizedKey = normalizeKey(item.key); // Ensure key is normalized
                // State hint is normalized inside calculateTotals, but we must ensure consistency here too
                normalizeStateHintForItem(item, log);
                
                const mealContext = mealsForThisDay.find(m => m.items.some(i => i.key === item.key))?.items || [];
                return computeItemMacros(item, mealContext);
            };

            const { adjusted, factor, meals: scaledMeals } = reconcileNonProtein({
                meals: mealsForThisDay.map(m => ({ ...m, items: m.items.map(i => ({ ...i, qty: i.qty_value, unit: i.qty_unit })) })),
                targetKcal: targetCalories,
                getItemMacros: reconcilerGetItemMacros, // Use our master calculator
                tolPct: 5,
                // D1, D2, D3: Pass parameters for protein scaling logic
                allowProteinScaling: ALLOW_PROTEIN_SCALING,
                targetProtein: nutritionalTargets.protein,
                log: log
            });

            // Re-format scaled meals and calculate their *final* totals
            const reconcilerV0Meals = scaledMeals.map(m => ({ ...m, items: m.items.map(i => ({ ...i, qty_value: i.qty, qty_unit: i.unit })) }));
            const reconcilerV0Totals = calculateTotals(reconcilerV0Meals, day.dayNumber);
            
            // --- Determine which meal/total set to use ---
            let selectedMeals = USE_SOLVER_V1 ? solverV1Meals : reconcilerV0Meals;
            let selectedTotals = USE_SOLVER_V1 ? solverV1Totals : reconcilerV0Totals;

            // --- 3. Log Comparison ---
            log(`[Solver] Day ${day.dayNumber} Shadow Mode Comparison:`, 'INFO', 'SOLVER', {
                day: day.dayNumber,
                target: targetCalories,
                solver_v1_kcal: solverV1Totals.totalKcal.toFixed(0),
                reconciler_v0_kcal: reconcilerV0Totals.totalKcal.toFixed(0),
                reconciler_adjusted: adjusted,
                reconciler_factor: factor
            });

            // --- 4. Store processed results back into day object ---
            day.meals = selectedMeals;
            day.totals = selectedTotals;
        }

        solver_ms = Date.now() - solverStartTime;
        sendEvent('phase:end', { name: 'solver', duration_ms: solver_ms });


        // --- Phase 6: Assemble Response ---
        sendEvent('phase:start', { name: 'assemble', description: 'Assembling final plan...' });
        // CHANGE 4: Persist `lastPhase` to KV
        await setRunStatus(run_id, 'running', null, log, 'assemble');

        sendEvent('plan:progress', { pct: 90, message: `Building final response...` });

        // Create the final unique ingredient ARRAY (for uniqueIngredients field)
        const finalUniqueIngredients = aggregatedIngredients.map(({ normalizedKey, dayRefs, ...rest }) => {
             const priceData = priceDataMap.get(normalizedKey) || {};
             const marketResult = fullResultsMap.get(normalizedKey) || {}; // GET THE FULL RESULT
             
             // Merge market data (which contains allProducts, currentSelectionURL, source, etc.)
             // then override with the cleaner priceData structure where available.
             return {
                 ...rest, // originalIngredient, requested_total_g, stateHint
                 normalizedKey,  // Keep normalizedKey for frontend lookups
                 dayRefs: Array.from(dayRefs), // Convert Set to Array
                 // Include ALL market result data (allProducts, currentSelectionURL, source)
                 ...marketResult,
                 // Include price data (overwrites for cleaner structure)
                 ...priceData
             };
        });

        // Build macroDebug per day
        const macroDebugByDay = fullMealPlan.map(day => {
            const dayDebug = {
                dayNumber: day.dayNumber,
                meals: day.meals.map(meal => {
                    const targetMacros = (meal.type && meal.type.toLowerCase().includes('snack')) ? targetsPerMealType.snack : targetsPerMealType.main;
                    return {
                        name: meal.name,
                        type: meal.type,
                        targetMacros: {
                            calories: targetMacros.calories ? Math.round(targetMacros.calories) : null,
                            protein: targetMacros.protein ? Math.round(targetMacros.protein) : null,
                            fat: targetMacros.fat ? Math.round(targetMacros.fat) : null,
                            carbs: targetMacros.carbs ? Math.round(targetMacros.carbs) : null
                        },
                        computedTotals: {
                            calories: Math.round(meal.subtotal_kcal || 0),
                            protein: Math.round(meal.subtotal_protein || 0),
                            fat: Math.round(meal.subtotal_fat || 0),
                            carbs: Math.round(meal.subtotal_carbs || 0)
                        },
                        deviation: {
                            caloriesDiff: targetMacros.calories ? Math.round((meal.subtotal_kcal || 0) - targetMacros.calories) : null,
                            proteinDiff: targetMacros.protein ? Math.round((meal.subtotal_protein || 0) - targetMacros.protein) : null,
                            fatDiff: targetMacros.fat ? Math.round((meal.subtotal_fat || 0) - targetMacros.fat) : null,
                            carbsDiff: targetMacros.carbs ? Math.round((meal.subtotal_carbs || 0) - targetMacros.carbs) : null,
                        },
                        items: meal.items.map(item => {
                            const detailed = computeDetailedItemMacros(item, meal.items);
                            return detailed.debugItem;
                        })
                    };
                }),
                dayTotals: day.totals
            };
            return dayDebug;
        });

        // Final response data
        const responseData = {
            run_id,
            version: `V14.1-${TRANSFORM_CONFIG_VERSION}`,
            days: fullMealPlan.map(day => ({
                dayNumber: day.dayNumber,
                meals: day.meals,
                totals: day.totals,
            })),
            uniqueIngredients: finalUniqueIngredients,
            macroDebug: macroDebugByDay,
            timings: {
                dietitian_ms,
                market_run_ms,
                nutrition_ms,
                solver_ms,
                total_ms: Date.now() - dietitianStartTime,
            },
            meta: {
                store,
                transformVersion: TRANSFORM_CONFIG_VERSION,
                solverMode: USE_SOLVER_V1 ? 'solver_v1' : 'reconciler_v0',
                proteinScaling: ALLOW_PROTEIN_SCALING,
            }
        };

        sendEvent('phase:end', { name: 'assemble' });

        // --- Phase 7: Persist to KV and send final data ---
        // Trim data for KV storage (avoid exceeding KV value size limits)
        if (responseData.macroDebug) {
            // Store a trimmed version for status polling
            const trimmedData = {
                ...responseData,
                macroDebug: undefined, // Too large for KV
                days: responseData.days.map(d => ({
                    ...d,
                    meals: d.meals.map(m => ({
                        ...m,
                        instructions: Array.isArray(m.instructions) ?
                            [m.instructions[0] || 'See full plan for instructions.']
                            : ['See full plan for instructions.']
                    }))
                }))
            };
            await setRunStatus(run_id, 'complete', trimmedData, log);
        } else {
            await setRunStatus(run_id, 'complete', responseData, log);
        }

        sendFinalDataAndClose(responseData);

    } catch (error) {
        log(`CRITICAL Orchestrator ERROR: ${error.message}`, 'CRITICAL', 'SYSTEM', { stack: error.stack?.substring(0, 500) });
        console.error(`FULL PLAN UNHANDLED ERROR:`, error);
        
        const isPlanError = error.message.startsWith('Meal Planner AI failed');
        const errorCode = isPlanError ? "PLAN_INVALID" : "SERVER_FAULT_PLAN";

        await setRunStatus(run_id, 'failed', { error: error.message, code: errorCode }, log).catch(() => {});
        logErrorAndClose(error.message, errorCode);
        return; 
    }
    finally {
        // Ensure the stream is closed if execution somehow reaches here
        if (response && !response.writableEnded) {
            log('Stream not ended, forcing close.', 'WARN', 'SYSTEM');
            try { response.end(); } catch {}
        }
    }
};

module.exports.getRunStatus = getRunStatus;

/// ===== MAIN-HANDLER-END ===== ////