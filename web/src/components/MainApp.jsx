// web/src/components/MainApp.jsx
import React, { useState } from 'react';
import { RefreshCw, Zap, AlertTriangle, CheckCircle, Package, DollarSign, ExternalLink, Calendar, Users, Menu, X, ChevronsDown, ChevronsUp, ShoppingBag, BookOpen, ChefHat, Tag, Soup, Replace, Target, FileText, LayoutDashboard, Terminal, Loader, ChevronRight, GripVertical, Flame, Droplet, Wheat, ChevronDown, ChevronUp, Download, ListX, Save, FolderDown, User, Check, ListChecks, ListOrdered, Utensils } from 'lucide-react';

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
import MacroDebugLogViewer from './MacroDebugLogViewer'; // CHANGE 1
import RecipeModal from './RecipeModal';
import EmojiIcon from './EmojiIcon';
import ProfileTab from './ProfileTab';
import SavedPlansModal from './SavedPlansModal';
import PlanSetupWizard from './wizard/PlanSetupWizard';

// Phase 2 imports
import Header from './Header';
import { ToastContainer } from './Toast';
import EmptyState from './EmptyState';
import LoadingOverlay from './LoadingOverlay';
import SuccessModal from './SuccessModal';
import MealCard from './MealCard';
import DayNavigator from './DayNavigator';
import ShoppingListWithDetails from './ShoppingListWithDetails';
import FormSection from './FormSection';
import SettingsPanel from './SettingsPanel';
import BottomNav from './BottomNav';
import { MealCardSkeleton, ProfileCardSkeleton, ShoppingListSkeleton } from './SkeletonLoader';
import PullToRefresh from './PullToRefresh';

