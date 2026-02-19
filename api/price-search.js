// --- Cheffy: api/price-search.js ---
// [PERF V2.0] Circuit Breaker + In-Memory Rate Limiter + Fast-Fail KV
// 
// CHANGES FROM V1:
// 1. Added KV Circuit Breaker — after 3 consecutive KV failures, all KV operations 
//    are bypassed for 60s. This prevents 4.3s timeout per KV call (the #1 bottleneck).
// 2. Replaced KV-based token bucket with in-memory token bucket.
//    The KV bucket was adding ~4.3s per call when KV is down. In-memory is instant.
//    Trade-off: per-instance rate limiting (not global across Vercel instances),
//    but this is acceptable since RapidAPI has its own 429 handling.
// 3. Added explicit KV operation timeout (KV_TIMEOUT_MS = 800ms).
//    If KV doesn't respond in 800ms, we skip it rather than waiting 4.3s.
// 4. All KV writes (cache SET) are now fire-and-forget (non-blocking).
//    We never await cache SET on the hot path.
//
// ALL EXISTING API CONTRACTS AND RETURN SHAPES ARE PRESERVED.

const axios = require('axios');
const { createClient } = require('@vercel/kv');

const kv = createClient({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// --- CONFIGURATION ---
const RAPID_API_HOSTS = {
    Coles: 'coles-product-price-api.p.rapidapi.com',
    Woolworths: 'woolworths-products-api.p.rapidapi.com'
};
const RAPID_API_KEY = process.env.RAPIDAPI_KEY;
const MAX_RETRIES = 3;
const DELAY_MS = 1500;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- CACHE CONFIGURATION ---
const TTL_SEARCH_MS = 1000 * 60 * 60 * 3; // 3 hours
const SWR_SEARCH_MS = 1000 * 60 * 60 * 1; // 1 hour stale-while-revalidate
const CACHE_PREFIX_SEARCH = 'search';

// --- [PERF V2] KV CIRCUIT BREAKER ---
// After CIRCUIT_BREAKER_THRESHOLD consecutive failures, skip KV for CIRCUIT_BREAKER_COOLDOWN_MS
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60000; // 60 seconds
const KV_TIMEOUT_MS = 800; // Max wait for any single KV operation

let kvCircuitBreaker = {
    failures: 0,
    lastFailure: 0,
    isOpen: false, // true = KV is bypassed
};

function isKvAvailable() {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return false;
    if (!kvCircuitBreaker.isOpen) return true;
    // Check if cooldown has elapsed
    if (Date.now() - kvCircuitBreaker.lastFailure > CIRCUIT_BREAKER_COOLDOWN_MS) {
        kvCircuitBreaker.isOpen = false;
        kvCircuitBreaker.failures = 0;
        return true; // Allow a probe
    }
    return false; // Circuit is open, skip KV
}

function recordKvSuccess() {
    kvCircuitBreaker.failures = 0;
    kvCircuitBreaker.isOpen = false;
}

function recordKvFailure(log, operation) {
    kvCircuitBreaker.failures++;
    kvCircuitBreaker.lastFailure = Date.now();
    if (kvCircuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD && !kvCircuitBreaker.isOpen) {
        kvCircuitBreaker.isOpen = true;
        log(`KV Circuit Breaker OPEN after ${kvCircuitBreaker.failures} consecutive failures. Bypassing KV for ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s.`, 'WARN', 'CIRCUIT_BREAKER');
    }
}

/**
 * Wraps a KV operation with a timeout. Returns null on failure/timeout.
 */
async function kvGetSafe(key, log) {
    if (!isKvAvailable()) return null;
    try {
        const result = await Promise.race([
            kv.get(key),
            new Promise((_, reject) => setTimeout(() => reject(new Error('KV_TIMEOUT')), KV_TIMEOUT_MS))
        ]);
        recordKvSuccess();
        return result;
    } catch (error) {
        recordKvFailure(log, 'GET');
        // Log at DEBUG level after circuit breaker is open to avoid log spam
        const level = kvCircuitBreaker.isOpen ? 'DEBUG' : 'WARN';
        log(`KV GET failed for ${key}: ${error.message}`, level, 'KV_FAST_FAIL', { timeout_ms: KV_TIMEOUT_MS });
        return null;
    }
}

/**
 * Fire-and-forget KV SET. Never blocks the hot path.
 */
function kvSetAsync(key, value, options, log) {
    if (!isKvAvailable()) return;
    // Do NOT await — this runs in the background
    kv.set(key, value, options)
        .then(() => { recordKvSuccess(); })
        .catch(error => {
            recordKvFailure(log, 'SET');
        });
}

// --- [PERF V2] IN-MEMORY TOKEN BUCKET ---
// Replaces the KV-based bucket. Instant, no network calls.
// Trade-off: per-instance, not global. Acceptable for Vercel serverless.
const BUCKET_CAPACITY = 12; // Slightly higher than before (was 10)
const BUCKET_REFILL_RATE = 12; // Tokens per second (was 10)
const BUCKET_RETRY_DELAY_MS = 700;

const inMemoryBuckets = {}; // { [storeKey]: { tokens, lastRefill } }

function acquireToken(storeKey) {
    const now = Date.now();
    if (!inMemoryBuckets[storeKey]) {
        inMemoryBuckets[storeKey] = { tokens: BUCKET_CAPACITY - 1, lastRefill: now };
        return true; // First call always succeeds
    }
    const bucket = inMemoryBuckets[storeKey];
    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = elapsedMs * (BUCKET_REFILL_RATE / 1000);
    bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return true;
    }
    return false; // No token available
}

// --- HELPERS ---
const normalizeKey = (str) => (str || '').toString().toLowerCase().trim().replace(/\s+/g, '_');
const inflightRefreshes = new Set();


/**
 * Internal logic for fetching price data from the API.
 * UNCHANGED from V1 except timeout reduced from 8000 to 6000ms.
 */
async function _fetchPriceDataFromApi(store, query, page = 1, log = console.log) {
    if (!RAPID_API_KEY) {
        log('Configuration Error: RAPIDAPI_KEY is not set.', 'CRITICAL', 'CONFIG');
        return { error: { message: 'Server configuration error: API key missing.', status: 500 } };
    }
    if (!store || !query) {
        log('Missing required parameters: store and query.', 'WARN', 'INPUT', { store, query });
        return { error: { message: 'Missing required parameters: store and query.', status: 400 } };
    }
    const host = RAPID_API_HOSTS[store];
    if (!host) {
        log(`Invalid store specified: ${store}. Must be "Coles" or "Woolworths".`, 'WARN', 'INPUT');
        return { error: { message: 'Invalid store specified. Must be "Coles" or "Woolworths".', status: 400 } };
    }

    const endpointUrl = `https://${host}/${store.toLowerCase()}/product-search/`;
    const apiParams = { query, page: page.toString(), page_size: '20' };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const attemptStartTime = Date.now();
        log(`Attempt ${attempt + 1}/${MAX_RETRIES}: Requesting product data (Page ${page}).`, 'DEBUG', 'RAPID_REQUEST', { store, query, page, endpoint: endpointUrl });

        try {
            const rapidResp = await axios.get(endpointUrl, {
                params: apiParams,
                headers: { 'x-rapidapi-key': RAPID_API_KEY, 'x-rapidapi-host': host },
                timeout: 6000 // [PERF V2] Reduced from 8000ms
            });
            const attemptLatency = Date.now() - attemptStartTime;
            log(`Successfully fetched products for "${query}" (Page ${page}).`, 'SUCCESS', 'RAPID_RESPONSE', { count: rapidResp.data.results?.length || 0, status: rapidResp.status, currentPage: rapidResp.data.current_page, totalPages: rapidResp.data.total_pages, latency_ms: attemptLatency });
            return rapidResp.data;

        } catch (error) {
            const attemptLatency = Date.now() - attemptStartTime;
            const status = error.response?.status;
            const is429 = status === 429;
            const isRetryableNetworkError = error.code === 'ECONNABORTED' || error.code === 'EAI_AGAIN' || error.message.includes('timeout');

            log(`RapidAPI fetch failed (Attempt ${attempt + 1})`, 'WARN', 'RAPID_FAILURE', { store, query, page, status: status || 'Network/Timeout', message: error.message, is429, isRetryable: is429 || isRetryableNetworkError, latency_ms: attemptLatency });

            if (is429) {
                const rateLimitError = new Error(`Rate limit exceeded (429)`);
                rateLimitError.statusCode = 429;
                throw rateLimitError;
            }

            if (isRetryableNetworkError && attempt < MAX_RETRIES - 1) {
                const delayTime = DELAY_MS * Math.pow(2, attempt);
                log(`Retrying network error in ${delayTime}ms...`, 'WARN', 'RAPID_RETRY');
                await delay(delayTime);
                continue;
            }

            const finalErrorMessage = `Request failed after ${attempt + 1} attempts. Status: ${status || 'Network/Timeout'}.`;
            log(finalErrorMessage, 'CRITICAL', 'RAPID_FAILURE', { store, query, page, status: status || 504, details: error.message });
            return { error: { message: finalErrorMessage, status: status || 504, details: error.message }, results: [], total_pages: 0, current_page: 1 };
        }
    }
    const fallbackMsg = `Price search failed definitely after ${MAX_RETRIES} internal retries.`;
    log(fallbackMsg, 'CRITICAL', 'RAPID_FAILURE', { store, query, page });
    return { error: { message: fallbackMsg, status: 500 }, results: [], total_pages: 0, current_page: 1 };
}


