// web/src/hooks/useAppLogic.js
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import usePlanPersistence from './usePlanPersistence';

// --- CONFIGURATION ---
const ORCHESTRATOR_TARGETS_API_URL = '/api/plan/targets';
const ORCHESTRATOR_DAY_API_URL = '/api/plan/day';
const ORCHESTRATOR_FULL_PLAN_API_URL = '/api/plan/generate-full-plan';
const NUTRITION_API_URL = '/api/nutrition-search';
const MAX_SUBSTITUTES = 5;

// --- LOCALSTORAGE KEY ---
const STORAGE_KEY = 'cheffy_current_plan';

// --- MOCK DATA ---
const MOCK_PRODUCT_TEMPLATE = {
    name: "Placeholder (API DOWN)", 
    brand: "MOCK DATA", 
    price: 15.99, 
    size: "1kg",
    url: "#api_down_mock_product", 
    unit_price_per_100: 1.59,
};

// --- SSE Stream Parser ---
function processSseChunk(value, buffer, decoder) {
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    
    const events = [];
    let lines = buffer.split('\n\n');
    
    for (let i = 0; i < lines.length - 1; i++) {
        const message = lines[i];
        if (message.trim().length === 0) continue;
        
        let eventType = 'message';
        let eventData = '';
        
        message.split('\n').forEach(line => {
            if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
                eventData += line.substring(6).trim();
            }
        });

        if (eventData) {
            try {
                const jsonData = JSON.parse(eventData);
                events.push({ eventType, data: jsonData });
            } catch (e) {
                console.error("SSE: Failed to parse JSON data:", eventData, e);
                events.push({
                    eventType: 'log_message', 
                    data: {
                        timestamp: new Date().toISOString(),
                        level: 'CRITICAL',
                        tag: 'SSE_PARSE',
                        message: 'Failed to parse incoming SSE JSON data.',
                        data: { raw: eventData.substring(0, 100) + '...' }
                    }
                });
            }
        }
    }
    
    let newBuffer = lines[lines.length - 1];
    return { events, newBuffer };
}

/**
 * Custom hook that encapsulates all business logic from App.jsx
 * Handles plan generation, profile management, auth, and UI interactions
 */
