// --- Cheffy: utils/llm-provider.js ---
// [V3.1] LLM Provider Abstraction Layer
//
// CHANGELOG:
// V3.0 — Added isReasoningModel() detection. Reasoning models (o-series,
//         gpt-5.x) have temperature/top_p STRIPPED; receive reasoning_effort
//         instead. Standard models (gpt-4.x) keep full sampling params.
//         Added gpt-4.1, gpt-4.1-mini, o4-mini to SUPPORTED_MODELS.
// V3.1 — Increased groceryQuery max_tokens 2048 → 4096 for GPT-5.1
//         reasoning overhead (internal chain-of-thought tokens consume
//         part of max_completion_tokens; 2048 was too tight for 20+ ingredients).
//
// DESIGN DECISIONS:
// - Callers continue to build payloads in Gemini format (the existing shape).
//   This module translates on the fly when the target is an OpenAI model.
// - Response parsing is normalised so callers always receive the same shape.
// - The module does NOT own retry logic — fetchLLMWithRetry in each file
//   still handles retries + abort timeouts.

'use strict';

// ============================================================
// 1. ENVIRONMENT & CONSTANTS
// ============================================================

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || '';
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY   || '';

const PRIMARY_MODEL   = process.env.CHEFFY_PRIMARY_MODEL  || 'gemini-2.5-flash-lite';
const FALLBACK_MODEL  = process.env.CHEFFY_FALLBACK_MODEL || 'gemini-2.0-flash';

const OPENAI_BASE_URL = 'https://api.openai.com/v1/chat/completions';

const getGeminiApiUrl = (modelName) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

// V3.1: groceryQuery raised 2048 → 4096 for GPT-5.1 reasoning tokens
const DEFAULT_MAX_TOKENS = {
    mealPlan:       4096,
    groceryQuery:   4096,
    chefRecipe:     1024,
    default:        4096,
};

// V3.0: Added gpt-4.1, gpt-4.1-mini, o4-mini with reasoning flags
const SUPPORTED_MODELS = {
    'gpt-5.1':               { provider: 'openai',  label: 'GPT-5.1 (Primary)',      reasoning: true  },
    'gpt-4.1':               { provider: 'openai',  label: 'GPT-4.1',                reasoning: false },
    'gpt-4.1-mini':          { provider: 'openai',  label: 'GPT-4.1 Mini',           reasoning: false },
    'o4-mini':               { provider: 'openai',  label: 'o4-mini (Reasoning)',     reasoning: true  },
    'gemini-2.0-flash':      { provider: 'gemini',  label: 'Gemini 2.0 Flash',       reasoning: false },
    'gemini-2.5-flash-lite': { provider: 'gemini',  label: 'Gemini 2.5 Flash Lite',  reasoning: false },
};

// ============================================================
// 2. PROVIDER & MODEL TYPE DETECTION
// ============================================================

function detectProvider(modelName) {
    if (!modelName || typeof modelName !== 'string') return 'gemini';
    const lower = modelName.toLowerCase();
    if (lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) {
        return 'openai';
    }
    return 'gemini';
}

/**
 * V3.0: Reasoning models reject temperature/top_p with a 400 error.
 * They use reasoning_effort instead.
 */
function isReasoningModel(modelName) {
    if (!modelName || typeof modelName !== 'string') return false;

    // Registry check (most reliable)
    if (SUPPORTED_MODELS[modelName] && typeof SUPPORTED_MODELS[modelName].reasoning === 'boolean') {
        return SUPPORTED_MODELS[modelName].reasoning;
    }

    // Heuristic fallback
    const lower = modelName.toLowerCase();
    if (lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) return true;
    if (lower.startsWith('gpt-5')) return true;
    if (lower.startsWith('gpt-4')) return false;
    return false;
}

// ============================================================
// 3. REQUEST BUILDING
// ============================================================