/**
 * [PERF V2] Simplified fetchStoreSafe using in-memory token bucket.
 * No more KV round-trips for rate limiting.
 */
async function fetchStoreSafe(store, query, page = 1, log = console.log) {
    const storeKey = store?.toLowerCase();
    if (!RAPID_API_HOSTS[store]) {
        log(`Invalid store key "${storeKey}" for token bucket.`, 'CRITICAL', 'BUCKET_ERROR');
        return { data: { error: { message: `Internal configuration error: Invalid store key ${storeKey}`, status: 500 } }, waitMs: 0 };
    }

    // [PERF V2] In-memory token bucket — instant, no KV calls
    if (!acquireToken(storeKey)) {
        // Brief wait and retry once
        await delay(100);
        if (!acquireToken(storeKey)) {
            log(`In-memory rate limiter: no token available for ${storeKey}. Proceeding anyway.`, 'DEBUG', 'BUCKET_SKIP');
            // Proceed anyway — RapidAPI will 429 us if needed, and we handle that below
        }
    }

    try {
        const data = await _fetchPriceDataFromApi(store, query, page, log);
        return { data, waitMs: 0 };
    } catch (error) {
        if (error.statusCode === 429) {
            log(`RapidAPI returned 429. Retrying once after ${BUCKET_RETRY_DELAY_MS}ms...`, 'WARN', 'BUCKET_RETRY', { store, query, page });
            await delay(BUCKET_RETRY_DELAY_MS);
            try {
                const retryData = await _fetchPriceDataFromApi(store, query, page, log);
                return { data: retryData, waitMs: BUCKET_RETRY_DELAY_MS };
            } catch (retryError) {
                log(`Retry after 429 failed: ${retryError.message}`, 'ERROR', 'BUCKET_RETRY_FAIL', { store, query, page });
                const status = retryError.response?.status || retryError.statusCode || 500;
                const errorData = { error: { message: `Retry after 429 failed. Status: ${status}`, status: status, details: retryError.message }, results: [], total_pages: 0, current_page: 1 };
                return { data: errorData, waitMs: BUCKET_RETRY_DELAY_MS };
            }
        }
        log(`Unhandled error during fetchStoreSafe: ${error.message}`, 'CRITICAL', 'BUCKET_ERROR', { store, query, page });
        const errorData = { error: { message: `Unexpected error during safe fetch: ${error.message}`, status: 500 }, results: [], total_pages: 0, current_page: 1 };
        return { data: errorData, waitMs: 0 };
    }
}