const useAppLogic = ({ 
    auth, 
    db, 
    userId, 
    isAuthReady, 
    appId,
    formData,
    setFormData,
    nutritionalTargets,
    setNutritionalTargets
}) => {
    // --- Refs ---
    const abortControllerRef = useRef(null);
    
    // --- State ---
    const [results, setResults] = useState({});
    const [uniqueIngredients, setUniqueIngredients] = useState([]);
    const [mealPlan, setMealPlan] = useState([]);
    const [totalCost, setTotalCost] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [eatenMeals, setEatenMeals] = useState({});
    const [selectedDay, setSelectedDay] = useState(1);
    const [diagnosticLogs, setDiagnosticLogs] = useState([]);
    const [nutritionCache, setNutritionCache] = useState({});
    const [loadingNutritionFor, setLoadingNutritionFor] = useState(null);
    const [logHeight, setLogHeight] = useState(250);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [failedIngredientsHistory, setFailedIngredientsHistory] = useState([]);
    const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
    
    // Macro Debug State
    const [macroDebug, setMacroDebug] = useState(null);

    const [showMacroDebugLog, setShowMacroDebugLog] = useState(
      () => JSON.parse(localStorage.getItem('cheffy_show_macro_debug_log') ?? 'false')
    );
    
    const [showOrchestratorLogs, setShowOrchestratorLogs] = useState(
      () => JSON.parse(localStorage.getItem('cheffy_show_orchestrator_logs') ?? 'true')
    );
    const [showFailedIngredientsLogs, setShowFailedIngredientsLogs] = useState(
      () => JSON.parse(localStorage.getItem('cheffy_show_failed_ingredients_logs') ?? 'true')
    );
    
    const [generationStepKey, setGenerationStepKey] = useState(null);
    const [generationStatus, setGenerationStatus] = useState("Ready to generate plan."); 

    const [selectedMeal, setSelectedMeal] = useState(null);
    const [useBatchedMode, setUseBatchedMode] = useState(true);

    const [toasts, setToasts] = useState([]);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [planStats, setPlanStats] = useState([]);

    // --- Cleanup Effect (Aborts pending requests on unmount) ---
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                console.log("[CLEANUP] Aborting pending request on unmount.");
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // --- Persist Log Visibility Preferences ---
    useEffect(() => {
      localStorage.setItem('cheffy_show_orchestrator_logs', JSON.stringify(showOrchestratorLogs));
    }, [showOrchestratorLogs]);

    useEffect(() => {
      localStorage.setItem('cheffy_show_failed_ingredients_logs', JSON.stringify(showFailedIngredientsLogs));
    }, [showFailedIngredientsLogs]);
    
    // Macro Debug Log Persistence
    useEffect(() => {
      localStorage.setItem('cheffy_show_macro_debug_log', JSON.stringify(showMacroDebugLog));
    }, [showMacroDebugLog]);

    // --- NEW: Load meal plan from localStorage on mount ---
    useEffect(() => {
        if (mealPlan.length > 0) return; // Don't overwrite existing plan
        
        const loadFromLocalStorage = () => {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const planData = JSON.parse(stored);
                    
                    // Check if data is not expired (optional: 7 days)
                    if (planData.timestamp) {
                        const age = Date.now() - new Date(planData.timestamp).getTime();
                        const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
                        if (age > MAX_AGE) {
                            console.log('[LOAD] Stored plan expired, removing from cache');
                            localStorage.removeItem(STORAGE_KEY);
                            return;
                        }
                    }
                    
                    // Restore the plan data
                    if (planData.mealPlan && planData.mealPlan.length > 0) {
                        setMealPlan(planData.mealPlan || []);
                        setResults(planData.results || {});
                        setUniqueIngredients(planData.uniqueIngredients || []);
                        setTotalCost(planData.totalCost || 0);
                        console.log('[LOAD] Restored meal plan from localStorage');
                        showToast('Previous meal plan restored', 'info');
                    }
                }
            } catch (error) {
                console.error('[LOAD] Failed to restore plan from localStorage:', error);
                localStorage.removeItem(STORAGE_KEY);
            }
        };
        
        loadFromLocalStorage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    // --- NEW: Save meal plan to localStorage whenever it changes ---
    useEffect(() => {
        if (mealPlan.length > 0) {
            try {
                const planData = {
                    mealPlan,
                    results,
                    uniqueIngredients,
                    totalCost,
                    formData,
                    nutritionalTargets,
                    timestamp: new Date().toISOString()
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(planData));
                console.log('[SAVE] Meal plan saved to localStorage');
            } catch (error) {
                console.error('[SAVE] Failed to save plan to localStorage:', error);
                // If storage quota exceeded, try to clear old data
                if (error.name === 'QuotaExceededError') {
                    console.warn('[SAVE] Storage quota exceeded, clearing old plan');
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
        }
    }, [mealPlan, results, uniqueIngredients, totalCost, formData, nutritionalTargets]);

    // --- Base Helpers ---
    const showToast = useCallback((message, type = 'info', duration = 3000) => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, type, duration }]);
    }, []);
    
    const removeToast = useCallback((id) => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);
    
    const recalculateTotalCost = useCallback((currentResults) => {
        let newTotal = 0;
        Object.values(currentResults).forEach(item => {
            const qty = item.userQuantity || 1;
            if (item.source === 'discovery' && item.allProducts && item.currentSelectionURL) {
                const selected = item.allProducts.find(p => p.url === item.currentSelectionURL);
                if (selected) {
                    newTotal += (selected.price || 0) * qty;
                }
            } else if (item.source === 'failed') {
                newTotal += (MOCK_PRODUCT_TEMPLATE.price || 0) * qty;
            } else if (item.price) {
                newTotal += (item.price || 0) * qty;
            }
        });
        setTotalCost(newTotal);
    }, []);

    // --- Plan Persistence ---
    const planPersistence = usePlanPersistence({
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
        setUniqueIngredients
    });

    // --- Categorized Results (Computed Value) ---
    const categorizedResults = useMemo(() => {
        const groups = {};
        Object.keys(results).forEach(normalizedKey => {
            const item = results[normalizedKey];
            if (item && item.originalIngredient) {
                const category = item.category || 'Uncategorized';
                if (!groups[category]) groups[category] = [];
                 if (!groups[category].some(existing => existing.originalIngredient === item.originalIngredient)) {
                      groups[category].push({ normalizedKey: normalizedKey, ingredient: item.originalIngredient, ...item });
                 }
            }
        });
        const sortedCategories = Object.keys(groups).sort();
        const sortedGroups = {};
        for (const category of sortedCategories) {
            sortedGroups[category] = groups[category];
        }
        return sortedGroups;
    }, [results]); 

    const hasInvalidMeals = useMemo(() => {
        if (!mealPlan || mealPlan.length === 0) return false;
        return mealPlan.some(dayPlan =>
            !dayPlan || !Array.isArray(dayPlan.meals) || dayPlan.meals.some(meal =>
                !meal || typeof meal.subtotal_kcal !== 'number' || meal.subtotal_kcal <= 0
            )
        );
    }, [mealPlan]); 

    const latestLog = diagnosticLogs.length > 0 ? diagnosticLogs[diagnosticLogs.length - 1] : null;

    // --- Profile Management ---
    const handleSaveProfile = useCallback(async (silent = false) => {
        if (!isAuthReady || !userId || !db || userId.startsWith('local_')) {
            return;
        }

        try {
            const profileData = {
                formData: formData,
                nutritionalTargets: nutritionalTargets,
                lastUpdated: new Date().toISOString()
            };
            
            // FIX: Changed from 'profiles' to 'profile' to match the collection name used in load
            await setDoc(doc(db, 'profile', userId), profileData);
            console.log("[PROFILE] Profile saved successfully");
            
            if (!silent) {
                showToast('Profile saved!', 'success');
            }
            
        } catch (error) {
            console.error("[PROFILE] Error saving profile:", error);
            if (!silent) {
                showToast('Failed to save profile', 'error');
            }
            return;
        }
    }, [formData, nutritionalTargets, userId, db, isAuthReady, showToast]);

    const handleLoadProfile = useCallback(async (silent = false) => {
        if (!isAuthReady || !userId || !db || userId.startsWith('local_')) {
            return false;
        }

        try {
            const profileRef = doc(db, 'profile', userId);
            const profileSnap = await getDoc(profileRef);

            if (profileSnap.exists()) {
                const data = profileSnap.data();
                
                if (data.formData) {
                    setFormData(data.formData);
                }
                if (data.nutritionalTargets) {
                    setNutritionalTargets(data.nutritionalTargets);
                }
                
                console.log("[PROFILE] Profile loaded successfully");
                
                if (!silent) {
                    showToast('Profile loaded!', 'success');
                }
                
                return true;
                
            } else {
                console.log("[PROFILE] No saved profile found");
                if (!silent) {
                    showToast('No saved profile found', 'info');
                }
                return false;
            }
            
        } catch (error) {
            console.error("[PROFILE] Error loading profile:", error);
            if (!silent) {
                showToast('Failed to load profile', 'error');
            }
            return false;
        }
    }, [userId, db, isAuthReady, showToast, setFormData, setNutritionalTargets]);

    const handleSaveSettings = useCallback(async () => {
        if (!isAuthReady || !userId || !db || userId.startsWith('local_')) {
            return;
        }

        try {
            const settingsData = {
                showOrchestratorLogs: showOrchestratorLogs,
                showFailedIngredientsLogs: showFailedIngredientsLogs,
                showMacroDebugLog: showMacroDebugLog,
                lastUpdated: new Date().toISOString()
            };

            await setDoc(doc(db, 'settings', userId), settingsData);
            console.log("[SETTINGS] Settings saved successfully");
            
        } catch (error) {
            console.error("[SETTINGS] Error saving settings:", error);
        }
    }, [showOrchestratorLogs, showFailedIngredientsLogs, showMacroDebugLog, userId, db, isAuthReady]);

    const handleLoadSettings = useCallback(async () => {
        if (!isAuthReady || !userId || !db || userId.startsWith('local_')) {
            return;
        }

        try {
            const settingsRef = doc(db, 'settings', userId);
            const settingsSnap = await getDoc(settingsRef);

            if (settingsSnap.exists()) {
                const data = settingsSnap.data();
                setShowOrchestratorLogs(data.showOrchestratorLogs ?? true);
                setShowFailedIngredientsLogs(data.showFailedIngredientsLogs ?? true);
                setShowMacroDebugLog(data.showMacroDebugLog ?? false);
                console.log("[SETTINGS] Settings loaded successfully");
            }
            
        } catch (error) {
            console.error("[SETTINGS] Error loading settings:", error);
        }
    }, [userId, db, isAuthReady]);

    // --- Auto-Save/Load Effects ---
    useEffect(() => {
        if (!userId || userId.startsWith('local_') || !isAuthReady) return;
        
        const timeoutId = setTimeout(() => {
            handleSaveProfile(true);
        }, 2000);
        
        return () => clearTimeout(timeoutId);
    }, [formData, nutritionalTargets, userId, isAuthReady, handleSaveProfile]);

    useEffect(() => {
        if (userId && !userId.startsWith('local_') && isAuthReady) {
            handleSaveSettings();
        }
    }, [showOrchestratorLogs, showFailedIngredientsLogs, showMacroDebugLog, userId, isAuthReady, handleSaveSettings]);

    useEffect(() => {
        if (userId && !userId.startsWith('local_') && isAuthReady && db) {
            handleLoadProfile(true);
            handleLoadSettings();
        }
    }, [userId, isAuthReady, db, handleLoadProfile, handleLoadSettings]);

    // --- App Feature Handlers ---
    const handleRefresh = useCallback(async () => {
      if (mealPlan.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        showToast('Data refreshed!', 'success');
      }
    }, [mealPlan, showToast]);

    const handleGeneratePlan = useCallback(async (e) => {
        e.preventDefault();
        
        // --- RECOMMENDED FIX: Abort any pending request ---
        if (abortControllerRef.current) {
            console.log('[GENERATE] Aborting previous request.');
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        // --- End Abort Fix ---

        setLoading(true);
        setError(null);
        setDiagnosticLogs([]);
        setNutritionCache({});
        if (nutritionalTargets.calories === 0) {
            setNutritionalTargets({ calories: 0, protein: 0, fat: 0, carbs: 0 });
        }
        setResults({});
        setUniqueIngredients([]);
        setMealPlan([]);
        setTotalCost(0);
        setEatenMeals({});
        setFailedIngredientsHistory([]);
        setGenerationStepKey('targets');
        if (!isLogOpen) { setLogHeight(250); setIsLogOpen(true); }
        setMacroDebug(null); // Macro Debug Reset

        let targets;

        try {
            const targetsResponse = await fetch(ORCHESTRATOR_TARGETS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                signal: signal,
            });

            if (!targetsResponse.ok) {
                const errorMsg = await getResponseErrorDetails(targetsResponse);
                throw new Error(`Failed to calculate targets: ${errorMsg}`);
            }

            const targetsData = await targetsResponse.json();
            targets = targetsData.nutritionalTargets;
            setNutritionalTargets(targets);
            setDiagnosticLogs(prev => [...prev, ...(targetsData.logs || [])]);
            
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[GENERATE] Targets request aborted.');
                setLoading(false);
                return; // Exit gracefully
            }
            console.error("Plan generation failed critically at Targets:", err);
            setError(`Critical failure: ${err.message}`);
            setGenerationStepKey('error');
            setLoading(false);
            setDiagnosticLogs(prev => [...prev, {
                timestamp: new Date().toISOString(), level: 'CRITICAL', tag: 'FRONTEND', message: `Critical failure: ${err.message}`
            }]);
            return;
        }

        if (!useBatchedMode) {
            setGenerationStatus("Generating plan (per-day mode)...");
            let accumulatedResults = {}; 
            let accumulatedMealPlan = []; 
            let accumulatedUniqueIngredients = new Map(); 

            try {
                const numDays = parseInt(formData.days, 10);
                for (let day = 1; day <= numDays; day++) {
                    setGenerationStatus(`Generating plan for Day ${day}/${numDays}...`);
                    setGenerationStepKey('planning');
                    
                    let dailyFailedIngredients = [];
                    let dayFetchError = null;

                    try {
                        const dayResponse = await fetch(`${ORCHESTRATOR_DAY_API_URL}?day=${day}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
                            body: JSON.stringify({ formData, nutritionalTargets: targets }),
                            signal: signal,
                        });

                        if (!dayResponse.ok) {
                            const errorMsg = await getResponseErrorDetails(dayResponse);
                            throw new Error(`Day ${day} request failed: ${errorMsg}`);
                        }

                        const reader = dayResponse.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';
                        let dayDataReceived = false;

                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) {
                                if (!dayDataReceived && !dayFetchError) {
                                    throw new Error(`Day ${day} stream ended unexpectedly without data.`);
                                }
                                break;
                            }

                            const { events } = processSseChunk(value, buffer, decoder);
                            buffer = ''; 

                            for (const { eventType, data: eventData } of events) {
                                switch (eventType) {
                                    case 'log_message':
                                        setDiagnosticLogs(prev => [...prev, eventData]);
                                        break;

                                    case 'plan:progress':
                                        setGenerationStatus(eventData.message || `Day ${day}/${numDays}: ${eventData.pct}%`);
                                        break;

                                    case 'phase:start':
                                    case 'phase:end':
                                        const stepKey = eventData.name;
                                        if (stepKey !== generationStepKey) {
                                            setGenerationStepKey(stepKey);
                                            if(eventData.description) setGenerationStatus(eventData.description);
                                        }
                                        break;

                                    case 'day:result':
                                        dayDataReceived = true;
                                        const dayPlan = eventData.dayPlan || {};
                                        const dayResults = eventData.dayResults || {};
                                        const dayIngredients = eventData.dayIngredients || [];

                                        accumulatedMealPlan.push(dayPlan);
                                        Object.assign(accumulatedResults, dayResults);
                                        dayIngredients.forEach(ing => {
                                            const key = ing.originalIngredient;
                                            if (!accumulatedUniqueIngredients.has(key)) {
                                                accumulatedUniqueIngredients.set(key, ing);
                                            } else {
                                                const existing = accumulatedUniqueIngredients.get(key);
                                                existing.requested_total_g = (existing.requested_total_g || 0) + (ing.requested_total_g || 0);
                                            }
                                        });
                                        break;

                                    case 'ingredient:found':
                                        setResults(prev => ({ ...prev, [eventData.key]: eventData.data }));
                                        break;

                                    case 'ingredient:failed':
                                        const failedItem = {
                                            timestamp: new Date().toISOString(),
                                            originalIngredient: eventData.key,
                                            error: eventData.reason,
                                        };
                                        dailyFailedIngredients.push(failedItem);
                                        break;

                                    case 'error':
                                        dayFetchError = new Error(eventData.message || `Day ${day} error`);
                                        break;
                                }
                            }
                        }

                        if (dayFetchError) throw dayFetchError;
                        
                    } catch (dayError) {
                        setError(error ? `${error}\n${dayError.message}` : dayError.message); 
                        setGenerationStepKey('error');
                        setDiagnosticLogs(prev => [...prev, { timestamp: new Date().toISOString(), level: 'CRITICAL', tag: 'FRONTEND', message: dayError.message }]);
                    } finally {
                        if (dailyFailedIngredients.length > 0) setFailedIngredientsHistory(prev => [...prev, ...dailyFailedIngredients]);
                    }
                }

                if (!error) {
                    setGenerationStatus(`Plan generation finished.`);
                    setGenerationStepKey('finalizing');
                    setTimeout(() => setGenerationStepKey('complete'), 1500);
                } else {
                    setGenerationStepKey('error');
                }
            } catch (err) {
                 console.error("Per-day plan generation failed critically:", err);
                 setError(`Critical failure: ${err.message}`);
                 setGenerationStepKey('error');
            } finally {
                 setTimeout(() => setLoading(false), 2000);
            }

        } else {
            setGenerationStatus("Generating full plan (batched mode)...");
            
            try {
                const planResponse = await fetch(ORCHESTRATOR_FULL_PLAN_API_URL, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream' 
                    },
                    body: JSON.stringify({
                        formData,
                        nutritionalTargets: targets
                    }),
                    signal: signal,
                });

                if (!planResponse.ok) {
                    const errorMsg = await getResponseErrorDetails(planResponse);
                    throw new Error(`Full plan request failed (${planResponse.status}): ${errorMsg}`);
                }

                const reader = planResponse.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let planComplete = false;

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        // FIX: Check planComplete instead of !error
                        if (!planComplete) {
                            throw new Error("Batch stream ended without 'plan:complete' event.");
                        }
                        break;
                    }

                    const { events } = processSseChunk(value, buffer, decoder);
                    buffer = '';

                    for (const { eventType, data: eventData } of events) {
                        switch (eventType) {
                            case 'log_message':
                                setDiagnosticLogs(prev => [...prev, eventData]);
                                break;

                            case 'plan:progress':
                                setGenerationStatus(eventData.message || `Processing: ${eventData.pct}%`);
                                break;

                            case 'phase:start':
                            case 'phase:end':
                                const stepKey = eventData.name;
                                if (stepKey !== generationStepKey) {
                                    setGenerationStepKey(stepKey);
                                    if(eventData.description) setGenerationStatus(eventData.description);
                                }
                                break;
                            
                            case 'ingredient:found':
                                setResults(prev => ({
                                    ...prev,
                                    [eventData.key]: eventData.data
                                }));
                                break;

                            case 'ingredient:failed':
                                const failedItem = {
                                    timestamp: new Date().toISOString(),
                                    originalIngredient: eventData.key,
                                    error: eventData.reason,
                                };
                                setFailedIngredientsHistory(prev => [...prev, failedItem]);
                                setResults(prev => ({
                                    ...prev,
                                    [eventData.key]: {
                                        originalIngredient: eventData.key,
                                        normalizedKey: eventData.key,
                                        source: 'failed',
                                        error: eventData.reason,
                                        allProducts: [],
                                        currentSelectionURL: MOCK_PRODUCT_TEMPLATE.url
                                    }
                                }));
                                break;

                            case 'plan:complete':
                                planComplete = true;
                                setMealPlan(eventData.mealPlan || []);
                                setResults(eventData.results || {});
                                setUniqueIngredients(eventData.uniqueIngredients || []);
                                recalculateTotalCost(eventData.results || {});
                                
                                // Capture Macro Debug Data
                                if (eventData.macroDebug) {
                                    setMacroDebug(eventData.macroDebug);
                                }
                                
                                setGenerationStepKey('complete');
                                setGenerationStatus('Plan generation complete!');
                                
                                setPlanStats([
                                  { label: 'Days', value: formData.days, color: '#4f46e5' },
                                  { label: 'Meals', value: eventData.mealPlan?.length * (parseInt(formData.eatingOccasions) || 3), color: '#10b981' },
                                  { label: 'Items', value: eventData.uniqueIngredients?.length || 0, color: '#f59e0b' },
                                ]);
                                
                                setTimeout(() => {
                                  setShowSuccessModal(true);
                                  setTimeout(() => {
                                    setShowSuccessModal(false);
                                  }, 2500);
                                }, 500);
                                break;

                            case 'error':
                                throw new Error(eventData.message || 'Unknown backend error');
                        }
                    }
                }
                
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('[GENERATE] Batched request aborted.');
                    setLoading(false);
                    return; // Exit gracefully
                }
                
                console.error("Batched plan generation failed critically:", err);
                setError(`Critical failure: ${err.message}`);
                setGenerationStepKey('error');
                setDiagnosticLogs(prev => [...prev, {
                    timestamp: new Date().toISOString(), level: 'CRITICAL', tag: 'FRONTEND', message: `Critical failure: ${err.message}`
                }]);
            } finally {
                 setTimeout(() => setLoading(false), 2000);
            }
        }
    }, [formData, isLogOpen, recalculateTotalCost, useBatchedMode, showToast, nutritionalTargets.calories, error, generationStepKey]);

    // --- NEW HELPER FUNCTION for robust error parsing ---
    const getResponseErrorDetails = useCallback(async (response) => {
        let errorMsg = `HTTP ${response.status}`;
        try {
            const clonedResponse = response.clone();
            try {
                const errorData = await clonedResponse.json();
                errorMsg = errorData.message || JSON.stringify(errorData);
            } catch (jsonErr) {
                errorMsg = await response.text() || `HTTP ${response.status} - Could not read body`;
            }
        } catch (e) {
            console.error('[ERROR] Could not read error response body:', e);
            errorMsg = `HTTP ${response.status} - Could not read response body`;
        }
        return errorMsg;
    }, []);

    const handleFetchNutrition = useCallback(async (product) => {
        if (!product || !product.url || nutritionCache[product.url]) { return; }
        if (product.nutrition && product.nutrition.status === 'found') {
             setNutritionCache(prev => ({...prev, [product.url]: product.nutrition}));
             return;
        }
        setLoadingNutritionFor(product.url);
        try {
            const params = product.barcode ? 
                { barcode: product.barcode } : 
                { url: product.url, name: product.name, brand: product.brand };
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`${NUTRITION_API_URL}?${queryString}`);
            if (!response.ok) {
                throw new Error(`Nutrition lookup failed (${response.status})`);
            }
            const data = await response.json();
            setNutritionCache(prev => ({ ...prev, [product.url]: data }));
            
            setResults(prev => {
                const newResults = { ...prev };
                Object.keys(newResults).forEach(key => {
                    if (newResults[key].allProducts) {
                        newResults[key].allProducts = newResults[key].allProducts.map(p => 
                            p.url === product.url ? { ...p, nutrition: data } : p
                        );
                    }
                });
                return newResults;
            });
        } catch (error) {
            console.error('Nutrition fetch error:', error);
        } finally {
            setLoadingNutritionFor(null);
        }
    }, [nutritionCache]);

    const handleSubstituteSelection = useCallback((ingredientKey, selectedProductUrl) => {
        setResults(prev => {
            const updated = { ...prev };
            if (updated[ingredientKey]) {
                updated[ingredientKey] = {
                    ...updated[ingredientKey],
                    currentSelectionURL: selectedProductUrl
                };
            }
            return updated;
        });
        recalculateTotalCost({ ...results, [ingredientKey]: { ...results[ingredientKey], currentSelectionURL: selectedProductUrl } });
    }, [results, recalculateTotalCost]);

    const handleQuantityChange = useCallback((ingredientKey, newQuantity) => {
        const qty = parseInt(newQuantity, 10);
        if (isNaN(qty) || qty < 1) return;
        setResults(prev => {
            const updated = { ...prev };
            if (updated[ingredientKey]) {
                updated[ingredientKey] = {
                    ...updated[ingredientKey],
                    userQuantity: qty
                };
            }
            return updated;
        });
        recalculateTotalCost({ ...results, [ingredientKey]: { ...results[ingredientKey], userQuantity: qty } });
    }, [results, recalculateTotalCost]);

    const handleDownloadFailedLogs = useCallback(() => {
      const blob = new Blob([JSON.stringify(failedIngredientsHistory, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `cheffy_failed_ingredients_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, [failedIngredientsHistory]);

    const handleDownloadLogs = useCallback(() => {
      const blob = new Blob([JSON.stringify(diagnosticLogs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `cheffy_orchestrator_logs_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, [diagnosticLogs]);

    const handleDownloadMacroDebugLogs = useCallback(() => {
      if (!macroDebug) {
        showToast('No macro debug data available', 'warning');
        return;
      }
      const blob = new Blob([JSON.stringify(macroDebug, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `cheffy_macro_debug_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, [macroDebug, showToast]);

    const handleSignUp = useCallback(async ({ name, email, password }) => {
        try {
            console.log("[AUTH] Starting sign up process...");
            
            if (!auth) {
                throw new Error("Firebase not initialized");
            }

            const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            console.log("[AUTH] User created:", user.uid);

            if (name) {
                await updateProfile(user, { displayName: name });
            }

            const trialStartDate = new Date();
            const trialEndDate = new Date();
            trialEndDate.setDate(trialEndDate.getDate() + 7);

            if (db) {
                await setDoc(doc(db, 'users', user.uid), {
                    name: name || '',
                    email: email,
                    createdAt: trialStartDate.toISOString(),
                    trialStartDate: trialStartDate.toISOString(),
                    trialEndDate: trialEndDate.toISOString(),
                    accountStatus: 'trial',
                    appId: appId
                });
                console.log("[AUTH] User profile saved to Firestore");
            }
            
            showToast(`Welcome ${name}! Your 7-day trial has started.`, 'success');
            
        } catch (error) {
            console.error("[AUTH] Sign up error:", error);
            showToast(error.message || 'Failed to create account', 'error');
            throw error;
        }
    }, [auth, db, appId, showToast]);

    const handleSignIn = useCallback(async ({ email, password }) => {
        try {
            console.log("[AUTH] Starting sign in process...");
            
            if (!auth) {
                throw new Error("Firebase not initialized");
            }

            const { signInWithEmailAndPassword } = await import('firebase/auth');
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            console.log("[AUTH] User signed in:", user.uid);
            
            showToast('Welcome back!', 'success');
            
        } catch (error) {
            console.error("[AUTH] Sign in error:", error);
            showToast(error.message || 'Failed to sign in', 'error');
            throw error;
        }
    }, [auth, showToast]);

    const handleSignOut = useCallback(async () => {
        try {
            if (!auth) {
                throw new Error("Firebase not initialized");
            }

            const { signOut } = await import('firebase/auth');
            await signOut(auth);
            
            console.log("[AUTH] User signed out");
            showToast('Signed out successfully', 'info');
            
        } catch (error) {
            console.error("[AUTH] Sign out error:", error);
            showToast(error.message || 'Failed to sign out', 'error');
            throw error;
        }
    }, [auth, showToast]);

    const onToggleMealEaten = useCallback((dayIndex, mealIndex) => {
      const key = `${dayIndex}-${mealIndex}`;
      setEatenMeals(prev => ({ ...prev, [key]: !prev[key] }));
      if (!eatenMeals[key]) {
        showToast('Meal marked as eaten!', 'success');
      }
    }, [mealPlan, showToast, eatenMeals]);

    // --- Return all handlers and computed values ---
    return {
        // State
        results,
        uniqueIngredients,
        mealPlan,
        totalCost,
        loading,
        error,
        eatenMeals,
        selectedDay,
        diagnosticLogs,
        nutritionCache,
        loadingNutritionFor,
        logHeight,
        isLogOpen,
        failedIngredientsHistory,
        statusMessage,
        showOrchestratorLogs,
        showFailedIngredientsLogs,
        generationStepKey,
        generationStatus,
        selectedMeal,
        useBatchedMode,
        toasts,
        showSuccessModal,
        planStats,
        macroDebug, 
        showMacroDebugLog,
        categorizedResults,
        hasInvalidMeals,
        latestLog,
        
        // Setters
        setSelectedDay,
        setLogHeight,
        setIsLogOpen,
        setShowOrchestratorLogs,
        setShowFailedIngredientsLogs,
        setShowMacroDebugLog,
        setSelectedMeal,
        setUseBatchedMode,
        setShowSuccessModal,
        
        // Handlers
        showToast,
        removeToast,
        handleLoadProfile,
        handleSaveProfile,
        handleLoadSettings,
        handleSaveSettings,
        handleRefresh,
        handleGeneratePlan,
        handleFetchNutrition,
        handleSubstituteSelection,
        handleQuantityChange,
        handleDownloadFailedLogs,
        handleDownloadLogs,
        handleDownloadMacroDebugLogs,
        handleSignUp,
        handleSignIn,
        handleSignOut,
        onToggleMealEaten,
        
        // Plan persistence additions
        savedPlans: planPersistence.savedPlans,
        activePlanId: planPersistence.activePlanId,
        handleSavePlan: planPersistence.savePlan,
        handleLoadPlan: planPersistence.loadPlan,
        handleDeletePlan: planPersistence.deletePlan,
        savingPlan: planPersistence.savingPlan,
        loadingPlan: planPersistence.loadingPlan,
        handleListPlans: planPersistence.listPlans,
        handleSetActivePlan: planPersistence.setActivePlan,
    };
};

export default useAppLogic;