function buildLLMRequest(modelName, geminiPayload, options = {}) {
    const provider = detectProvider(modelName);

    if (provider === 'openai') {
        return _buildOpenAIRequest(modelName, geminiPayload, options);
    }
    return _buildGeminiRequest(modelName, geminiPayload);
}

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

// V3.0: Diverges for reasoning vs standard models
function _buildOpenAIRequest(modelName, geminiPayload, options = {}) {
    const { agentType = 'default', maxTokens } = options;
    const reasoning = isReasoningModel(modelName);

    // 1. Extract system prompt
    const systemText = geminiPayload.systemInstruction?.parts?.[0]?.text || '';

    // 2. Extract user message(s)
    const userParts = (geminiPayload.contents || [])
        .flatMap(c => (c.parts || []).map(p => p.text).filter(Boolean));
    const userText = userParts.join('\n');

    // 3. Build messages array
    const messages = [];
    if (systemText) messages.push({ role: 'system', content: systemText });
    if (userText)   messages.push({ role: 'user',   content: userText });

    // 4. generationConfig
    const genConfig = geminiPayload.generationConfig || {};

    // 5. JSON mode
    const wantsJson = genConfig.responseMimeType === 'application/json';

    // 6. max_tokens
    const resolvedMaxTokens = maxTokens
        || DEFAULT_MAX_TOKENS[agentType]
        || DEFAULT_MAX_TOKENS.default;

    // 7. Assemble body
    const body = {
        model:    modelName,
        messages,
        max_completion_tokens: resolvedMaxTokens,
    };

    if (reasoning) {
        // ─── REASONING MODEL (o4-mini, gpt-5.1) ───
        // temperature/top_p MUST be omitted — they cause 400 errors.
        const effortMap = {
            mealPlan:     'medium',
            chefRecipe:   'medium',
            groceryQuery: 'low',
            default:      'medium',
        };
        body.reasoning_effort = effortMap[agentType] || 'medium';
    } else {
        // ─── STANDARD MODEL (gpt-4.1, gpt-4.1-mini) ───
        body.temperature = genConfig.temperature ?? 0.3;
        body.top_p       = genConfig.topP ?? 0.9;
        // topK silently dropped — OpenAI doesn't support it.
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

function parseLLMResponse(modelName, rawJson) {
    const provider = detectProvider(modelName);
    if (provider === 'openai') return _parseOpenAIResponse(modelName, rawJson);
    return _parseGeminiResponse(modelName, rawJson);
}

function _parseGeminiResponse(modelName, rawJson) {
    const candidate    = rawJson.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const normalisedFinish = _normaliseGeminiFinishReason(finishReason);

    const content = candidate?.content;
    if (!content || !content.parts || content.parts.length === 0 || !content.parts[0].text) {
        throw new Error(`Model ${modelName} response missing content or text part.`);
    }
    return { text: content.parts[0].text, finishReason: normalisedFinish, provider: 'gemini', raw: rawJson };
}

function _normaliseGeminiFinishReason(reason) {
    switch (reason) {
        case 'STOP':       return 'STOP';
        case 'MAX_TOKENS': return 'MAX_TOKENS';
        case 'SAFETY':     return 'SAFETY';
        default:           return reason || 'ERROR';
    }
}

function _parseOpenAIResponse(modelName, rawJson) {
    if (rawJson.error) {
        throw new Error(`OpenAI API error: ${rawJson.error.message || JSON.stringify(rawJson.error)}`);
    }
    const choice = rawJson.choices?.[0];
    if (!choice) throw new Error(`Model ${modelName} response missing choices array.`);

    const finishReason     = choice.finish_reason;
    const normalisedFinish = _normaliseOpenAIFinishReason(finishReason);
    const text             = choice.message?.content;
    if (!text || typeof text !== 'string') {
        throw new Error(`Model ${modelName} response missing message.content.`);
    }
    return { text, finishReason: normalisedFinish, provider: 'openai', raw: rawJson };
}

function _normaliseOpenAIFinishReason(reason) {
    switch (reason) {
        case 'stop':           return 'STOP';
        case 'length':         return 'MAX_TOKENS';
        case 'content_filter': return 'SAFETY';
        default:               return reason || 'ERROR';
    }
}


// ============================================================
// 5. HIGH-LEVEL CONVENIENCE: callLLM
// ============================================================

async function callLLM({ modelName, geminiPayload, fetchFn, log, logPrefix, options = {} }) {
    const { url, headers, body } = buildLLMRequest(modelName, geminiPayload, options);
    log(`${logPrefix}: Calling ${detectProvider(modelName)} model: ${modelName}`, 'INFO', 'LLM');

    const response = await fetchFn(url, { method: 'POST', headers, body }, log, logPrefix);
    const rawJson  = await response.json();
    const parsed   = parseLLMResponse(modelName, rawJson);

    if (parsed.finishReason !== 'STOP') {
        throw new Error(`Model ${modelName} failed: finishReason was ${parsed.finishReason}.`);
    }
    return parsed;
}


// ============================================================
// 6. FALLBACK ORCHESTRATOR
// ============================================================

async function callWithFallback({
    geminiPayload, fetchFn, log, logPrefix,
    expectedShape = null, options = {},
    primaryModel = PRIMARY_MODEL, fallbackModel = FALLBACK_MODEL,
}) {
    try {
        const result = await callLLM({ modelName: primaryModel, geminiPayload, fetchFn, log, logPrefix, options });
        return _validateAndParseText(result.text, primaryModel, logPrefix, expectedShape, log);
    } catch (primaryError) {
        log(`${logPrefix}: Primary model (${primaryModel}) failed: ${primaryError.message}. Falling back to ${fallbackModel}.`, 'WARN', 'LLM_FALLBACK');
    }

    try {
        const result = await callLLM({ modelName: fallbackModel, geminiPayload, fetchFn, log, logPrefix, options });
        return _validateAndParseText(result.text, fallbackModel, logPrefix, expectedShape, log);
    } catch (fallbackError) {
        log(`${logPrefix}: Fallback model (${fallbackModel}) also failed: ${fallbackError.message}.`, 'CRITICAL', 'LLM_FALLBACK');
        throw new Error(
            `${logPrefix}: All LLM models failed. Primary (${primaryModel}): see earlier log. ` +
            `Fallback (${fallbackModel}): ${fallbackError.message}`
        );
    }
}


// ============================================================
// 7. INTERNAL HELPERS
// ============================================================

function _validateAndParseText(text, modelName, logPrefix, expectedShape, log) {
    const trimmed = (text || '').trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new Error(`Model ${modelName} returned non-JSON text: "${trimmed.substring(0, 100)}"`);
    }

    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        log(`Failed to parse JSON from ${modelName}: ${e.message}`, 'CRITICAL', 'LLM', { raw: trimmed.substring(0, 300) });
        throw new Error(`Model ${modelName} failed: Invalid JSON. ${e.message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Model ${modelName} failed: Parsed response is not an object.`);
    }

    if (expectedShape && typeof expectedShape === 'object') {
        for (const key in expectedShape) {
            if (!parsed.hasOwnProperty(key)) throw new Error(`Parsed JSON missing required key: '${key}'.`);
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

function validateChefRecipeShape(parsed) {
    if (!parsed || typeof parsed.description !== 'string' ||
        !Array.isArray(parsed.instructions) || parsed.instructions.length === 0) {
        throw new Error("Invalid Chef JSON structure: 'description' (string) or 'instructions' (non-empty array) missing.");
    }
}


// ============================================================
// 9. EXPORTS
// ============================================================

module.exports = {
    buildLLMRequest,
    parseLLMResponse,
    detectProvider,
    isReasoningModel,
    callLLM,
    callWithFallback,
    validateChefRecipeShape,
    PRIMARY_MODEL,
    FALLBACK_MODEL,
    SUPPORTED_MODELS,
    DEFAULT_MAX_TOKENS,
    OPENAI_BASE_URL,
    getGeminiApiUrl,
};