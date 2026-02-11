// web/src/components/MealPlanDisplay.jsx
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, Target, CheckCircle, AlertTriangle, Soup, Droplet, Wheat, Copy } from 'lucide-react';
import { COLORS } from '../constants';
import { exportMealPlanToClipboard } from '../utils/mealPlanExporter';


// ─────────────────────────────────────────────────────────────
// ANIMATED NUMBER — Smooth count-up/down on value change
// ─────────────────────────────────────────────────────────────

/**
 * Renders a number that smoothly animates between old and new values
 * using requestAnimationFrame. Transitions over `duration` ms with
 * an ease-out curve.
 *
 * @param {number}   value    - Target numeric value
 * @param {number}   duration - Animation duration in ms (default 500)
 * @param {function} format   - Optional formatter (default: toLocaleString)
 */
const AnimatedNumber = ({ value, duration = 500, format }) => {
    const [displayValue, setDisplayValue] = useState(value);
    const prevValueRef = useRef(value);
    const rafRef = useRef(null);

    const formatter = useCallback((v) => {
        if (format) return format(v);
        return Math.round(v).toLocaleString();
    }, [format]);

    useEffect(() => {
        const from = prevValueRef.current;
        const to = value;
        prevValueRef.current = value;

        // If no change or component just mounted with same value, skip animation
        if (from === to) {
            setDisplayValue(to);
            return;
        }

        const startTime = performance.now();

        const tick = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            const current = from + (to - from) * eased;

            setDisplayValue(current);

            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                setDisplayValue(to);
            }
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [value, duration]);

    return <>{formatter(displayValue)}</>;
};


// ─────────────────────────────────────────────────────────────
// RING LAYER — Single concentric SVG ring
// ─────────────────────────────────────────────────────────────

