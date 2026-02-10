// web/src/App.jsx
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';

// --- Component Imports ---
import LandingPage from './pages/LandingPage';
import MainApp from './components/MainApp';

// --- Hook Imports ---
import useAppLogic from './hooks/useAppLogic';
import { useResponsive } from './hooks/useResponsive';

// --- Firebase Config variables ---
let firebaseConfig = null;
let firebaseInitializationError = null;
let globalAppId = 'default-app-id';

// --- MAIN APP COMPONENT ---
const App = () => {
    // --- Top-level UI State ---
    const [contentView, setContentView] = useState('profile');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    // [FIX] Removed: const [showLandingPage, setShowLandingPage] = useState(true);
    // Landing page visibility is now derived from isAuthReady + userId (see below)
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState(null);

    // --- Firebase State ---
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [appId, setAppId] = useState('default-app-id');

    // --- Form Data State (needed by hook and MainApp) ---
    const [formData, setFormData] = useState({ 
        name: '', height: '180', weight: '75', age: '30', gender: 'male', 
        activityLevel: 'moderate', goal: 'cut_moderate', dietary: 'None', 
        days: 7, store: 'Woolworths', eatingOccasions: '3', 
        costPriority: 'Best Value', mealVariety: 'Balanced Variety', 
        cuisine: '', bodyFat: '' 
    });
    
    const [nutritionalTargets, setNutritionalTargets] = useState({ 
        calories: 0, protein: 0, fat: 0, carbs: 0 
    });

    // --- Responsive ---
    const { isMobile, isDesktop } = useResponsive();

    // --- [FIX] Derive landing page visibility instead of using separate state + useEffect ---
    // This eliminates the race condition where showLandingPage was true before Firebase
    // had a chance to restore the session, causing a "logged out" flash on refresh.
    const showLandingPage = isAuthReady && !userId;

    // --- Firebase Initialization and Auth Effect ---
    useEffect(() => {
        const firebaseConfigStr = typeof __firebase_config !== 'undefined' 
            ? __firebase_config 
            : import.meta.env.VITE_FIREBASE_CONFIG;
            
        const currentAppId = typeof __app_id !== 'undefined' 
            ? __app_id 
            : (import.meta.env.VITE_APP_ID || 'default-app-id');
        
        setAppId(currentAppId);
        globalAppId = currentAppId;
        
        try {
            if (firebaseConfigStr && firebaseConfigStr.trim() !== '') {
                firebaseConfig = JSON.parse(firebaseConfigStr);
            } else {
                console.warn("[FIREBASE] __firebase_config is not defined or is empty.");
                firebaseInitializationError = 'Firebase config environment variable is missing.';
            }
        } catch (e) {
            console.error("CRITICAL: Failed to parse Firebase config:", e);
            firebaseInitializationError = `Failed to parse Firebase config: ${e.message}`;
        }
        
        if (firebaseInitializationError) {
            console.error("[FIREBASE] Firebase init failed:", firebaseInitializationError);
            setIsAuthReady(true);
            return;
        }

        if (firebaseConfig) {
            try {
                const app = initializeApp(firebaseConfig);
                const authInstance = getAuth(app);
                const dbInstance = getFirestore(app);
                setDb(dbInstance);
                setAuth(authInstance);
                setLogLevel('debug');
                console.log("[FIREBASE] Initialized.");

                // [FIX] Explicitly set persistence to browserLocalPersistence.
                // This ensures the session survives page refreshes via IndexedDB,
                // and documents the intent (Firebase v9+ defaults to this, but
                // being explicit guards against edge cases).
                setPersistence(authInstance, browserLocalPersistence)
                    .then(() => {
                        console.log("[FIREBASE] Persistence set to browserLocalPersistence.");
                    })
                    .catch((persistErr) => {
                        console.warn("[FIREBASE] Failed to set persistence (falling back to default):", persistErr);
                    });

                const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                    if (user) {
                        console.log("[FIREBASE] User is signed in:", user.uid);
                        setUserId(user.uid);
                    } else {
                        console.log("[FIREBASE] User is signed out.");
                        setUserId(null);
                    }
                    if (!isAuthReady) {
                        setIsAuthReady(true);
                        console.log("[FIREBASE] Auth state ready.");
                    }
                });
                return () => unsubscribe();
            } catch (initError) {
                console.error("[FIREBASE] Initialization failed:", initError);
                setIsAuthReady(true);
            }
        }
    }, []);

    // [FIX] Removed the old useEffect that toggled showLandingPage based on userId.
    // It introduced an extra render cycle that caused the "logged out" flash.
    // Landing page visibility is now derived above: const showLandingPage = isAuthReady && !userId;

    // --- Business Logic Hook ---
    const logic = useAppLogic({
        auth,
        db,
        userId,
        isAuthReady,
        appId,
        formData,
        setFormData,
        nutritionalTargets,
        setNutritionalTargets
    });

    // --- Form Handlers ---
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'days') {
            const newDays = parseInt(value, 10);
            if (!isNaN(newDays) && newDays < logic.selectedDay) {
                logic.setSelectedDay(newDays);
            }
        }
    };

    const handleSliderChange = (e) => {
        const value = parseInt(e.target.value, 10);
        setFormData(prev => ({ ...prev, days: value }));
        if (value < logic.selectedDay) {
            logic.setSelectedDay(value);
        }
    };

    // --- Auth Handlers with Loading State ---
    // [FIX] Removed manual setShowLandingPage calls — no longer needed since
    // showLandingPage is derived from isAuthReady && !userId, which updates
    // automatically when Firebase auth state changes.
    const handleSignUp = useCallback(async (credentials) => {
        setAuthLoading(true);
        setAuthError(null);
        try {
            await logic.handleSignUp(credentials);
            setContentView('profile');
        } catch (error) {
            setAuthError(error.message);
        } finally {
            setAuthLoading(false);
        }
    }, [logic]);

    const handleSignIn = useCallback(async (credentials) => {
        setAuthLoading(true);
        setAuthError(null);
        try {
            await logic.handleSignIn(credentials);
            setContentView('profile');
        } catch (error) {
            setAuthError(error.message);
        } finally {
            setAuthLoading(false);
        }
    }, [logic]);

    const handleSignOut = useCallback(async () => {
        await logic.handleSignOut();
        setContentView('profile');
        setAuthError(null);
    }, [logic]);

    // --- Edit Profile Handler (FIXED) ---
    const handleEditProfile = useCallback(() => {
        setIsSettingsOpen(false); // Close settings panel
        setContentView('profile'); // Navigate to profile view (right panel)
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
    }, []);

    // --- Render ---
    // [FIX] Gate rendering on isAuthReady. Before Firebase resolves the session,
    // show a branded loading screen instead of flashing the landing page.
    if (!isAuthReady) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)',
            }}>
                <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    animation: 'pulse 2s ease-in-out infinite',
                }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
                        <line x1="6" y1="17" x2="18" y2="17" />
                    </svg>
                </div>
                <p style={{
                    color: '#6366f1',
                    fontSize: 18,
                    fontWeight: 600,
                    fontFamily: "'Poppins', sans-serif",
                    letterSpacing: '0.02em',
                }}>
                    Cheffy
                </p>
                <style>{`
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.08); opacity: 0.85; }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <>
            {showLandingPage ? (
                <LandingPage 
                    onSignUp={handleSignUp}
                    onSignIn={handleSignIn}
                    authLoading={authLoading}
                    authError={authError}
                />
            ) : (
                <MainApp
                    // User & Auth
                    userId={userId}
                    isAuthReady={isAuthReady}
                    firebaseConfig={firebaseConfig}
                    firebaseInitializationError={firebaseInitializationError}
                    
                    // Form Data
                    formData={formData}
                    handleChange={handleChange}
                    handleSliderChange={handleSliderChange}
                    
                    // Nutritional Targets
                    nutritionalTargets={nutritionalTargets}
                    
                    // Results & Plan
                    results={logic.results}
                    uniqueIngredients={logic.uniqueIngredients}
                    mealPlan={logic.mealPlan}
                    totalCost={logic.totalCost}
                    categorizedResults={logic.categorizedResults}
                    hasInvalidMeals={logic.hasInvalidMeals}
                    
                    // UI State
                    loading={logic.loading}
                    error={logic.error}
                    eatenMeals={logic.eatenMeals}
                    selectedDay={logic.selectedDay}
                    setSelectedDay={logic.setSelectedDay}
                    contentView={contentView}
                    setContentView={setContentView}
                    isMenuOpen={isMenuOpen}
                    setIsMenuOpen={setIsMenuOpen}
                    
                    // Logs
                    diagnosticLogs={logic.diagnosticLogs}
                    showOrchestratorLogs={logic.showOrchestratorLogs}
                    setShowOrchestratorLogs={logic.setShowOrchestratorLogs}
                    showFailedIngredientsLogs={logic.showFailedIngredientsLogs}
                    setShowFailedIngredientsLogs={logic.setShowFailedIngredientsLogs}
                    failedIngredientsHistory={logic.failedIngredientsHistory}
                    logHeight={logic.logHeight}
                    setLogHeight={logic.setLogHeight}
                    isLogOpen={logic.isLogOpen}
                    setIsLogOpen={logic.setIsLogOpen} 
                    latestLog={logic.latestLog}
                    
                    // Macro Debug Log props (with defensive defaults)
                    macroDebug={logic.macroDebug || {}}
                    showMacroDebugLog={logic.showMacroDebugLog ?? false}
                    setShowMacroDebugLog={logic.setShowMacroDebugLog || (() => {})}
                    handleDownloadMacroDebugLogs={logic.handleDownloadMacroDebugLogs || (() => {})}
                    
                    // Generation State
                    generationStepKey={logic.generationStepKey}
                    generationStatus={logic.generationStatus}
                    
                    // Nutrition Cache
                    nutritionCache={logic.nutritionCache}
                    loadingNutritionFor={logic.loadingNutritionFor}
                    
                    // Modal State
                    selectedMeal={logic.selectedMeal}
                    setSelectedMeal={logic.setSelectedMeal}
                    showSuccessModal={logic.showSuccessModal}
                    setShowSuccessModal={logic.setShowSuccessModal}
                    planStats={logic.planStats}
                    
                    // Settings
                    isSettingsOpen={isSettingsOpen}
                    setIsSettingsOpen={setIsSettingsOpen}
                    // AI Model
                    selectedModel={logic.selectedModel}
                    setSelectedModel={logic.setSelectedModel}
                    
                    // Toasts
                    toasts={logic.toasts}
                    removeToast={logic.removeToast}
                    
                    // Handlers
                    handleGeneratePlan={logic.handleGeneratePlan}
                    handleLoadProfile={logic.handleLoadProfile}
                    handleSaveProfile={logic.handleSaveProfile}
                    handleFetchNutrition={logic.handleFetchNutrition}
                    handleSubstituteSelection={logic.handleSubstituteSelection}
                    handleQuantityChange={logic.handleQuantityChange}
                    handleDownloadFailedLogs={logic.handleDownloadFailedLogs}
                    handleDownloadLogs={logic.handleDownloadLogs}
                    onToggleMealEaten={logic.onToggleMealEaten}
                    handleRefresh={logic.handleRefresh}
                    handleEditProfile={handleEditProfile}
                    handleSignOut={handleSignOut}
                    showToast={logic.showToast}
                    
                    // Plan Persistence - NEW
                    savedPlans={logic.savedPlans}
                    activePlanId={logic.activePlanId}
                    handleSavePlan={logic.handleSavePlan}
                    handleLoadPlan={logic.handleLoadPlan}
                    handleDeletePlan={logic.handleDeletePlan}
                    savingPlan={logic.savingPlan}
                    loadingPlan={logic.loadingPlan}

                    // Responsive
                    isMobile={isMobile}
                    isDesktop={isDesktop}
                />
            )}
        </>
    );
};

export default App;