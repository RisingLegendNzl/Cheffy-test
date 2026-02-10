// web/src/components/MealPlanDisplay.jsx
import React, { useMemo, useState } from 'react';
import { BookOpen, Target, CheckCircle, AlertTriangle, Soup, Droplet, Wheat, Copy } from 'lucide-react';
import MacroBar from './MacroBar';
import { exportMealPlanToClipboard } from '../utils/mealPlanExporter';

const MealPlanDisplay = ({ mealPlan, selectedDay, nutritionalTargets, eatenMeals, onToggleMealEaten, onViewRecipe, showToast }) => {
    const [copying, setCopying] = useState(false);

    // ── CRITICAL BOUNDS CHECK: Prevent out-of-bounds crashes ──
    // This handles the case where selectedDay > mealPlan.length
    // (e.g., user was on day 7 of a 7-day plan, then loaded a 3-day plan)
    if (!mealPlan || mealPlan.length === 0) {
        console.warn('[MealPlanDisplay] mealPlan is empty or undefined');
        return (
            <div className="p-6 text-center bg-yellow-50 rounded-lg">
                <AlertTriangle className="inline mr-2" />
                No meal plan data available. Generate a plan to get started.
            </div>
        );
    }

    if (selectedDay < 1 || selectedDay > mealPlan.length) {
        console.error(`[MealPlanDisplay] selectedDay ${selectedDay} is out of bounds (plan has ${mealPlan.length} days)`);
        return (
            <div className="p-6 text-center bg-red-50 text-red-800 rounded-lg">
                <AlertTriangle className="inline mr-2" />
                Invalid day selection. Please select a day between 1 and {mealPlan.length}.
            </div>
        );
    }

    const dayData = mealPlan[selectedDay - 1];

    // ── CRITICAL NULL CHECK: Prevent crashes from undefined dayData ──
    if (!dayData) {
        console.warn(`[MealPlanDisplay] No valid data found for day ${selectedDay}.`);
        return (
            <div className="p-6 text-center bg-yellow-50 rounded-lg">
                <AlertTriangle className="inline mr-2" />
                No meal plan data found for Day {selectedDay}.
            </div>
        );
    }

    if (!Array.isArray(dayData.meals)) {
        console.error(`[MealPlanDisplay] Invalid meals structure for day ${selectedDay}. Expected array, got:`, dayData.meals);
        return (
            <div className="p-6 text-center bg-red-50 text-red-800 rounded-lg">
                <AlertTriangle className="inline mr-2" />
                Error loading meals for Day {selectedDay}. Data invalid.
            </div>
        );
    }

    // Calculate eaten macros for the day
    // SAFETY: Only execute after all null checks pass
    const dailyMacrosEaten = useMemo(() => {
        // Extra safety check inside useMemo to prevent crashes
        if (!dayData || !Array.isArray(dayData.meals) || !eatenMeals) {
            return { calories: 0, protein: 0, fat: 0, carbs: 0 };
        }
        
        const dayMealsEatenState = eatenMeals[`day${selectedDay}`] || {};
        let totals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
        
        dayData.meals.forEach(meal => {
            if (meal && meal.name && dayMealsEatenState[meal.name]) {
                totals.calories += meal.subtotal_kcal || 0;
                totals.protein += meal.subtotal_protein || 0;
                totals.fat += meal.subtotal_fat || 0;
                totals.carbs += meal.subtotal_carbs || 0;
            }
        });
        
        return {
            calories: Math.round(totals.calories),
            protein: Math.round(totals.protein),
            fat: Math.round(totals.fat),
            carbs: Math.round(totals.carbs),
        };
    }, [dayData, eatenMeals, selectedDay]);

    // Handle copy all meals button click
    const handleCopyAllMeals = async () => {
        setCopying(true);
        
        try {
            const result = await exportMealPlanToClipboard(mealPlan || []);
            
            if (showToast) {
                showToast(result.message, result.success ? 'success' : 'error');
            }
        } catch (error) {
            console.error('[MealPlanDisplay] Error copying meals:', error);
            if (showToast) {
                showToast('Failed to copy meal plan', 'error');
            }
        } finally {
            setCopying(false);
        }
    };

    const calTarget = nutritionalTargets?.calories || 0;
    
    return (
        <div className="space-y-6">
            {/* Premium Header with Copy Button */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                    <div 
                        className="p-2.5 rounded-xl shadow-md"
                        style={{
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                        }}
                    >
                        <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                            Meals for Day {selectedDay}
                        </h3>
                        <p className="text-sm text-gray-500 font-medium mt-0.5">
                            Your personalized nutrition plan
                        </p>
                    </div>
                </div>
                
                {/* Copy All Meals Button */}
                <button
                    onClick={handleCopyAllMeals}
                    disabled={copying || !mealPlan || mealPlan.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Copy all meals to clipboard"
                >
                    <Copy className="w-4 h-4" />
                    <span className="hidden sm:inline">
                        {copying ? 'Copying...' : 'Copy Meals'}
                    </span>
                </button>
            </div>
            
            {/* Enhanced Tracker with Macro Bars */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm p-6 rounded-xl shadow-lg border z-10">
                <h4 className="text-lg font-bold mb-4 flex items-center">
                    <Target className="w-5 h-5 mr-2"/>Daily Progress
                </h4>
                
                {/* Main Calorie Bar */}
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-gray-700">Calories</span>
                        <span className="text-sm font-bold">
                            <span className={dailyMacrosEaten.calories > calTarget * 1.05 ? 'text-red-600' : 
                                dailyMacrosEaten.calories >= calTarget * 0.95 ? 'text-green-600' : 'text-gray-700'}>
                                {dailyMacrosEaten.calories}
                            </span>
                            <span className="text-gray-500"> / {calTarget} kcal</span>
                        </span>
                    </div>
                    <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                                dailyMacrosEaten.calories > calTarget * 1.05 ? 'bg-red-500' :
                                dailyMacrosEaten.calories >= calTarget * 0.95 ? 'bg-green-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${Math.min((dailyMacrosEaten.calories / calTarget) * 100, 100)}%` }}
                        />
                    </div>
                </div>

                {/* Macro Bars */}
                <div className="space-y-3">
                    <MacroBar 
                        icon={Soup} 
                        label="Protein" 
                        current={dailyMacrosEaten.protein} 
                        target={nutritionalTargets?.protein || 0} 
                        unit="g" 
                        color="bg-blue-500"
                    />
                    <MacroBar 
                        icon={Droplet} 
                        label="Fat" 
                        current={dailyMacrosEaten.fat} 
                        target={nutritionalTargets?.fat || 0} 
                        unit="g" 
                        color="bg-yellow-500"
                    />
                    <MacroBar 
                        icon={Wheat} 
                        label="Carbs" 
                        current={dailyMacrosEaten.carbs} 
                        target={nutritionalTargets?.carbs || 0} 
                        unit="g" 
                        color="bg-green-500"
                    />
                </div>
            </div>

            {/* Meal Cards */}
            <div className="space-y-4">
                {dayData.meals.map((meal, index) => {
                    if (!meal || !meal.name) {
                        console.warn(`[MealPlanDisplay] Invalid meal at index ${index}:`, meal);
                        return null;
                    }

                    const mealEaten = eatenMeals?.[`day${selectedDay}`]?.[meal.name] || false;
                    
                    return (
                        <div 
                            key={`${meal.name}-${index}`}
                            className={`p-5 rounded-xl border-2 transition-all ${
                                mealEaten 
                                    ? 'bg-green-50 border-green-300 opacity-60' 
                                    : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-lg'
                            }`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                    <h4 className="text-xl font-bold text-gray-900 mb-1">
                                        {meal.name}
                                    </h4>
                                    {meal.description && (
                                        <p className="text-sm text-gray-600 mb-2">
                                            {meal.description}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-3 text-sm">
                                        <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full font-semibold">
                                            {Math.round(meal.subtotal_kcal || 0)} kcal
                                        </span>
                                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-semibold">
                                            P: {Math.round(meal.subtotal_protein || 0)}g
                                        </span>
                                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full font-semibold">
                                            F: {Math.round(meal.subtotal_fat || 0)}g
                                        </span>
                                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full font-semibold">
                                            C: {Math.round(meal.subtotal_carbs || 0)}g
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Mark as Eaten Checkbox */}
                                <button
                                    onClick={() => onToggleMealEaten && onToggleMealEaten(selectedDay, meal.name)}
                                    className={`ml-4 p-2 rounded-full transition-all ${
                                        mealEaten 
                                            ? 'bg-green-500 text-white' 
                                            : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
                                    }`}
                                    title={mealEaten ? 'Mark as not eaten' : 'Mark as eaten'}
                                >
                                    <CheckCircle className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Ingredients List */}
                            {meal.ingredients && meal.ingredients.length > 0 && (
                                <div className="mt-3 mb-3">
                                    <h5 className="text-sm font-bold text-gray-700 mb-2">Ingredients:</h5>
                                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                                        {meal.ingredients.map((ing, idx) => (
                                            <li key={idx}>
                                                {ing.quantity_display || ing.quantity} {ing.unit || ''} {ing.name}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* View Recipe Button */}
                            <button
                                onClick={() => onViewRecipe && onViewRecipe(meal)}
                                className="w-full mt-3 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                                <BookOpen className="w-4 h-4" />
                                View Full Recipe
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MealPlanDisplay;