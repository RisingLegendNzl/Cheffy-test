// web/src/App.jsx
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// --- Component Imports ---
import LandingPage from './pages/LandingPage';
import MainApp from './components/MainApp';

// --- Hook Imports ---
import useAppLogic from './hooks/useAppLogic';
import { useResponsive } from './hooks/useResponsive';

// --- PERSISTENCE FIX: Import cache cleanup ---
import { clearAll as clearLocalPlanCache } from './services/localPlanCache';

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
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState(null);

    // --- Firebase State ---
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [appId, setAppId] = useState('default-app-id');

    // --- New User Onboarding State ---
    const [isNewUser, setIsNewUser] = useState(false);
    const [profileSetupComplete, setProfileSetupComplete] = useState(true); // default true so returning users aren't gated
    const [profileSetupSaving, setProfileSetupSaving] = useState(false);

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

    // --- Derive landing page visibility instead of using separate state ---
    const showLandingPage = isAuthReady && !userId;

    // --- Firebase Initialization and Auth Effect ---
    useEffect(() => {
        const firebaseConfigStr = typeof __firebase_config !== 'undefined' 
            ? __firebase_config 
            : import.meta.env.VITE_FIREBASE_CONFIG;
            
        const currentAppId = typeof __app_id !== 'undefined' 
            ? __app_id 
            : import.meta.env.VITE_APP_ID || 'default-app-id';
        
        setAppId(currentAppId);
        globalAppId = currentAppId;

        if (firebaseConfigStr) {
            try {
                const parsedConfig = typeof firebaseConfigStr === 'string' 
                    ? JSON.parse(firebaseConfigStr) 
                    : firebaseConfigStr;
                firebaseConfig = parsedConfig;

                const app = initializeApp(parsedConfig);
                const authInstance = getAuth(app);
                const dbInstance = getFirestore(app);

                // Suppress verbose Firestore logs in production
                try { setLogLevel('error'); } catch (e) { /* ignore */ }

                setAuth(authInstance);
                setDb(dbInstance);

                // Set persistence to local so sessions survive page reloads
                setPersistence(authInstance, browserLocalPersistence).catch(err => {
                    console.warn("[FIREBASE] Failed to set persistence:", err);
                });

                const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                    if (user) {
                        console.log("[FIREBASE] User authenticated:", user.uid);
                        setUserId(user.uid);

                        // --- NEW USER DETECTION ---
                        // Check the 'users' Firestore document to determine if profile setup is complete.
                        try {
                            const userDocRef = doc(dbInstance, 'users', user.uid);
                            const userSnap = await getDoc(userDocRef);

                            if (userSnap.exists()) {
                                const userData = userSnap.data();
                                const hasCompletedSetup = userData.profileSetupComplete === true;

                                if (!hasCompletedSetup) {
                                    // New user who hasn't completed profile setup yet
                                    console.log("[ONBOARDING] New user detected — showing profile gate.");
                                    setIsNewUser(true);
                                    setProfileSetupComplete(false);
                                } else {
                                    // Returning user who already completed setup
                                    console.log("[ONBOARDING] Returning user — profile setup already complete.");
                                    setIsNewUser(false);
                                    setProfileSetupComplete(true);
                                }
                            } else {
                                // No user doc at all (edge case: legacy user or doc not created)
                                // Treat as returning user — don't block them
                                console.log("[ONBOARDING] No user doc found — treating as returning user.");
                                setIsNewUser(false);
                                setProfileSetupComplete(true);
                            }
                        } catch (err) {
                            console.error("[ONBOARDING] Error checking user doc:", err);
                            // On error, don't block the user
                            setIsNewUser(false);
                            setProfileSetupComplete(true);
                        }
                    } else {
                        console.log("[FIREBASE] No user signed in.");
                        setUserId(null);
                        // Reset onboarding state on sign-out
                        setIsNewUser(false);
                        setProfileSetupComplete(true);
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
    const handleSignUp = useCallback(async (credentials) => {
        setAuthLoading(true);
        setAuthError(null);
        try {
            await logic.handleSignUp(credentials);
            // After sign-up, the onAuthStateChanged callback will detect the new user
            // via the 'users' doc (which handleSignUp creates WITHOUT profileSetupComplete).
            // Force the profile gate to appear.
            setIsNewUser(true);
            setProfileSetupComplete(false);
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
            // The onAuthStateChanged callback handles new-user detection for sign-in too
            setContentView('profile');
        } catch (error) {
            setAuthError(error.message);
        } finally {
            setAuthLoading(false);
        }
    }, [logic]);

    const handleSignOut = useCallback(async () => {
        // ── PERSISTENCE FIX: clear local caches on sign-out ──
        // Prevents plan data from one user leaking to the next sign-in.
        clearLocalPlanCache();

        await logic.handleSignOut();
        setContentView('profile');
        setAuthError(null);
        // Reset onboarding state
        setIsNewUser(false);
        setProfileSetupComplete(true);
    }, [logic]);

    // --- Complete Profile Setup Handler (called from NewUserProfileGate) ---
    const handleCompleteProfileSetup = useCallback(async () => {
        if (!db || !userId) return;

        setProfileSetupSaving(true);
        try {
            // 1. Save the name to the profile document
            await logic.handleSaveProfile(true); // silent save

            // 2. Mark profileSetupComplete in the 'users' document
            const userDocRef = doc(db, 'users', userId);
            await updateDoc(userDocRef, {
                profileSetupComplete: true,
                profileSetupCompletedAt: new Date().toISOString()
            });

            console.log("[ONBOARDING] Profile setup marked as complete.");

            // 3. Update local state
            setIsNewUser(false);
            setProfileSetupComplete(true);

            logic.showToast('Profile saved! Welcome to Cheffy!', 'success');
        } catch (err) {
            console.error("[ONBOARDING] Error completing profile setup:", err);
            logic.showToast('Failed to save profile. Please try again.', 'error');
        } finally {
            setProfileSetupSaving(false);
        }
    }, [db, userId, logic]);

    // --- Edit Profile Handler ---
    const handleEditProfile = useCallback(() => {
        setIsSettingsOpen(false);
        setContentView('profile');
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
    }, []);

    // --- Render ---
    // Gate rendering on isAuthReady. Before Firebase resolves the session,
    // show a branded loading screen instead of flashing the landing page.
    if (!isAuthReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
                <div className="text-center">
                    <div className="animate-pulse text-4xl mb-4">🍳</div>
                    <p className="text-gray-500 text-sm">Loading Cheffy…</p>
                </div>
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

                    // --- NEW: Onboarding / New User Props ---
                    isNewUser={isNewUser}
                    profileSetupComplete={profileSetupComplete}
                    profileSetupSaving={profileSetupSaving}
                    onCompleteProfileSetup={handleCompleteProfileSetup}
                />
            )}
        </>
    );
};

export default App;