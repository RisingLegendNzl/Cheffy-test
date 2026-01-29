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

    // --- Toast System (Unified) ---
    const showToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // --- Plan Persistence Hook ---
    const planPersistence = usePlanPersistence({
        db,
        userId,
        isAuthReady,
        showToast,
        formData,
        nutritionalTargets,
        mealPlan,
        results,
        uniqueIngredients,
        totalCost,
        setFormData,
        setNutritionalTargets,
        setMealPlan,
        setResults,
        setUniqueIngredients,
        setTotalCost
    });

    // --- Restore meal plan from localStorage on mount ---
    useEffect(() => {
        const loadFromLocalStorage = () => {
            try {
                const savedPlan = localStorage.getItem(STORAGE_KEY);
                if (savedPlan) {
                    const planData = JSON.parse(savedPlan);
                   
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
            }
        }
    }, [mealPlan, results, uniqueIngredients, totalCost, formData, nutritionalTargets]);

    // --- Computed Values ---
    const latestLog = useMemo(() => {
        if (diagnosticLogs.length === 0) return null;
        return diagnosticLogs[diagnosticLogs.length - 1];
    }, [diagnosticLogs]);

    const categorizedResults = useMemo(() => {
        const categories = { pantry: [], dairy: [], produce: [], meat: [], frozen: [], other: [] };
        Object.entries(results).forEach(([key, item]) => {
            const cat = item.category?.toLowerCase() || 'other';
            if (categories[cat]) categories[cat].push({ key, ...item });
            else categories.other.push({ key, ...item });
        });
        return categories;
    }, [results]);

    const hasInvalidMeals = useMemo(() => {
        return mealPlan.some(dayPlan =>
            dayPlan.meals?.some(meal => !meal.items || meal.items.length === 0)
        );
    }, [mealPlan]);

    // --- Firebase Auth Handlers ---
    const handleSignUp = useCallback(async (credentials) => {
        if (!auth) throw new Error('Firebase auth not initialized');
        const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
        const userCredential = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
        if (credentials.displayName) {
            await updateProfile(userCredential.user, { displayName: credentials.displayName });
        }
        showToast('Account created successfully!', 'success');
    }, [auth, showToast]);

    const handleSignIn = useCallback(async (credentials) => {
        if (!auth) throw new Error('Firebase auth not initialized');
        const { signInWithEmailAndPassword } = await import('firebase/auth');
        await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
        showToast('Signed in successfully!', 'success');
    }, [auth, showToast]);

    const handleSignOut = useCallback(async () => {
        if (!auth) return;
        const { signOut } = await import('firebase/auth');
        await signOut(auth);
        showToast('Signed out successfully', 'success');
    }, [auth, showToast]);

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
        
        // --- Create new AbortController for this request ---
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        
        // --- Reset State ---
        setLoading(true);
        setError(null);
        setDiagnosticLogs([]);
        setResults({});
        setUniqueIngredients([]);
        setFailedIngredientsHistory([]);
        setMealPlan([]);
        setMacroDebug(null);
        setGenerationStepKey('targets');
        setGenerationStatus('Calculating nutritional targets...');

        // --- Fetch Targets ---
        let targets;
        try {
            const targetsResponse = await fetch(ORCHESTRATOR_TARGETS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formData }),
                signal: signal,
            });

            if (!targetsResponse.ok) {
                throw new Error(`Targets API failed: ${targetsResponse.status}`);
            }

            const targetsData = await targetsResponse.json();
            setNutritionalTargets(targetsData);
            targets = targetsData;
            console.log('[GENERATE] Targets fetched:', targets);

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
                                // FIX: Set planComplete to true before throwing error
                                // This indicates the backend properly closed the stream with an error event
                                planComplete = true;
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
        } catch (err) {
            console.error(`Failed to fetch nutrition for ${product.name}:`, err);
            const errorData = { status: 'error', error: err.message };
            setNutritionCache(prev => ({ ...prev, [product.url]: errorData }));
        } finally {
            setLoadingNutritionFor(null);
        }
    }, [nutritionCache]);

    const handleSubstituteSelection = useCallback((ingredientKey, newProduct) => {
        setResults(prev => {
            const updated = { ...prev };
            if (updated[ingredientKey]) {
                const currentSelection = updated[ingredientKey].allProducts?.find(p => p.url === updated[ingredientKey].currentSelectionURL);
                const quantityNeeded = updated[ingredientKey].requested_total_g || 0;
                const currentQty = currentSelection?.size ? parseFloat(currentSelection.size.match(/\d+\.?\d*/)?.[0]) || 1 : 1;
                const newQty = newProduct.size ? parseFloat(newProduct.size.match(/\d+\.?\d*/)?.[0]) || 1 : 1;
                const calculatedQuantity = Math.ceil((quantityNeeded / 1000) / newQty);
                updated[ingredientKey] = {
                    ...updated[ingredientKey],
                    currentSelectionURL: newProduct.url,
                    price: newProduct.price,
                    size: newProduct.size,
                    brand: newProduct.brand,
                    name: newProduct.name,
                    calculatedQuantity: Math.max(1, calculatedQuantity)
                };
            }
            return updated;
        });
        showToast(`Switched to ${newProduct.name}`, 'success');
    }, [showToast]);

    const handleQuantityChange = useCallback((ingredientKey, newQuantity) => {
        const qty = Math.max(1, parseInt(newQuantity, 10) || 1);
        setResults(prev => {
            const updated = { ...prev };
            if (updated[ingredientKey]) {
                updated[ingredientKey] = {
                    ...updated[ingredientKey],
                    calculatedQuantity: qty
                };
            }
            return updated;
        });
    }, []);

    const recalculateTotalCost = useCallback((resultsData) => {
        let cost = 0;
        Object.values(resultsData).forEach(item => {
            const price = parseFloat(item.price) || 0;
            const qty = parseInt(item.calculatedQuantity, 10) || 1;
            cost += price * qty;
        });
        setTotalCost(cost);
    }, []);

    useEffect(() => {
        recalculateTotalCost(results);
    }, [results, recalculateTotalCost]);

    const handleDownloadLogs = useCallback(() => {
        const logsText = diagnosticLogs.map(log => {
            const data = log.data ? JSON.stringify(log.data, null, 2) : '';
            return `[${log.timestamp}] [${log.level}] [${log.tag}] ${log.message}${data ? `\n${data}` : ''}`;
        }).join('\n\n');
        const blob = new Blob([logsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cheffy_logs_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Logs downloaded', 'success');
    }, [diagnosticLogs, showToast]);

    const handleDownloadFailedLogs = useCallback(() => {
        if (failedIngredientsHistory.length === 0) {
            showToast('No failed ingredients to download', 'info');
            return;
        }
        const logsText = failedIngredientsHistory.map(item => 
            `[${item.timestamp}] ${item.originalIngredient}: ${item.error}`
        ).join('\n');
        const blob = new Blob([logsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cheffy_failed_ingredients_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Failed ingredients log downloaded', 'success');
    }, [failedIngredientsHistory, showToast]);

    const handleDownloadMacroDebugLogs = useCallback(() => {
        if (!macroDebug || !macroDebug.days || macroDebug.days.length === 0) {
            showToast('No macro debug data available', 'info');
            return;
        }
        const logsText = JSON.stringify(macroDebug, null, 2);
        const blob = new Blob([logsText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cheffy_macro_debug_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Macro debug data downloaded', 'success');
    }, [macroDebug, showToast]);

    const onToggleMealEaten = useCallback((dayIndex, mealIndex) => {
      const key = `${dayIndex}-${mealIndex}`;
      setEatenMeals(prev => {
        const newState = { ...prev, [key]: !prev[key] };
        if (newState[key]) {
          showToast('Meal marked as eaten', 'success');
        }
        return newState;
      });
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