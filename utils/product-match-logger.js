/**
 * utils/product-match-logger.js
 * ==============================
 * Structured Product Match Trace Logger for Market Run.
 *
 * Replaces the old "failed ingredients" logging with a comprehensive
 * per-ingredient trace that captures:
 *   1. Normalized search query used
 *   2. Raw top API results returned
 *   3. Scoring/ranking outcome per product
 *   4. Final selected product
 *   5. Rejection reasons for non-selected products
 *
 * Performance: When disabled (MATCH_TRACE_ENABLED=false), all methods
 * are no-ops with zero object allocation. When enabled, trace data is
 * collected in-memory per ingredient and emitted once at the end.
 *
 * Version: 1.0.0
 */

'use strict';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if match tracing is enabled.
 * Defaults to 'true' — set MATCH_TRACE_ENABLED=false in production to disable.
 */
const TRACE_ENABLED = (process.env.MATCH_TRACE_ENABLED || 'true').toLowerCase() !== 'false';

/**
 * Maximum number of raw products to capture per query attempt.
 * Keeps trace payloads reasonable without losing diagnostic value.
 */
const MAX_RAW_PRODUCTS_PER_QUERY = 8;

/**
 * Maximum number of scored (passing) products to capture per query attempt.
 */
const MAX_SCORED_PRODUCTS_PER_QUERY = 5;

// ============================================================================
// TRACE BUILDER
// ============================================================================

/**
 * Creates a new trace context for a single ingredient's market run.
 *
 * Usage:
 *   const trace = createMatchTrace('garlic', ingredientData);
 *   // ... during query loop:
 *   const attempt = trace.startAttempt('tight', 'woolworths garlic');
 *   attempt.addRawResult(product);          // for each API result
 *   attempt.addScoredResult(product, score, reason); // for each scored product
 *   attempt.finalize('success', 5);
 *   // ... after selection:
 *   trace.setSelection(selectedProduct, 'discovery', 'tight');
 *   // ... or on failure:
 *   trace.setFailed('No products passed scoring');
 *   // Emit:
 *   const traceData = trace.build();
 *
 * @param {string} ingredientKey - The original ingredient name
 * @param {object} ingredientData - The full ingredient data from LLM
 * @returns {object} Trace builder with chainable methods
 */
