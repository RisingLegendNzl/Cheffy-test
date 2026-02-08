// web/src/components/MainApp.jsx
import React, { useState } from 'react';
import { RefreshCw, Zap, AlertTriangle, CheckCircle, Package, DollarSign, ExternalLink, Calendar, Users, Menu, X, ChevronsDown, ChevronsUp, ShoppingBag, BookOpen, ChefHat, Tag, Soup, Replace, Target, FileText, LayoutDashboard, Terminal, Loader, ChevronRight, GripVertical, Flame, Droplet, Wheat, ChevronDown, ChevronUp, Download, ListX, Save, FolderDown, User, Check, ListChecks, ListOrdered, Utensils } from 'lucide-react';

// --- Component Imports ---
import MacroRing from './MacroRing';
import MacroBar from './MacroBar';
import InputField from './InputField';
import DaySlider from './DaySlider';
import DayTabBar from './DayTabBar';          // ← NEW: replaces DaySidebar
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
    
    // Macro Debug
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
        if (selectedMeal) {
            setSelectedMeal(null);
        }
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

    const handleOpenSavedPlans = () => {
        setShowSavedPlansModal(true);
    };

    const handleSavePlanClick = () => {
        if (!mealPlan || mealPlan.length === 0) {
            showToast('No meal plan to save', 'warning');
            return;
        }
        setShowSavePlanPrompt(true);
    };

    const handleConfirmSave = async () => {
        const name = savePlanName.trim() || `Plan ${new Date().toLocaleDateString()}`;
        await handleSavePlan(name);
        setShowSavePlanPrompt(false);
        setSavePlanName('');
    };

    // --- Shopping List Content ---
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

            {/* ── Single-day inline action buttons (tab bar is hidden) ── */}
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

            {/* ── Meal Content ── */}
            {mealPlan && mealPlan.length > 0 && selectedDay >= 1 && selectedDay <= mealPlan.length ? (
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
                            <div className={`p-6 md:p-8 w-full md:w-1/2 border-b md:border-r ${isMenuOpen ? 'hidden md:block' : 'block'}`}>
                                <form onSubmit={handleGeneratePlan} className="space-y-2">
                                    <FormSection title="Personal Details" defaultOpen={true}>
                                        <InputField label="Name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g., John" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputField label="Height (cm)" name="height" type="number" value={formData.height} onChange={handleChange} />
                                            <InputField label="Weight (kg)" name="weight" type="number" value={formData.weight} onChange={handleChange} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputField label="Age" name="age" type="number" value={formData.age} onChange={handleChange} />
                                            <InputField label="Gender" name="gender" type="select" value={formData.gender} onChange={handleChange} options={[ { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' } ]} />
                                        </div>
                                        <InputField label="Body Fat % (Optional)" name="bodyFat" type="number" value={formData.bodyFat} onChange={handleChange} placeholder="e.g., 20" />
                                    </FormSection>
    
                                    <FormSection title="Activity & Goals" defaultOpen={true}>
                                        <InputField label="Activity Level" name="activityLevel" type="select" value={formData.activityLevel} onChange={handleChange} options={[ { value: 'sedentary', label: 'Sedentary' }, { value: 'light', label: 'Lightly Active' }, { value: 'moderate', label: 'Moderately Active' }, { value: 'active', label: 'Very Active' }, { value: 'veryActive', label: 'Extremely Active' } ]} />
                                        <InputField label="Goal" name="goal" type="select" value={formData.goal} onChange={handleChange} options={[ { value: 'maintain', label: 'Maintain Weight' }, { value: 'cut_moderate', label: 'Moderate Cut (-15%)' }, { value: 'cut_aggressive', label: 'Aggressive Cut (-25%)' }, { value: 'bulk_lean', label: 'Lean Bulk (+15%)' }, { value: 'bulk_aggressive', label: 'Aggressive Bulk (+25%)' } ]} />
                                        <InputField label="Dietary Preference" name="dietary" type="select" value={formData.dietary} onChange={handleChange} options={[ { value: 'None', label: 'No Preference' }, { value: 'Vegetarian', label: 'Vegetarian' }, { value: 'Vegan', label: 'Vegan' }, { value: 'Pescatarian', label: 'Pescatarian' }, { value: 'Keto', label: 'Keto' }, { value: 'Paleo', label: 'Paleo' }, { value: 'Mediterranean', label: 'Mediterranean' }, { value: 'Halal', label: 'Halal' } ]} />
                                    </FormSection>
    
                                    <FormSection title="Plan Settings" defaultOpen={false}>
                                        <DaySlider value={formData.days} onChange={handleSliderChange} />
                                        <InputField label="Daily Eating Occasions" name="eatingOccasions" type="select" value={formData.eatingOccasions} onChange={handleChange} options={[ { value: '3', label: '3 (B, L, D)' }, { value: '4', label: '4 (B, L, D + 1 Snack)' }, { value: '5', label: '5 (B, L, D + 2 Snacks)' } ]} />
                                        <InputField label="Store" name="store" type="select" value={formData.store} onChange={handleChange} options={[ { value: 'Woolworths', label: 'Woolworths' }, { value: 'Coles', label: 'Coles' } ]} />
                                        <InputField label="Spending Priority" name="costPriority" type="select" value={formData.costPriority} onChange={handleChange} options={[ { value: 'Extreme Budget', label: 'Extreme Budget' }, { value: 'Best Value', label: 'Best Value' }, { value: 'Quality Focus', label: 'Quality Focus' } ]} />
                                        <InputField label="Meal Variety" name="mealVariety" type="select" value={formData.mealVariety} onChange={handleChange} options={[ { value: 'High Repetition', label: 'High' }, { value: 'Balanced Variety', label: 'Balanced' }, { value: 'Low Repetition', label: 'Low' } ]} />
                                        <InputField label="Cuisine Profile (Optional)" name="cuisine" value={formData.cuisine} onChange={handleChange} placeholder="e.g., Spicy Thai" />
                                    </FormSection>
    
                                    <button type="submit" disabled={loading || !isAuthReady || !firebaseConfig} className={`w-full flex items-center justify-center py-3 mt-6 text-lg font-bold rounded-xl shadow-lg ${loading || !isAuthReady || !firebaseConfig ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                                        {loading ? <><RefreshCw className="w-5 h-5 mr-3 animate-spin" /> Processing...</> : <><Zap className="w-5 h-5 mr-3" /> Generate Plan</>}
                                    </button>
                                    {(!isAuthReady || !firebaseConfig) && <p className="text-xs text-center text-red-600 mt-2">
                                        {firebaseInitializationError ? firebaseInitializationError : 'Initializing Firebase auth...'}
                                    </p>}
                                </form>
                            </div>
    
                            {/* --- RESULTS VIEW (RIGHT COLUMN) --- */}
                            <div className={`w-full md:w-1/2 ${isMenuOpen ? 'hidden md:block' : 'block'}`}>
                                <div className="border-b">
                                    <div className="p-6 md:p-8">
                                        {/* Navigation Tabs (Summary / Meals / Shopping) */}
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
                subtitle={`${planStats?.totalMeals || 0} meals across ${planStats?.totalDays || 0} days`}
                stats={planStats}
                onDismiss={() => {
                    setShowSuccessModal(false);
                    handleTabChange('meals');
                }}
            />
    
            {selectedMeal && (
                <RecipeModal
                    meal={selectedMeal}
                    onClose={() => setSelectedMeal(null)}
                />
            )}
    
            <SettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                onLoadProfile={handleLoadProfile}
                onSaveProfile={() => handleSaveProfile(formData)}
                formData={formData}
            />
    
            {/* Save Plan Name Prompt */}
            {showSavePlanPrompt && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="text-lg font-bold mb-4">Name Your Plan</h3>
                        <input
                            type="text"
                            value={savePlanName}
                            onChange={(e) => setSavePlanName(e.target.value)}
                            placeholder={`Plan ${new Date().toLocaleDateString()}`}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirmSave()}
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowSavePlanPrompt(false);
                                    setSavePlanName('');
                                }}
                                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmSave}
                                disabled={savingPlan}
                                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {savingPlan ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
    
            {/* Saved Plans Modal */}
            {showSavedPlansModal && (
                <SavedPlansModal
                    isOpen={showSavedPlansModal}
                    onClose={() => setShowSavedPlansModal(false)}
                    savedPlans={savedPlans}
                    activePlanId={activePlanId}
                    onLoadPlan={handleLoadPlan}
                    onDeletePlan={handleDeletePlan}
                    loadingPlan={loadingPlan}
                />
            )}
    
            {/* Diagnostic Logs */}
            {diagnosticLogs && diagnosticLogs.length > 0 && (
                <DiagnosticLogViewer
                    logs={diagnosticLogs}
                    isOpen={isLogOpen}
                    onToggle={() => setIsLogOpen(!isLogOpen)}
                    logHeight={logHeight}
                    onHeightChange={setLogHeight}
                    onDownload={handleDownloadLogs}
                    showOrchestratorLogs={showOrchestratorLogs}
                    onToggleOrchestratorLogs={() => setShowOrchestratorLogs(!showOrchestratorLogs)}
                />
            )}
    
            {/* Failed Ingredients Log */}
            {failedIngredientsHistory && failedIngredientsHistory.length > 0 && (
                <FailedIngredientLogViewer
                    history={failedIngredientsHistory}
                    isOpen={showFailedIngredientsLogs}
                    onToggle={() => setShowFailedIngredientsLogs(!showFailedIngredientsLogs)}
                    onDownload={handleDownloadFailedLogs}
                />
            )}

            {/* Macro Debug Log Viewer */}
            {macroDebug && Object.keys(macroDebug).length > 0 && (
                <MacroDebugLogViewer
                    data={macroDebug}
                    isOpen={showMacroDebugLog}
                    onToggle={() => setShowMacroDebugLog(!showMacroDebugLog)}
                    onDownload={handleDownloadMacroDebugLogs}
                />
            )}
        </>
    );
};

export default MainApp;