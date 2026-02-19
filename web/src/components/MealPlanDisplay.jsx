// web/src/components/MealPlanDisplay.jsx
// REDESIGN: Concept B (Split Neon Tiles) + Day Selector A (Calendar Strip)
// - Neon tile grid replaces concentric rings for macro display
// - Calendar strip day selector integrated into the section header
// - Animated/pulsing borders on tiles
// - Meal cards below are UNCHANGED

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, CheckCircle, AlertTriangle, Copy } from 'lucide-react';
import { COLORS } from '../constants';
import { exportMealPlanToClipboard } from '../utils/mealPlanExporter';


// ─────────────────────────────────────────────────────────────
// ANIMATED NUMBER — Smooth count-up/down on value change
// ─────────────────────────────────────────────────────────────
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
        if (from === to) { setDisplayValue(to); return; }
        const startTime = performance.now();
        const tick = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            const current = from + (to - from) * eased;
            setDisplayValue(current);
            if (t < 1) { rafRef.current = requestAnimationFrame(tick); }
            else { setDisplayValue(to); }
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [value, duration]);

    return <>{formatter(displayValue)}</>;
};


// ─────────────────────────────────────────────────────────────
// CALENDAR STRIP DAY SELECTOR (Concept A)
// Horizontal scrollable day cells with day-of-week labels,
// gradient active state, and completion dots.
// ─────────────────────────────────────────────────────────────
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CalendarStripSelector = ({ totalDays, currentDay, onSelectDay, eatenMeals, mealPlan }) => {
    const stripRef = useRef(null);

    // Auto-scroll active day into view
    useEffect(() => {
        if (!stripRef.current) return;
        const activeEl = stripRef.current.querySelector('[data-active="true"]');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [currentDay]);

    // Determine which days have all meals eaten
    const completedDays = useMemo(() => {
        if (!eatenMeals || !mealPlan) return [];
        const completed = [];
        for (let d = 1; d <= totalDays; d++) {
            const dayData = mealPlan[d - 1];
            if (!dayData || !Array.isArray(dayData.meals) || dayData.meals.length === 0) continue;
            const dayEaten = eatenMeals[`day${d}`] || {};
            const allEaten = dayData.meals.every(m => m && m.name && dayEaten[m.name]);
            if (allEaten) completed.push(d);
        }
        return completed;
    }, [eatenMeals, mealPlan, totalDays]);

    if (totalDays <= 1) return null;

    return (
        <div className="mpd-cal-strip-wrapper">
            <div ref={stripRef} className="mpd-cal-strip">
                {Array.from({ length: totalDays }, (_, i) => {
                    const day = i + 1;
                    const isActive = day === currentDay;
                    const isCompleted = completedDays.includes(day);
                    const dowLabel = DAY_LABELS[i % 7];

                    return (
                        <button
                            key={day}
                            data-active={isActive}
                            onClick={() => onSelectDay(day)}
                            className={`mpd-cal-day ${isActive ? 'mpd-cal-day--active' : ''}`}
                        >
                            <span className="mpd-cal-dow">{dowLabel}</span>
                            <span className="mpd-cal-num">{day}</span>
                            {isCompleted && <span className="mpd-cal-check" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};


// ─────────────────────────────────────────────────────────────
// NEON TILE — Individual macro tile with pulsing border
// ─────────────────────────────────────────────────────────────
const NeonTile = ({ label, value, target, unit, color, colorRgb, pct, isHero, delay }) => {
    const clampedPct = Math.min(pct * 100, 100);

    return (
        <div
            className={`mpd-neon-tile ${isHero ? 'mpd-neon-tile--hero' : ''}`}
            style={{
                '--tile-color': color,
                '--tile-rgb': colorRgb,
                '--tile-delay': `${delay}s`,
            }}
        >
            <div className="mpd-neon-tile-label">{label}</div>
            <div className="mpd-neon-tile-value" style={{ color }}>
                <AnimatedNumber value={value} duration={600} />
                {!isHero && <span className="mpd-neon-tile-unit">{unit}</span>}
            </div>
            <div className="mpd-neon-tile-target">
                of {isHero ? target.toLocaleString() + ' kcal' : target + unit}
            </div>
            <div className="mpd-neon-tile-bar">
                <div
                    className="mpd-neon-tile-bar-fill"
                    style={{
                        width: `${clampedPct}%`,
                        background: color,
                    }}
                />
            </div>
        </div>
    );
};


// ─────────────────────────────────────────────────────────────
// NEON TILES CARD (Concept B — Split Neon Tiles)
// Full-width calorie hero tile + 2-column P/F/C grid
// ─────────────────────────────────────────────────────────────
const NeonTilesCard = ({ calories, protein, fat, carbs, targets }) => {
    const calTarget = targets?.calories || 1;
    const proTarget = targets?.protein || 1;
    const fatTarget = targets?.fat || 1;
    const carbTarget = targets?.carbs || 1;

    return (
        <div className="mpd-neon-grid">
            <NeonTile
                label="Calories"
                value={calories}
                target={calTarget}
                unit=" kcal"
                color={COLORS.primary[400]}
                colorRgb="99, 102, 241"
                pct={calTarget > 0 ? calories / calTarget : 0}
                isHero
                delay={0}
            />
            <NeonTile
                label="Protein"
                value={protein}
                target={proTarget}
                unit="g"
                color="#3b82f6"
                colorRgb="59, 130, 246"
                pct={proTarget > 0 ? protein / proTarget : 0}
                delay={0.1}
            />
            <NeonTile
                label="Fat"
                value={fat}
                target={fatTarget}
                unit="g"
                color="#f59e0b"
                colorRgb="245, 158, 11"
                pct={fatTarget > 0 ? fat / fatTarget : 0}
                delay={0.2}
            />
            <NeonTile
                label="Carbs"
                value={carbs}
                target={carbTarget}
                unit="g"
                color="#22c55e"
                colorRgb="34, 197, 94"
                pct={carbTarget > 0 ? carbs / carbTarget : 0}
                delay={0.3}
            />
        </div>
    );
};


// ─────────────────────────────────────────────────────────────
// MEAL PLAN DISPLAY — Main component
// ─────────────────────────────────────────────────────────────
const MealPlanDisplay = ({
    mealPlan,
    selectedDay,
    setSelectedDay,
    nutritionalTargets,
    eatenMeals,
    onToggleMealEaten,
    onViewRecipe,
    showToast,
    // These are passed by MainApp but unused here; accept to avoid console warnings
    formData,
    nutritionCache,
    loadingNutritionFor,
    onFetchNutrition,
}) => {
    const [copying, setCopying] = useState(false);

    // ── CRITICAL BOUNDS CHECK ──
    if (!mealPlan || mealPlan.length === 0) {
        return (
            <div className="p-6 text-center bg-yellow-50 rounded-lg">
                <AlertTriangle className="inline mr-2" />
                No meal plan data available. Generate a plan to get started.
            </div>
        );
    }

    if (selectedDay < 1 || selectedDay > mealPlan.length) {
        return (
            <div className="p-6 text-center bg-red-50 text-red-800 rounded-lg">
                <AlertTriangle className="inline mr-2" />
                Invalid day selection. Please select a day between 1 and {mealPlan.length}.
            </div>
        );
    }

    const dayData = mealPlan[selectedDay - 1];

    if (!dayData) {
        return (
            <div className="p-6 text-center bg-yellow-50 rounded-lg">
                <AlertTriangle className="inline mr-2" />
                No meal plan data found for Day {selectedDay}.
            </div>
        );
    }

    if (!Array.isArray(dayData.meals)) {
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

    // Copy all meals handler
    const handleCopyAllMeals = async () => {
        setCopying(true);
        try {
            const result = await exportMealPlanToClipboard(mealPlan || []);
            if (showToast) {
                showToast(result.message, result.success ? 'success' : 'error');
            }
        } catch (error) {
            console.error('[MealPlanDisplay] Error copying meals:', error);
            if (showToast) showToast('Failed to copy meal plan', 'error');
        } finally {
            setCopying(false);
        }
    };

    return (
        <div className="mpd-root">
            {/* ════════ Concept B Section Card ════════ */}
            <div className="mpd-section-card">
                {/* Header Row: Title + Day Badge + Copy */}
                <div className="mpd-header">
                    <div className="mpd-header-left">
                        <div className="mpd-header-pill">Day {selectedDay}</div>
                        <div>
                            <h3 className="mpd-header-title">Your Nutrition</h3>
                            <p className="mpd-header-sub">Personalized daily plan</p>
                        </div>
                    </div>
                    <button
                        onClick={handleCopyAllMeals}
                        disabled={copying || !mealPlan || mealPlan.length === 0}
                        className="mpd-copy-btn"
                        title="Copy all meals to clipboard"
                    >
                        <Copy className="w-4 h-4" />
                        <span className="hidden sm:inline">
                            {copying ? 'Copying...' : 'Copy'}
                        </span>
                    </button>
                </div>

                {/* Calendar Strip Day Selector */}
                <CalendarStripSelector
                    totalDays={mealPlan.length}
                    currentDay={selectedDay}
                    onSelectDay={setSelectedDay}
                    eatenMeals={eatenMeals}
                    mealPlan={mealPlan}
                />

                {/* Neon Tiles Macro Display */}
                <NeonTilesCard
                    calories={dailyMacrosEaten.calories}
                    protein={dailyMacrosEaten.protein}
                    fat={dailyMacrosEaten.fat}
                    carbs={dailyMacrosEaten.carbs}
                    targets={nutritionalTargets}
                />
            </div>

            {/* ════════ Meal Cards (UNCHANGED — do not modify below) ════════ */}
            <div className="space-y-4 mt-6">
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

            {/* ════════ Scoped Styles ════════ */}
            <style>{`
                /* ── Root ── */
                .mpd-root {
                    padding: 16px;
                }

                /* ── Section Card ── */
                .mpd-section-card {
                    background: #1a1d2a;
                    border-radius: 20px;
                    padding: 22px;
                    border: 1px solid #262a3a;
                    margin-bottom: 8px;
                }

                /* ── Header ── */
                .mpd-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                }
                .mpd-header-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .mpd-header-pill {
                    font-family: 'Inter', -apple-system, sans-serif;
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 5px 14px;
                    border-radius: 999px;
                    letter-spacing: 0.04em;
                    background: linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]});
                    color: white;
                    white-space: nowrap;
                }
                .mpd-header-title {
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: #f0f1f5;
                    line-height: 1.2;
                }
                .mpd-header-sub {
                    font-size: 0.75rem;
                    color: #7b809a;
                    margin-top: 1px;
                }
                .mpd-copy-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 14px;
                    border-radius: 10px;
                    background: rgba(99, 102, 241, 0.12);
                    border: 1px solid rgba(99, 102, 241, 0.2);
                    color: #818cf8;
                    font-size: 0.78rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .mpd-copy-btn:hover {
                    background: rgba(99, 102, 241, 0.22);
                }
                .mpd-copy-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                /* ── Calendar Strip ── */
                .mpd-cal-strip-wrapper {
                    margin: 0 -22px 18px;
                    padding: 0 22px;
                }
                .mpd-cal-strip {
                    display: flex;
                    gap: 8px;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.04);
                    border-radius: 14px;
                    border: 1px solid #262a3a;
                    overflow-x: auto;
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .mpd-cal-strip::-webkit-scrollbar { display: none; }

                .mpd-cal-day {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 8px 12px;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.25s ease;
                    flex-shrink: 0;
                    min-width: 50px;
                    border: 1px solid transparent;
                    background: transparent;
                    -webkit-tap-highlight-color: transparent;
                }
                .mpd-cal-day:hover:not(.mpd-cal-day--active) {
                    background: rgba(255, 255, 255, 0.06);
                    border-color: rgba(255, 255, 255, 0.08);
                }
                .mpd-cal-day--active {
                    background: linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]});
                    border-color: rgba(99, 102, 241, 0.4);
                    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
                }
                .mpd-cal-dow {
                    font-size: 0.6rem;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    color: #7b809a;
                    margin-bottom: 3px;
                    font-weight: 600;
                    line-height: 1;
                }
                .mpd-cal-day--active .mpd-cal-dow { color: rgba(255,255,255,0.8); }
                .mpd-cal-num {
                    font-family: 'Inter', -apple-system, sans-serif;
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: #e8eaf0;
                    line-height: 1;
                }
                .mpd-cal-day--active .mpd-cal-num { color: white; }
                .mpd-cal-check {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                    margin-top: 5px;
                    background: #22c55e;
                }

                /* ── Neon Tiles Grid ── */
                .mpd-neon-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }

                /* ── Individual Tile ── */
                .mpd-neon-tile {
                    border-radius: 16px;
                    padding: 14px 16px;
                    position: relative;
                    overflow: hidden;
                    background: rgba(var(--tile-rgb), 0.06);
                    border: 1px solid rgba(var(--tile-rgb), 0.15);
                    transition: transform 0.2s ease, border-color 0.3s ease;
                    animation: mpd-tile-border-pulse 3s ease-in-out infinite alternate;
                    animation-delay: var(--tile-delay);
                }
                .mpd-neon-tile:hover {
                    transform: translateY(-2px);
                }
                .mpd-neon-tile--hero {
                    grid-column: 1 / -1;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.06));
                    border-color: rgba(99, 102, 241, 0.18);
                }

                @keyframes mpd-tile-border-pulse {
                    0% { border-color: rgba(var(--tile-rgb), 0.12); }
                    100% { border-color: rgba(var(--tile-rgb), 0.35); }
                }

                .mpd-neon-tile-label {
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: #7b809a;
                    margin-bottom: 4px;
                    font-weight: 600;
                }
                .mpd-neon-tile-value {
                    font-family: 'Inter', -apple-system, sans-serif;
                    font-size: 1.4rem;
                    font-weight: 700;
                    line-height: 1;
                    font-variant-numeric: tabular-nums;
                }
                .mpd-neon-tile--hero .mpd-neon-tile-value {
                    font-size: 2rem;
                }
                .mpd-neon-tile-unit {
                    font-size: 0.7rem;
                    color: #7b809a;
                    margin-left: 2px;
                }
                .mpd-neon-tile-target {
                    font-size: 0.7rem;
                    color: #5a5e75;
                    margin-top: 3px;
                }
                .mpd-neon-tile-bar {
                    margin-top: 10px;
                    height: 4px;
                    background: rgba(255, 255, 255, 0.06);
                    border-radius: 99px;
                    overflow: hidden;
                }
                .mpd-neon-tile-bar-fill {
                    height: 100%;
                    border-radius: 99px;
                    transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1);
                    box-shadow: 0 0 8px currentColor;
                    animation: mpd-neon-glow 2.5s ease-in-out infinite alternate;
                }
                @keyframes mpd-neon-glow {
                    0% { box-shadow: 0 0 4px currentColor; opacity: 0.85; }
                    100% { box-shadow: 0 0 14px currentColor; opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default MealPlanDisplay;