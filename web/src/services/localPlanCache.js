// web/src/services/localPlanCache.js
// ─────────────────────────────────────────────────────────────────────────────
// Thin persistence layer over localStorage (plan data) and sessionStorage
// (orchestrator logs, active run ID).
//
// PURPOSE:
//   Provide synchronous, instant restore of critical UI state across refreshes
//   and tab re-opens without waiting for Firestore or any network call.
//
// DESIGN DECISIONS:
//   • localStorage  → plan data (survives tab close + reopen)
//   • sessionStorage → logs & active runId (per-tab, survives refresh only)
//   • All keys are namespaced under `cheffy:cache:` to avoid collisions.
//   • Every write is wrapped in try/catch to gracefully handle QuotaExceeded.
//   • A plan snapshot is ~200–400 KB for a 7-day plan — well within the 5 MB
//     localStorage budget.  Logs are capped at MAX_LOG_ENTRIES to stay safe.
// ─────────────────────────────────────────────────────────────────────────────

// ── Key constants ──────────────────────────────────────────────────────────
const KEYS = {
    PLAN_DATA:    'cheffy:cache:plan_data',
    PLAN_META:    'cheffy:cache:plan_meta',     // { savedAt, planId, planName }
    LOGS:         'cheffy:cache:logs',
    RUN_ID:       'cheffy:cache:run_id',
    RUN_STATE:    'cheffy:cache:run_state',      // 'generating' | 'polling' | null
    FORM_DATA:    'cheffy:cache:form_data',
    TARGETS:      'cheffy:cache:targets',
};

const MAX_LOG_ENTRIES = 500;

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Safe JSON.stringify with circular-reference protection.
 */
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

/**
 * Safe JSON.parse — returns defaultValue on any failure.
 */
function safeParse(raw, defaultValue = null) {
    if (raw === null || raw === undefined) return defaultValue;
    try {
        return JSON.parse(raw);
    } catch {
        return defaultValue;
    }
}

/**
 * Write to a storage backend (localStorage or sessionStorage).
 * Returns true on success, false on quota / security errors.
 */
function writeStorage(storage, key, value) {
    try {
        const serialised = safeStringify(value);
        if (serialised === null) {
            console.warn(`[LOCAL_CACHE] Failed to serialise value for key: ${key}`);
            return false;
        }
        storage.setItem(key, serialised);
        return true;
    } catch (err) {
        if (err.name === 'QuotaExceededError' || err.code === 22) {
            console.warn(`[LOCAL_CACHE] Storage quota exceeded writing key: ${key}. Attempting eviction…`);
            // Evict logs first (largest likely item)
            try {
                sessionStorage.removeItem(KEYS.LOGS);
                storage.setItem(key, safeStringify(value));
                return true;
            } catch {
                console.error(`[LOCAL_CACHE] Eviction failed — cannot write key: ${key}`);
            }
        } else {
            console.error(`[LOCAL_CACHE] Write error for key ${key}:`, err);
        }
        return false;
    }
}

/**
 * Read from a storage backend.
 */
function readStorage(storage, key, defaultValue = null) {
    try {
        const raw = storage.getItem(key);
        return safeParse(raw, defaultValue);
    } catch {
        return defaultValue;
    }
}

/**
 * Remove a key from a storage backend.
 */
