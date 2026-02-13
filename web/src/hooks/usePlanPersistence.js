// web/src/hooks/usePlanPersistence.js
import { useState, useEffect, useCallback, useRef } from ‘react’;
import { flushSync } from ‘react-dom’;
import * as planService from ‘../services/planPersistence’;
import { cachePlan, getCachedPlan, clearCachedPlan, clearAll as clearLocalCache } from ‘../services/localPlanCache’;

/**

- Custom hook for managing meal plan persistence.
- 
- FIXES APPLIED:
- - autoSavePlan accepts an optional explicit planData argument so callers
- can pass SSE/recovery payloads directly, avoiding stale-closure bugs.
- - loadPlan now restores formData and nutritionalTargets (requires
- setFormData and setNutritionalTargets to be passed in).
- - loadPlan now resets selectedDay to 1 to prevent out-of-bounds crashes.
- - loadPlan now synchronously updates activePlanId and persists active status.
- - The loadActivePlan mount effect uses a ref guard instead of mealPlan
- in its dependency array, preventing skip-on-stale-value and re-trigger
- loops.
- - recalculateTotalCost is called after loading to fix the $0 total bug.
- 
- PERSISTENCE FIX:
- - Every successful save/load/autoSave also writes a plan snapshot to
- localStorage via localPlanCache, providing instant restore on refresh.
- - The mount effect tries localStorage FIRST (synchronous, no network)
- before falling back to the Firestore active-plan load.
- - Exposes clearLocalCache for sign-out cleanup.
- 
- WHITE-SCREEN FIX (v14.1):
- - loadPlan now uses flushSync to batch selectedDay reset with mealPlan
- update, preventing intermediate renders where selectedDay is out-of-bounds.
- - Added a transitioning flag exposed as `loadingPlan` to let MainApp
- show a loading fallback during the async load window.
- 
- RENAME FEATURE:
- - Added renamePlan callback that updates only the name field in Firestore
- and optimistically updates local state.
  */
  const usePlanPersistence = ({
  userId,
  isAuthReady,
  db,
  mealPlan,
  results,
  uniqueIngredients,
  formData,
  nutritionalTargets,
  showToast,
  setMealPlan,
  setResults,
  setUniqueIngredients,
  recalculateTotalCost,
  setFormData,
  setNutritionalTargets,
  setSelectedDay
  }) => {
  const [savedPlans, setSavedPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingPlansList, setLoadingPlansList] = useState(false);

```
// Guard ref: ensures the mount-load runs exactly once per auth session
const hasAttemptedLoadRef = useRef(false);

// Reset the guard when user identity changes (sign-out → sign-in)
useEffect(() => {
    hasAttemptedLoadRef.current = false;
}, [userId]);

// ── listPlans ──────────────────────────────────────────────────────
const listPlans = useCallback(async () => {
    if (!userId || !db) {
        return [];
    }

    setLoadingPlansList(true);
    try {
        const plans = await planService.listPlans({ userId, db });
        setSavedPlans(plans);

        const active = plans.find(p => p.isActive);
        setActivePlanId(active ? active.planId : null);

        return plans;
    } catch (error) {
        console.error('[PLAN_HOOK] Error listing plans:', error);
        return [];
    } finally {
        setLoadingPlansList(false);
    }
}, [userId, db]);

// ── savePlan (manual, user-triggered) ──────────────────────────────
const savePlan = useCallback(async (planName) => {
    if (!userId || !db) {
        showToast && showToast('Please sign in to save plans', 'warning');
        return null;
    }

    if (!mealPlan || mealPlan.length === 0) {
        showToast && showToast('No meal plan to save', 'warning');
        return null;
    }

    setSavingPlan(true);
    try {
        const savedPlan = await planService.savePlan({
            userId,
            db,
            planName: planName || `Plan ${new Date().toLocaleDateString()}`,
            mealPlan,
            results,
            uniqueIngredients,
            formData,
            nutritionalTargets
        });

        // ── PERSISTENCE FIX: write-through to localStorage ──
        cachePlan(
            { mealPlan, results, uniqueIngredients, formData, nutritionalTargets },
            { planId: savedPlan?.planId, planName: savedPlan?.name }
        );

        await listPlans();
        showToast && showToast('Plan saved successfully!', 'success');
        return savedPlan;
    } catch (error) {
        console.error('[PLAN_HOOK] Error saving plan:', error);
        showToast && showToast('Failed to save plan', 'error');
        return null;
    } finally {
        setSavingPlan(false);
    }
}, [userId, db, mealPlan, results, uniqueIngredients, formData, nutritionalTargets, showToast, listPlans]);

// ── autoSavePlan ───────────────────────────────────────────────────
/**
 * Automatically saves a plan and marks it active.
 *
 * @param {object} [planData] - Optional explicit data to save. When
 *   provided, these values are used instead of hook closure state.
 *   Expected shape: { mealPlan, results, uniqueIngredients, formData,
 *   nutritionalTargets }
 * @returns {Promise<string|null>} The planId if saved, or null.
 */
const autoSavePlan = useCallback(async (planData) => {
    if (!userId || !db) {
        console.warn('[PLAN_HOOK] autoSavePlan skipped: no userId or db');
        // ── PERSISTENCE FIX: even without auth, cache locally ──
        if (planData && planData.mealPlan && planData.mealPlan.length > 0) {
            cachePlan(planData);
        }
        return null;
    }

    // Use explicit data if provided, otherwise fall back to closure state
    const mp   = planData?.mealPlan          ?? mealPlan;
    const res  = planData?.results           ?? results;
    const ui   = planData?.uniqueIngredients ?? uniqueIngredients;
    const fd   = planData?.formData          ?? formData;
    const nt   = planData?.nutritionalTargets ?? nutritionalTargets;

    if (!mp || mp.length === 0) {
        console.warn('[PLAN_HOOK] autoSavePlan skipped: no meal plan data');
        return null;
    }

    // ── PERSISTENCE FIX: always cache locally first (synchronous, instant) ──
    cachePlan({ mealPlan: mp, results: res, uniqueIngredients: ui, formData: fd, nutritionalTargets: nt });

    try {
        const now = new Date();
        const planName = `Plan - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        const savedPlan = await planService.autoSavePlan({
            userId,
            db,
            planName,
            mealPlan: mp,
            results: res,
            uniqueIngredients: ui,
            formData: fd,
            nutritionalTargets: nt
        });

        if (savedPlan && savedPlan.planId) {
            await planService.setActivePlan({ userId, db, planId: savedPlan.planId });
            setActivePlanId(savedPlan.planId);
            console.log('[PLAN_HOOK] Auto-saved and activated plan:', savedPlan.planId);

            // Update localStorage meta with the Firestore planId
            cachePlan(
                { mealPlan: mp, results: res, uniqueIngredients: ui, formData: fd, nutritionalTargets: nt },
                { planId: savedPlan.planId, planName }
            );

            // Refresh plans list in background
            listPlans().catch(() => {});

            return savedPlan.planId;
        }

        return null;
    } catch (error) {
        console.error('[PLAN_HOOK] autoSavePlan error:', error);
        // localStorage cache was already written above -- plan is safe locally
        return null;
    }
}, [userId, db, mealPlan, results, uniqueIngredients, formData, nutritionalTargets, listPlans]);

