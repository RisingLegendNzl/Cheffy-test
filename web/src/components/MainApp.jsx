// web/src/components/MainApp.jsx
import React, { useState, useMemo } from 'react';
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
import MacroDebugLogViewer from './MacroDebugLogViewer';
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
    
    // ── WHITE-SCREEN FIX: Clamp selectedDay safely ──
    // Instead of relying solely on an async useEffect to auto-correct,
    // compute a safe clamped value synchronously for rendering. This ensures
    // that even if React renders before the useEffect fires, we never
    // pass an out-of-bounds selectedDay to MealPlanDisplay.
    const safeSelectedDay = useMemo(() => {
        if (!mealPlan || mealPlan.length === 0) return 1;
        if (selectedDay < 1) return 1;
        if (selectedDay > mealPlan.length) return 1;
        return selectedDay;
    }, [mealPlan, selectedDay]);

    // ── CRITICAL: Validate selectedDay before rendering ──
    // This prevents white screen crashes when selectedDay is out of bounds
    const isValidDaySelection = mealPlan && 
                                 mealPlan.length > 0 && 
                                 safeSelectedDay >= 1 && 
                                 safeSelectedDay <= mealPlan.length;

    // Auto-correct invalid selectedDay to prevent crashes
    // This is a safety fallback - primary fix is in loadPlan (flushSync)
    React.useEffect(() => {
        if (mealPlan && mealPlan.length > 0 && selectedDay > mealPlan.length) {
            console.warn(`[MainApp] Auto-correcting selectedDay from ${selectedDay} to 1 (plan has ${mealPlan.length} days)`);
            setSelectedDay(1);
        }
    }, [mealPlan, selectedDay, setSelectedDay]);

    // ── WHITE-SCREEN FIX: Stable plan identity key ──
    // When loading a new plan, React needs to know the plan has changed so
    // DayTabBar and MealPlanDisplay re-mount cleanly. We derive a stable
    // identity from the plan's day count + first meal name, which changes
    // any time a different plan is loaded.
    const planIdentityKey = useMemo(() => {
        if (!mealPlan || mealPlan.length === 0) return 'empty';
        const firstMealName = mealPlan[0]?.meals?.[0]?.name || 'unknown';
        return `plan-${mealPlan.length}d-${firstMealName}`;
    }, [mealPlan]);

    const mealPlanContent = (
        <div className="flex flex-col">
            {/* ── WHITE-SCREEN FIX: Loading overlay during plan transition ── */}
            {loadingPlan && (
                <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                        <p className="text-gray-500 text-sm font-medium">Loading plan…</p>
                    </div>
                </div>
            )}

            {/* ── Day Tab Bar (auto-hidden for single-day plans, hidden during load) ── */}
            {!loadingPlan && mealPlan && mealPlan.length > 0 && (
                <DayTabBar
                    key={planIdentityKey}
                    totalDays={Math.max(1, mealPlan.length)}
                    selectedDay={safeSelectedDay}
                    onSelectDay={setSelectedDay}
                    onSavePlan={handleSavePlanClick}
                    onLoadPlans={handleOpenSavedPlans}
                    savingPlan={savingPlan}
                    loading={loading}
                />
            )}

            {/* ── Single-day inline action buttons (shown only when tab bar is hidden) ── */}
            {!loadingPlan && mealPlan && mealPlan.length === 1 && (
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
            {!loadingPlan && isValidDaySelection ? (
                <div className="p-4">
                    <MealPlanDisplay
                        key={`${planIdentityKey}-day${safeSelectedDay}`}
                        mealPlan={mealPlan}
                        selectedDay={safeSelectedDay}
                        nutritionalTargets={nutritionalTargets}
                        eatenMeals={eatenMeals}
                        onToggleMealEaten={onToggleMealEaten}
                        onViewRecipe={setSelectedMeal}
                        showToast={showToast}
                    />
                </div>
            ) : !loadingPlan ? (
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
            ) : null}
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
                            <div className={`p-6 md:p-8 w-full md:w-1/2 border-b md:border-r ${isMenuOpen ? 'block' : 'hidden md:block'}`} style={{ borderColor: '#e5e7eb' }}>
                                <PlanSetupWizard
                                    formData={formData}
                                    onChange={handleChange}
                                    onSliderChange={handleSliderChange}
                                    onSubmit={handleGeneratePlan}
                                    onLoadProfile={handleLoadProfile}
                                    onSaveProfile={handleSaveProfile}
                                    loading={loading}
                                    isAuthReady={isAuthReady}
                                    userId={userId}
                                    firebaseConfig={firebaseConfig}
                                    firebaseInitializationError={firebaseInitializationError}
                                    onClose={() => setIsMenuOpen(false)}
                                    isMobile={isMobile}
                                />
                            </div>

                            {/* --- RESULTS (RIGHT COLUMN) --- */}
                            <div className={`w-full md:w-1/2 ${isMenuOpen ? 'hidden md:block' : 'block'}`}>
                                {/* Tab Navigation */}
                                <div className="flex border-b" style={{ borderColor: '#e5e7eb' }}>
                                    <button
                                        onClick={() => handleTabChange('meals')}
                                        className={`flex-1 py-3 px-4 text-center font-semibold transition-colors ${
                                            contentView === 'meals' 
                                                ? 'text-indigo-600 border-b-2 border-indigo-600' 
                                                : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        <Utensils className="inline w-4 h-4 mr-1.5" />
                                        Meals
                                    </button>
                                    <button
                                        onClick={() => handleTabChange('shopping')}
                                        className={`flex-1 py-3 px-4 text-center font-semibold transition-colors ${
                                            contentView === 'shopping' 
                                                ? 'text-indigo-600 border-b-2 border-indigo-600' 
                                                : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        <ShoppingBag className="inline w-4 h-4 mr-1.5" />
                                        Shopping
                                    </button>
                                </div>

                                {/* Content Area */}
                                <div className="min-h-[400px]">
                                    {/* Generation in progress */}
                                    {loading && generationStepKey && generationStepKey !== 'complete' && generationStepKey !== 'error' ? (
                                        <StoryModeGeneration
                                            activeStepKey={generationStepKey}
                                            statusMessage={generationStatus}
                                            formData={formData}
                                            results={results}
                                            mealPlan={mealPlan}
                                        />
                                    ) : contentView === 'meals' ? (
                                        mealPlan && mealPlan.length > 0 ? mealPlanContent : (
                                            <EmptyState 
                                                icon={<ChefHat className="w-16 h-16 text-gray-300" />}
                                                title="No Meal Plan Yet"
                                                description="Fill in your details and generate a plan to get started."
                                            />
                                        )
                                    ) : contentView === 'shopping' ? (
                                        uniqueIngredients && uniqueIngredients.length > 0 ? shoppingListContent : (
                                            <EmptyState 
                                                icon={<ShoppingBag className="w-16 h-16 text-gray-300" />}
                                                title="No Shopping List Yet"
                                                description="Generate a meal plan first to see your shopping list."
                                            />
                                        )
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </PullToRefresh>

            {/* Toast Container */}
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* Bottom Nav (mobile) */}
            {isMobile && (
                <BottomNav 
                    activeTab={contentView}
                    onTabChange={handleTabChange}
                    isMenuOpen={isMenuOpen}
                    onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
                />
            )}

            {/* Settings Panel */}
            <SettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentStore={formData?.store || 'Woolworths'}
                onStoreChange={(store) => handleChange({ target: { name: 'store', value: store } })}
                onClearData={() => {}}
                onEditProfile={handleEditProfile}
                showOrchestratorLogs={showOrchestratorLogs}
                onToggleOrchestratorLogs={() => setShowOrchestratorLogs(prev => !prev)}
                showFailedIngredientsLogs={showFailedIngredientsLogs}
                onToggleFailedIngredientsLogs={() => setShowFailedIngredientsLogs(prev => !prev)}
                showMacroDebugLog={showMacroDebugLog}
                onToggleMacroDebugLog={() => setShowMacroDebugLog(prev => !prev)}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
            />

            {/* Success Modal */}
            {showSuccessModal && (
                <SuccessModal
                    planStats={planStats}
                    onClose={() => setShowSuccessModal(false)}
                />
            )}

            {/* Save Plan Prompt */}
            {showSavePlanPrompt && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowSavePlanPrompt(false)} />
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl p-6 z-50 w-80">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Save Plan</h3>
                        <input
                            type="text"
                            value={savePlanName}
                            onChange={(e) => setSavePlanName(e.target.value)}
                            placeholder={`Plan ${new Date().toLocaleDateString()}`}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmSave()}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowSavePlanPrompt(false)}
                                className="flex-1 py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmSave}
                                disabled={savingPlan}
                                className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:opacity-50"
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