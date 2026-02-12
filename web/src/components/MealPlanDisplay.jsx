// web/src/components/MealPlanDisplay.jsx
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, Target, CheckCircle, AlertTriangle, Soup, Droplet, Wheat, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
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
//
// ANIMATION FIX: The circle element stays mounted (no key-based
// remount). strokeDashoffset is set as a style prop. The CSS
// class .concept-b-ring-fill has:
//   transition: stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)
// so whenever the offset value changes (day switch, meal toggled),
// the browser smoothly interpolates between old and new values.
// Per-ring stagger is achieved via inline transition-delay.
//
// This matches the Concept B HTML reference exactly.
// ─────────────────────────────────────────────────────────────

const RingLayer = ({ cx, cy, r, sw, bgColor, fillColor, pct, delay = 0 }) => {
    const circ = 2 * Math.PI * r;
    const clampedPct = Math.min(Math.max(pct, 0), 1);
    const offset = circ - circ * clampedPct;

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
                    transitionDelay: `${delay}ms`,
                }}
            />
        </>
    );
};


// ─────────────────────────────────────────────────────────────
// LABEL ROW — Right-side macro label with animated value
// ─────────────────────────────────────────────────────────────

const RingLabelRow = ({ dotStyle, label, current, target, isNumeric = false, animDelay = 0 }) => (
    <div
        className="concept-b-label-row concept-b-label-row-animate"
        style={{ animationDelay: `${animDelay}ms` }}
    >
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
//
// LAYOUT FIX: Container 180×180px. Ring radii:
//   Calories (outer): r=80, sw=10
//   Protein:          r=64, sw=8
//   Fat:              r=50, sw=7
//   Carbs (inner):    r=37, sw=6
//   Center text area: ~62px diameter — fits "1,397" comfortably.
//
// ANIMATION FIX: Ring <circle> elements are stable (never
// remounted). CSS transition on stroke-dashoffset handles smooth
// filling. A separate animKey counter is used ONLY for:
//   - The center number <span> (pop entrance animation)
//   - The labels container <div> (stagger slide-in animation)
// These cosmetic entrance animations use key-based remount
// which is safe because they don't affect the ring fill.
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

    // Enlarged SVG viewBox (was 160, now 180) for ring spacing
    const size = 180;
    const cx = 90;
    const cy = 90;

    // Animation key for entrance effects (center pop + label stagger).
    // Only increments when macro values actually change.
    // Does NOT affect ring circles — those stay mounted.
    const animKeyRef = useRef(0);
    const prevRef = useRef({ calories, protein, fat, carbs });

    if (
        prevRef.current.calories !== calories ||
        prevRef.current.protein !== protein ||
        prevRef.current.fat !== fat ||
        prevRef.current.carbs !== carbs
    ) {
        animKeyRef.current += 1;
        prevRef.current = { calories, protein, fat, carbs };
    }

    const animKey = animKeyRef.current;

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
                     * The SVG is rotated -90deg so arcs start at 12-o'clock.
                     * Ring radii (wider spacing for text room):
                     *   Calories:  r=80, sw=10
                     *   Protein:   r=64, sw=8
                     *   Fat:       r=50, sw=7
                     *   Carbs:     r=37, sw=6
                     *   Center:    ~62px clear diameter
                     *
                     * Circle elements are STABLE — no key prop, no remount.
                     * CSS transition on stroke-dashoffset does the smooth fill.
                     */}
                    <svg
                        viewBox={`0 0 ${size} ${size}`}
                        width="100%"
                        height="100%"
                        style={{ transform: 'rotate(-90deg)' }}
                    >
                        {/* Calories — outermost ring */}
                        <RingLayer
                            cx={cx} cy={cy} r={80} sw={10}
                            bgColor={COLORS.gray ? COLORS.gray[100] : '#f3f4f6'}
                            fillColor={calStrokeOverride || 'url(#cheffyCalGrad)'}
                            pct={calPct} delay={0}
                        />
                        {/* Protein */}
                        <RingLayer
                            cx={cx} cy={cy} r={64} sw={8}
                            bgColor="rgba(59, 130, 246, 0.1)"
                            fillColor="#3b82f6"
                            pct={proPct} delay={100}
                        />
                        {/* Fat */}
                        <RingLayer
                            cx={cx} cy={cy} r={50} sw={7}
                            bgColor="rgba(245, 158, 11, 0.1)"
                            fillColor="#f59e0b"
                            pct={fatPct} delay={200}
                        />
                        {/* Carbs — innermost ring */}
                        <RingLayer
                            cx={cx} cy={cy} r={37} sw={6}
                            bgColor="rgba(34, 197, 94, 0.1)"
                            fillColor="#22c55e"
                            pct={carbPct} delay={300}
                        />
                    </svg>

                    {/* Center Text — NO rotation, positioned over the ring */}
                    <div className="concept-b-ring-center">
                        <span
                            key={`center-num-${animKey}`}
                            className="concept-b-ring-center-num concept-b-center-pop"
                        >
                            <AnimatedNumber value={calories} duration={600} />
                        </span>
                        <span className="concept-b-ring-center-label">
                            kcal eaten
                        </span>
                    </div>
                </div>

                {/* ── Right: Label Rows with animated numbers ── */}
                <div className="concept-b-ring-labels" key={`labels-${animKey}`}>
                    <RingLabelRow
                        dotStyle={{ background: `linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary ? COLORS.secondary[500] : '#a855f7'})` }}
                        label="Calories"
                        current={calories}
                        target={`/ ${calTarget.toLocaleString()} kcal`}
                        isNumeric
                        animDelay={50}
                    />
                    <RingLabelRow
                        dotStyle={{ background: '#3b82f6' }}
                        label="Protein"
                        current={protein}
                        target={`/ ${proTarget}g`}
                        isNumeric
                        animDelay={120}
                    />
                    <RingLabelRow
                        dotStyle={{ background: '#f59e0b' }}
                        label="Fat"
                        current={fat}
                        target={`/ ${fatTarget}g`}
                        isNumeric
                        animDelay={190}
                    />
                    <RingLabelRow
                        dotStyle={{ background: '#22c55e' }}
                        label="Carbs"
                        current={carbs}
                        target={`/ ${carbTarget}g`}
                        isNumeric
                        animDelay={260}
                    />
                </div>
            </div>
        </div>
    );
};


