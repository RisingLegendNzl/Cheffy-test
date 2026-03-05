// --- api/plan/helpers/config.js ---
// Extracted from generate-full-plan.js (refactor-only, no logic changes)
// Contains: env vars, feature flags, model names, KV client, cache/perf constants, mock data

const { createClient } = require('@vercel/kv');

// Import TRANSFORM_VERSION for cache prefix
// Note: Vercel bundles these relative to the project root, hence the `../../`
let TRANSFORM_VERSION_IMPORTED;
try {
    ({ TRANSFORM_VERSION: TRANSFORM_VERSION_IMPORTED } = require('../../utils/transforms.js'));
} catch (e) {
    try {
        ({ TRANSFORM_VERSION: TRANSFORM_VERSION_IMPORTED } = require('../../../utils/transforms.js'));
    } catch (e2) {
        console.error("CRITICAL: Failed to import TRANSFORM_VERSION in config.js. Using fallback.", e2.message);
        TRANSFORM_VERSION_IMPORTED = 'v13.3-hybrid';
    }
}

// Import LLM provider model names
let PRIMARY_MODEL_IMPORTED, FALLBACK_MODEL_IMPORTED, SUPPORTED_MODELS_IMPORTED;
try {
    ({ PRIMARY_MODEL: PRIMARY_MODEL_IMPORTED, FALLBACK_MODEL: FALLBACK_MODEL_IMPORTED, SUPPORTED_MODELS: SUPPORTED_MODELS_IMPORTED } = require('../../utils/llm-provider.js'));
} catch (e) {
    try {
        ({ PRIMARY_MODEL: PRIMARY_MODEL_IMPORTED, FALLBACK_MODEL: FALLBACK_MODEL_IMPORTED, SUPPORTED_MODELS: SUPPORTED_MODELS_IMPORTED } = require('../../../utils/llm-provider.js'));
    } catch (e2) {
        console.error("CRITICAL: Failed to import LLM provider in config.js. Using fallback model names.", e2.message);
        PRIMARY_MODEL_IMPORTED = 'gpt-5.1';
        FALLBACK_MODEL_IMPORTED = 'gemini-2.0-flash';
        SUPPORTED_MODELS_IMPORTED = {};
    }
}

/// ===== CONFIG-START ===== \\
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TRANSFORM_CONFIG_VERSION = TRANSFORM_VERSION_IMPORTED || 'v13.3-hybrid';

const USE_SOLVER_V1 = process.env.CHEFFY_USE_SOLVER === '1'; // Default to false (use legacy reconcile)
const ALLOW_PROTEIN_SCALING = process.env.CHEFFY_SCALE_PROTEIN === '1'; // D3: New feature flag for protein scaling

// Change 2.2: GPT-5.1 as primary, Gemini as fallback (from llm-provider.js)
const PLAN_MODEL_NAME_PRIMARY = PRIMARY_MODEL_IMPORTED;
const PLAN_MODEL_NAME_FALLBACK = FALLBACK_MODEL_IMPORTED;
const SUPPORTED_MODELS = SUPPORTED_MODELS_IMPORTED;

// Re-export raw model names for handler-level model selection logic
const PRIMARY_MODEL = PRIMARY_MODEL_IMPORTED;
const FALLBACK_MODEL = FALLBACK_MODEL_IMPORTED;

// --- Vercel KV Client ---
const kv = createClient({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Change 6.2: Add health check
let kvReady = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
(async () => {
    if (kvReady) {
        try {
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('KV Ping Timeout')), 3000));
            await Promise.race([kv.ping(), timeout]);
        } catch (e) {
            console.warn(`KV Connection check failed: ${e.message}`);
            kvReady = false;
        }
    }
})();

const CACHE_PREFIX = `cheffy:plan:v3:t:${TRANSFORM_CONFIG_VERSION}`;
const TTL_PLAN_MS = 1000 * 60 * 60 * 24; // 24 hours

// --- Performance & API Constants ---
const MAX_LLM_RETRIES = 2; // Change 2.3
const LLM_REQUEST_TIMEOUT_MS = 45000; // Change 2.3: Increased for GPT-5.1 JSON mode latency
const REQUIRED_WORD_SCORE_THRESHOLD = 0.60;
const SKIP_STRONG_MATCH_THRESHOLD = 0.80;
const MARKET_RUN_CONCURRENCY = 12; // [PERF V2] Increased from 6 — no 429s observed in logs
const NUTRITION_CONCURRENCY = 10;  // [PERF V2] Increased from 6
const TOKEN_BUCKET_CAPACITY = 10;
const TOKEN_BUCKET_REFILL_PER_SEC = 10;
const TOKEN_BUCKET_MAX_WAIT_MS = 250;
const FAIL_FAST_CATEGORIES = ["produce", "meat", "dairy", "veg", "fruit", "seafood"];

// [REMOVED] Local BANNED_KEYWORDS array replaced by SCORER_BANNED_KEYWORDS in utils/product-scorer
// const BANNED_KEYWORDS = [ ... ];

const PRICE_OUTLIER_Z_SCORE = 2.0;
const PANTRY_CATEGORIES = ["pantry", "grains", "canned", "spreads", "condiments", "drinks"];
const MAX_CALORIES_PER_ITEM = 1200; // Sanity check

/// ===== CONFIG-END ===== ////

/// ===== MOCK-START ===== \\
const MOCK_PRODUCT_TEMPLATE = { name: "Placeholder (Not Found)", brand: "MOCK DATA", price: 0, size: "N/A", url: "#", unit_price_per_100: 0, barcode: null };
const MOCK_RECIPE_FALLBACK = {
    description: "Meal description could not be generated.",
    instructions: ["Cooking instructions could not be generated for this meal. Please rely on standard cooking methods for the ingredients listed."]
};
/// ===== MOCK-END ===== ////

// Getter for kvReady (since it's mutable)
function isKvReady() {
    return kvReady;
}

// Setter for kvReady (used only by health check)
function setKvReady(val) {
    kvReady = val;
}

module.exports = {
    // Env
    GEMINI_API_KEY,
    TRANSFORM_CONFIG_VERSION,
    // Feature flags
    USE_SOLVER_V1,
    ALLOW_PROTEIN_SCALING,
    // Model names
    PLAN_MODEL_NAME_PRIMARY,
    PLAN_MODEL_NAME_FALLBACK,
    PRIMARY_MODEL,
    FALLBACK_MODEL,
    SUPPORTED_MODELS,
    // KV
    kv,
    isKvReady,
    setKvReady,
    // Cache
    CACHE_PREFIX,
    TTL_PLAN_MS,
    // Performance
    MAX_LLM_RETRIES,
    LLM_REQUEST_TIMEOUT_MS,
    REQUIRED_WORD_SCORE_THRESHOLD,
    SKIP_STRONG_MATCH_THRESHOLD,
    MARKET_RUN_CONCURRENCY,
    NUTRITION_CONCURRENCY,
    TOKEN_BUCKET_CAPACITY,
    TOKEN_BUCKET_REFILL_PER_SEC,
    TOKEN_BUCKET_MAX_WAIT_MS,
    FAIL_FAST_CATEGORIES,
    PRICE_OUTLIER_Z_SCORE,
    PANTRY_CATEGORIES,
    MAX_CALORIES_PER_ITEM,
    // Mock
    MOCK_PRODUCT_TEMPLATE,
    MOCK_RECIPE_FALLBACK,
};