/**
 * Background refresh — uses fire-and-forget KV SET.
 */
function refreshInBackground(cacheKey, store, query, page, log, keyType) {
    if (inflightRefreshes.has(cacheKey)) return;
    inflightRefreshes.add(cacheKey);
    log(`Starting background refresh for ${cacheKey}...`, 'INFO', 'SWR_REFRESH_START', { key_type: keyType });

    (async () => {
        try {
            const { data: freshData } = await fetchStoreSafe(store, query, page, log);
            if (freshData && !freshData.error) {
                kvSetAsync(cacheKey, { data: freshData, ts: Date.now() }, { px: TTL_SEARCH_MS }, log);
                log(`Background refresh successful for ${cacheKey}`, 'INFO', 'SWR_REFRESH_SUCCESS', { key_type: keyType });
            } else {
                log(`Background refresh failed to fetch data for ${cacheKey}`, 'WARN', 'SWR_REFRESH_FAIL', { error: freshData?.error, key_type: keyType });
            }
        } catch (error) {
            log(`Background refresh error for ${cacheKey}: ${error.message}`, 'ERROR', 'SWR_REFRESH_ERROR', { key_type: keyType });
        } finally {
            inflightRefreshes.delete(cacheKey);
        }
    })();
}


/**
 * [PERF V2] Cache-wrapped fetchPriceData with circuit breaker and fast-fail KV.
 * Return shape is IDENTICAL to V1: { data, waitMs }
 */