// ─────────────────────────────────────────────────────────────
// INLINE DAY SELECTOR — Compact pill-based day switcher
//
// Renders only when totalDays > 1. Uses horizontally scrollable
// pills with arrow navigation for accessibility. Visually
// connected to the active day via gradient highlight + scale.
// ─────────────────────────────────────────────────────────────

const InlineDaySelector = ({ totalDays, selectedDay, onSelectDay }) => {
    const scrollRef = useRef(null);

    // Auto-scroll to keep active pill visible
    useEffect(() => {
        if (!scrollRef.current) return;
        const activeBtn = scrollRef.current.querySelector('[data-active="true"]');
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [selectedDay]);

    const canGoPrev = selectedDay > 1;
    const canGoNext = selectedDay < totalDays;

    return (
        <div className="mealplan-day-selector">
            {/* Arrow Left */}
            <button
                onClick={() => canGoPrev && onSelectDay(selectedDay - 1)}
                disabled={!canGoPrev}
                className="mealplan-day-selector__arrow"
                style={{
                    opacity: canGoPrev ? 1 : 0.3,
                    cursor: canGoPrev ? 'pointer' : 'not-allowed',
                }}
                aria-label="Previous day"
            >
                <ChevronLeft size={18} />
            </button>

            {/* Scrollable pill track */}
            <div
                ref={scrollRef}
                className="mealplan-day-selector__track"
            >
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                    const isActive = day === selectedDay;
                    return (
                        <button
                            key={day}
                            data-active={isActive}
                            onClick={() => onSelectDay(day)}
                            className={`mealplan-day-selector__pill ${isActive ? 'mealplan-day-selector__pill--active' : ''}`}
                        >
                            Day {day}
                        </button>
                    );
                })}
            </div>

            {/* Arrow Right */}
            <button
                onClick={() => canGoNext && onSelectDay(selectedDay + 1)}
                disabled={!canGoNext}
                className="mealplan-day-selector__arrow"
                style={{
                    opacity: canGoNext ? 1 : 0.3,
                    cursor: canGoNext ? 'pointer' : 'not-allowed',
                }}
                aria-label="Next day"
            >
                <ChevronRight size={18} />
            </button>

            {/* Scoped styles for the day selector */}
            <style>{`
                .mealplan-day-selector {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 0;
                }

                .mealplan-day-selector__arrow {
                    flex-shrink: 0;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: 1px solid #e5e7eb;
                    background: #ffffff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6366f1;
                    transition: all 0.2s ease;
                }

                .mealplan-day-selector__arrow:not(:disabled):hover {
                    background: #eef2ff;
                    border-color: #c7d2fe;
                    transform: scale(1.08);
                }

                .mealplan-day-selector__arrow:not(:disabled):active {
                    transform: scale(0.95);
                }

                .mealplan-day-selector__track {
                    display: flex;
                    gap: 8px;
                    overflow-x: auto;
                    flex: 1;
                    padding: 4px 2px;
                    scroll-behavior: smooth;
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }

                .mealplan-day-selector__track::-webkit-scrollbar {
                    display: none;
                }

                .mealplan-day-selector__pill {
                    flex-shrink: 0;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 600;
                    border: 1.5px solid #e5e7eb;
                    background: #ffffff;
                    color: #4b5563;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                    white-space: nowrap;
                }

                .mealplan-day-selector__pill:hover:not(.mealplan-day-selector__pill--active) {
                    border-color: #c7d2fe;
                    background: #f5f3ff;
                    color: #4338ca;
                    transform: translateY(-1px);
                }

                .mealplan-day-selector__pill--active {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: #ffffff;
                    border-color: transparent;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
                    transform: scale(1.05);
                }

                .mealplan-day-selector__pill:active {
                    transform: scale(0.96);
                }

                @media (prefers-reduced-motion: reduce) {
                    .mealplan-day-selector__pill,
                    .mealplan-day-selector__arrow {
                        transition: none !important;
                    }
                }
            `}</style>
        </div>
    );
};


// ─────────────────────────────────────────────────────────────
// MEAL PLAN DISPLAY — Main component
//
// FIX: Added `setSelectedDay` to destructured props so the day
// selector can be rendered and day switching works correctly.
// ─────────────────────────────────────────────────────────────

const MealPlanDisplay = ({ mealPlan, selectedDay, setSelectedDay, nutritionalTargets, eatenMeals, onToggleMealEaten, onViewRecipe, showToast }) => {
    const [copying, setCopying] = useState(false);

    const totalDays = mealPlan ? mealPlan.length : 0;

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

            {/* ════════ Day Selector — only when multiple days ════════ */}
            {totalDays > 1 && setSelectedDay && (
                <InlineDaySelector
                    totalDays={totalDays}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                />
            )}

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
                            key={`${selectedDay}-${meal.name}-${index}`}
                            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 transition-all duration-200 hover:shadow-md"
                        >
                            {/* Meal Header */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                                        {meal.type || 'Meal'}
                                    </span>
                                    <h4 className="font-bold text-gray-900 text-lg">{meal.name}</h4>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleMealEaten && onToggleMealEaten(selectedDay, meal.name);
                                    }}
                                    className={`p-2 rounded-full transition-all duration-200 ${
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