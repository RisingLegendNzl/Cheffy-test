// web/src/components/MainApp.jsx
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Zap, AlertTriangle, CheckCircle, Package, DollarSign, ExternalLink, Calendar, Users, Menu, X, ChevronsDown, ChevronsUp, ShoppingBag, BookOpen, ChefHat, Tag, Soup, Replace, Target, FileText, Terminal, Loader, ChevronRight, GripVertical, Flame, Droplet, Wheat, ChevronDown, ChevronUp, Download, ListX, Save, FolderDown, User, Check, ListChecks, ListOrdered, Utensils } from 'lucide-react';

// --- Component Imports ---
import MacroRing from './MacroRing';
import MacroBar from './MacroBar';
import InputField from './InputField';
import ProductCard from './ProductCard';
import CollapsibleSection from './CollapsibleSection';
import SubstituteMenu from './SubstituteMenu';
import GenerationProgressDisplay from './GenerationProgressDisplay';
import StoryModeGeneration from './StoryModeGeneration';
import NutritionalInfo from './NutritionalInfo';
import IngredientResultBlock from './IngredientResultBlock';
import MealPlanDisplay from './MealPlanDisplay';
import ShoppingListWithDetails from './ShoppingListWithDetails';
import LogEntry from './LogEntry';
import DiagnosticLogViewer from './DiagnosticLogViewer';
import ProductMatchLogViewer from './ProductMatchLogViewer';
import MacroDebugLogViewer from './MacroDebugLogViewer';
import RecipeModal from './RecipeModal';
import EmojiIcon from './EmojiIcon';
import ProfileTab from './ProfileTab';
import SavedPlansModal from './SavedPlansModal';
import PlanSetupWizard from './wizard/PlanSetupWizard';
import NewUserProfileGate from './NewUserProfileGate';
import EmptyTabState from './EmptyTabState';

import Header from './Header';
import StickyTabs from './StickyTabs';
import SettingsPanel from './SettingsPanel';
import SuccessModal from './SuccessModal';
import ToastContainer from './Toast';

// --- Theme Hook Import ---
import { useTheme } from '../contexts/ThemeContext';

import { COLORS, SHADOWS, Z_INDEX, APP_CONFIG } from '../constants';

// Category icon map for shopping list
const CATEGORY_ICONS = {
    'protein': <EmojiIcon code="1f969" alt="meat" />,
    'meat': <EmojiIcon code="1f969" alt="meat" />,
    'poultry': <EmojiIcon code="1f357" alt="poultry" />,
    'seafood': <EmojiIcon code="1f990" alt="seafood" />,
    'dairy': <EmojiIcon code="1f95b" alt="dairy" />,
    'grains': <EmojiIcon code="1f33e" alt="grains" />,
    'vegetables': <EmojiIcon code="1f966" alt="vegetables" />,
    'fruits': <EmojiIcon code="1f34e" alt="fruits" />,
    'fats': <EmojiIcon code="1fad2" alt="fats" />,
    'oils': <EmojiIcon code="1fad2" alt="fats" />,
    'spices': <EmojiIcon code="1f9c2" alt="spices" />,
    'seasonings': <EmojiIcon code="1f9c2" alt="spices" />,
    'condiments': <EmojiIcon code="1f9c8" alt="condiments" />,
    'sauces': <EmojiIcon code="1f9c8" alt="condiments" />,
    'canned': <EmojiIcon code="1f96b" alt="canned" />,
    'frozen': <EmojiIcon code="2744" alt="frozen" />,
    'beverages': <EmojiIcon code="1f964" alt="beverages" />,
    'bakery': <EmojiIcon code="1f35e" alt="bakery" />,
    'snacks': <EmojiIcon code="1f36b" alt="snacks" />,
    'misc': <EmojiIcon code="1f36b" alt="snacks" />,
    'uncategorized': <EmojiIcon code="1f6cd" alt="shopping" />,
    'default': <EmojiIcon code="1f6cd" alt="shopping" />
};

/**
 * MainApp - Pure presentational component
 * Receives all data and handlers via props
 * Renders the main application UI
 */
