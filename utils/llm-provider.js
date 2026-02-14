// --- Cheffy: utils/llm-provider.js ---
// [UPDATED V3.0] LLM Provider Abstraction Layer
// - Added reasoning model detection (o-series, gpt-5.x)
// - Reasoning models: temperature, top_p stripped; reasoning_effort injected
// - Added gpt-4.1, gpt-4.1-mini, o4-mini to SUPPORTED_MODELS
// - GPT-4.1 / GPT-4.1-mini: standard non-reasoning, temperature/top_p supported
// - o4-mini / gpt-5.1: reasoning models, temperature/top_p NOT supported
//
// DESIGN DECISIONS:
// - Callers continue to build payloads in Gemini format (the existing shape).
//   This module translates on the fly when the target is an OpenAI model.
// - Response parsing is also normalised so callers always receive the same shape.
// - The module does NOT own retry logic — fetchLLMWithRetry in each file still
//   handles retries + abort timeouts. This module only transforms request/response.
//
// GROCERY OPTIMISER CHANGES (v2.0):
// - Primary model switched to gemini-2.5-flash-lite for maximum speed
// - Reduced max_tokens for groceryQuery agent (4096 → 2048)
// - Optimized generation parameters for structured JSON output
// - Fallback remains gemini-2.0-flash for reliability

'use strict';

// ============================================================
// 1. ENVIRONMENT & CONSTANTS
// ============================================================

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || '';
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY   || '';

// Allow runtime model switching without redeploy

const PRIMARY_MODEL   = process.env.CHEFFY_PRIMARY_MODEL  || 'gpt-5.1';
const FALLBACK_MODEL  = process.env.CHEFFY_FALLBACK_MODEL || 'gemini-2.0-flash';

const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';

const getGeminiApiUrl = (modelName) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

// Default max_tokens caps per agent type (OpenAI requires this explicitly)
// UPDATED: Reduced groceryQuery from 4096 to 2048 for faster Grocery Optimiser responses
const DEFAULT_MAX_TOKENS = {
    mealPlan:       4096,
    groceryQuery:   2048,  // OPTIMIZED: Grocery queries are typically <2K tokens
    chefRecipe:     1024,
    default:        4096,
};

// Supported models that the frontend is allowed to select.
// Used by API handlers to validate the `preferredModel` field.
// [V3.0] Added gpt-4.1, gpt-4.1-mini, o4-mini for full frontend coverage
const SUPPORTED_MODELS = {
    'gpt-5.1':              { provider: 'openai',  label: 'GPT-5.1 (Primary)',        reasoning: true  },
    'gpt-4.1':              { provider: 'openai',  label: 'GPT-4.1',                  reasoning: false },
    'gpt-4.1-mini':         { provider: 'openai',  label: 'GPT-4.1 Mini',             reasoning: false },
    'o4-mini':              { provider: 'openai',  label: 'o4-mini (Reasoning)',       reasoning: true  },
    'gemini-2.0-flash':     { provider: 'gemini',  label: 'Gemini 2.0 Flash',         reasoning: false },
    'gemini-2.5-flash-lite': { provider: 'gemini',  label: 'Gemini 2.5 Flash Lite',   reasoning: false },
};

// ============================================================
// 2. PROVIDER & MODEL TYPE DETECTION
// ============================================================

/**
 * Determines which provider a model belongs to.
 *
 * @param {string} modelName - e.g. 'gpt-5.1', 'gemini-2.0-flash', 'o4-mini'
 * @returns {'openai' | 'gemini'}
 */
function detectProvider(modelName) {
    if (!modelName || typeof modelName !== 'string') return 'gemini';
    const lower = modelName.toLowerCase();
    if (lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) {
        return 'openai';
    }
    return 'gemini';
}

/**
 * [V3.0] Determines if a model is a "reasoning" model that does NOT support
 * temperature, top_p, or other sampling parameters.
 *
 * Reasoning models (o-series, gpt-5.x) reject non-default temperature/top_p
 * with a 400 error. They use `reasoning_effort` instead.
 *
 * Standard models (gpt-4.1, gpt-4.1-mini) fully support temperature/top_p.
 *
 * @param {string} modelName
 * @returns {boolean}
 */
