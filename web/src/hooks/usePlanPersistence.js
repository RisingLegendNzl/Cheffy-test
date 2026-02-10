// web/src/hooks/usePlanPersistence.js
import { useState, useEffect, useCallback, useRef } from 'react';
import * as planService from '../services/planPersistence';
import { cachePlan, getCachedPlan, clearCachedPlan, clearAll as clearLocalCache } from '../services/localPlanCache';

/**
 * Custom hook for managing meal plan persistence.
 *
 * FIXES APPLIED (original):
 * - autoSavePlan accepts an optional explicit planData argument so callers
 *   can pass SSE/recovery payloads directly, avoiding stale-closure bugs.
 * - loadPlan now restores formData and nutritionalTargets (requires
 *   setFormData and setNutritionalTargets to be passed in).
 * - The loadActivePlan mount effect uses a ref guard instead of mealPlan
 *   in its dependency array, preventing skip-on-stale-value and re-trigger
 *   loops.
 * - recalculateTotalCost is called after loading to fix the $0 total bug.
 *
 * PERSISTENCE FIX (new):
 * - Every successful save/load/autoSave also writes a plan snapshot to
 *   localStorage via localPlanCache, providing instant restore on refresh.
 * - The mount effect tries localStorage FIRST (synchronous, no network)
 *   before falling back to the Firestore active-plan load.
 * - Exposes clearLocalCache for sign-out cleanup.
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
    setNutritionalTargets
}) => {
    const [savedPlans, setSavedPlans] = useState([]);
    const [activePlanId, setActivePlanId] = useState(null);
    const [savingPlan, setSavingPlan] = useState(false);
    const [loadingPlan, setLoadingPlan] = useState(false);
    const [loadingPlansList, setLoadingPlansList] = useState(false);

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
            const planName = `Plan – ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

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
            // localStorage cache was already written above — plan is safe locally
            return null;
        }
    }, [userId, db, mealPlan, results, uniqueIngredients, formData, nutritionalTargets, listPlans]);

    // ── loadPlan ───────────────────────────────────────────────────────
    /**
     * Loads a saved plan from Firestore and restores ALL five state fields:
     * mealPlan, results, uniqueIngredients, formData, nutritionalTargets.
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
        try {
            const loadedPlan = await planService.loadPlan({
                userId,
                db,
                planId
            });

            // Restore the three core plan-data fields
            if (setMealPlan && loadedPlan.mealPlan) {
                setMealPlan(loadedPlan.mealPlan);
            }
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

            showToast && showToast(`Loaded: ${loadedPlan.name}`, 'success');
            return true;
        } catch (error) {
            console.error('[PLAN_HOOK] Error loading plan:', error);
            showToast && showToast('Failed to load plan', 'error');
            return false;
        } finally {
            setLoadingPlan(false);
        }
    }, [userId, db, showToast, setMealPlan, setResults, setUniqueIngredients, setFormData, setNutritionalTargets, recalculateTotalCost]);

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
            if (cached && cached.meta && cached.meta.planId === planId) {
                clearCachedPlan();
            }

            await listPlans();
            showToast && showToast('Plan deleted', 'success');
            return true;
        } catch (error) {
            console.error('[PLAN_HOOK] Error deleting plan:', error);
            showToast && showToast('Failed to delete plan', 'error');
            return false;
        }
    }, [userId, db, showToast, listPlans]);

    // ── setActivePlan ──────────────────────────────────────────────────
    const setActivePlanHandler = useCallback(async (planId) => {
        if (!userId || !db) {
            return false;
        }

        try {
            if (planId) {
                await planService.setActivePlan({ userId, db, planId });
                setActivePlanId(planId);
            } else {
                setActivePlanId(null);
            }

            await listPlans();
            return true;
        } catch (error) {
            console.error('[PLAN_HOOK] Error setting active plan:', error);
            return false;
        }
    }, [userId, db, listPlans]);

    // ── Load active plan on mount ──────────────────────────────────────
    // PERSISTENCE FIX: Try localStorage first (synchronous, instant), then
    // upgrade to Firestore in background.
    useEffect(() => {
        const loadActivePlan = async () => {
            if (!userId || !db) {
                return;
            }

            // Only attempt once per auth session
            if (hasAttemptedLoadRef.current) {
                return;
            }
            hasAttemptedLoadRef.current = true;

            // ── STEP 1: Instant restore from localStorage ──
            const cached = getCachedPlan();
            if (cached && cached.mealPlan && cached.mealPlan.length > 0) {
                console.log('[PLAN_HOOK] Fast-restoring plan from localStorage cache');
                if (setMealPlan) setMealPlan(cached.mealPlan);
                if (setResults) setResults(cached.results || {});
                if (setUniqueIngredients) setUniqueIngredients(cached.uniqueIngredients || []);
                if (cached.formData && setFormData) {
                    setFormData(prev => ({ ...prev, ...cached.formData }));
                }
                if (cached.nutritionalTargets && cached.nutritionalTargets.calories && setNutritionalTargets) {
                    setNutritionalTargets(cached.nutritionalTargets);
                }
                if (recalculateTotalCost && cached.results) {
                    recalculateTotalCost(cached.results);
                }
            }

            // ── STEP 2: Background upgrade from Firestore (may be newer) ──
            try {
                const active = await planService.getActivePlan({ userId, db });
                if (active && active.planId) {
                    setActivePlanId(active.planId);

                    // Only overwrite if Firestore plan is different from cache
                    const cachedMeta = cached?.meta;
                    if (!cachedMeta || cachedMeta.planId !== active.planId) {
                        console.log('[PLAN_HOOK] Firestore has a different/newer active plan — loading it');
                        await loadPlan(active.planId);
                    } else {
                        console.log('[PLAN_HOOK] Firestore active plan matches localStorage cache — skipping re-fetch');
                    }
                }
            } catch (error) {
                console.error('[PLAN_HOOK] Error loading active plan from Firestore:', error);
                // localStorage cache (if any) is already restored above — user sees data
            }
        };

        loadActivePlan();
    }, [userId, db, loadPlan, setMealPlan, setResults, setUniqueIngredients, setFormData, setNutritionalTargets, recalculateTotalCost]);

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
        setActivePlan: setActivePlanHandler,
        autoSavePlan,
        // ── PERSISTENCE FIX: expose for sign-out cleanup ──
        clearLocalCache,
    };
};

export default usePlanPersistence;