function createMatchTrace(ingredientKey, ingredientData) {
    if (!TRACE_ENABLED) {
        // Return a no-op trace that costs nothing
        return NO_OP_TRACE;
    }

    const startTime = Date.now();

    const trace = {
        ingredient: ingredientKey,
        normalizedIngredient: ingredientData?.normalizedKey || null,
        queries: {
            tight: ingredientData?.tightQuery || null,
            normal: ingredientData?.normalQuery || null,
            wide: ingredientData?.wideQuery || null,
        },
        validationRules: {
            requiredWords: ingredientData?.requiredWords || [],
            negativeKeywords: ingredientData?.negativeKeywords || [],
            allowedCategories: ingredientData?.allowedCategories || [],
            targetSize: ingredientData?.targetSize || null,
        },
        attempts: [],
        selection: null,
        outcome: 'pending', // 'success' | 'failed' | 'error'
        durationMs: 0,
    };

    const builder = {
        /**
         * Start recording a query attempt (tight/normal/wide/fallback).
         * @param {string} queryType - 'tight' | 'normal' | 'wide' | 'fallback'
         * @param {string} queryString - The actual query sent to the API
         * @returns {object} Attempt recorder
         */
        startAttempt(queryType, queryString) {
            const attempt = {
                queryType,
                queryString,
                rawResults: [],
                scoredResults: [],
                rejections: [],
                status: 'pending', // 'success' | 'no_match' | 'no_match_post_filter' | 'fetch_error'
                rawCount: 0,
                passCount: 0,
                bestScore: 0,
            };
            trace.attempts.push(attempt);

            return {
                /**
                 * Record a raw API result (before scoring).
                 * @param {object} product - Raw product from store API
                 */
                addRawResult(product) {
                    if (attempt.rawResults.length < MAX_RAW_PRODUCTS_PER_QUERY) {
                        attempt.rawResults.push({
                            name: product.product_name || product.name || '??',
                            price: product.current_price || product.price || null,
                            size: product.product_size || product.size || null,
                            category: product.product_category || product.category || null,
                        });
                    }
                    attempt.rawCount++;
                },

                /**
                 * Record a product that PASSED scoring.
                 * @param {object} product - The product object
                 * @param {number} score - The score (0-1)
                 */
                addPassedResult(product, score) {
                    if (attempt.scoredResults.length < MAX_SCORED_PRODUCTS_PER_QUERY) {
                        attempt.scoredResults.push({
                            name: product.product_name || product.name || '??',
                            price: product.current_price || product.price || null,
                            size: product.product_size || product.size || null,
                            score: Math.round(score * 1000) / 1000,
                        });
                    }
                    attempt.passCount++;
                    if (score > attempt.bestScore) {
                        attempt.bestScore = Math.round(score * 1000) / 1000;
                    }
                },

                /**
                 * Record a product that FAILED scoring.
                 * @param {object} product - The product object
                 * @param {string} reason - Why it was rejected (from scorer)
                 */
                addRejection(product, reason) {
                    // Only keep first N rejections to avoid bloat
                    if (attempt.rejections.length < MAX_RAW_PRODUCTS_PER_QUERY) {
                        attempt.rejections.push({
                            name: product.product_name || product.name || '??',
                            reason: reason || 'unknown',
                        });
                    }
                },

                /**
                 * Mark this attempt as complete.
                 * @param {string} status - Final status
                 * @param {number} [filteredCount] - Products after price outlier guard
                 */
                finalize(status, filteredCount) {
                    attempt.status = status;
                    if (filteredCount !== undefined) {
                        attempt.postFilterCount = filteredCount;
                    }
                    // Sort scored results by score descending for readability
                    attempt.scoredResults.sort((a, b) => b.score - a.score);
                },
            };
        },

        /**
         * Record the final selected product.
         * @param {object} product - The selected product
         * @param {string} source - 'discovery' | 'fallback' | etc.
         * @param {string} viaQueryType - Which query type found it
         */
        setSelection(product, source, viaQueryType) {
            trace.selection = {
                productName: product?.name || product?.product_name || '??',
                price: product?.price || product?.current_price || null,
                size: product?.size || product?.product_size || null,
                url: product?.url || null,
                score: product?._matchScore || null,
                source,
                viaQueryType,
            };
            trace.outcome = 'success';
        },

        /**
         * Mark this ingredient as failed (no product found).
         * @param {string} [reason] - Optional reason
         */
        setFailed(reason) {
            trace.outcome = 'failed';
            if (reason) {
                trace.failureReason = reason;
            }
        },

        /**
         * Mark this ingredient as errored.
         * @param {string} errorMsg - Error message
         */
        setError(errorMsg) {
            trace.outcome = 'error';
            trace.errorMessage = errorMsg;
        },

        /**
         * Build the final trace object. Call this once at the end.
         * @returns {object} The complete trace data
         */
        build() {
            trace.durationMs = Date.now() - startTime;
            return trace;
        },
    };

    return builder;
}

// ============================================================================
// NO-OP TRACE (zero-cost when disabled)
// ============================================================================

const NO_OP_ATTEMPT = {
    addRawResult() {},
    addPassedResult() {},
    addRejection() {},
    finalize() {},
};

const NO_OP_TRACE = {
    startAttempt() { return NO_OP_ATTEMPT; },
    setSelection() {},
    setFailed() {},
    setError() {},
    build() { return null; },
};

// ============================================================================
// TRACE FORMATTER (for download / display)
// ============================================================================