const MainApp = ({
    // User & Auth
    userId,
    isAuthReady,
    firebaseConfig,
    firebaseInitializationError,
    
    // Form Data
    formData,
    handleChange,
    handleSliderChange,
    
    // Nutritional Targets
    nutritionalTargets,
    
    // Results & Plan
    results,
    uniqueIngredients,
    mealPlan,
    totalCost,
    categorizedResults,
    hasInvalidMeals,
    
    // UI State
    loading,
    error,
    eatenMeals,
    selectedDay,
    setSelectedDay,
    contentView,
    setContentView,
    isMenuOpen,
    setIsMenuOpen,
    
    // Logs
    diagnosticLogs,
    showOrchestratorLogs,
    setShowOrchestratorLogs,
    showMatchTraceLogs,
    setShowMatchTraceLogs,
    matchTraces,
    logHeight,
    setLogHeight,
    isLogOpen,
    setIsLogOpen,
    latestLog,
    
    // Macro Debug Log props
    macroDebug = {},
    showMacroDebugLog = false,
    setShowMacroDebugLog = () => {},
    handleDownloadMacroDebugLogs = () => {},

    // ADDED: Product Match Trace Props (Fix)
    showProductMatchTrace = false,
    setShowProductMatchTrace = () => {},
    
    // Generation State
    generationStepKey,
    generationStatus,
    
    // Nutrition Cache
    nutritionCache,
    loadingNutritionFor,
    
    // Modal State
    selectedMeal,
    setSelectedMeal,
    showSuccessModal,
    setShowSuccessModal,
    planStats,
    
    // Settings
    isSettingsOpen,
    setIsSettingsOpen,
    
    // AI Model
    selectedModel,
    setSelectedModel,
    
    // Toasts
    toasts,
    removeToast,
    
    // Handlers
    handleGeneratePlan,
    handleFetchNutrition,
    handleSubstituteSelection,
    handleQuantityChange,
    handleDownloadMatchTraceReport,
    handleDownloadLogs,
    onToggleMealEaten,
    handleRefresh,
    handleEditProfile,
    handleSignOut,
    showToast,
    
    // Plan Persistence
    savedPlans,
    activePlanId,
    handleSavePlan,
    handleLoadPlan,
    handleDeletePlan,
    handleRenamePlan,
    savingPlan,
    loadingPlan,
    
    // Responsive
    isMobile,
    isDesktop,

    // --- NEW: Onboarding / New User Props ---
    isNewUser = false,
    profileSetupComplete = true,
    profileSetupSaving = false,
    onCompleteProfileSetup = () => {},
}) => {
    
    // --- Consume Theme Hook ---
    const { isDark } = useTheme();
    
    useEffect(() => {
    // Ensure smooth scrolling when tabs are shown/hidden
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
        document.documentElement.style.scrollBehavior = 'auto';
    };
}, []);
    

    // Determine if we should show the new-user profile gate
    const showProfileGate = isNewUser && !profileSetupComplete;

    // Create a wrapped handler that closes meal when changing tabs
    // Also blocks navigation if profile setup is not complete for new users
    const handleTabChange = (newTab) => {
        // Block navigation if new user hasn't completed profile setup
        if (showProfileGate) {
            return;
        }
        // Close meal detail if open
        if (selectedMeal) {
            setSelectedMeal(null);
        }
        // Change the tab
        setContentView(newTab);
    };
    
    // Wrapped handler for plan generation + redirect
    const handleGenerateAndRedirect = async (e) => {
        await handleGeneratePlan(e);
        setContentView('profile');
        setIsMenuOpen(false);
    };

    // Local state for SavedPlansModal
    const [showSavedPlansModal, setShowSavedPlansModal] = useState(false);
    const [savePlanName, setSavePlanName] = useState('');
    const [showSavePlanPrompt, setShowSavePlanPrompt] = useState(false);
    const [headerHeight, setHeaderHeight] = useState(64);
    
    const PlanCalculationErrorPanel = () => (
        <div className="p-6 text-center bg-red-100 text-red-800 rounded-lg shadow-lg m-4">
            <AlertTriangle className="inline mr-2 w-8 h-8" />
            <h3 className="text-xl font-bold">Plan Calculation Error</h3>
            <p className="mt-2">A critical error occurred while calculating meal nutrition. The generated plan is incomplete and cannot be displayed. Check logs for details.</p>
            {error && <pre className="mt-2 whitespace-pre-wrap text-sm">{error}</pre>}
        </div>
    );

    // Handle opening saved plans
    const handleOpenSavedPlans = () => {
        setShowSavedPlansModal(true);
    };