// ── loadPlan ───────────────────────────────────────────────────────
/**
 * Loads a saved plan from Firestore and restores ALL five state fields:
 * mealPlan, results, uniqueIngredients, formData, nutritionalTargets.
 *
 * CRITICAL FIXES:
 * - Resets selectedDay to 1 to prevent out-of-bounds crashes
 * - Updates activePlanId synchronously to prevent UI desync
 * - Marks plan as active in Firestore
 * - Uses staging variables for atomic state updates
 *
 * WHITE-SCREEN FIX (v14.1):
 * - Uses flushSync to apply selectedDay + mealPlan in one synchronous
 *   commit, eliminating the intermediate render where selectedDay is
 *   out-of-bounds for the new plan.
 */
const loadPlan = useCallback(async (planId) => {
    if (!userId || !db) {
        showToast && showToast('Please sign in to load plans', 'warning');
        return false;
    }

    if (!planId) {
        showToast && showToast('Invalid plan ID', 'error');
        return false;
    }

    setLoadingPlan(true);

    // Stage all updates in local variables for atomic application
    let stagedPlan = null;

    try {
        const loadedPlan = await planService.loadPlan({
            userId,
            db,
            planId
        });

        stagedPlan = loadedPlan;

        // ── CRITICAL FIX 1: Mark as active in Firestore BEFORE updating UI ──
        await planService.setActivePlan({ userId, db, planId });

        // ── WHITE-SCREEN FIX: Use flushSync to batch selectedDay + mealPlan ──
        // Without flushSync, React may render between setSelectedDay(1) and
        // setMealPlan(newPlan). If the OLD plan had 7 days and selectedDay was 5,
        // the intermediate state would be selectedDay=1, mealPlan=[old 7-day plan]
        // which is fine -- but if React batches differently or the old plan is
        // already cleared, it can flash a blank. flushSync guarantees both updates
        // commit in a single synchronous render pass.
        flushSync(() => {
            // Reset selectedDay FIRST to prevent out-of-bounds render
            if (setSelectedDay) {
                setSelectedDay(1);
            }

            // Update plan content atomically with the day reset
            if (setMealPlan && loadedPlan.mealPlan) {
                setMealPlan(loadedPlan.mealPlan);
            }
        });

        // These can safely happen outside flushSync -- they don't affect
        // the day/plan render boundary
        if (setResults && loadedPlan.results) {
            setResults(loadedPlan.results);
        }
        if (setUniqueIngredients && loadedPlan.uniqueIngredients) {
            setUniqueIngredients(loadedPlan.uniqueIngredients);
        }

        // Restore formData so the profile/setup panel reflects the plan's parameters
        if (setFormData && loadedPlan.formData && Object.keys(loadedPlan.formData).length > 0) {
            setFormData(prev => ({
                ...prev,
                ...loadedPlan.formData
            }));
        }

        // Restore nutritionalTargets so calorie/macro bars show correct values
        if (setNutritionalTargets && loadedPlan.nutritionalTargets && loadedPlan.nutritionalTargets.calories) {
            setNutritionalTargets(loadedPlan.nutritionalTargets);
        }

        // Recalculate total cost from loaded results
        if (recalculateTotalCost && loadedPlan.results) {
            console.log('[PLAN_HOOK] Recalculating total cost after loading plan');
            recalculateTotalCost(loadedPlan.results);
        }

        // ── CRITICAL FIX 3: Update activePlanId to sync UI selection ──
        setActivePlanId(planId);

        // ── PERSISTENCE FIX: write-through to localStorage ──
        cachePlan(
            {
                mealPlan: loadedPlan.mealPlan,
                results: loadedPlan.results,
                uniqueIngredients: loadedPlan.uniqueIngredients,
                formData: loadedPlan.formData,
                nutritionalTargets: loadedPlan.nutritionalTargets,
            },
            { planId: loadedPlan.planId, planName: loadedPlan.name }
        );

        // Refresh plans list to update isActive flags
        await listPlans();

        showToast && showToast(`Loaded: ${loadedPlan.name}`, 'success');
        return true;
    } catch (error) {
        console.error('[PLAN_HOOK] Error loading plan:', error);
        showToast && showToast('Failed to load plan', 'error');

        // ── ERROR RECOVERY: Don't leave UI in partial state ──
        // If load failed, don't update any state

        return false;
    } finally {
        setLoadingPlan(false);
    }
}, [userId, db, showToast, setMealPlan, setResults, setUniqueIngredients, setFormData, setNutritionalTargets, setSelectedDay, recalculateTotalCost, listPlans]);