function isReasoningModel(modelName) {
    if (!modelName || typeof modelName !== 'string') return false;

    // Check the SUPPORTED_MODELS registry first (most reliable)
    if (SUPPORTED_MODELS[modelName] && typeof SUPPORTED_MODELS[modelName].reasoning === 'boolean') {
        return SUPPORTED_MODELS[modelName].reasoning;
    }

    // Fallback heuristic for models not in the registry
    const lower = modelName.toLowerCase();

    // o-series models are always reasoning models
    if (lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) {
        return true;
    }

    // GPT-5.x family are reasoning models
    if (lower.startsWith('gpt-5')) {
        return true;
    }

    // GPT-4.x family are standard (non-reasoning) models
    if (lower.startsWith('gpt-4')) {
        return false;
    }

    return false;
}

// ============================================================
// 3. REQUEST BUILDING
// ============================================================

/**
 * Converts the existing Gemini-shaped payload into the correct provider
 * format and returns a fetch-ready { url, headers, body } object.
 *
 * Callers should keep building the `geminiPayload` exactly as they do today.
 * This function handles translation when the target is an OpenAI model.
 *
 * @param {string}  modelName       - The target model (e.g. 'gpt-5.1', 'gemini-2.5-flash-lite')
 * @param {Object}  geminiPayload   - Payload in Gemini format:
 *   {
 *     contents:          [{ parts: [{ text: '...' }] }],
 *     systemInstruction: { parts: [{ text: '...' }] },
 *     generationConfig:  { temperature, topK, topP, responseMimeType }
 *   }
 * @param {Object}  [options]
 * @param {string}  [options.agentType]   - 'mealPlan' | 'groceryQuery' | 'chefRecipe' | 'default'
 *                                          Used to select the max_tokens cap for OpenAI.
 * @param {number}  [options.maxTokens]   - Override the default max_tokens for this call.
 * @returns {{ url: string, headers: Object, body: string }}
 */
function buildLLMRequest(modelName, geminiPayload, options = {}) {
    const provider = detectProvider(modelName);

    if (provider === 'openai') {
        return _buildOpenAIRequest(modelName, geminiPayload, options);
    }
    return _buildGeminiRequest(modelName, geminiPayload);
}

// --- Gemini (unchanged from current codebase) -----------------------