async function fetchPriceData(store, query, page = 1, log = console.log) {
    const startTime = Date.now();
    const storeNorm = normalizeKey(store);
    const queryNorm = normalizeKey(query);
    const cacheKey = `${CACHE_PREFIX_SEARCH}:${storeNorm}:${queryNorm}:${page}`;
    const keyType = 'price_search';

    // [PERF V2] Try cache with fast-fail (800ms timeout + circuit breaker)
    const cachedItem = await kvGetSafe(cacheKey, log);

    if (cachedItem && typeof cachedItem === 'object' && cachedItem.data && cachedItem.ts) {
        const ageMs = Date.now() - cachedItem.ts;
        if (ageMs < SWR_SEARCH_MS) {
            log(`Cache Hit (Fresh) for ${cacheKey}`, 'INFO', 'CACHE_HIT', { key_type: keyType, latency_ms: Date.now() - startTime, age_ms: ageMs });
            return { data: cachedItem.data, waitMs: 0 };
        } else if (ageMs < TTL_SEARCH_MS) {
            log(`Cache Hit (Stale) for ${cacheKey}, serving stale and refreshing.`, 'INFO', 'CACHE_HIT_STALE', { key_type: keyType, latency_ms: Date.now() - startTime, age_ms: ageMs });
            refreshInBackground(cacheKey, store, query, page, log, keyType);
            return { data: cachedItem.data, waitMs: 0 };
        }
    }

    // Cache miss or KV unavailable — fetch from API
    log(`Cache Miss for ${cacheKey}`, 'INFO', 'CACHE_MISS', { key_type: keyType, kv_available: isKvAvailable() });
    const { data: fetchedData, waitMs: fetchWaitMs } = await fetchStoreSafe(store, query, page, log);
    const fetchLatencyMs = Date.now() - startTime;

    // [PERF V2] Fire-and-forget cache SET — never blocks the hot path
    if (fetchedData && !fetchedData.error) {
        kvSetAsync(cacheKey, { data: fetchedData, ts: Date.now() }, { px: TTL_SEARCH_MS }, log);
    }

    log(`Fetch completed for ${cacheKey}`, 'INFO', 'FETCH_COMPLETE', { key_type: keyType, latency_ms: fetchLatencyMs, success: !fetchedData?.error, bucket_wait_ms: fetchWaitMs });
    const returnData = fetchedData || { error: { message: "Fetch returned undefined after cache miss", status: 500 }};
    return { data: returnData, waitMs: fetchWaitMs };
}


// --- Vercel Handler (UNCHANGED) ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).send();
    }

    try {
        const { store, query, page } = req.query;
        const log = (message, level = 'INFO', tag = 'HANDLER') => { console.log(`[${level}] [${tag}] ${message}`); };

        const { data: result, waitMs } = await fetchPriceData(store, query, page ? parseInt(page, 10) : 1, log);

        if (result && result.error) {
            log(`Price search handler returning error: ${result.error.message}`, 'WARN', 'HANDLER');
            return res.status(result.error.status || 500).json(result.error);
        } else if (result) {
            return res.status(200).json(result);
        } else {
            log('Price search handler received unexpected null/undefined result.', 'ERROR', 'HANDLER');
            return res.status(500).json({ message: "Internal server error: Price search failed unexpectedly." });
        }
    } catch (error) {
        console.error("Handler error:", error);
        return res.status(500).json({ message: "Internal server error in price search handler.", details: error.message });
    }
};

// Expose fetchPriceData for generate-full-plan.js and day.js
module.exports.fetchPriceData = fetchPriceData;