// --- Category Icon Map ---
const categoryIconMap = {
    'produce': <EmojiIcon code="1f966" alt="produce" />,
    'fruit': <EmojiIcon code="1f353" alt="fruit" />,
    'veg': <EmojiIcon code="1f955" alt="veg" />,
    'grains': <EmojiIcon code="1f33e" alt="grains" />,
    'carb': <EmojiIcon code="1f33e" alt="grains" />,
    'meat': <EmojiIcon code="1f969" alt="meat" />,
    'protein': <EmojiIcon code="1f969" alt="meat" />,
    'seafood': <EmojiIcon code="1f41f" alt="seafood" />,
    'dairy': <EmojiIcon code="1f95b" alt="dairy" />,
    'fat': <EmojiIcon code="1f951" alt="fat" />,
    'drinks': <EmojiIcon code="1f9c3" alt="drinks" />,
    'pantry': <EmojiIcon code="1f968" alt="pantry" />,
    'canned': <EmojiIcon code="1f96b" alt="canned" />,
    'spreads': <EmojiIcon code="1f95c" alt="spreads" />,
    'condiments': <EmojiIcon code="1f9c2" alt="condiments" />,
    'bakery': <EmojiIcon code="1f370" alt="bakery" />,
    'frozen': <EmojiIcon code="2744" alt="frozen" />,
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
}) => {
    
    // Create a wrapped handler that closes meal when changing tabs
    const handleTabChange = (newTab) => {
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
            <p className="mt-2">A critical error occurred while calculating meal nutrition. The generated plan is incomplete and cannot be displayed. Please check the logs for details.</p>
        </div>
    );

    // Handler for opening saved plans modal
    const handleOpenSavedPlans = () => {
        setShowSavedPlansModal(true);
    };

    // Handler for save plan button click
    const handleSavePlanClick = () => {
        if (!mealPlan || mealPlan.length === 0) {
            showToast('No meal plan to save', 'warning');
            return;
        }
        setShowSavePlanPrompt(true);
    };

    // Handler for confirming save with name
    const handleConfirmSave = async () => {
        const name = savePlanName.trim() || `Plan ${new Date().toLocaleDateString()}`;
        await handleSavePlan(name);
        setShowSavePlanPrompt(false);
        setSavePlanName('');
    };

    // --- Shopping List Content Definition ---
    const shoppingListContent = (
        <div className="p-4">
            <ShoppingListWithDetails
                ingredients={uniqueIngredients || []}
                results={results || {}}
                totalCost={totalCost || 0}
                storeName={formData?.store || 'Woolworths'}
                onShowToast={showToast}
                onSelectSubstitute={handleSubstituteSelection}
                onQuantityChange={handleQuantityChange}
                onFetchNutrition={handleFetchNutrition}
                nutritionCache={nutritionCache || {}}
                loadingNutritionFor={loadingNutritionFor}
                categorizedResults={categorizedResults || {}}
            />
        </div>
    );
    
    // ─────────────────────────────────────────────────────────
    // MEAL PLAN CONTENT — Option A: Sticky Top Tab Bar
    // ─────────────────────────────────────────────────────────
    // Old layout:  sidebar card (DaySidebar + Save/Load) | meal content
    // New layout:  DayTabBar (full-width sticky strip)
    //              meal content (full-width)
    //
    // Save/Load live inside the DayTabBar kebab menu.
    // For single-day plans (tab bar hidden), compact buttons
    // appear inline in the meal header area.
    // ─────────────────────────────────────────────────────────
    
    // ── CRITICAL: Validate selectedDay before rendering ──
    // This prevents white screen crashes when selectedDay is out of bounds
    const isValidDaySelection = mealPlan && 
                                 mealPlan.length > 0 && 
                                 selectedDay >= 1 && 
                                 selectedDay <= mealPlan.length;

    // Auto-correct invalid selectedDay to prevent crashes
    // This is a safety fallback - primary fix is in loadPlan
    React.useEffect(() => {
        if (mealPlan && mealPlan.length > 0 && selectedDay > mealPlan.length) {
            console.warn(`[MainApp] Auto-correcting selectedDay from ${selectedDay} to 1 (plan has ${mealPlan.length} days)`);
            setSelectedDay(1);
        }
    }, [mealPlan, selectedDay, setSelectedDay]);

    const mealPlanContent = (
        <div className="flex flex-col">
            {/* ── Day Tab Bar (auto-hidden for single-day plans) ── */}
            {mealPlan && mealPlan.length > 0 && (
                <DayTabBar
                    totalDays={Math.max(1, mealPlan.length)}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                    onSavePlan={handleSavePlanClick}
                    onLoadPlans={handleOpenSavedPlans}
                    savingPlan={savingPlan}
                    loading={loading}
                />
            )}

            {/* ── Single-day inline action buttons (shown only when tab bar is hidden) ── */}
            {mealPlan && mealPlan.length === 1 && (
                <div className="flex items-center justify-end gap-2 px-4 pt-3">
                    <button
                        onClick={handleSavePlanClick}
                        disabled={savingPlan || loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md bg-indigo-600 text-white"
                    >
                        <Save size={14} />
                        <span>{savingPlan ? 'Saving…' : 'Save'}</span>
                    </button>
                    <button
                        onClick={handleOpenSavedPlans}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md bg-gray-200 text-gray-800"
                    >
                        <FolderDown size={14} />
                        <span>Load</span>
                    </button>
                </div>
            )}

            {/* ── Meal Content with Bounds Validation ── */}
            {isValidDaySelection ? (
                <div className="p-4">
                    <MealPlanDisplay
                        key={selectedDay}
                        mealPlan={mealPlan}
                        selectedDay={selectedDay}
                        nutritionalTargets={nutritionalTargets}
                        eatenMeals={eatenMeals}
                        onToggleMealEaten={onToggleMealEaten}
                        onViewRecipe={setSelectedMeal}
                        showToast={showToast}
                    />
                </div>
            ) : (
                <div className="flex-1 text-center p-8 text-gray-500">
                    {error && !loading ? (
                        <div className="p-4 bg-red-50 text-red-800 rounded-lg">
                            <AlertTriangle className="inline w-6 h-6 mr-2" />
                            <strong>Error generating plan. Check logs for details.</strong>
                            <pre className="mt-2 whitespace-pre-wrap text-sm">{error}</pre>
                        </div>
                    ) : mealPlan?.length === 0 && !loading ? (
                        'Generate a plan to see your meals.'
                    ) : (
                        !loading && 'Select a valid day to view meals.'
                    )}
                </div>
            )}
        </div>
    );

    const totalLogHeight = (failedIngredientsHistory?.length > 0 ? 60 : 0) + (isLogOpen ? Math.max(50, logHeight) : 50);

    return (
        <>
            <Header 
                userId={userId}
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
                        paddingBottom: `${isMobile && results && Object.keys(results).length > 0 ? '6rem' : (Number.isFinite(totalLogHeight) ? totalLogHeight : 50) + 'px'}`
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
                                <div className="border-b">
                                    <div className="p-6 md:p-8">
                                        {/* Added Navigation Tabs */}
                                        <div className="flex space-x-4 border-b">
                                            <button
                                                onClick={() => handleTabChange('profile')}
                                                className={`pb-2 text-lg font-semibold ${contentView === 'profile' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                <LayoutDashboard className="inline w-5 h-5 mr-2" /> Summary
                                            </button>
                                            {results && Object.keys(results).length > 0 && (
                                                <>
                                                    <button
                                                        onClick={() => handleTabChange('meals')}
                                                        className={`pb-2 text-lg font-semibold ${contentView === 'meals' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                                    >
                                                        <Utensils className="inline w-5 h-5 mr-2" /> Meals
                                                    </button>
                                                    <button
                                                        onClick={() => handleTabChange('ingredients')}
                                                        className={`pb-2 text-lg font-semibold ${contentView === 'ingredients' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                                    >
                                                        <ShoppingBag className="inline w-5 h-5 mr-2" /> Shopping
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
    
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
    
            {isMobile && results && Object.keys(results).length > 0 && (
                <BottomNav
                    activeTab={contentView}
                    onTabChange={handleTabChange}
                    showPlanButton={false}
                />
            )}
    
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
                settings={{
                    showOrchestratorLogs,
                    showFailedIngredientsLogs,
                    showMacroDebugLog,
                }}
                onToggleSetting={(key) => {
                    if (key === 'showOrchestratorLogs') {
                        setShowOrchestratorLogs(!showOrchestratorLogs);
                    } else if (key === 'showFailedIngredientsLogs') {
                        setShowFailedIngredientsLogs(!showFailedIngredientsLogs);
                    } else if (key === 'showMacroDebugLog') {
                        setShowMacroDebugLog(!showMacroDebugLog);
                    }
                }}
            />

            {/* Save Plan Name Prompt */}
            {showSavePlanPrompt && (
                <>
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 z-[1000]"
                        onClick={() => setShowSavePlanPrompt(false)}
                    />
                    <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <h3 className="text-xl font-bold mb-4 text-gray-900">
                                Save Meal Plan
                            </h3>
                            <input
                                type="text"
                                value={savePlanName}
                                onChange={(e) => setSavePlanName(e.target.value)}
                                placeholder={`Plan ${new Date().toLocaleDateString()}`}
                                className="w-full px-4 py-2 border rounded-lg mb-4 border-gray-300"
                            />
                            <div className="flex space-x-3">
                                <button
                                    onClick={() => setShowSavePlanPrompt(false)}
                                    className="flex-1 py-2 px-4 rounded-lg font-semibold bg-gray-200 text-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmSave}
                                    disabled={savingPlan}
                                    className="flex-1 py-2 px-4 rounded-lg font-semibold text-white disabled:opacity-50 bg-indigo-600"
                                >
                                    {savingPlan ? 'Saving...' : 'Save'}
                                </button>
                            </div>
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