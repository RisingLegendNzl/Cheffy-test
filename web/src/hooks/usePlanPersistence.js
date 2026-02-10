// web/src/hooks/usePlanPersistence.js
import { useState, useEffect, useCallback } from 'react';
import * as planService from '../services/planPersistence';

/**
 * Custom hook for managing meal plan persistence
 * 
 * FIX: Added recalculateTotalCost parameter and invoke it after loading plans
 * This fixes the bug where total cost and estimated savings show $0 after loading
 * 
 * FIX: Added autoSavePlan method for automatic persistence after generation/recovery
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
    recalculateTotalCost  // FIX: New parameter to recalculate costs after loading
}) => {
    const [savedPlans, setSavedPlans] = useState([]);
    const [activePlanId, setActivePlanId] = useState(null);
    const [savingPlan, setSavingPlan] = useState(false);
    const [loadingPlan, setLoadingPlan] = useState(false);
    const [loadingPlansList, setLoadingPlansList] = useState(false);

    // Hardened listPlans implementation
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

    /**
     * autoSavePlan — Automatically saves the current plan and marks it active.
     * Called programmatically after plan generation completes or after recovery.
     * Does NOT show toast notifications (silent operation).
     * Skips backend validation (unnecessary for a freshly generated plan).
     * 
     * @returns {Promise<string|null>} The planId if saved, or null on failure.
     */
    const autoSavePlan = useCallback(async () => {
        if (!userId || !db) {
            console.warn('[PLAN_HOOK] autoSavePlan skipped: no userId or db');
            return null;
        }

        if (!mealPlan || mealPlan.length === 0) {
            console.warn('[PLAN_HOOK] autoSavePlan skipped: no meal plan data');
            return null;
        }

        try {
            const now = new Date();
            const planName = `Plan – ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

            const savedPlan = await planService.autoSavePlan({
                userId,
                db,
                planName,
                mealPlan,
                results,
                uniqueIngredients,
                formData,
                nutritionalTargets
            });

            if (savedPlan && savedPlan.planId) {
                // Mark as active so it auto-loads on next mount
                await planService.setActivePlan({ userId, db, planId: savedPlan.planId });
                setActivePlanId(savedPlan.planId);
                console.log('[PLAN_HOOK] Auto-saved and activated plan:', savedPlan.planId);

                // Refresh the plans list in the background
                listPlans().catch(() => {});

                return savedPlan.planId;
            }

            return null;
        } catch (error) {
            console.error('[PLAN_HOOK] autoSavePlan error:', error);
            return null;
        }
    }, [userId, db, mealPlan, results, uniqueIngredients, formData, nutritionalTargets, listPlans]);

    /**
     * FIX: Enhanced loadPlan function that recalculates totals after loading
     * 
     * CRITICAL CHANGE: After setting state with loaded plan data, we now call
     * recalculateTotalCost(loadedPlan.results) to recompute the shopping total
     * and trigger derived value recalculation (estimated savings).
     * 
     * This fixes the bug where total cost shows $0 when loading saved plans.
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

            // Set all state from loaded plan
            if (setMealPlan && loadedPlan.mealPlan) {
                setMealPlan(loadedPlan.mealPlan);
            }
            if (setResults && loadedPlan.results) {
                setResults(loadedPlan.results);
            }
            if (setUniqueIngredients && loadedPlan.uniqueIngredients) {
                setUniqueIngredients(loadedPlan.uniqueIngredients);
            }

            // FIX: Recalculate total cost from loaded results
            // This is the critical missing piece that caused the $0 bug
            if (recalculateTotalCost && loadedPlan.results) {
                console.log('[PLAN_HOOK] Recalculating total cost after loading plan');
                recalculateTotalCost(loadedPlan.results);
            }

            showToast && showToast(`Loaded: ${loadedPlan.name}`, 'success');
            return true;
        } catch (error) {
            console.error('[PLAN_HOOK] Error loading plan:', error);
            showToast && showToast('Failed to load plan', 'error');
            return false;
        } finally {
            setLoadingPlan(false);
        }
    }, [userId, db, showToast, setMealPlan, setResults, setUniqueIngredients, recalculateTotalCost]);

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
            await listPlans();
            showToast && showToast('Plan deleted', 'success');
            return true;
        } catch (error) {
            console.error('[PLAN_HOOK] Error deleting plan:', error);
            showToast && showToast('Failed to delete plan', 'error');
            return false;
        }
    }, [userId, db, showToast, listPlans]);

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

    // Load active plan on mount
    useEffect(() => {
        const loadActivePlan = async () => {
            if (!userId || !db) {
                return;
            }

            try {
                const active = await planService.getActivePlan({ userId, db });
                if (active && active.planId) {
                    setActivePlanId(active.planId);
                    // Only auto-load if there's no current meal plan
                    if (!mealPlan || mealPlan.length === 0) {
                        await loadPlan(active.planId);
                    }
                }
            } catch (error) {
                console.error('[PLAN_HOOK] Error loading active plan on mount:', error);
            }
        };

        loadActivePlan();
    }, [userId, db, mealPlan, loadPlan]); 

    // Load plans list on mount
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
        autoSavePlan
    };
};

export default usePlanPersistence;