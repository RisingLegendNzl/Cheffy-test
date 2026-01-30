// web/src/hooks/useAppLogic.js
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import usePlanPersistence from './usePlanPersistence';
import { saveToStorage, loadFromStorage, removeFromStorage } from '../helpers';

// --- CONFIGURATION ---
const ORCHESTRATOR_TARGETS_API_URL = '/api/plan/targets';
const ORCHESTRATOR_DAY_API_URL = '/api/plan/day';
const ORCHESTRATOR_FULL_PLAN_API_URL = '/api/plan/generate-full-plan';
const NUTRITION_API_URL = '/api/nutrition-search';
const MAX_SUBSTITUTES = 5;

// Storage keys for state persistence
const STORAGE_KEYS = {
    GENERATION_STATE: 'cheffy_generation_state',
    PARTIAL_PLAN: 'cheffy_partial_plan',
    GENERATION_PROGRESS: 'cheffy_generation_progress',
};

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
 * NOW WITH STATE PERSISTENCE AND RESUME CAPABILITY
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
    const isGeneratingRef = useRef(false);
    const visibilityHandlerRef = useRef(null);
    
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

    // --- NEW: State Persistence Helpers ---
    const saveGenerationState = useCallback((state) => {
        try {
            saveToStorage(STORAGE_KEYS.GENERATION_STATE, {
                ...state,
                timestamp: Date.now(),
                userId: userId || 'anonymous',
            });
        } catch (error) {
            console.error('[STATE_PERSISTENCE] Failed to save generation state:', error);
        }
    }, [userId]);

    const loadGenerationState = useCallback(() => {
        try {
            const state = loadFromStorage(STORAGE_KEYS.GENERATION_STATE);
            if (!state) return null;
            
            // Check if state is stale (older than 1 hour)
            const isStale = Date.now() - state.timestamp > 60 * 60 * 1000;
            if (isStale) {
                removeFromStorage(STORAGE_KEYS.GENERATION_STATE);
                return null;
            }
            
            // Verify user matches (if authenticated)
            if (userId && state.userId !== userId) {
                return null;
            }
            
            return state;
        } catch (error) {
            console.error('[STATE_PERSISTENCE] Failed to load generation state:', error);
            return null;
        }
    }, [userId]);

    const clearGenerationState = useCallback(() => {
        removeFromStorage(STORAGE_KEYS.GENERATION_STATE);
        removeFromStorage(STORAGE_KEYS.PARTIAL_PLAN);
        removeFromStorage(STORAGE_KEYS.GENERATION_PROGRESS);
    }, []);

    // --- NEW: Auto-save generation state during generation ---
    useEffect(() => {
        if (loading && isGeneratingRef.current) {
            saveGenerationState({
                mealPlan,
                results,
                uniqueIngredients,
                formData,
                nutritionalTargets,
                generationStepKey,
                generationStatus,
                diagnosticLogs: diagnosticLogs.slice(-50), // Save last 50 logs
                failedIngredientsHistory,
                macroDebug,
            });
        }
    }, [
        loading,
        mealPlan,
        results,
        uniqueIngredients,
        formData,
        nutritionalTargets,
        generationStepKey,
        generationStatus,
        diagnosticLogs,
        failedIngredientsHistory,
        macroDebug,
        saveGenerationState,
    ]);

    // --- NEW: Restore incomplete generation on mount ---
    useEffect(() => {
        const restoreState = () => {
            const savedState = loadGenerationState();
            if (!savedState) return;

            console.log('[STATE_PERSISTENCE] Restoring incomplete generation...');
            
            // Restore state
            if (savedState.mealPlan) setMealPlan(savedState.mealPlan);
            if (savedState.results) setResults(savedState.results);
            if (savedState.uniqueIngredients) setUniqueIngredients(savedState.uniqueIngredients);
            if (savedState.diagnosticLogs) setDiagnosticLogs(savedState.diagnosticLogs);
            if (savedState.failedIngredientsHistory) setFailedIngredientsHistory(savedState.failedIngredientsHistory);
            if (savedState.macroDebug) setMacroDebug(savedState.macroDebug);
            
            // Show notification
            showToast('Incomplete plan generation detected. Data restored.', 'info', 5000);
            
            // Don't auto-resume - let user decide
            setGenerationStatus('Previous generation was interrupted. You can continue generating or start fresh.');
            setGenerationStepKey('restored');
        };

        // Only restore if not currently loading
        if (!loading && isAuthReady) {
            restoreState();
        }
    }, [isAuthReady]); // Only run once when auth is ready

    // --- NEW: Handle tab visibility changes ---
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                console.log('[VISIBILITY] Tab hidden - generation state will be preserved');
                // Save state when tab becomes hidden
                if (isGeneratingRef.current) {
                    saveGenerationState({
                        mealPlan,
                        results,
                        uniqueIngredients,
                        formData,
                        nutritionalTargets,
                        generationStepKey,
                        generationStatus,
                        diagnosticLogs: diagnosticLogs.slice(-50),
                        failedIngredientsHistory,
                        macroDebug,
                    });
                }
            } else {
                console.log('[VISIBILITY] Tab visible - continuing generation');
                // Don't abort on visibility change - let the stream continue
            }
        };

        visibilityHandlerRef.current = handleVisibilityChange;
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (visibilityHandlerRef.current) {
                document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
            }
        };
    }, [
        mealPlan,
        results,
        uniqueIngredients,
        formData,
        nutritionalTargets,
        generationStepKey,
        generationStatus,
        diagnosticLogs,
        failedIngredientsHistory,
        macroDebug,
        saveGenerationState,
    ]);

    // --- Cleanup Effect (Aborts pending requests on unmount) ---
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                console.log("[CLEANUP] Aborting pending request on unmount.");
                abortControllerRef.current.abort();
            }
            isGeneratingRef.current = false;
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
                if (selected && selected.price) {
                    newTotal += selected.price * qty;
                }
            } else if (item.source === 'direct' && item.productInfo && item.productInfo.price) {
                newTotal += item.productInfo.price * qty;
            }
        });
        setTotalCost(newTotal);
    }, []);

    // --- Plan Persistence Hook ---
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

    // --- Auth Handlers ---
    const handleSignUp = useCallback(async (credentials) => {
        if (!auth) {
            throw new Error('Authentication not initialized');
        }
        const { createUserWithEmailAndPassword } = await import('firebase/auth');
        const userCredential = await createUserWithEmailAndPassword(
            auth,
            credentials.email,
            credentials.password
        );
        return userCredential;
    }, [auth]);

    const handleSignIn = useCallback(async (credentials) => {
        if (!auth) {
            throw new Error('Authentication not initialized');
        }
        const { signInWithEmailAndPassword } = await import('firebase/auth');
        const userCredential = await signInWithEmailAndPassword(
            auth,
            credentials.email,
            credentials.password
        );
        return userCredential;
    }, [auth]);

    const handleSignOut = useCallback(async () => {
        if (!auth) {
            throw new Error('Authentication not initialized');
        }
        const { signOut } = await import('firebase/auth');
        
        // Clear generation state on sign out
        clearGenerationState();
        
        await signOut(auth);
        
        setMealPlan([]);
        setResults({});
        setUniqueIngredients([]);
        setNutritionalTargets({ calories: 0, protein: 0, fat: 0, carbs: 0 });
        setError(null);
        setDiagnosticLogs([]);
        setFailedIngredientsHistory([]);
        setMacroDebug(null);
    }, [auth, clearGenerationState, setNutritionalTargets]);

    // --- Profile Management ---
    const handleLoadProfile = useCallback(async () => {
        if (!userId || !db) {
            showToast('Please sign in to load your profile', 'warning');
            return;
        }
        try {
            const userDocRef = doc(db, 'users', userId);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const profileData = userDoc.data();
                setFormData(prev => ({ ...prev, ...profileData }));
                showToast('Profile loaded successfully!', 'success');
            } else {
                showToast('No saved profile found', 'info');
            }
        } catch (err) {
            console.error('Error loading profile:', err);
            showToast('Failed to load profile', 'error');
        }
    }, [userId, db, setFormData, showToast]);

    const handleSaveProfile = useCallback(async () => {
        if (!userId || !db) {
            showToast('Please sign in to save your profile', 'warning');
            return;
        }
        try {
            const userDocRef = doc(db, 'users', userId);
            await setDoc(userDocRef, formData, { merge: true });
            showToast('Profile saved successfully!', 'success');
        } catch (err) {
            console.error('Error saving profile:', err);
            showToast('Failed to save profile', 'error');
        }
    }, [userId, db, formData, showToast]);

    // --- MAIN PLAN GENERATION ---
    const handleGeneratePlan = useCallback(async () => {
        // Validate form
        const requiredFields = ['name', 'height', 'weight', 'age', 'gender', 'activityLevel', 'goal'];
        const missingFields = requiredFields.filter(field => !formData[field] || formData[field].trim() === '');
        if (missingFields.length > 0) {
            showToast(`Please fill in all required profile fields: ${missingFields.join(', ')}`, 'error');
            return;
        }

        // Clear previous state
        setMealPlan([]);
        setResults({});
        setUniqueIngredients([]);
        setDiagnosticLogs([]);
        setFailedIngredientsHistory([]);
        setMacroDebug(null);
        setError(null);
        setLoading(true);
        setGenerationStepKey('targets');
        setGenerationStatus("Calculating nutritional targets...");
        isGeneratingRef.current = true;

        // Create abort controller for this generation
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Step 1: Calculate Targets
        let targets = null;
        try {
            const targetResponse = await fetch(ORCHESTRATOR_TARGETS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formData }),
                signal: signal,
            });

            if (!targetResponse.ok) {
                const errorMsg = await getResponseErrorDetails(targetResponse);
                throw new Error(`Targets request failed: ${errorMsg}`);
            }

            const targetData = await targetResponse.json();
            if (!targetData || !targetData.targets) {
                throw new Error("Targets response missing 'targets' field.");
            }

            targets = targetData.targets;
            setNutritionalTargets(targets);
            setDiagnosticLogs(prev => [...prev, {
                timestamp: new Date().toISOString(),
                level: 'SUCCESS',
                tag: 'TARGETS',
                message: `Targets calculated: ${targets.calories} kcal, ${targets.protein}g protein, ${targets.fat}g fat, ${targets.carbs}g carbs.`
            }]);

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Plan generation aborted by user.');
                setError('Plan generation cancelled.');
                setGenerationStepKey('cancelled');
                setLoading(false);
                isGeneratingRef.current = false;
                return; // Exit gracefully
            }
            console.error("Plan generation failed critically at Targets:", err);
            setError(`Critical failure: ${err.message}`);
            setGenerationStepKey('error');
            setLoading(false);
            isGeneratingRef.current = false;
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

                            const { events, newBuffer } = processSseChunk(value, buffer, decoder);
                            buffer = newBuffer;

                            for (const event of events) {
                                const eventData = event.data;
                                
                                if (event.eventType === 'message' || event.eventType === 'log_message') {
                                    setDiagnosticLogs(prev => [...prev, eventData]);
                                } else if (event.eventType === 'finalData' || event.eventType === 'plan:complete') {
                                    dayDataReceived = true;
                                    if (eventData.mealPlanForDay && eventData.mealPlanForDay.meals) {
                                        accumulatedMealPlan.push(eventData.mealPlanForDay);
                                    }
                                    if (eventData.dayResults) {
                                        accumulatedResults = { ...accumulatedResults, ...eventData.dayResults };
                                    }
                                    if (eventData.dayUniqueIngredients && Array.isArray(eventData.dayUniqueIngredients)) {
                                        eventData.dayUniqueIngredients.forEach(ing => {
                                            const key = ing.originalIngredient || ing.name;
                                            if (!accumulatedUniqueIngredients.has(key)) {
                                                accumulatedUniqueIngredients.set(key, { ...ing, count: 1 });
                                            } else {
                                                const existing = accumulatedUniqueIngredients.get(key);
                                                existing.count = (existing.count || 1) + 1;
                                                existing.requested_total_g = (existing.requested_total_g || 0) + (ing.requested_total_g || 0);
                                            }
                                        });
                                    }
                                    setMealPlan([...accumulatedMealPlan]);
                                    setResults({ ...accumulatedResults });
                                    const uniqueIngredientsArray = Array.from(accumulatedUniqueIngredients.values());
                                    setUniqueIngredients(uniqueIngredientsArray);
                                    recalculateTotalCost(accumulatedResults);
                                    
                                    // Save progress after each day
                                    saveGenerationState({
                                        mealPlan: [...accumulatedMealPlan],
                                        results: { ...accumulatedResults },
                                        uniqueIngredients: uniqueIngredientsArray,
                                        formData,
                                        nutritionalTargets: targets,
                                        generationStepKey: 'planning',
                                        generationStatus: `Completed Day ${day}/${numDays}`,
                                        diagnosticLogs: diagnosticLogs.slice(-50),
                                        failedIngredientsHistory,
                                        macroDebug,
                                        completedDays: day,
                                        totalDays: numDays,
                                    });
                                    
                                } else if (event.eventType === 'error') {
                                    dayFetchError = eventData.message || 'Unknown error occurred';
                                    setDiagnosticLogs(prev => [...prev, {
                                        timestamp: new Date().toISOString(),
                                        level: 'ERROR',
                                        tag: 'DAY_ERROR',
                                        message: dayFetchError
                                    }]);
                                } else if (event.eventType === 'failed_ingredient') {
                                    dailyFailedIngredients.push({
                                        ingredient: eventData.ingredient || 'Unknown',
                                        reason: eventData.reason || 'Unknown',
                                        timestamp: eventData.timestamp || new Date().toISOString(),
                                        error: eventData.error
                                    });
                                }
                            }
                        }

                        if (dayFetchError) {
                            throw new Error(dayFetchError);
                        }

                    } catch (dayError) {
                        if (dayError.name === 'AbortError') {
                            console.log(`Day ${day} generation aborted by user.`);
                            setError(prev => prev ? `${prev}\nDay ${day} cancelled.` : `Day ${day} cancelled.`);
                            break;
                        }
                        console.error(`Day ${day} generation error:`, dayError);
                        setError(prev => prev ? `${prev}\n${dayError.message}` : dayError.message); 
                        setGenerationStepKey('error');
                        setDiagnosticLogs(prev => [...prev, { timestamp: new Date().toISOString(), level: 'CRITICAL', tag: 'FRONTEND', message: dayError.message }]);
                    } finally {
                        if (dailyFailedIngredients.length > 0) setFailedIngredientsHistory(prev => [...prev, ...dailyFailedIngredients]);
                    }
                }

                if (!error) {
                    setGenerationStatus(`Plan generation finished.`);
                    setGenerationStepKey('finalizing');
                    setTimeout(() => {
                        setGenerationStepKey('complete');
                        // Clear generation state on success
                        clearGenerationState();
                    }, 1500);
                } else {
                    setGenerationStepKey('error');
                }
            } catch (err) {
                 console.error("Per-day plan generation failed critically:", err);
                 setError(`Critical failure: ${err.message}`);
                 setGenerationStepKey('error');
            } finally {
                 setTimeout(() => {
                     setLoading(false);
                     isGeneratingRef.current = false;
                 }, 2000);
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
                        if (!planComplete && !error) {
                            console.error("Stream ended unexpectedly before 'plan:complete' event.");
                            throw new Error("Stream ended unexpectedly. The plan may be incomplete.");
                        }
                        break;
                    }
                    
                    const { events, newBuffer } = processSseChunk(value, buffer, decoder);
                    buffer = newBuffer;

                    for (const event of events) {
                        const eventData = event.data;
                        
                        switch (event.eventType) {
                            case 'log_message':
                                setDiagnosticLogs(prev => [...prev, eventData]);
                                break;
                            
                            case 'phase:start':
                                const phaseMap = {
                                    'meals': 'planning',
                                    'aggregate': 'planning',
                                    'market': 'market',
                                    'nutrition': 'market',
                                    'solver': 'finalizing',
                                    'writer': 'finalizing',
                                    'finalize': 'finalizing'
                                };
                                const stepKey = phaseMap[eventData.name];
                                if (stepKey) {
                                    setGenerationStepKey(stepKey);
                                }
                                if (eventData.description) {
                                    setGenerationStatus(eventData.description);
                                }
                                break;
                            
                            case 'phase:end':
                                // Optional: could add phase completion logic here
                                break;
                            
                            case 'failed_ingredient':
                                setFailedIngredientsHistory(prev => [...prev, {
                                    ingredient: eventData.ingredient || 'Unknown',
                                    reason: eventData.reason || 'Unknown',
                                    timestamp: eventData.timestamp || new Date().toISOString(),
                                    error: eventData.error
                                }]);
                                break;
                            
                            case 'plan:complete':
                                planComplete = true;
                                setGenerationStatus("Plan generation complete!");
                                
                                if (eventData.mealPlan) {
                                    setMealPlan(eventData.mealPlan);
                                }
                                if (eventData.results) {
                                    setResults(eventData.results);
                                    recalculateTotalCost(eventData.results);
                                }
                                if (eventData.uniqueIngredients) {
                                    setUniqueIngredients(eventData.uniqueIngredients);
                                }
                                if (eventData.macroDebug) {
                                    setMacroDebug(eventData.macroDebug);
                                }
                                
                                setTimeout(() => {
                                    setGenerationStepKey('complete');
                                    // Clear generation state on success
                                    clearGenerationState();
                                }, 1000);
                                break;
                            
                            case 'error':
                                const errorMessage = eventData.message || eventData.error || 'An unknown error occurred';
                                console.error("Server error:", errorMessage);
                                setError(errorMessage);
                                setGenerationStepKey('error');
                                setDiagnosticLogs(prev => [...prev, {
                                    timestamp: new Date().toISOString(),
                                    level: 'CRITICAL',
                                    tag: 'SERVER_ERROR',
                                    message: errorMessage
                                }]);
                                break;
                        }
                    }
                }

                if (!planComplete && !error) {
                    throw new Error("Plan generation did not complete successfully");
                }
                
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('Batched plan generation aborted by user.');
                    setError('Plan generation cancelled.');
                    setGenerationStepKey('cancelled');
                    setLoading(false);
                    isGeneratingRef.current = false;
                    return; // Exit gracefully
                }
                
                console.error("Batched plan generation failed critically:", err);
                setError(`Critical failure: ${err.message}`);
                setGenerationStepKey('error');
                setDiagnosticLogs(prev => [...prev, {
                    timestamp: new Date().toISOString(), level: 'CRITICAL', tag: 'FRONTEND', message: `Critical failure: ${err.message}`
                }]);
            } finally {
                 setTimeout(() => {
                     setLoading(false);
                     isGeneratingRef.current = false;
                 }, 2000);
            }
        }
    }, [formData, isLogOpen, recalculateTotalCost, useBatchedMode, showToast, nutritionalTargets.calories, error, saveGenerationState, clearGenerationState, setNutritionalTargets]);

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
            const params = product.barcode 
                ? { barcode: product.barcode, store: formData.store }
                : { url: product.url, store: formData.store };
            
            const response = await fetch(`${NUTRITION_API_URL}?${new URLSearchParams(params)}`);
            if (!response.ok) throw new Error(`Nutrition API returned ${response.status}`);
            
            const data = await response.json();
            setNutritionCache(prev => ({ ...prev, [product.url]: data }));
            
        } catch (err) {
            console.error('Nutrition fetch error:', err);
            setNutritionCache(prev => ({ ...prev, [product.url]: { status: 'error', message: err.message } }));
        } finally {
            setLoadingNutritionFor(null);
        }
    }, [nutritionCache, formData.store]);

    const handleSubstituteSelection = useCallback((ingredientKey, newUrl) => {
        setResults(prev => {
            const item = prev[ingredientKey];
            if (!item || item.source !== 'discovery') return prev;
            
            return {
                ...prev,
                [ingredientKey]: {
                    ...item,
                    currentSelectionURL: newUrl
                }
            };
        });
        recalculateTotalCost(results);
    }, [results, recalculateTotalCost]);

    const handleQuantityChange = useCallback((ingredientKey, newQuantity) => {
        setResults(prev => {
            const item = prev[ingredientKey];
            if (!item) return prev;
            
            return {
                ...prev,
                [ingredientKey]: {
                    ...item,
                    userQuantity: newQuantity
                }
            };
        });
        recalculateTotalCost(results);
    }, [results, recalculateTotalCost]);

    const onToggleMealEaten = useCallback((day, mealIndex) => {
        const key = `${day}-${mealIndex}`;
        setEatenMeals(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    }, []);

    const handleRefresh = useCallback(() => {
        setMealPlan([]);
        setResults({});
        setUniqueIngredients([]);
        setError(null);
        setDiagnosticLogs([]);
        setFailedIngredientsHistory([]);
        setMacroDebug(null);
        setGenerationStepKey(null);
        setGenerationStatus("Ready to generate plan.");
        clearGenerationState();
    }, [clearGenerationState]);

    const handleDownloadFailedLogs = useCallback(() => {
        if (!failedIngredientsHistory || failedIngredientsHistory.length === 0) return;
        let logContent = "Cheffy Failed Ingredients Log\n==============================\n\n";
        failedIngredientsHistory.forEach((item, idx) => {
            logContent += `[${idx + 1}] ${item.ingredient}\n`;
            logContent += `    Reason: ${item.reason}\n`;
            logContent += `    Time: ${new Date(item.timestamp).toLocaleString()}\n`;
            logContent += item.error ? `Error: ${item.error}\n` : '';
            logContent += `\n`;
        });
        const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `cheffy_failed_ingredients_${timestamp}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [failedIngredientsHistory]); 

    const handleDownloadLogs = useCallback(() => {
        if (!diagnosticLogs || diagnosticLogs.length === 0) return;
        let logContent = "Cheffy Orchestrator Logs\n=========================\n\n";
        diagnosticLogs.forEach(log => {
            if (log && typeof log === 'object' && log.timestamp) {
                const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
                logContent += `${time} [${log.level || 'N/A'}] [${log.tag || 'N/A'}] ${log.message || ''}\n`;
                if (log.data) {
                    try {
                        logContent += `  Data: ${JSON.stringify(log.data, null, 2)}\n`;
                    } catch (e) {
                        logContent += `  Data: [Could not serialize: ${e.message}]\n`;
                    }
                }
                logContent += "\n";
            } else {
                 logContent += `[Invalid Log Entry: ${JSON.stringify(log)}]\n\n`;
            }
        });
        const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `cheffy_orchestrator_logs_${timestamp}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [diagnosticLogs]); 

    const handleDownloadMacroDebugLogs = useCallback(() => {
      if (!macroDebug || Object.keys(macroDebug).length === 0) return;
      const logContent = JSON.stringify(macroDebug, null, 2);
      const blob = new Blob([logContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `cheffy_macro_debug_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, [macroDebug]);

    // Compute plan stats
    const computedPlanStats = useMemo(() => {
        if (!mealPlan || mealPlan.length === 0) return [];
        
        return mealPlan.map(dayPlan => {
            let totalCalories = 0;
            let totalProtein = 0;
            let totalFat = 0;
            let totalCarbs = 0;

            if (dayPlan.meals && Array.isArray(dayPlan.meals)) {
                dayPlan.meals.forEach(meal => {
                    if (meal.nutrition) {
                        totalCalories += meal.nutrition.calories || 0;
                        totalProtein += meal.nutrition.protein || 0;
                        totalFat += meal.nutrition.fat || 0;
                        totalCarbs += meal.nutrition.carbs || 0;
                    }
                });
            }

            return {
                day: dayPlan.day,
                calories: Math.round(totalCalories),
                protein: Math.round(totalProtein),
                fat: Math.round(totalFat),
                carbs: Math.round(totalCarbs)
            };
        });
    }, [mealPlan]);

    useEffect(() => {
        setPlanStats(computedPlanStats);
    }, [computedPlanStats]);

    // --- Return all state and handlers ---
    return {
        // State
        results,
        setResults,
        uniqueIngredients,
        setUniqueIngredients,
        mealPlan,
        setMealPlan,
        totalCost,
        loading,
        error,
        eatenMeals,
        selectedDay,
        setSelectedDay,
        diagnosticLogs,
        setDiagnosticLogs,
        nutritionCache,
        loadingNutritionFor,
        logHeight,
        setLogHeight,
        isLogOpen,
        setIsLogOpen,
        failedIngredientsHistory,
        setFailedIngredientsHistory,
        statusMessage,
        setStatusMessage,
        
        // Macro Debug
        macroDebug,
        setMacroDebug,
        showMacroDebugLog,
        setShowMacroDebugLog,
        
        // Log Visibility
        showOrchestratorLogs,
        setShowOrchestratorLogs,
        showFailedIngredientsLogs,
        setShowFailedIngredientsLogs,
        
        // Generation State
        generationStepKey,
        generationStatus,
        
        // Modal State
        selectedMeal,
        setSelectedMeal,
        showSuccessModal,
        setShowSuccessModal,
        planStats,
        
        // Settings
        useBatchedMode,
        setUseBatchedMode,
        
        // Toasts
        toasts,
        showToast,
        removeToast,
        
        // Handlers
        handleGeneratePlan,
        handleLoadProfile,
        handleSaveProfile,
        handleSignUp,
        handleSignIn,
        handleSignOut,
        handleFetchNutrition,
        handleSubstituteSelection,
        handleQuantityChange,
        handleDownloadFailedLogs,
        handleDownloadLogs,
        handleDownloadMacroDebugLogs,
        onToggleMealEaten,
        handleRefresh,
        
        // Plan Persistence
        ...planPersistence,
    };
};

export default useAppLogic;