// ── deletePlan ─────────────────────────────────────────────────────
const deletePlan = useCallback(async (planId) => {
    if (!userId || !db) {
        showToast && showToast('Please sign in to delete plans', 'warning');
        return false;
    }

    if (!planId) {
        showToast && showToast('Invalid plan ID', 'error');
        return false;
    }

    try {
        await planService.deletePlan({ userId, db, planId });

        // ── PERSISTENCE FIX: if we just deleted the cached plan, clear local cache ──
        const cached = getCachedPlan();
        if (cached?.meta?.planId === planId) {
            clearCachedPlan();
        }

        // If we deleted the active plan, clear the active ID
        if (activePlanId === planId) {
            setActivePlanId(null);
        }

        await listPlans();
        showToast && showToast('Plan deleted', 'success');
        return true;
    } catch (error) {
        console.error('[PLAN_HOOK] Error deleting plan:', error);
        showToast && showToast('Failed to delete plan', 'error');
        return false;
    }
}, [userId, db, showToast, activePlanId, listPlans]);

// ── renamePlan ─────────────────────────────────────────────────────
/**
 * Renames an existing saved plan. Only updates the `name` field in
 * Firestore -- all other data and the planId remain unchanged.
 *
 * Optimistically updates local state for instant UI feedback, then
 * re-fetches on error to ensure consistency.
 *
 * @param {string} planId - The ID of the plan to rename.
 * @param {string} newName - The new name (will be trimmed).
 * @returns {Promise<void>}
 */
