// web/src/services/planPersistence.js
// Service layer for meal plan persistence.
// Handles API validation calls and Firestore operations.

import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Validate request with backend before performing Firestore operation.
 * @param {string} action - Action to validate
 * @param {string} userId - User ID
 * @param {object} payload - Additional data for validation
 * @returns {Promise<boolean>} Whether validation succeeded
 */
const validateWithBackend = async (action, userId, payload = {}) => {
    try {
        const response = await fetch(`${API_BASE}/api/plans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                userId,
                ...payload
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[PLAN_SERVICE] Validation failed:', errorData);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[PLAN_SERVICE] Validation error:', error);
        return false;
    }
};

/**
 * Save a meal plan to Firestore (manual, user-triggered).
 * Includes backend validation before writing.
 */
export const savePlan = async ({
    userId,
    db,
    planName,
    mealPlan,
    results,
    uniqueIngredients,
    formData,
    nutritionalTargets
}) => {
    if (!userId || !db) {
        throw new Error('Missing userId or database instance');
    }

    if (!mealPlan || mealPlan.length === 0) {
        throw new Error('Cannot save empty meal plan');
    }

    const planData = {
        mealPlan,
        results: results || {},
        uniqueIngredients: uniqueIngredients || [],
        formData: formData || {},
        nutritionalTargets: nutritionalTargets || {}
    };

    // Validate with backend
    const isValid = await validateWithBackend('save', userId, { planData, planName });
    if (!isValid) {
        throw new Error('Plan validation failed');
    }

    // Generate plan ID and save to Firestore
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const planDoc = {
        planId,
        name: planName || `Plan ${new Date().toLocaleDateString()}`,
        mealPlan,
        results: results || {},
        uniqueIngredients: uniqueIngredients || [],
        formData: formData || {},
        nutritionalTargets: nutritionalTargets || {},
        createdAt: new Date().toISOString(),
        isActive: false
    };

    const planRef = doc(db, 'plans', userId, 'saved_plans', planId);
    await setDoc(planRef, planDoc);

    console.log('[PLAN_SERVICE] Plan saved successfully:', planId);
    return planDoc;
};

/**
 * Auto-save a meal plan to Firestore without backend validation.
 * Used programmatically after generation completes or after recovery.
 * Skips the validation round-trip since the plan was just generated.
 *
 * All data fields are passed explicitly by the caller -- this function
 * does NOT read from React state or closures.
 *
 * PERSISTENCE FIX: Includes a single retry on Firestore write failure.
 */
export const autoSavePlan = async ({
    userId,
    db,
    planName,
    mealPlan,
    results,
    uniqueIngredients,
    formData,
    nutritionalTargets
}) => {
    if (!userId || !db) {
        console.warn('[PLAN_SERVICE] autoSavePlan skipped: missing userId or db');
        return null;
    }

    if (!mealPlan || mealPlan.length === 0) {
        console.warn('[PLAN_SERVICE] autoSavePlan skipped: empty meal plan');
        return null;
    }

    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const planDoc = {
        planId,
        name: planName || `Plan - ${new Date().toLocaleDateString()}`,
        mealPlan,
        results: results || {},
        uniqueIngredients: uniqueIngredients || [],
        formData: formData || {},
        nutritionalTargets: nutritionalTargets || {},
        createdAt: new Date().toISOString(),
        isActive: true
    };

    const MAX_RETRIES = 1;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const planRef = doc(db, 'plans', userId, 'saved_plans', planId);
            await setDoc(planRef, planDoc);
            console.log('[PLAN_SERVICE] Auto-saved plan:', planId, attempt > 0 ? `(retry ${attempt})` : '');
            return planDoc;
        } catch (error) {
            lastError = error;
            console.warn(`[PLAN_SERVICE] autoSavePlan attempt ${attempt + 1} failed:`, error.message);
            if (attempt < MAX_RETRIES) {
                // Brief delay before retry
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    console.error('[PLAN_SERVICE] autoSavePlan failed after retries:', lastError);
    return null;
};

/**
 * Load a meal plan from Firestore.
 */
export const loadPlan = async ({ userId, db, planId }) => {
    if (!userId || !db || !planId) {
        throw new Error('Missing required parameters');
    }

    // Validate with backend
    const isValid = await validateWithBackend('load', userId, { planId });
    if (!isValid) {
        throw new Error('Plan load validation failed');
    }

    // Load from Firestore
    const planRef = doc(db, 'plans', userId, 'saved_plans', planId);
    const planSnap = await getDoc(planRef);

    if (!planSnap.exists()) {
        throw new Error('Plan not found');
    }

    console.log('[PLAN_SERVICE] Plan loaded successfully:', planId);
    return planSnap.data();
};

/**
 * List all saved plans for a user.
 */
export const listPlans = async ({ userId, db }) => {
    if (!userId || !db) {
        throw new Error('Missing userId or database instance');
    }

    // Validate with backend
    const isValid = await validateWithBackend('list', userId);
    if (!isValid) {
        throw new Error('Plan list validation failed');
    }

    // Query Firestore
    const plansRef = collection(db, 'plans', userId, 'saved_plans');
    const q = query(plansRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const plans = [];
    querySnapshot.forEach((docSnap) => {
        plans.push(docSnap.data());
    });

    console.log('[PLAN_SERVICE] Plans listed:', plans.length);
    return plans;
};

/**
 * Delete a saved plan.
 */
export const deletePlan = async ({ userId, db, planId }) => {
    if (!userId || !db || !planId) {
        throw new Error('Missing required parameters');
    }

    // Validate with backend
    const isValid = await validateWithBackend('delete', userId, { planId });
    if (!isValid) {
        throw new Error('Plan deletion validation failed');
    }

    // Delete from Firestore
    const planRef = doc(db, 'plans', userId, 'saved_plans', planId);
    await deleteDoc(planRef);

    console.log('[PLAN_SERVICE] Plan deleted successfully:', planId);
};

/**
 * Rename an existing saved plan.
 * Only updates the `name` field -- all other data and the planId remain unchanged.
 */
export const renamePlan = async ({ userId, db, planId, newName }) => {
    if (!userId || !db || !planId) {
        throw new Error('Missing required parameters');
    }

    if (!newName || !newName.trim()) {
        throw new Error('Plan name cannot be empty');
    }

    // Validate with backend
    const isValid = await validateWithBackend('rename', userId, { planId, planName: newName.trim() });
    if (!isValid) {
        throw new Error('Plan rename validation failed');
    }

    // Load current plan doc, update name only
    const planRef = doc(db, 'plans', userId, 'saved_plans', planId);
    const planSnap = await getDoc(planRef);

    if (!planSnap.exists()) {
        throw new Error('Plan not found');
    }

    const existing = planSnap.data();
    await setDoc(planRef, {
        ...existing,
        name: newName.trim()
    });

    console.log('[PLAN_SERVICE] Plan renamed successfully:', planId, '→', newName.trim());
};

/**
 * Set a plan as active. Clears the isActive flag on all other plans.
 */
export const setActivePlan = async ({ userId, db, planId }) => {
    if (!userId || !db) {
        throw new Error('Missing userId or database instance');
    }

    // Validate with backend
    const isValid = await validateWithBackend('set-active', userId, { planId });
    if (!isValid) {
        throw new Error('Set active plan validation failed');
    }

    // Get all plans and update isActive flag
    const plansRef = collection(db, 'plans', userId, 'saved_plans');
    const querySnapshot = await getDocs(plansRef);

    const updatePromises = [];
    querySnapshot.forEach((planDoc) => {
        const data = planDoc.data();
        const shouldBeActive = data.planId === planId;
        if (data.isActive !== shouldBeActive) {
            updatePromises.push(
                setDoc(doc(db, 'plans', userId, 'saved_plans', data.planId), {
                    ...data,
                    isActive: shouldBeActive
                })
            );
        }
    });

    await Promise.all(updatePromises);
    console.log('[PLAN_SERVICE] Active plan set:', planId);
};

/**
 * Get the currently active plan.
 */
export const getActivePlan = async ({ userId, db }) => {
    if (!userId || !db) {
        return null;
    }

    try {
        const plansRef = collection(db, 'plans', userId, 'saved_plans');
        const querySnapshot = await getDocs(plansRef);

        let activePlan = null;
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.isActive) {
                activePlan = data;
            }
        });

        if (activePlan) {
            console.log('[PLAN_SERVICE] Active plan found:', activePlan.planId);
        }

        return activePlan;
    } catch (error) {
        console.error('[PLAN_SERVICE] Error getting active plan:', error);
        return null;
    }
};