const RingLayer = ({ cx, cy, r, sw, bgColor, fillColor, pct, delay = 0 }) => {
    const circ = 2 * Math.PI * r;
    const offset = circ - circ * Math.min(Math.max(pct, 0), 1);

    return (
        <>
            <circle
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={bgColor}
                strokeWidth={sw}
            />
            <circle
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={fillColor}
                strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                className="concept-b-ring-fill"
                style={{
                    transition: `stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
                }}
            />
        </>
    );
};


// ─────────────────────────────────────────────────────────────
// LABEL ROW — Right-side macro label with animated value
// ─────────────────────────────────────────────────────────────

const RingLabelRow = ({ dotStyle, label, current, target, isNumeric = false }) => (
    <div className="concept-b-label-row">
        <span className="concept-b-label-dot" style={dotStyle} />
        <span className="concept-b-label-text">{label}</span>
        <span className="concept-b-label-value">
            <span className="concept-b-label-current">
                {isNumeric ? (
                    <AnimatedNumber value={current} duration={500} />
                ) : (
                    current
                )}
            </span>{' '}
            <span className="concept-b-label-target">{target}</span>
        </span>
    </div>
);


// ─────────────────────────────────────────────────────────────
// CONCENTRIC RINGS CARD — Concept B progress visualization
// ─────────────────────────────────────────────────────────────

const ConcentricRingsCard = ({ calories, protein, fat, carbs, targets }) => {
    const calTarget = targets?.calories || 1;
    const proTarget = targets?.protein || 1;
    const fatTarget = targets?.fat || 1;
    const carbTarget = targets?.carbs || 1;

    const calPct = calTarget > 0 ? calories / calTarget : 0;
    const proPct = proTarget > 0 ? protein / proTarget : 0;
    const fatPct = fatTarget > 0 ? fat / fatTarget : 0;
    const carbPct = carbTarget > 0 ? carbs / carbTarget : 0;

    const size = 160;
    const cx = 80;
    const cy = 80;

    // Dynamic calorie ring color
    const getCalStroke = () => {
        if (calPct > 1.05) return '#ef4444';
        if (calPct >= 0.95) return '#22c55e';
        return null; // use gradient
    };
    const calStrokeOverride = getCalStroke();

    return (
        <div className="concept-b-rings-card">
            {/* SVG Gradient Definition */}
            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <linearGradient id="cheffyCalGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={COLORS.primary[500]} />
                        <stop offset="100%" stopColor={COLORS.secondary ? COLORS.secondary[500] : '#a855f7'} />
                    </linearGradient>
                </defs>
            </svg>

            <div className="concept-b-rings-layout">
                {/* ── Left: Ring Visualization ── */}
                <div className="concept-b-ring-container">
                    {/*
                     * FIX #1: The SVG is rotated -90deg so arcs start at 12-o'clock.
                     * The center text overlay is a SIBLING div positioned absolutely
                     * over the ring container — it is NOT inside the SVG, so it must
                     * NOT have any counter-rotation. The old code had rotate(90deg)
                     * on .concept-b-ring-center which made "kcal eaten" display sideways.
                     * That CSS rule is removed in the updated concept-b-rings.css.
                     */}
                    <svg
                        viewBox={`0 0 ${size} ${size}`}
                        width="100%"
                        height="100%"
                        style={{ transform: 'rotate(-90deg)' }}
                    >
                        <RingLayer
                            cx={cx} cy={cy} r={70} sw={10}
                            bgColor={COLORS.gray ? COLORS.gray[100] : '#f3f4f6'}
                            fillColor={calStrokeOverride || 'url(#cheffyCalGrad)'}
                            pct={calPct} delay={0}
                        />
                        <RingLayer
                            cx={cx} cy={cy} r={56} sw={8}
                            bgColor="rgba(59, 130, 246, 0.1)"
                            fillColor="#3b82f6"
                            pct={proPct} delay={100}
                        />
                        <RingLayer
                            cx={cx} cy={cy} r={44} sw={7}
                            bgColor="rgba(245, 158, 11, 0.1)"
                            fillColor="#f59e0b"
                            pct={fatPct} delay={200}
                        />
                        <RingLayer
                            cx={cx} cy={cy} r={33} sw={6}
                            bgColor="rgba(34, 197, 94, 0.1)"
                            fillColor="#22c55e"
                            pct={carbPct} delay={300}
                        />
                    </svg>

                    {/* Center Text — NO rotation, positioned over the ring */}
                    <div className="concept-b-ring-center">
                        <span className="concept-b-ring-center-num">
                            <AnimatedNumber value={calories} duration={600} />
                        </span>
                        <span className="concept-b-ring-center-label">
                            kcal eaten
                        </span>
                    </div>
                </div>

                {/* ── Right: Label Rows with animated numbers ── */}
                <div className="concept-b-ring-labels">
                    <RingLabelRow
                        dotStyle={{ background: `linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary ? COLORS.secondary[500] : '#a855f7'})` }}
                        label="Calories"
                        current={calories}
                        target={`/ ${calTarget.toLocaleString()} kcal`}
                        isNumeric
                    />
                    <RingLabelRow
                        dotStyle={{ background: '#3b82f6' }}
                        label="Protein"
                        current={protein}
                        target={`/ ${proTarget}g`}
                        isNumeric
                    />
                    <RingLabelRow
                        dotStyle={{ background: '#f59e0b' }}
                        label="Fat"
                        current={fat}
                        target={`/ ${fatTarget}g`}
                        isNumeric
                    />
                    <RingLabelRow
                        dotStyle={{ background: '#22c55e' }}
                        label="Carbs"
                        current={carbs}
                        target={`/ ${carbTarget}g`}
                        isNumeric
                    />
                </div>
            </div>
        </div>
    );
};


// ─────────────────────────────────────────────────────────────
// MEAL PLAN DISPLAY — Main component
// ─────────────────────────────────────────────────────────────

const MealPlanDisplay = ({ mealPlan, selectedDay, nutritionalTargets, eatenMeals, onToggleMealEaten, onViewRecipe, showToast }) => {
    const [copying, setCopying] = useState(false);

    // ── CRITICAL BOUNDS CHECK ──
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
        console.error(`[MealPlanDisplay] Invalid meals structure for day ${selectedDay}.`);
        return (
            <div className="p-6 text-center bg-red-50 text-red-800 rounded-lg">
                <AlertTriangle className="inline mr-2" />
                Error loading meals for Day {selectedDay}. Data invalid.
            </div>
        );
    }

    // Calculate eaten macros for the day
    const dailyMacrosEaten = useMemo(() => {
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

    // Handle copy all meals
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

    return (
        <div className="space-y-6">
            {/* ════════ Premium Header with Copy Button ════════ */}
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

            {/* ════════ Concept B: Concentric Rings Progress Card ════════ */}
            <ConcentricRingsCard
                calories={dailyMacrosEaten.calories}
                protein={dailyMacrosEaten.protein}
                fat={dailyMacrosEaten.fat}
                carbs={dailyMacrosEaten.carbs}
                targets={nutritionalTargets}
            />

            {/* ════════ Meal Cards (UNCHANGED — do not modify below) ════════ */}
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