function removeStorage(storage, key) {
    try {
        storage.removeItem(key);
    } catch {
        // Ignore — key may not exist or storage may be inaccessible
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Plan Data (localStorage)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cache the current plan snapshot to localStorage.
 *
 * @param {object} planData
 * @param {Array}  planData.mealPlan
 * @param {object} planData.results
 * @param {Array}  planData.uniqueIngredients
 * @param {object} [planData.formData]
 * @param {object} [planData.nutritionalTargets]
 * @param {object} [meta]  - Optional { planId, planName }
 * @returns {boolean} true on success
 */
export function cachePlan(planData, meta = {}) {
    if (!planData || !planData.mealPlan || planData.mealPlan.length === 0) {
        return false;
    }

    const payload = {
        mealPlan: planData.mealPlan,
        results: planData.results || {},
        uniqueIngredients: planData.uniqueIngredients || [],
    };

    const ok1 = writeStorage(localStorage, KEYS.PLAN_DATA, payload);

    // Store form data and targets separately (smaller, less volatile)
    if (planData.formData) {
        writeStorage(localStorage, KEYS.FORM_DATA, planData.formData);
    }
    if (planData.nutritionalTargets) {
        writeStorage(localStorage, KEYS.TARGETS, planData.nutritionalTargets);
    }

    const metaObj = {
        savedAt: new Date().toISOString(),
        planId: meta.planId || null,
        planName: meta.planName || null,
    };
    writeStorage(localStorage, KEYS.PLAN_META, metaObj);

    if (ok1) {
        console.log('[LOCAL_CACHE] Plan cached to localStorage');
    }
    return ok1;
}

/**
 * Retrieve the cached plan from localStorage.
 *
 * @returns {object|null}  { mealPlan, results, uniqueIngredients, formData,
 *                            nutritionalTargets, meta } or null
 */
export function getCachedPlan() {
    const planData = readStorage(localStorage, KEYS.PLAN_DATA, null);
    if (!planData || !planData.mealPlan || planData.mealPlan.length === 0) {
        return null;
    }

    return {
        mealPlan: planData.mealPlan,
        results: planData.results || {},
        uniqueIngredients: planData.uniqueIngredients || [],
        formData: readStorage(localStorage, KEYS.FORM_DATA, null),
        nutritionalTargets: readStorage(localStorage, KEYS.TARGETS, null),
        meta: readStorage(localStorage, KEYS.PLAN_META, {}),
    };
}

/**
 * Clear cached plan data from localStorage.
 */
export function clearCachedPlan() {
    removeStorage(localStorage, KEYS.PLAN_DATA);
    removeStorage(localStorage, KEYS.PLAN_META);
    removeStorage(localStorage, KEYS.FORM_DATA);
    removeStorage(localStorage, KEYS.TARGETS);
    console.log('[LOCAL_CACHE] Cached plan cleared');
}


// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Diagnostic Logs (sessionStorage — per-tab, survives refresh)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Persist the current diagnostic logs array to sessionStorage.
 * Automatically truncates to the most recent MAX_LOG_ENTRIES entries.
 *
 * @param {Array} logs
 * @returns {boolean}
 */
export function cacheLogs(logs) {
    if (!Array.isArray(logs)) return false;
    const trimmed = logs.length > MAX_LOG_ENTRIES
        ? logs.slice(logs.length - MAX_LOG_ENTRIES)
        : logs;
    return writeStorage(sessionStorage, KEYS.LOGS, trimmed);
}

/**
 * Retrieve cached logs from sessionStorage.
 *
 * @returns {Array}
 */
export function getCachedLogs() {
    return readStorage(sessionStorage, KEYS.LOGS, []);
}

/**
 * Clear cached logs.
 */
export function clearCachedLogs() {
    removeStorage(sessionStorage, KEYS.LOGS);
}


// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Active Run State (sessionStorage — per-tab)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Persist the active generation run ID so it survives a tab refresh.
 *
 * @param {string} runId
 * @param {string} [state='generating']  - 'generating' | 'polling'
 */
export function cacheRunId(runId, state = 'generating') {
    if (!runId) return;
    writeStorage(sessionStorage, KEYS.RUN_ID, runId);
    writeStorage(sessionStorage, KEYS.RUN_STATE, state);
}

/**
 * Retrieve the cached run ID and its state.
 *
 * @returns {{ runId: string|null, state: string|null }}
 */
export function getCachedRunState() {
    return {
        runId: readStorage(sessionStorage, KEYS.RUN_ID, null),
        state: readStorage(sessionStorage, KEYS.RUN_STATE, null),
    };
}

/**
 * Clear run state (call after generation completes or fails).
 */
export function clearRunState() {
    removeStorage(sessionStorage, KEYS.RUN_ID);
    removeStorage(sessionStorage, KEYS.RUN_STATE);
}


// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Full Cleanup
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wipe ALL cheffy cache keys from both storage backends.
 * Call on sign-out to prevent data leaking between accounts.
 */
export function clearAll() {
    Object.values(KEYS).forEach(key => {
        removeStorage(localStorage, key);
        removeStorage(sessionStorage, key);
    });
    console.log('[LOCAL_CACHE] All cache cleared');
}