// Close Saved Plans before navigating to Edit Profile
// Ensures both views are never in the DOM simultaneously
const handleEditProfileClean = useCallback(() => {
    if (showSavedPlansModal) {
        setShowSavedPlansModal(false);
    }
    // Delegate to the parent-provided handler after a tick
    // so the modal has time to unmount cleanly
    setTimeout(() => {
        handleEditProfile();
    }, 50);
}, [showSavedPlansModal, handleEditProfile]);

    // Create a local handler for viewing recipe
    const handleViewRecipe = useCallback((meal) => {
        setSelectedMeal(meal);
    }, [setSelectedMeal]);
    
    // Memoize content for meals tab
    const mealPlanContent = useMemo(() => {
        if (!mealPlan || mealPlan.length === 0) return null;
        return (
            <MealPlanDisplay
                mealPlan={mealPlan}
                selectedDay={selectedDay}
                setSelectedDay={setSelectedDay}
                eatenMeals={eatenMeals}
                onToggleMealEaten={onToggleMealEaten}
                formData={formData}
                nutritionalTargets={nutritionalTargets}
                nutritionCache={nutritionCache}
                loadingNutritionFor={loadingNutritionFor}
                onFetchNutrition={handleFetchNutrition}
                onViewRecipe={handleViewRecipe}
                showToast={showToast}
            />
        );
    }, [
        mealPlan, 
        selectedDay, 
        eatenMeals, 
        formData, 
        nutritionalTargets, 
        nutritionCache, 
        loadingNutritionFor, 
        handleFetchNutrition, 
        handleViewRecipe, 
        onToggleMealEaten, 
        setSelectedDay,
        showToast
    ]);

    // Memoize shopping list content
    const shoppingListContent = useMemo(() => {
        if (!results || Object.keys(results).length === 0) return null;
        
        return (
            <ShoppingListWithDetails
                ingredients={uniqueIngredients}
                results={results}
                totalCost={totalCost}
                storeName={formData?.store || 'Woolworths'}
                categorizedResults={categorizedResults}
                onSelectSubstitute={handleSubstituteSelection}
                onQuantityChange={handleQuantityChange}
                onShowToast={showToast}
                onFetchNutrition={handleFetchNutrition}
                nutritionCache={nutritionCache}
                loadingNutritionFor={loadingNutritionFor}
            />
        );
    }, [
        results, 
        uniqueIngredients, 
        totalCost, 
        formData?.store, 
        categorizedResults, 
        handleSubstituteSelection, 
        handleQuantityChange, 
        handleFetchNutrition, 
        nutritionCache, 
        loadingNutritionFor, 
        showToast
    ]);

    // Error/empty state for meals & ingredients
    const emptyResultsMessage = (
        <div className="p-6 text-center text-gray-500">
            {loading ? null : error ? (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg">
                    <AlertTriangle className="inline mr-2 w-5 h-5" />
                    <strong>Error generating plan.</strong>
                    <br />
                    <strong>Check logs for details.</strong>
                    <pre className="mt-2 whitespace-pre-wrap text-sm">{error}</pre>
                </div>
            ) : mealPlan?.length === 0 && !loading ? (
                'Generate a plan to see your meals.'
            ) : (
                !loading && 'Select a valid day to view meals.'
            )}
        </div>
    );

    const totalLogHeight = (matchTraces?.length > 0 ? 60 : 0) + (isLogOpen ? Math.max(50, logHeight) : 50);

    return (
        <>
            {/* --- NEW USER PROFILE GATE --- */}
            {showProfileGate && (
                <NewUserProfileGate
                    formData={formData}
                    onChange={handleChange}
                    onComplete={onCompleteProfileSetup}
                    saving={profileSetupSaving}
                />
            )}

            <Header 
    userId={userId}
    userName={formData?.name || ''}
    onOpenSettings={() => setIsSettingsOpen(true)}
    onNavigateToProfile={() => {
        handleTabChange('profile');
        setIsMenuOpen(true);
    }}
    onSignOut={handleSignOut}
    onOpenSavedPlans={handleOpenSavedPlans}
    onHeaderHeightChange={setHeaderHeight}
    activeTab={contentView}
    onTabChange={handleTabChange}
    tabsHidden={showSavedPlansModal || isSettingsOpen || (isMenuOpen && isMobile)}
    tabsDisabled={showProfileGate}
/>
    
    {/* StickyTabs — hidden when inside Edit Profile or My Saved Plans */}
<StickyTabs
    activeTab={contentView}
    onTabChange={handleTabChange}
    hidden={showSavedPlansModal || isSettingsOpen || (isMenuOpen && isMobile)}
    disabled={showProfileGate}
    headerHeight={headerHeight}
/>
    
            
                {/* --- Theme-Aware Background --- */}
                <div 
                    className="min-h-screen p-4 md:p-8 transition-all duration-200 relative" 
                    style={{ 
    backgroundColor: isDark ? '#0f1117' : '#f3f4f6',
    paddingTop: `${headerHeight + 8}px`,
    paddingBottom: '2rem',
    transition: 'padding-top 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
}}
                >
                    <div
    className="max-w-7xl mx-auto rounded-3xl shadow-2xl overflow-hidden"
    style={{
        backgroundColor: isDark ? '#181a24' : '#ffffff',
        border: isDark ? '1px solid rgba(45, 49, 72, 0.5)' : 'none',
    }}
>
                        <div className="flex flex-col md:flex-row">
                            {/* --- SETUP FORM (LEFT COLUMN) --- */}
                            <div className={`p-6 md:p-8 w-full md:w-1/2 border-b md:border-r ${isMenuOpen ? 'block' : 'hidden md:block'}`}>
                                <PlanSetupWizard
                                    formData={formData}
                                    onChange={handleChange}
                                    onSliderChange={handleSliderChange}
                                    onSubmit={handleGenerateAndRedirect}
                                    loading={loading}
                                    isAuthReady={isAuthReady}
                                    userId={userId}
                                    firebaseConfig={firebaseConfig}
                                    firebaseInitializationError={firebaseInitializationError}
                                    onClose={() => setIsMenuOpen(false)}
                                    isMobile={isMobile}
                                    measurementUnits={formData.measurementUnits || 'metric'}
                                />
                            </div>
    
                            {/* --- RESULTS VIEW (RIGHT COLUMN) --- */}
                            <div className={`w-full md:w-1/2 ${isMenuOpen ? 'hidden md:block' : 'block'}`}>
                                {hasInvalidMeals ? (
                                    <PlanCalculationErrorPanel />
                                ) : (
                                    <div className="p-0">
                                        {loading && (
                                            <div className="p-4 md:p-6">
                                                <StoryModeGeneration
                                                    activeStepKey={generationStepKey}
                                                    errorMsg={error}
                                                    latestLog={latestLog}
                                                    formData={formData}
                                                    nutritionalTargets={nutritionalTargets}
                                                    results={results}
                                                    mealPlan={mealPlan}
                                                />
                                            </div>
                                        )}
                                
                                        {contentView === 'profile' && (
                                            <ProfileTab 
                                                formData={formData} 
                                                nutritionalTargets={nutritionalTargets} 
                                            />
                                        )}
                                        
                                        {contentView === 'meals' && mealPlan?.length > 0 && mealPlanContent}
                                        
                                        {contentView === 'ingredients' && Object.keys(results)?.length > 0 && shoppingListContent}
                                        
                                        {(contentView === 'meals' || contentView === 'ingredients') && (!results || Object.keys(results).length === 0) && (
                                            <EmptyTabState tab={contentView} />
                                
                                        )}
                                        
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            
    
    
            <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
            
                        <SuccessModal
                isVisible={showSuccessModal}
                title="Your Plan is Ready!"
                message={`We've created ${formData.days} days of meals optimized for your goals`}
                stats={planStats}
                onClose={() => setShowSuccessModal(false)}
                onViewPlan={async (planName) => {
                    // Save the plan using the user-provided name, then navigate
                    if (handleSavePlan) {
                        await handleSavePlan(planName);
                    }
                    setShowSuccessModal(false);
                    handleTabChange('meals');
                }}
            />

    
            <SettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onClearData={() => {
                    showToast('All data cleared', 'success');
                }}
                onEditProfile={handleEditProfileClean}
                showOrchestratorLogs={showOrchestratorLogs}
                onToggleOrchestratorLogs={setShowOrchestratorLogs}
                
                // MAPPING FIX: Map new state to potentially legacy props for safety
                // We pass BOTH the legacy naming conventions and the new naming conventions
                // to ensure SettingsPanel works regardless of its internal state.
                
                // Legacy Props (if SettingsPanel uses them)
                setShowMatchTraceLogs={setShowProductMatchTrace}
                onToggleFailedIngredientsLogs={setShowProductMatchTrace}
                showMatchTraceLogs={showProductMatchTrace}
                
                // New Props (Standardized)
                showProductMatchTrace={showProductMatchTrace}
                onToggleProductMatchTrace={setShowProductMatchTrace}
                
                showMacroDebugLog={showMacroDebugLog}
                onToggleMacroDebugLog={setShowMacroDebugLog}

                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                measurementUnits={formData.measurementUnits || 'metric'}
                onMeasurementUnitsChange={(units) => {
                    handleChange({ target: { name: 'measurementUnits', value: units } });
                    showToast(`Units changed to ${units === 'imperial' ? 'Imperial (lb, ft)' : 'Metric (kg, cm)'}`, 'success');
                }}
            />

            {/* Save Plan Prompt */}
            {showSavePlanPrompt && (
                <>
                    <div
                        className="fixed inset-0 animate-fadeIn"
                        style={{
                            zIndex: Z_INDEX.modalBackdrop,
                            backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.5)',
                        }}
                        onClick={() => setShowSavePlanPrompt(false)}
                    />
                    <div
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 w-80 shadow-2xl"
                        style={{
                            zIndex: Z_INDEX.modal,
                            backgroundColor: isDark ? '#1e2130' : '#ffffff',
                            border: isDark ? '1px solid #2d3148' : undefined,
                        }}
                    >
                        <h3
                            className="text-lg font-bold mb-4"
                            style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}
                        >
                            Save Current Plan
                        </h3>
                        <input
                            type="text"
                            value={savePlanName}
                            onChange={(e) => setSavePlanName(e.target.value)}
                            placeholder="Plan name (optional)"
                            className="w-full px-4 py-2 border rounded-lg mb-4"
                            style={{
                                borderColor: isDark ? '#2d3148' : COLORS.gray[300],
                                backgroundColor: isDark ? '#252839' : '#ffffff',
                                color: isDark ? '#f0f1f5' : COLORS.gray[900],
                            }}
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowSavePlanPrompt(false)}
                                className="flex-1 px-4 py-2 rounded-lg border"
                                style={{
                                    borderColor: isDark ? '#2d3148' : COLORS.gray[300],
                                    color: isDark ? '#d1d5db' : COLORS.gray[600],
                                    backgroundColor: isDark ? '#1e2130' : 'transparent',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await handleSavePlan(savePlanName || undefined);
                                    setShowSavePlanPrompt(false);
                                    setSavePlanName('');
                                }}
                                disabled={savingPlan}
                                className="flex-1 px-4 py-2 rounded-lg text-white font-semibold"
                                style={{ backgroundColor: COLORS.primary[600] }}
                            >
                                {savingPlan ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Saved Plans Modal */}
            <SavedPlansModal
                isOpen={showSavedPlansModal}
                onClose={() => setShowSavedPlansModal(false)}
                savedPlans={savedPlans || []}
                activePlanId={activePlanId}
                onLoadPlan={handleLoadPlan}
                onDeletePlan={handleDeletePlan}
                 onRenamePlan={handleRenamePlan}
                loadingPlan={loadingPlan}
            />
    
            {/* Fixed bottom log area */}
            <div className="fixed bottom-0 left-0 right-0 z-[100] flex flex-col-reverse">
                {showOrchestratorLogs && (
                    <DiagnosticLogViewer logs={diagnosticLogs} height={logHeight} setHeight={setLogHeight} isOpen={isLogOpen} setIsOpen={setIsLogOpen} onDownloadLogs={handleDownloadLogs} />
                )}
                {/* UPDATED: Condition now uses showProductMatchTrace */}
                {showProductMatchTrace && (
                    <ProductMatchLogViewer 
                        matchTraces={matchTraces} 
                        onDownload={handleDownloadMatchTraceReport} 
                    />
                )}
                {showMacroDebugLog && (
                    <MacroDebugLogViewer macroDebug={macroDebug} onDownload={handleDownloadMacroDebugLogs} />
                )}
                {/* Updated condition to include showProductMatchTrace */}
                {!showOrchestratorLogs && !showProductMatchTrace && !showMacroDebugLog && (
    <div 
        className="p-2 text-xs text-center cursor-pointer"
        style={{
            backgroundColor: isDark ? '#181a24' : '#1f2937',
            color: '#ffffff',
        }}
        onClick={() => { 
            // Only enable Orchestrator logs by default, respect user's other toggle states
            setShowOrchestratorLogs(true);
        }}
    >
        📋 Show Logs
    </div>
)}
            </div>
    
            {selectedMeal && (
                <RecipeModal 
                    meal={selectedMeal} 
                    onClose={() => setSelectedMeal(null)} 
                />
            )}
        </>
    );
};

export default MainApp;

