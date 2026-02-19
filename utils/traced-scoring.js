/**
 * utils/traced-scoring.js
 * ========================
 * Thin wrapper around runEnhancedChecklist / runSmarterChecklist that
 * captures trace data for the Product Match Logger.
 *
 * IMPORTANT: This does NOT change any scoring logic. It just observes
 * the results and records them into the trace attempt object.
 *
 * Usage in the market run loop:
 *
 *   const { tracedScoring } = require('../utils/traced-scoring');
 *   // ... inside the rawProducts loop:
 *   const checklistResult = tracedScoring(
 *       runEnhancedChecklist, // or runSmarterChecklist
 *       rawProduct,
 *       ingredient,
 *       log,
 *       attemptRecorder  // from trace.startAttempt()
 *   );
 *
 * Version: 1.0.0
 */

'use strict';

const { TRACE_ENABLED } = require('./product-match-logger');

/**
 * Wraps a scoring function call, recording results into the trace attempt.
 *
 * @param {function} scoreFn - The actual scoring function (runEnhancedChecklist or runSmarterChecklist)
 * @param {object} product - Raw product from store API
 * @param {object} ingredientData - Ingredient data from LLM
 * @param {function} log - Logger function
 * @param {object} attemptRecorder - The attempt recorder from trace.startAttempt()
 * @param {object} [ctx] - Optional context passed to enhanced checklist
 * @returns {object} The original { pass, score, reason? } result from the scoring function
 */
function tracedScoring(scoreFn, product, ingredientData, log, attemptRecorder, ctx) {
    // Always record raw result first (if tracing is enabled)
    if (TRACE_ENABLED && attemptRecorder) {
        attemptRecorder.addRawResult(product);
    }

    // Call the actual scoring function (no changes to its behavior)
    const result = ctx !== undefined ? scoreFn(product, ingredientData, log, ctx) : scoreFn(product, ingredientData, log);

    // Record the outcome
    if (TRACE_ENABLED && attemptRecorder) {
        if (result.pass) {
            attemptRecorder.addPassedResult(product, result.score);
        } else {
            attemptRecorder.addRejection(product, result.reason || 'score=0');
        }
    }

    return result;
}

module.exports = { tracedScoring };