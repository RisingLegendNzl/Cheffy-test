// web/src/components/MainApp.jsx
import React, { useState, useMemo } from 'react';
import { RefreshCw, Zap, AlertTriangle, CheckCircle, Package, DollarSign, ExternalLink, Calendar, Users, Menu, X, ChevronsDown, ChevronsUp, ShoppingBag, BookOpen, ChefHat, Tag, Soup, Replace, Target, FileText, Terminal, Loader, ChevronRight, GripVertical, Flame, Droplet, Wheat, ChevronDown, ChevronUp, Download, ListX, Save, FolderDown, User, Check, ListChecks, ListOrdered, Utensils } from 'lucide-react';

// --- Component Imports ---
import MacroRing from './MacroRing';
import MacroBar from './MacroBar';
import InputField from './InputField';
import DaySlider from './DaySlider';
import DayTabBar from './DayTabBar';
import ProductCard from './ProductCard';
import CollapsibleSection from './CollapsibleSection';
import SubstituteMenu from './SubstituteMenu';
import GenerationProgressDisplay from './GenerationProgressDisplay';
import StoryModeGeneration from './StoryModeGeneration';
import NutritionalInfo from './NutritionalInfo';
import IngredientResultBlock from './IngredientResultBlock';
import MealPlanDisplay from './MealPlanDisplay';
import LogEntry from './LogEntry';
import DiagnosticLogViewer from './DiagnosticLogViewer';
import FailedIngredientLogViewer from './FailedIngredientLogViewer';
import MacroDebugLogViewer from './MacroDebugLogViewer';
import RecipeModal from './RecipeModal';
import EmojiIcon from './EmojiIcon';
import ProfileTab from './ProfileTab';
import SavedPlansModal from './SavedPlansModal';
import PlanSetupWizard from './wizard/PlanSetupWizard';
import NewUserProfileGate from './NewUserProfileGate';
// EnhancedTabs REMOVED — top tab bar no longer rendered.