function _buildGeminiRequest(modelName, geminiPayload) {
    return {
        url:     getGeminiApiUrl(modelName),
        headers: {
            'Content-Type':   'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify(geminiPayload),
    };
}

// --- OpenAI (translated from Gemini format) --------------------------
// [V3.0] Now handles reasoning vs standard models differently

function _buildOpenAIRequest(modelName, geminiPayload, options = {}) {
    const { agentType = 'default', maxTokens } = options;
    const reasoning = isReasoningModel(modelName);

    // 1. Extract system prompt
    const systemText = geminiPayload.systemInstruction?.parts?.[0]?.text || '';

    // 2. Extract user message(s)
    //    Gemini's `contents` can have multiple parts; concatenate them.
    const userParts = (geminiPayload.contents || [])
        .flatMap(c => (c.parts || []).map(p => p.text).filter(Boolean));
    const userText = userParts.join('\n');

    // 3. Build messages array
    //    Reasoning models treat "system" as "developer" role internally,
    //    but the Chat Completions API still accepts "system" for o-series
    //    and gpt-5.x models. We keep using "system" for compatibility.
    const messages = [];
    if (systemText) {
        messages.push({ role: 'system', content: systemText });
    }
    if (userText) {
        messages.push({ role: 'user', content: userText });
    }

    // 4. Map generationConfig → OpenAI parameters
    const genConfig = geminiPayload.generationConfig || {};

    // 5. JSON mode
    const wantsJson = genConfig.responseMimeType === 'application/json';

    // 6. max_tokens
    const resolvedMaxTokens = maxTokens
        || DEFAULT_MAX_TOKENS[agentType]
        || DEFAULT_MAX_TOKENS.default;

    // 7. Assemble body — diverges for reasoning vs standard models
    const body = {
        model:    modelName,
        messages,
        max_completion_tokens: resolvedMaxTokens,
    };

    if (reasoning) {
        // ─── REASONING MODEL (o4-mini, gpt-5.1, etc.) ───
        // These models reject temperature, top_p, and other sampling params.
        // They only accept reasoning_effort (and temperature must be omitted
        // or set to exactly 1).
        //
        // We add reasoning_effort based on agentType:
        //   - mealPlan / chefRecipe → 'medium' (good creativity vs speed)
        //   - groceryQuery          → 'low'    (structured output, speed)
        //   - default               → 'medium'
        const effortMap = {
            mealPlan:     'medium',
            chefRecipe:   'medium',
            groceryQuery: 'low',
            default:      'medium',
        };
        body.reasoning_effort = effortMap[agentType] || 'medium';

        // DO NOT include temperature or top_p — they cause 400 errors
    } else {
        // ─── STANDARD MODEL (gpt-4.1, gpt-4.1-mini, etc.) ───
        // These models fully support temperature and top_p.
        const temperature = genConfig.temperature ?? 0.3;
        const topP        = genConfig.topP ?? 0.9;
        // Note: OpenAI does NOT support topK — silently dropped.

        body.temperature = temperature;
        body.top_p       = topP;
    }

    if (wantsJson) {
        body.response_format = { type: 'json_object' };
    }

    return {
        url:     OPENAI_BASE_URL,
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
    };
}


// ============================================================
// 4. RESPONSE PARSING
// ============================================================

/**
 * Normalises the raw JSON response from either provider into a
 * consistent shape that callers can consume without knowing the provider.
 *
 * @param {string} modelName  - The model that was called
 * @param {Object} rawJson    - The parsed JSON body from the API response
 * @returns {{ text: string, finishReason: string, provider: string, raw: Object }}
 *   - text:          The text content (the JSON string the LLM produced)
 *   - finishReason:  Normalised to one of: 'STOP', 'MAX_TOKENS', 'SAFETY', 'ERROR'
 *   - provider:      'openai' | 'gemini'
 *   - raw:           The original raw JSON for debug logging
 * @throws {Error} If the response is missing required fields
 */
function parseLLMResponse(modelName, rawJson) {
    const provider = detectProvider(modelName);

    if (provider === 'openai') {
        return _parseOpenAIResponse(modelName, rawJson);
    }
    return _parseGeminiResponse(modelName, rawJson);
}

// --- Gemini response parsing -----------------------------------------

function _parseGeminiResponse(modelName, rawJson) {
    const candidate     = rawJson.candidates?.[0];
    const finishReason  = candidate?.finishReason; // 'STOP', 'MAX_TOKENS', 'SAFETY', etc.

    // Normalise finish reason
    const normalisedFinish = _normaliseGeminiFinishReason(finishReason);

    // Extract text
    const content = candidate?.content;
    if (!content || !content.parts || content.parts.length === 0 || !content.parts[0].text) {
        throw new Error(`Model ${modelName} response missing content or text part.`);
    }

    return {
        text:         content.parts[0].text,
        finishReason: normalisedFinish,
        provider:     'gemini',
        raw:          rawJson,
    };
}

function _normaliseGeminiFinishReason(reason) {
    switch (reason) {
        case 'STOP':        return 'STOP';
        case 'MAX_TOKENS':  return 'MAX_TOKENS';
        case 'SAFETY':      return 'SAFETY';
        default:            return reason || 'ERROR';
    }
}

// --- OpenAI response parsing ------------------------------------------

function _parseOpenAIResponse(modelName, rawJson) {
    // Check for top-level API error
    if (rawJson.error) {
        throw new Error(
            `OpenAI API error: ${rawJson.error.message || JSON.stringify(rawJson.error)}`
        );
    }

    const choice = rawJson.choices?.[0];
    if (!choice) {
        throw new Error(`Model ${modelName} response missing choices array.`);
    }

    const finishReason = choice.finish_reason; // 'stop', 'length', 'content_filter', etc.
    const normalisedFinish = _normaliseOpenAIFinishReason(finishReason);

    const text = choice.message?.content;
    if (!text || typeof text !== 'string') {
        throw new Error(`Model ${modelName} response missing message.content.`);
    }

    return {
        text,
        finishReason: normalisedFinish,
        provider:     'openai',
        raw:          rawJson,
    };
}

function _normaliseOpenAIFinishReason(reason) {
    switch (reason) {
        case 'stop':            return 'STOP';
        case 'length':          return 'MAX_TOKENS';
        case 'content_filter':  return 'SAFETY';
        default:                return reason || 'ERROR';
    }
}


// ============================================================
// 5. HIGH-LEVEL CONVENIENCE: callLLM
// ============================================================

/**
 * End-to-end helper that builds the request, calls the API via the
 * caller-provided `fetchFn`, and parses the response.
 *
 * This is OPTIONAL. Callers that need finer control (e.g. custom retry
 * logic inside fetchLLMWithRetry) can use buildLLMRequest + parseLLMResponse
 * separately. This helper is provided for simpler call-sites.
 *
 * @param {Object}   params
 * @param {string}   params.modelName      - Target model
 * @param {Object}   params.geminiPayload  - Payload in Gemini format
 * @param {Function} params.fetchFn        - async (url, fetchOptions) => Response
 *                                           (This is typically fetchLLMWithRetry)
 * @param {Function} params.log            - Logger function
 * @param {string}   params.logPrefix      - e.g. 'MealPlannerDay1'
 * @param {Object}   [params.options]      - { agentType, maxTokens }
 * @returns {Promise<{ text: string, finishReason: string, provider: string, raw: Object }>}
 */
async function callLLM({ modelName, geminiPayload, fetchFn, log, logPrefix, options = {} }) {
    const { url, headers, body } = buildLLMRequest(modelName, geminiPayload, options);

    log(`${logPrefix}: Calling ${detectProvider(modelName)} model: ${modelName}`, 'INFO', 'LLM');

    const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body,
    }, log, logPrefix);

    // Both day.js and generate-full-plan.js return a Response-like object from
    // fetchLLMWithRetry, so .json() is always available.
    const rawJson = await response.json();

    const parsed = parseLLMResponse(modelName, rawJson);

    if (parsed.finishReason !== 'STOP') {
        throw new Error(`Model ${modelName} failed: finishReason was ${parsed.finishReason}.`);
    }

    return parsed;
}


