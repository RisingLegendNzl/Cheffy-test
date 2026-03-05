// --- api/plan/helpers/http.js ---
// Extracted from generate-full-plan.js (refactor-only, no logic changes)
// Contains: fetchLLMWithRetry with JSON Guard

const fetch = require('node-fetch');
// Ensure Response is available for the fix in Change 2.5
const Response = fetch.Response || global.Response;

const { MAX_LLM_RETRIES, LLM_REQUEST_TIMEOUT_MS } = require('./config');
const { delay } = require('./utils');

// --- fetchLLMWithRetry with JSON Guard ---
async function fetchLLMWithRetry(url, options, log, attemptPrefix = "LLM") {
    for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);

        try {
            log(`${attemptPrefix} Attempt ${attempt}: Fetching from ${url} (Timeout: ${LLM_REQUEST_TIMEOUT_MS}ms)`, 'DEBUG', 'HTTP');
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout); // Clear the timeout as the request completed

            if (response.ok) {
                // [FIX] Read as text first to check for non-JSON
                const rawText = await response.text();
                if (!rawText || rawText.trim() === "") {
                    throw new Error("Response was 200 OK but body was empty.");
                }
                // Create a synthetic Response object so callers can still call .json()
                return new Response(rawText, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            }

            if (response.status === 429 || response.status >= 500) {
                log(`${attemptPrefix} Attempt ${attempt}: Received retryable error ${response.status}. Retrying...`, 'WARN', 'HTTP');
            } else {
                const errorBody = await response.text();
                log(`${attemptPrefix} Attempt ${attempt}: Non-retryable error ${response.status}.`, 'CRITICAL', 'HTTP', { body: errorBody });
                throw new Error(`${attemptPrefix} call failed with status ${response.status}. Body: ${errorBody}`);
            }
        } catch (error) {
             clearTimeout(timeout);
             if (error.name === 'AbortError') {
                 log(`${attemptPrefix} Attempt ${attempt}: Fetch timed out after ${LLM_REQUEST_TIMEOUT_MS}ms. Retrying...`, 'WARN', 'HTTP');
             } else if (!error.message?.startsWith(`${attemptPrefix} call failed with status`)) {
                log(`${attemptPrefix} Attempt ${attempt}: Fetch failed: ${error.message}. Retrying...`, 'WARN', 'HTTP');
             } else {
                 throw error; // Rethrow non-retryable or final attempt errors
             }
        }

        if (attempt < MAX_LLM_RETRIES) {
            // (Change 1.4) Reduce backoff
            const delayTime = Math.pow(2, attempt -1) * 1000 + Math.random() * 500;
            log(`Waiting ${delayTime.toFixed(0)}ms before ${attemptPrefix} retry...`, 'DEBUG', 'HTTP');
            await delay(delayTime);
        }
    }
    log(`${attemptPrefix} call failed definitively after ${MAX_LLM_RETRIES} attempts.`, 'CRITICAL', 'HTTP');
    throw new Error(`${attemptPrefix} call to ${url} failed after ${MAX_LLM_RETRIES} attempts.`);
}

module.exports = {
    fetchLLMWithRetry,
    Response, // Re-export for callers that may need it
};
