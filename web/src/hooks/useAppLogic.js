// web/src/hooks/useAppLogic.js
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import usePlanPersistence from './usePlanPersistence';
import { persistRunId, getPendingRun, clearPendingRun } from '../services/runRecovery';
import {
    cachePlan,
    getCachedPlan,
    cacheLogs,
    getCachedLogs,
    cacheRunId,
    getCachedRunState,
    clearRunState
} from '../services/localPlanCache';

// --- CONFIGURATION ---
const ORCHESTRATOR_TARGETS_API_URL = '/api/plan/targets';
const ORCHESTRATOR_DAY_API_URL = '/api/plan/day';
const ORCHESTRATOR_FULL_PLAN_API_URL = '/api/plan/generate-full-plan';
const PLAN_STATUS_API_URL = '/api/plan/status';
const NUTRITION_API_URL = '/api/nutrition-search';
const MAX_SUBSTITUTES = 5;

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
    const currentRunIdRef = useRef(null);
    
    // --- State ---
    const [results, setResults] = useState({});
    const [uniqueIngredients, setUniqueIngredients] = useState([]);
    const [mealPlan, setMealPlan] = useState([]);
    const [totalCost, setTotalCost] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [eatenMeals, setEatenMeals] = useState({});
    const [selectedDay, setSelectedDay] = useState(1);
    const [diagnosticLogs, setDiagnosticLogs] = useState(() => getCachedLogs());
    const [nutritionCache, setNutritionCache] = useState({});
    const [loadingNutritionFor, setLoadingNutritionFor] = useState(null);
    const [logHeight, setLogHeight] = useState(250);
    const [isLogOpen, setIsLogOpen] = useState(false);
    
    // REPLACED: failedIngredientsHistory -> matchTraces
    const [matchTraces, setMatchTraces] = useState([]);
    
    const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
    
    // Macro Debug State
    const [macroDebug, setMacroDebug] = useState(null);

    const [showMacroDebugLog, setShowMacroDebugLog] = useState(
      () => JSON.parse(localStorage.getItem('cheffy_show_macro_debug_log') ?? 'false')
    );
    
    const [showOrchestratorLogs, setShowOrchestratorLogs] = useState(
      () => JSON.parse(localStorage.getItem('cheffy_show_orchestrator_logs') ?? 'true')
    );
    
    // REPLACED: showFailedIngredientsLogs -> showMatchTraceLogs
    const [showMatchTraceLogs, setShowMatchTraceLogs] = useState(
      () => JSON.parse(localStorage.getItem('cheffy_show_match_trace_logs') ?? 'true')
    );

    // [FIX] Ref for SSE closure to read current toggle value
    const showMatchTraceLogsRef = useRef(showMatchTraceLogs);
    useEffect(() => { showMatchTraceLogsRef.current = showMatchTraceLogs; }, [showMatchTraceLogs]);
    
    const [generationStepKey, setGenerationStepKey] = useState(null);
    const [generationStatus, setGenerationStatus] = useState("Ready to generate plan."); 

    const [selectedMeal, setSelectedMeal] = useState(null);
    // useBatchedMode REMOVED — batched generation is now always enabled.

    // --- AI Model Selection (persisted to localStorage) ---
    const [selectedModel, setSelectedModel] = useState(
      () => localStorage.getItem('cheffy_selected_model') || 'gpt-5.1'
    );

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

    // --- PERSISTENCE FIX: Resume polling if a run was in-flight before refresh ---
    useEffect(() => {
        const { runId, state } = getCachedRunState();
        if (!runId || !state) return;

        // Only resume if we don't already have a plan loaded
        if (mealPlan && mealPlan.length > 0) {
            clearRunState();
            return;
        }

        console.log(`[MOUNT] Found in-flight run ${runId} (state: ${state}). Resuming polling…`);
        currentRunIdRef.current = runId;

        // Fire-and-forget poll
        (async () => {
            try {
                const recovered = await pollForCompletedPlan(runId);
                if (recovered) {
                    setMealPlan(recovered.mealPlan || []);
                    setResults(recovered.results || {});
                    setUniqueIngredients(recovered.uniqueIngredients || []);
                    recalculateTotalCost(recovered.results || {});
                    if (recovered.macroDebug) setMacroDebug(recovered.macroDebug);

                    setGenerationStepKey('complete');
                    setGenerationStatus('Plan recovered after refresh!');
                    setError(null);

                    cachePlan({
                        mealPlan: recovered.mealPlan || [],
                        results: recovered.results || {},
                        uniqueIngredients: recovered.uniqueIngredients || [],
                        formData: formData,
                        nutritionalTargets: nutritionalTargets
                    });

                    if (planPersistence && planPersistence.autoSavePlan) {
                        planPersistence.autoSavePlan({
                            mealPlan: recovered.mealPlan || [],
                            results: recovered.results || {},
                            uniqueIngredients: recovered.uniqueIngredients || [],
                            formData: formData,
                            nutritionalTargets: nutritionalTargets
                        }).catch(err => console.warn('[AUTO_SAVE] Post-refresh recovery save failed:', err.message));
                    }

                    showToast('Plan recovered after page refresh!', 'success');
                } else {
                    setGenerationStatus('Previous generation could not be recovered. You can start a new one.');
                    setGenerationStepKey(null);
                }
            } catch (err) {
                console.error('[MOUNT] Poll recovery failed:', err);
                setGenerationStatus('Previous generation could not be recovered.');
                setGenerationStepKey(null);
            } finally {
                clearRunState();
                setLoading(false);
            }
        })();

        // Show loading state while polling
        setLoading(true);
        setGenerationStatus('Recovering plan from previous session…');
        setGenerationStepKey('reconnecting');

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Intentionally empty deps — runs once on mount only

    // --- Mount-time run recovery (survives tab close / refresh) ---
    useEffect(() => {
        if (!isAuthReady || !userId || loading) return;

        const pendingRun = getPendingRun();
        if (!pendingRun) return;

        console.log('[RECOVERY] Found pending run from previous session:', pendingRun.runId);

        // Kick off polling in the background
        const recover = async () => {
            setLoading(true);
            setGenerationStepKey('reconnecting');
            setGenerationStatus('Resuming plan generation from previous session…');

            try {
                const recovered = await pollForCompletedPlan(pendingRun.runId);
                if (recovered) {
                    setMealPlan(recovered.mealPlan || []);
                    setResults(recovered.results || {});
                    setUniqueIngredients(recovered.uniqueIngredients || []);
                    recalculateTotalCost(recovered.results || {});
                    if (recovered.macroDebug) setMacroDebug(recovered.macroDebug);

                    setGenerationStepKey('complete');
                    setGenerationStatus('Plan recovered successfully!');
                    setError(null);

                    showToast('Plan recovered from previous session!', 'success');

                    // Auto-save the recovered plan
                    if (planPersistence && planPersistence.autoSavePlan) {
                        try {
                            await planPersistence.autoSavePlan({
                                mealPlan: recovered.mealPlan || [],
                                results: recovered.results || {},
                                uniqueIngredients: recovered.uniqueIngredients || [],
                                formData: formData,
                                nutritionalTargets: nutritionalTargets
                            });
                        } catch (err) {
                            console.error('[AUTO_SAVE] Auto-save failed after retries:', err.message);
                            showToast('Plan generated but failed to save. Use "Save Plan" to save manually.', 'warning');
                        }
                    }
                } else {
                    console.warn('[RECOVERY] Polling timed out for pending run:', pendingRun.runId);
                    setGenerationStepKey(null);
                    setGenerationStatus('Ready to generate plan.');
                }
            } catch (err) {
                console.error('[RECOVERY] Recovery failed:', err);
                setError(null);
                setGenerationStepKey(null);
                setGenerationStatus('Ready to generate plan.');
            } finally {
                clearPendingRun();
                setLoading(false);
            }
        };

        recover();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthReady, userId]);

    // --- Persist Log Visibility Preferences ---
    useEffect(() => {
      localStorage.setItem('cheffy_show_orchestrator_logs', JSON.stringify(showOrchestratorLogs));
    }, [showOrchestratorLogs]);

    // UPDATED: Persist showMatchTraceLogs instead of showFailedIngredientsLogs
    useEffect(() => {
      localStorage.setItem('cheffy_show_match_trace_logs', JSON.stringify(showMatchTraceLogs));
      // [FIX] Clear accumulated traces when user disables the toggle
      if (!showMatchTraceLogs) {
        setMatchTraces([]);
        console.debug('[SETTINGS] Match trace logging disabled — cleared accumulated traces');
      }
    }, [showMatchTraceLogs]);
    
    // Macro Debug Log Persistence
    useEffect(() => {
      localStorage.setItem('cheffy_show_macro_debug_log', JSON.stringify(showMacroDebugLog));
    }, [showMacroDebugLog]);

    // --- PERSISTENCE FIX: Persist diagnostic logs to sessionStorage ---
    useEffect(() => {
        if (diagnosticLogs.length > 0) {
            cacheLogs(diagnosticLogs);
        }
    }, [diagnosticLogs]);

    // Persist selected AI model
    useEffect(() => {
      localStorage.setItem('cheffy_selected_model', selectedModel);
    }, [selectedModel]);

    const showToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Date.now();
        setToasts([{ id, message, type, duration }]);
    }, []);
    
    const removeToast = useCallback((id) => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);
    
    const recalculateTotalCost = useCallback((currentResults) => {
        let newTotal = 0;
        Object.values(currentResults).forEach(item => {
            const qty = item.userQuantity || 1;
            if (item.source === 'discovery' && item.allProducts && item.currentSelectionURL) {
                const selected = item.allProducts.find(p => p && p.url === item.currentSelectionURL);
                if (selected?.price) {
                    newTotal += selected.price * qty;
                }
            }
        });
        setTotalCost(newTotal);
    }, []);

    // --- Plan Persistence Hook Call ---
    const planPersistence = usePlanPersistence({
        userId: userId || null,
        isAuthReady: isAuthReady || false,
        db: db || null,
        mealPlan: mealPlan || [],
        results: results || {},
        uniqueIngredients: uniqueIngredients || [],
        formData: formData || {},
        nutritionalTargets: nutritionalTargets || {},
        showToast: showToast || (() => {}),
        setMealPlan: setMealPlan || (() => {}),
        setResults: setResults || (() => {}),
        setUniqueIngredients: setUniqueIngredients || (() => {}),
        recalculateTotalCost: recalculateTotalCost || (() => {}),
        setFormData: setFormData || (() => {}),
        setNutritionalTargets: setNutritionalTargets || (() => {}),
        setSelectedDay: setSelectedDay || (() => {}),
    });

    // --- Profile & Settings Handlers ---
    const handleLoadProfile = useCallback(async (silent = false) => {
        if (!isAuthReady || !userId || !db || userId.startsWith('local_')) {
            if (!silent) {
                showToast('Please sign in to load your profile', 'warning');
            }
            return false;
        }
    
        try {
            const profileRef = doc(db, 'profile', userId);
            const profileSnap = await getDoc(profileRef);
    
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                
                setFormData({
                    name: data.name || '',
                    height: data.height || '180',
                    weight: data.weight || '75',
                    age: data.age || '30',
                    gender: data.gender || 'male',
                    bodyFat: data.bodyFat || '',
                    activityLevel: data.activityLevel || 'moderate',
                    goal: data.goal || 'cut_moderate',
                    dietary: data.dietary || 'None',
                    cuisine: data.cuisine || '',
                    days: data.days || 7,
                    eatingOccasions: data.eatingOccasions || '3',
                    store: data.store || 'Woolworths',
                    costPriority: data.costPriority || 'Best Value',
                    mealVariety: data.mealVariety || 'Balanced Variety',
                    measurementUnits: data.measurementUnits || 'metric', // Load measurement units
                });
                
                if (data.nutritionalTargets) {
                    setNutritionalTargets(data.nutritionalTargets);
                }
                
                console.log("[PROFILE] Profile loaded successfully");
                if (!silent) {
                    showToast('Profile loaded successfully!', 'success');
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
                showMatchTraceLogs: showMatchTraceLogs, // UPDATED: changed from showFailedIngredientsLogs
                showMacroDebugLog: showMacroDebugLog,
                selectedModel: selectedModel,
                theme: localStorage.getItem('cheffy-theme') || 'dark',
                measurementUnits: formData.measurementUnits || 'metric', // Persist units in settings
                lastUpdated: new Date().toISOString()
            };

            await setDoc(doc(db, 'settings', userId), settingsData);
            console.log("[SETTINGS] Settings saved successfully");
            
        } catch (error) {
            console.error("[SETTINGS] Error saving settings:", error);
        }
    }, [showOrchestratorLogs, showMatchTraceLogs, showMacroDebugLog, selectedModel, userId, db, isAuthReady, formData.measurementUnits]);

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
                
                // UPDATED: Load showMatchTraceLogs, fallback to old key if missing
                setShowMatchTraceLogs(data.showMatchTraceLogs ?? data.showFailedIngredientsLogs ?? true);
                
                setShowMacroDebugLog(data.showMacroDebugLog ?? false);
                if (data.selectedModel) setSelectedModel(data.selectedModel);
                
                // Load measurement units from settings if available
                if (data.measurementUnits) {
                    setFormData(prev => ({ ...prev, measurementUnits: data.measurementUnits }));
                }

                // --- Theme Sync ---
                const localTheme = localStorage.getItem('cheffy-theme');
                if (!localTheme && data.theme) {
                    localStorage.setItem('cheffy-theme', data.theme);
                    document.documentElement.setAttribute('data-theme', data.theme);
                }

                console.log("[SETTINGS] Settings loaded successfully");
            }
            
        } catch (error) {
            console.error("[SETTINGS] Error loading settings:", error);
        }
    }, [userId, db, isAuthReady, setFormData]);

    const handleSaveProfile = useCallback(async (silent = false) => {
        if (!isAuthReady || !userId || !db || userId.startsWith('local_')) {
            if (!silent) {
                showToast('Please sign in to save your profile', 'warning');
            }
            return;
        }

        try {
            const profileData = {
                name: formData.name,
                height: formData.height,
                weight: formData.weight,
                age: formData.age,
                gender: formData.gender,
                bodyFat: formData.bodyFat,
                activityLevel: formData.activityLevel,
                goal: formData.goal,
                dietary: formData.dietary,
                cuisine: formData.cuisine,
                days: formData.days,
                eatingOccasions: formData.eatingOccasions,
                store: formData.store,
                costPriority: formData.costPriority,
                mealVariety: formData.mealVariety,
                measurementUnits: formData.measurementUnits || 'metric', // Save measurement units
                nutritionalTargets: {
                    calories: nutritionalTargets.calories,
                    protein: nutritionalTargets.protein,
                    fat: nutritionalTargets.fat,
                    carbs: nutritionalTargets.carbs
                },
                lastUpdated: new Date().toISOString()
            };

            await setDoc(doc(db, 'profile', userId), profileData);
            
            console.log("[PROFILE] Profile saved successfully");
            if (!silent) {
                showToast('Profile saved successfully!', 'success');
            }
            
        } catch (error) {
            console.error("[PROFILE] Error saving profile:", error);
            if (!silent) {
                showToast('Failed to save profile', 'error');
            }
            return;
        }
    }, [formData, nutritionalTargets, userId, db, isAuthReady, showToast]);

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
    }, [showOrchestratorLogs, showMatchTraceLogs, showMacroDebugLog, userId, isAuthReady, handleSaveSettings, formData.measurementUnits]);

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

    const pollForCompletedPlan = useCallback(async (runId) => {
        if (!runId) return null;

        const MAX_POLLS = 200;
        const POLL_INTERVAL_MS = 3000;

        setGenerationStatus('Connection lost — checking for completed plan…');
        setGenerationStepKey('reconnecting');

        for (let i = 0; i < MAX_POLLS; i++) {
            try {
                const res = await fetch(`${PLAN_STATUS_API_URL}?runId=${encodeURIComponent(runId)}`);
                if (!res.ok) {
                    console.warn(`[POLL] Status endpoint returned ${res.status}`);
                    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                    continue;
                }
                const data = await res.json();

                if (data.status === 'complete' && data.payload) {
                    return data.payload;
                }
                if (data.status === 'failed') {
                    throw new Error(data.payload?.error || 'Plan generation failed on server');
                }
            } catch (err) {
                console.warn(`[POLL] Poll attempt ${i + 1} error:`, err.message);
            }
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        }
        return null;
    }, []);

    const handleGeneratePlan = useCallback(async (e) => {
        e.preventDefault();
        
        if (abortControllerRef.current) {
            console.log('[GENERATE] Aborting previous request.');
            abortControllerRef.current.abort();
        }
        clearPendingRun();
        abortControllerRef.current = new AbortController();
        currentRunIdRef.current = null;
        const signal = abortControllerRef.current.signal;

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
        
        // UPDATED: Reset matchTraces instead of failedIngredientsHistory
        setMatchTraces([]);
        
        setGenerationStepKey('targets');
        if (!isLogOpen) { setLogHeight(250); setIsLogOpen(true); }
        setMacroDebug(null);

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
                return;
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

        setGenerationStatus("Generating full plan...");
            
            try {
                const planResponse = await fetch(ORCHESTRATOR_FULL_PLAN_API_URL, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream' 
                    },
                    body: JSON.stringify({
                        formData,
                        nutritionalTargets: targets,
                        preferredModel: selectedModel
                    }),
                    signal: signal,
                });

                if (!planResponse.ok) {
                    const errorMsg = await getResponseErrorDetails(planResponse);
                    throw new Error(`Full plan request failed (${planResponse.status}): ${errorMsg}`);
                }

                const headerRunId = planResponse.headers.get('X-Cheffy-Run-Id');
                if (headerRunId) {
                    currentRunIdRef.current = headerRunId;
                    cacheRunId(headerRunId, 'generating');
                    console.log('[GENERATE] Got run_id from header:', headerRunId);
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
                            
                            case 'plan:start':
                                if (eventData.run_id) {
                                    currentRunIdRef.current = eventData.run_id;
                                    cacheRunId(eventData.run_id, 'generating');
                                }
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
                                    if(eventData.description) setGenerationStatus(eventData.description);
                                }
                                break;
                            
                            case 'ingredient:found':
                                setResults(prev => ({
                                    ...prev,
                                    [eventData.key]: eventData.data
                                }));
                                break;
                                
                            // UPDATED: Handle new match_trace event
                            case 'ingredient:match_trace':
                                if (eventData.trace && showMatchTraceLogsRef.current) {
                                    setMatchTraces(prev => [...prev, eventData.trace]);
                                }
                                break;

                            case 'ingredient:failed':
                                // Removed setFailedIngredientsHistory() call as that state is gone.
                                // We rely on match_trace for history now.
                                // Still updating results to show failure status in the UI lists.
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
                                clearPendingRun();
                                setMealPlan(eventData.mealPlan || []);
                                setResults(eventData.results || {});
                                setUniqueIngredients(eventData.uniqueIngredients || []);
                                recalculateTotalCost(eventData.results || {});
                                
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
                                }, 500);

                                if (planPersistence && planPersistence.autoSavePlan) {
                                    try {
                                        await planPersistence.autoSavePlan({
                                            mealPlan: eventData.mealPlan || [],
                                            results: eventData.results || {},
                                            uniqueIngredients: eventData.uniqueIngredients || [],
                                            formData: formData,
                                            nutritionalTargets: nutritionalTargets
                                        });
                                    } catch (err) {
                                        console.error('[AUTO_SAVE] Auto-save failed after retries:', err.message);
                                        showToast('Plan generated but failed to save. Use "Save Plan" to save manually.', 'warning');
                                    }
                                }

                                cachePlan({
                                    mealPlan: eventData.mealPlan || [],
                                    results: eventData.results || {},
                                    uniqueIngredients: eventData.uniqueIngredients || [],
                                    formData: formData,
                                    nutritionalTargets: nutritionalTargets
                                });
                                clearRunState();
                                break;

                            case 'error':
                                throw new Error(eventData.message || 'Unknown backend error');
                        }
                    }
                }
                
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('[GENERATE] Batched request aborted.');
                    return;
                }

                const isStreamInterrupt = (
                    err instanceof TypeError ||
                    /load failed|network|failed to fetch|aborted|readable/i.test(err.message)
                );

                if (isStreamInterrupt && currentRunIdRef.current) {
                    console.warn('[GENERATE] Stream interrupted, attempting recovery via polling...', err.message);
                    cacheRunId(currentRunIdRef.current, 'polling');
                    setDiagnosticLogs(prev => [...prev, {
                        timestamp: new Date().toISOString(), level: 'WARN', tag: 'FRONTEND',
                        message: `Stream interrupted: ${err.message}. Polling for server-side result…`
                    }]);

                    try {
                        const recovered = await pollForCompletedPlan(currentRunIdRef.current);
                        if (recovered) {
                            clearPendingRun();
                            setMealPlan(recovered.mealPlan || []);
                            setResults(recovered.results || {});
                            setUniqueIngredients(recovered.uniqueIngredients || []);
                            recalculateTotalCost(recovered.results || {});
                            if (recovered.macroDebug) setMacroDebug(recovered.macroDebug);

                            setGenerationStepKey('complete');
                            setGenerationStatus('Plan recovered successfully!');
                            setError(null);

                            setPlanStats([
                                { label: 'Days', value: formData.days, color: '#4f46e5' },
                                { label: 'Meals', value: recovered.mealPlan?.length * (parseInt(formData.eatingOccasions) || 3), color: '#10b981' },
                                { label: 'Items', value: recovered.uniqueIngredients?.length || 0, color: '#f59e0b' },
                            ]);

                            showToast('Plan recovered after connection interruption!', 'success');
                            
                            if (planPersistence && planPersistence.autoSavePlan) {
                                try {
                                    await planPersistence.autoSavePlan({
                                        mealPlan: recovered.mealPlan || [],
                                        results: recovered.results || {},
                                        uniqueIngredients: recovered.uniqueIngredients || [],
                                        formData: formData,
                                        nutritionalTargets: nutritionalTargets
                                    });
                                } catch (err) {
                                    console.error('[AUTO_SAVE] Auto-save failed after retries:', err.message);
                                    showToast('Plan generated but failed to save. Use "Save Plan" to save manually.', 'warning');
                                }
                            }

                            cachePlan({
                                mealPlan: recovered.mealPlan || [],
                                results: recovered.results || {},
                                uniqueIngredients: recovered.uniqueIngredients || [],
                                        formData: formData,
                                        nutritionalTargets: nutritionalTargets
                            });
                            clearRunState();
                            return;
                        }
                    } catch (pollErr) {
                        console.error('[GENERATE] Recovery polling failed:', pollErr);
                    }
                }

                clearPendingRun();
                console.error("Batched plan generation failed critically:", err);
                setError(`Critical failure: ${err.message}`);
                setGenerationStepKey('error');
                clearRunState();
                setDiagnosticLogs(prev => [...prev, {
                    timestamp: new Date().toISOString(), level: 'CRITICAL', tag: 'FRONTEND',
                    message: `Critical failure: ${err.message}`
                }]);
            } finally {
                 setTimeout(() => setLoading(false), 2000);
            }
        
    }, [formData, isLogOpen, recalculateTotalCost, selectedModel, showToast, nutritionalTargets, error, pollForCompletedPlan, planPersistence, getResponseErrorDetails]);

    const handleFetchNutrition = useCallback(async (product) => {
        if (!product || !product.url || nutritionCache[product.url]) { return; }
        if (product.nutrition && product.nutrition.status === 'found') {
             setNutritionCache(prev => ({...prev, [product.url]: product.nutrition}));
             return;
        }
        setLoadingNutritionFor(product.url);
        try {
            const params = product.barcode ? `barcode=${product.barcode}` : `query=${encodeURIComponent(product.name)}`;
            const response = await fetch(`${NUTRITION_API_URL}?${params}`);
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
                const errorText = await response.text();
                throw new Error(`Nutrition API Error ${response.status}: ${errorText || 'Invalid response'}`);
            }
            const nutritionData = await response.json();
            setNutritionCache(prev => ({...prev, [product.url]: nutritionData}));
        } catch (err) {
            console.error("Failed to fetch nutrition for", product.name, ":", err);
            setNutritionCache(prev => ({...prev, [product.url]: { status: 'not_found', source: 'fetch_error', reason: err.message }}));
        } finally {
            setLoadingNutritionFor(null);
        }
    }, [nutritionCache]); 

    const handleSubstituteSelection = useCallback((key, newProduct) => {
        setResults(prev => {
            const updatedItem = { ...prev[key], currentSelectionURL: newProduct.url };
            const newResults = { ...prev, [key]: updatedItem };
            recalculateTotalCost(newResults); 
            return newResults;
        });
    }, [recalculateTotalCost]); 

    const handleQuantityChange = useCallback((key, newQuantity) => {
    setResults(prev => {
        if (!prev[key]) {
            console.error(`[handleQuantityChange] Error: Ingredient key "${key}" not found.`);
            return prev;
        }
        const safeQty = Math.max(1, newQuantity);
        const updatedItem = { ...prev[key], userQuantity: safeQty };
        const newResults = { ...prev, [key]: updatedItem };
        recalculateTotalCost(newResults); 
        return newResults;
    });
}, [recalculateTotalCost]); 

    // REPLACED: handleDownloadFailedLogs -> handleDownloadMatchTraceReport
    const handleDownloadMatchTraceReport = useCallback(() => {
        if (matchTraces.length === 0) return;
        
        let output = '';
        output += '═══════════════════════════════════════════════════════\n';
        output += '  PRODUCT MATCH TRACE REPORT\n';
        output += `  Generated: ${new Date().toISOString()}\n`;
        output += `  Total: ${matchTraces.length}\n`;
        output += `  Success: ${matchTraces.filter(t => t.outcome === 'success').length}\n`;
        output += `  Failed: ${matchTraces.filter(t => t.outcome === 'failed').length}\n`;
        output += '═══════════════════════════════════════════════════════\n\n';
        
        for (const trace of matchTraces) {
            const icon = trace.outcome === 'success' ? '[OK]' : trace.outcome === 'failed' ? '[FAIL]' : '[ERR]';
            output += `${icon} ${trace.ingredient}\n`;
            output += '-'.repeat(55) + '\n';
            output += `  Queries: T="${trace.queries.tight || 'N/A'}" N="${trace.queries.normal || 'N/A'}" W="${trace.queries.wide || 'N/A'}"\n`;
            output += `  Required: [${trace.validationRules.requiredWords.join(', ')}]\n`;
            output += `  Negative: [${trace.validationRules.negativeKeywords.join(', ')}]\n`;
            output += `  Categories: [${trace.validationRules.allowedCategories.join(', ')}]\n`;
            
            for (const attempt of trace.attempts) {
                output += `\n  [${attempt.status}] ${attempt.queryType.toUpperCase()} → "${attempt.queryString}"\n`;
                output += `    Raw: ${attempt.rawCount} | Pass: ${attempt.passCount} | Best: ${attempt.bestScore}\n`;
                
                for (const raw of attempt.rawResults) {
                    output += `      • "${raw.name}" ($${raw.price || '?'})\n`;
                }
                for (const scored of attempt.scoredResults) {
                    output += `      ★ "${scored.name}" score=${scored.score}\n`;
                }
                for (const rej of attempt.rejections) {
                    output += `      ✗ "${rej.name}" → ${rej.reason}\n`;
                }
            }
            
            if (trace.selection) {
                output += `\n  ► SELECTED: "${trace.selection.productName}" score=${trace.selection.score || 'N/A'} via ${trace.selection.viaQueryType}\n`;
            } else if (trace.outcome === 'failed') {
                output += `\n  ► FAILED: ${trace.failureReason || 'No match'}\n`;
            }
            output += `  Duration: ${trace.durationMs}ms\n\n`;
        }
        
        const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `cheffy_match_trace_${timestamp}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [matchTraces]);

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
                    appId: appId,
                    profileSetupComplete: false
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
            let errorMessage = 'Failed to sign in';
            
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                errorMessage = 'No account found with this email or password';
            } else if (error.code === 'auth/wrong-password') {
                errorMessage = 'Incorrect password';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address';
            }
            
            showToast(errorMessage, 'error');
            throw new Error(errorMessage);
        }
    }, [auth, showToast]);

    const handleSignOut = useCallback(async () => {
        try {
            if (auth) {
                await auth.signOut();
                console.log("[FIREBASE] User signed out");
            }
            
            setMealPlan([]);
            
            setFormData({ 
                name: '', height: '180', weight: '75', age: '30', gender: 'male', 
                activityLevel: 'moderate', goal: 'cut_moderate', dietary: 'None', 
                days: 7, store: 'Woolworths', eatingOccasions: '3', 
                costPriority: 'Best Value', mealVariety: 'Balanced Variety', 
                cuisine: '', bodyFat: '', measurementUnits: 'metric'
            });
            setNutritionalTargets({ calories: 0, protein: 0, fat: 0, carbs: 0 });
            
            showToast('Signed out successfully', 'success');
        } catch (error) {
            console.error("[FIREBASE] Sign out error:", error);
            showToast('Error signing out', 'error');
        }
    }, [auth, showToast, setFormData, setNutritionalTargets]);

    const onToggleMealEaten = useCallback((day, mealName) => {
        setEatenMeals(prev => {
            const dayKey = `day${day}`;
            const dayMeals = { ...(prev[dayKey] || {}) };
            dayMeals[mealName] = !dayMeals[mealName];
            return { ...prev, [dayKey]: dayMeals };
        });
    }, []); 

    // --- Computed Values ---
    const categorizedResults = useMemo(() => {
        const groups = {};
        Object.entries(results || {}).forEach(([normalizedKey, item]) => {
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
        // REPLACED: failedIngredientsHistory -> matchTraces
        matchTraces,
        statusMessage,
        showOrchestratorLogs,
        // REPLACED: showFailedIngredientsLogs -> showMatchTraceLogs
        showMatchTraceLogs,
        generationStepKey,
        generationStatus,
        selectedMeal,
        selectedModel,
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
        // REPLACED: setShowFailedIngredientsLogs -> setShowMatchTraceLogs
        setShowMatchTraceLogs,
        setShowMacroDebugLog,
        setSelectedMeal,
        setSelectedModel,
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
        // REPLACED: handleDownloadFailedLogs -> handleDownloadMatchTraceReport
        handleDownloadMatchTraceReport,
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
        handleRenamePlan: planPersistence.renamePlan,
        savingPlan: planPersistence.savingPlan,
        loadingPlan: planPersistence.loadingPlan,
        handleListPlans: planPersistence.listPlans,
        handleSetActivePlan: planPersistence.setActivePlan,
    };
};

export default useAppLogic;