/**
 * Format a collection of traces into a human-readable text report.
 * Used by the frontend download function.
 *
 * @param {object[]} traces - Array of trace objects from build()
 * @returns {string} Formatted text report
 */
function formatTracesAsText(traces) {
    if (!traces || traces.length === 0) return 'No product match traces recorded.\n';

    let output = '';
    output += '═══════════════════════════════════════════════════════════════\n';
    output += '  PRODUCT MATCH TRACE REPORT\n';
    output += `  Generated: ${new Date().toISOString()}\n`;
    output += `  Total Ingredients: ${traces.length}\n`;
    output += `  Successful: ${traces.filter(t => t.outcome === 'success').length}\n`;
    output += `  Failed: ${traces.filter(t => t.outcome === 'failed').length}\n`;
    output += `  Errors: ${traces.filter(t => t.outcome === 'error').length}\n`;
    output += '═══════════════════════════════════════════════════════════════\n\n';

    for (const trace of traces) {
        const icon = trace.outcome === 'success' ? '✅' : trace.outcome === 'failed' ? '❌' : '⚠️';
        output += `${icon} ${trace.ingredient}\n`;
        output += `${'─'.repeat(60)}\n`;

        // Queries
        output += `  Queries:\n`;
        output += `    Tight:  ${trace.queries.tight || 'N/A'}\n`;
        output += `    Normal: ${trace.queries.normal || 'N/A'}\n`;
        output += `    Wide:   ${trace.queries.wide || 'N/A'}\n`;

        // Validation rules
        output += `  Validation:\n`;
        output += `    Required Words:    [${trace.validationRules.requiredWords.join(', ')}]\n`;
        output += `    Negative Keywords: [${trace.validationRules.negativeKeywords.join(', ')}]\n`;
        output += `    Allowed Categories: [${trace.validationRules.allowedCategories.join(', ')}]\n`;

        // Attempts
        for (const attempt of trace.attempts) {
            const statusIcon = attempt.status === 'success' ? '✓' : attempt.status === 'fetch_error' ? '⚡' : '✗';
            output += `\n  [${statusIcon}] Attempt: ${attempt.queryType.toUpperCase()} → "${attempt.queryString}"\n`;
            output += `      Raw Results: ${attempt.rawCount} | Passed: ${attempt.passCount} | Best Score: ${attempt.bestScore}\n`;

            if (attempt.rawResults.length > 0) {
                output += `      Top API Results:\n`;
                for (const raw of attempt.rawResults) {
                    output += `        • "${raw.name}" ($${raw.price || '?'}, ${raw.size || '?'})\n`;
                }
            }

            if (attempt.scoredResults.length > 0) {
                output += `      Scored (Passed):\n`;
                for (const scored of attempt.scoredResults) {
                    output += `        ★ "${scored.name}" → score=${scored.score} ($${scored.price || '?'})\n`;
                }
            }

            if (attempt.rejections.length > 0) {
                output += `      Rejections:\n`;
                for (const rej of attempt.rejections) {
                    output += `        ✗ "${rej.name}" → ${rej.reason}\n`;
                }
            }
        }

        // Selection
        if (trace.selection) {
            output += `\n  ► SELECTED: "${trace.selection.productName}"\n`;
            output += `    Price: $${trace.selection.price || '?'} | Size: ${trace.selection.size || '?'}\n`;
            output += `    Score: ${trace.selection.score || 'N/A'} | Via: ${trace.selection.viaQueryType} (${trace.selection.source})\n`;
        } else if (trace.outcome === 'failed') {
            output += `\n  ► FAILED: ${trace.failureReason || 'No suitable product found'}\n`;
        } else if (trace.outcome === 'error') {
            output += `\n  ► ERROR: ${trace.errorMessage || 'Unknown error'}\n`;
        }

        output += `  Duration: ${trace.durationMs}ms\n`;
        output += '\n';
    }

    return output;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createMatchTrace,
    formatTracesAsText,
    TRACE_ENABLED,
};