// ============================================================
// 6. FALLBACK ORCHESTRATOR
// ============================================================

/**
 * Tries the primary model, and if it fails, falls back to the secondary.
 * Returns the parsed text on success, or throws if both fail.
 *
 * This replaces the inline try/catch blocks in generateMealPlan,
 * generateGroceryQueries, generateChefInstructions, etc.
 *
 * @param {Object}   params
 * @param {Object}   params.geminiPayload    - Payload in Gemini format
 * @param {Function} params.fetchFn          - fetchLLMWithRetry
 * @param {Function} params.log              - Logger
 * @param {string}   params.logPrefix        - e.g. 'MealPlannerDay1'
 * @param {Object}   [params.expectedShape]  - Expected top-level keys for validation (e.g. { meals: [] })
 * @param {Object}   [params.options]        - { agentType, maxTokens }
 * @param {string}   [params.primaryModel]   - Override PRIMARY_MODEL for this call
 * @param {string}   [params.fallbackModel]  - Override FALLBACK_MODEL for this call
 * @returns {Promise<Object>} Parsed and shape-validated JSON object
 */
async function callWithFallback({
    geminiPayload,
    fetchFn,
    log,
    logPrefix,
    expectedShape = null,
    options = {},
    primaryModel = PRIMARY_MODEL,
    fallbackModel = FALLBACK_MODEL,
}) {
    // --- Attempt 1: Primary model ---
    try {
        const result = await callLLM({
            modelName: primaryModel,
            geminiPayload,
            fetchFn,
            log,
            logPrefix,
            options,
        });

        return _validateAndParseText(result.text, primaryModel, logPrefix, expectedShape, log);

    } catch (primaryError) {
        log(
            `${logPrefix}: Primary model (${primaryModel}) failed: ${primaryError.message}. Falling back to ${fallbackModel}.`,
            'WARN',
            'LLM_FALLBACK'
        );
    }

    // --- Attempt 2: Fallback model ---
    try {
        const result = await callLLM({
            modelName: fallbackModel,
            geminiPayload,
            fetchFn,
            log,
            logPrefix,
            options,
        });

        return _validateAndParseText(result.text, fallbackModel, logPrefix, expectedShape, log);

    } catch (fallbackError) {
        log(
            `${logPrefix}: Fallback model (${fallbackModel}) also failed: ${fallbackError.message}.`,
            'CRITICAL',
            'LLM_FALLBACK'
        );
        throw new Error(
            `${logPrefix}: All LLM models failed. Primary (${primaryModel}): see earlier log. ` +
            `Fallback (${fallbackModel}): ${fallbackError.message}`
        );
    }
}


