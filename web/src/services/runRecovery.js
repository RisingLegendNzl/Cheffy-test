// web/src/services/runRecovery.js
// ---------------------------------------------------------------------------
// Run Recovery Service
// ---------------------------------------------------------------------------
// Persists the current plan-generation runId (and associated metadata) to
// localStorage so that if the browser tab is refreshed or closed mid-
// generation, the frontend can detect the in-flight run on next mount and
// resume polling the /api/plan/status endpoint to recover the completed plan.
//
// DESIGN NOTES:
// - All writes are fire-and-forget; a localStorage failure must never block
//   plan generation.
// - The stored record includes a timestamp so stale entries (> MAX_AGE_MS)
//   are automatically discarded on read.
// - Only ONE pending run is tracked at a time. Starting a new generation
//   overwrites any previous pending entry.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'cheffy_pending_run';

/**
 * Maximum age (in milliseconds) for a pending run record before it is
 * considered stale and discarded.  Matches the backend KV TTL of 1 hour.
 */
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a runId to localStorage when a new plan generation begins.
 *
 * Call this as soon as the runId is known (i.e. when the `plan:start` SSE
 * event is received, or immediately after the fetch if the backend returns
 * the runId in the first event).
 *
 * @param {string} runId - The unique run identifier from the backend.
 * @param {object} [meta] - Optional metadata to store alongside the runId.
 *   Useful for restoring UI state (e.g. formData snapshot, generation step).
 */
export const persistRunId = (runId, meta = {}) => {
    if (!runId) return;
    try {
        const record = {
            runId,
            startedAt: Date.now(),
            ...meta,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        console.log('[RUN_RECOVERY] Persisted runId:', runId);
    } catch (err) {
        // localStorage may be full or disabled — never block the caller.
        console.warn('[RUN_RECOVERY] Failed to persist runId:', err.message);
    }
};

/**
 * Retrieve a pending (non-stale) runId from localStorage.
 *
 * Returns `null` if there is no pending run or if the stored record has
 * exceeded MAX_AGE_MS.
 *
 * @returns {{ runId: string, startedAt: number, [key: string]: any } | null}
 */
export const getPendingRun = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const record = JSON.parse(raw);

        // Validate shape
        if (!record || typeof record.runId !== 'string' || !record.startedAt) {
            clearPendingRun();
            return null;
        }

        // Discard stale entries
        if (Date.now() - record.startedAt > MAX_AGE_MS) {
            console.log('[RUN_RECOVERY] Discarding stale pending run:', record.runId);
            clearPendingRun();
            return null;
        }

        return record;
    } catch (err) {
        console.warn('[RUN_RECOVERY] Failed to read pending run:', err.message);
        clearPendingRun();
        return null;
    }
};

/**
 * Clear the pending run from localStorage.
 *
 * Call this when:
 *  - The plan:complete event is received via SSE (normal completion).
 *  - The polling recovery path successfully retrieves the completed plan.
 *  - The user explicitly cancels generation.
 *  - The run has been detected as failed and the UI has handled the error.
 */
export const clearPendingRun = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
        console.log('[RUN_RECOVERY] Cleared pending run.');
    } catch (err) {
        console.warn('[RUN_RECOVERY] Failed to clear pending run:', err.message);
    }
};

/**
 * Check whether a non-stale pending run exists.
 * Convenience wrapper — avoids parsing the full record when the caller
 * only needs a boolean.
 *
 * @returns {boolean}
 */
export const hasPendingRun = () => {
    return getPendingRun() !== null;
};