import Header from './Header';
import BottomNav from './BottomNav';
import PullToRefresh from './PullToRefresh';
import SettingsPanel from './SettingsPanel';
import SuccessModal from './SuccessModal';
import ToastContainer from './Toast';

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
    showFailedIngredientsLogs,
    setShowFailedIngredientsLogs,
    failedIngredientsHistory,
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
    handleLoadProfile,
    handleSaveProfile,
    handleFetchNutrition,
    handleSubstituteSelection,
    handleQuantityChange,
    handleDownloadFailedLogs,
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
    
    // Determine if we should show the new-user profile gate
    const showProfileGate = isNewUser && !profileSetupComplete;

    // Create a wrapped handler that closes meal when changing tabs
    // Also blocks tab changes if profile setup is not complete for new users
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
    
    // Local state for SavedPlansModal
    const [showSavedPlansModal, setShowSavedPlansModal] = useState(false);
    const [savePlanName, setSavePlanName] = useState('');
    const [showSavePlanPrompt, setShowSavePlanPrompt] = useState(false);
    
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
                onSelectMeal={setSelectedMeal}
            />
        );
    }, [mealPlan, selectedDay, eatenMeals, formData, nutritionalTargets, nutritionCache, loadingNutritionFor, handleFetchNutrition, setSelectedMeal, onToggleMealEaten, setSelectedDay]);

    // Memoize shopping list content
    const shoppingListContent = useMemo(() => {
        if (!results || Object.keys(results).length === 0) return null;
        
        const categories = categorizedResults || { 'All Items': results };
        
        return (
            <div className="p-4 md:p-6 space-y-4">
                {Object.entries(categories).map(([category, items]) => (
                    <CollapsibleSection
                        key={category}
                        title={category}
                        icon={CATEGORY_ICONS[category.toLowerCase()] || CATEGORY_ICONS['default']}
                        itemCount={Object.keys(items).length}
                        defaultOpen={true}
                    >
                        {Object.entries(items).map(([key, item]) => (
                            <IngredientResultBlock
                                key={key}
                                ingredientKey={key}
                                result={item}
                                onSelectSubstitute={handleSubstituteSelection}
                                onQuantityChange={handleQuantityChange}
                            />
                        ))}
                    </CollapsibleSection>
                ))}
            </div>
        );
    }, [results, categorizedResults, handleSubstituteSelection, handleQuantityChange]);

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

    const totalLogHeight = (failedIngredientsHistory?.length > 0 ? 60 : 0) + (isLogOpen ? Math.max(50, logHeight) : 50);

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
            />
    
            <PullToRefresh onRefresh={handleRefresh} refreshing={loading}>
                <div 
                    className="min-h-screen bg-gray-100 p-4 md:p-8 transition-all duration-200 relative" 
                    style={{ 
                        paddingTop: '80px',
                        paddingBottom: '6rem'
                    }}
                >
                    <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
                        <div className="flex flex-col md:flex-row">
                            {/* --- SETUP FORM (LEFT COLUMN) --- */}
                            <div className={`p-6 md:p-8 w-full md:w-1/2 border-b md:border-r ${isMenuOpen ? 'block' : 'hidden md:block'}`}>
                                <PlanSetupWizard
                                    formData={formData}
                                    onChange={handleChange}
                                    onSliderChange={handleSliderChange}
                                    onSubmit={handleGeneratePlan}
                                    onLoadProfile={() => handleLoadProfile(false)}
                                    onSaveProfile={() => handleSaveProfile(false)}
                                    loading={loading}
                                    isAuthReady={isAuthReady}
                                    userId={userId}
                                    firebaseConfig={firebaseConfig}
                                    firebaseInitializationError={firebaseInitializationError}
                                    onClose={() => setIsMenuOpen(false)}
                                    isMobile={isMobile}
                                />
                            </div>
    
                            {/* --- RESULTS VIEW (RIGHT COLUMN) --- */}
                            <div className={`w-full md:w-1/2 ${isMenuOpen ? 'hidden md:block' : 'block'}`}>
                                {/* Top tab bar REMOVED — navigation handled by BottomNav */}

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
                                        
                                        {(contentView === 'meals' || contentView === 'ingredients') && (!results || Object.keys(results).length === 0) && !loading && (
                                            <div className="p-6 text-center text-gray-500">
                                                Generate a plan to view {contentView}.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </PullToRefresh>
    
            {/* BottomNav — always visible as primary navigation */}
            <BottomNav
                activeTab={contentView}
                onTabChange={handleTabChange}
                showPlanButton={false}
                disabled={showProfileGate}
            />
    
            <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
            
            <SuccessModal
                isVisible={showSuccessModal}
                title="Your Plan is Ready!"
                message={`We've created ${formData.days} days of meals optimized for your goals`}
                stats={planStats}
                onClose={() => setShowSuccessModal(false)}
                onViewPlan={() => {
                    setShowSuccessModal(false);
                    handleTabChange('meals');
                }}
            />
    
            <SettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentStore={formData.store}
                onStoreChange={(store) => {
                    handleChange({ target: { name: 'store', value: store } });
                    showToast(`Store changed to ${store}`, 'success');
                }}
                onClearData={() => {
                    showToast('All data cleared', 'success');
                }}
                onEditProfile={handleEditProfile}
                showOrchestratorLogs={showOrchestratorLogs}
                onToggleOrchestratorLogs={setShowOrchestratorLogs}
                showFailedIngredientsLogs={showFailedIngredientsLogs}
                onToggleFailedIngredientsLogs={setShowFailedIngredientsLogs}
                showMacroDebugLog={showMacroDebugLog}
                onToggleMacroDebugLog={setShowMacroDebugLog}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
            />

            {/* Save Plan Prompt */}
            {showSavePlanPrompt && (
                <>
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 animate-fadeIn"
                        style={{ zIndex: Z_INDEX.modalBackdrop }}
                        onClick={() => setShowSavePlanPrompt(false)}
                    />
                    <div
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-80 shadow-2xl"
                        style={{ zIndex: Z_INDEX.modal }}
                    >
                        <h3 className="text-lg font-bold mb-4" style={{ color: COLORS.gray[900] }}>
                            Save Current Plan
                        </h3>
                        <input
                            type="text"
                            value={savePlanName}
                            onChange={(e) => setSavePlanName(e.target.value)}
                            placeholder="Plan name (optional)"
                            className="w-full px-4 py-2 border rounded-lg mb-4"
                            style={{ borderColor: COLORS.gray[300] }}
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowSavePlanPrompt(false)}
                                className="flex-1 px-4 py-2 rounded-lg border"
                                style={{ borderColor: COLORS.gray[300], color: COLORS.gray[600] }}
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
                loadingPlan={loadingPlan}
            />
    
            {/* Fixed bottom log area */}
            <div className="fixed bottom-0 left-0 right-0 z-[100] flex flex-col-reverse">
                {showOrchestratorLogs && (
                    <DiagnosticLogViewer logs={diagnosticLogs} height={logHeight} setHeight={setLogHeight} isOpen={isLogOpen} setIsOpen={setIsLogOpen} onDownloadLogs={handleDownloadLogs} />
                )}
                {showFailedIngredientsLogs && (
                    <FailedIngredientLogViewer failedHistory={failedIngredientsHistory} onDownload={handleDownloadFailedLogs} />
                )}
                {showMacroDebugLog && (
                    <MacroDebugLogViewer macroDebug={macroDebug} onDownload={handleDownloadMacroDebugLogs} />
                )}
                {!showOrchestratorLogs && !showFailedIngredientsLogs && !showMacroDebugLog && (
                    <div className="bg-gray-800 text-white p-2 text-xs text-center cursor-pointer hover:bg-gray-700" onClick={() => { setShowOrchestratorLogs(true); setShowFailedIngredientsLogs(true); setShowMacroDebugLog(true); }}>
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