const renamePlan = useCallback(async (planId, newName) => {
    if (!userId || !db) {
        showToast && showToast('Please sign in to rename plans', 'warning');
        return;
    }

    if (!planId || !newName?.trim()) {
        showToast && showToast('Invalid plan name', 'error');
        return;
    }

    try {
        await planService.renamePlan({ userId, db, planId, newName: newName.trim() });

        // Update local state immediately (optimistic update)
        setSavedPlans(prev =>
            prev.map(p => p.planId === planId ? { ...p, name: newName.trim() } : p)
        );

        showToast && showToast('Plan renamed successfully', 'success');
    } catch (error) {
        console.error('[PLAN_HOOK] Error renaming plan:', error);
        showToast && showToast('Failed to rename plan', 'error');
        // Re-fetch to ensure consistency
        listPlans().catch(() => {});
        throw error; // Re-throw so the UI can show the error state
    }
}, [userId, db, showToast, listPlans]);

// ── setActivePlan (manual, user-triggered) ─────────────────────────
const setActivePlanHandler = useCallback(async (planId) => {
    if (!userId || !db || !planId) return false;

    try {
        await planService.setActivePlan({ userId, db, planId });
        setActivePlanId(planId);
        return true;
    } catch (error) {
        console.error('[PLAN_HOOK] Error setting active plan:', error);
        return false;
    }
}, [userId, db]);

// ── Load active plan on mount ──────────────────────────────────────
useEffect(() => {
    if (!userId || !db || !isAuthReady) return;
    if (hasAttemptedLoadRef.current) return;
    hasAttemptedLoadRef.current = true;

    const loadActivePlan = async () => {
        // ── STEP 1: Instant restore from localStorage (synchronous) ──
        const cached = getCachedPlan();
        if (cached && cached.mealPlan && cached.mealPlan.length > 0) {
            console.log('[PLAN_HOOK] Restoring plan from localStorage cache');
            if (setMealPlan) setMealPlan(cached.mealPlan);
            if (setResults && cached.results) setResults(cached.results);
            if (setUniqueIngredients && cached.uniqueIngredients) setUniqueIngredients(cached.uniqueIngredients);
            if (setFormData && cached.formData) setFormData(prev => ({ ...prev, ...cached.formData }));
            if (setNutritionalTargets && cached.nutritionalTargets) setNutritionalTargets(cached.nutritionalTargets);
            if (recalculateTotalCost && cached.results) {
                recalculateTotalCost(cached.results);
            }
            // Restore selectedDay to 1 on mount
            if (setSelectedDay) {
                setSelectedDay(1);
            }
        }

        // ── STEP 2: Background upgrade from Firestore (may be newer) ──
        try {
            const active = await planService.getActivePlan({ userId, db });
            if (active && active.planId) {
                // Only overwrite if Firestore plan is different from cache
                const cachedMeta = cached?.meta;
                if (!cachedMeta || cachedMeta.planId !== active.planId) {
                    console.log('[PLAN_HOOK] Firestore has a different/newer active plan -- loading it');
                    // loadPlan will handle setActivePlanId and setSelectedDay
                    await loadPlan(active.planId);
                } else {
                    console.log('[PLAN_HOOK] Firestore active plan matches localStorage cache -- skipping re-fetch');
                    // Still need to set activePlanId for UI highlighting
                    setActivePlanId(active.planId);
                }
            }
        } catch (error) {
            console.error('[PLAN_HOOK] Error loading active plan from Firestore:', error);
            // localStorage cache (if any) is already restored above -- user sees data
        }
    };

    loadActivePlan();
}, [userId, db, loadPlan, setMealPlan, setResults, setUniqueIngredients, setFormData, setNutritionalTargets, setSelectedDay, recalculateTotalCost]);

// ── Load plans list on mount ───────────────────────────────────────
useEffect(() => {
    if (userId && db) {
        listPlans().catch(err => {
            console.error('[PLAN_HOOK] Silent error loading plans list:', err);
        });
    }
}, [userId, db, listPlans]);

return {
    savedPlans,
    activePlanId,
    savingPlan,
    loadingPlan,
    loadingPlansList,
    savePlan,
    loadPlan,
    listPlans,
    deletePlan,
    renamePlan,
    setActivePlan: setActivePlanHandler,
    autoSavePlan,
    // ── PERSISTENCE FIX: expose for sign-out cleanup ──
    clearLocalCache,
};
```

};

export default usePlanPersistence;