// ============================================================
// 7. INTERNAL HELPERS
// ============================================================

/**
 * Parses the raw text string from the LLM into a JSON object and
 * optionally validates it against an expected shape.
 *
 * This consolidates the JSON-parsing + shape-checking logic that
 * currently lives in both tryGenerateLLMPlan and tryGenerateChefRecipe.
 */
function _validateAndParseText(text, modelName, logPrefix, expectedShape, log) {
    const trimmed = (text || '').trim();

    // Guard: must look like JSON
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new Error(
            `Model ${modelName} returned non-JSON text: "${trimmed.substring(0, 100)}"`
        );
    }

    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        log(
            `Failed to parse JSON from ${modelName}: ${e.message}`,
            'CRITICAL',
            'LLM',
            { raw: trimmed.substring(0, 300) }
        );
        throw new Error(`Model ${modelName} failed: Invalid JSON. ${e.message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Model ${modelName} failed: Parsed response is not an object.`);
    }

    // Shape validation (if caller specified expected keys)
    if (expectedShape && typeof expectedShape === 'object') {
        for (const key in expectedShape) {
            if (!parsed.hasOwnProperty(key)) {
                throw new Error(`Parsed JSON missing required key: '${key}'.`);
            }
            if (Array.isArray(expectedShape[key]) && !Array.isArray(parsed[key])) {
                throw new Error(`Parsed JSON key '${key}' was not an array.`);
            }
        }
    }

    log(`${logPrefix}: Model ${modelName} succeeded.`, 'SUCCESS', 'LLM');
    return parsed;
}


// ============================================================
// 8. CHEF-SPECIFIC VALIDATOR
// ============================================================

/**
 * Validates that a parsed Chef AI response has the required fields.
 * Mirrors the existing check in tryGenerateChefRecipe.
 *
 * @param {Object} parsed - Parsed JSON from Chef AI
 * @throws {Error} If structure is invalid
 */
function validateChefRecipeShape(parsed) {
    if (
        !parsed ||
        typeof parsed.description !== 'string' ||
        !Array.isArray(parsed.instructions) ||
        parsed.instructions.length === 0
    ) {
        throw new Error(
            "Invalid Chef JSON structure: 'description' (string) or 'instructions' (non-empty array) missing."
        );
    }
}


// ============================================================
// 9. EXPORTS
// ============================================================

module.exports = {
    // --- Core functions (use together for fine-grained control) ---
    buildLLMRequest,
    parseLLMResponse,
    detectProvider,

    // --- [V3.0] Model type detection ---
    isReasoningModel,

    // --- High-level helpers (use for simpler call sites) ---
    callLLM,
    callWithFallback,

    // --- Validation ---
    validateChefRecipeShape,

    // --- Config (readable by consumers for logging / diagnostics) ---
    PRIMARY_MODEL,
    FALLBACK_MODEL,
    SUPPORTED_MODELS,
    DEFAULT_MAX_TOKENS,
    OPENAI_BASE_URL,
    getGeminiApiUrl,
};