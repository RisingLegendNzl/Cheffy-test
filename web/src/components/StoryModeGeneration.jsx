// web/src/components/StoryModeGeneration.jsx
//
// Combined Concept A (Kitchen Counter) + Concept C (Story Mode)
// Replaces GenerationProgressDisplay during meal plan generation.
//
// - Full narrative scene transitions with personalized copy
// - Progressive ingredient pill reveals as backend streams results
// - Meal preview skeleton grid that fills in when plan:complete fires
// - Smooth progress bar, rotating tips, confetti celebration
//
// DARK MODE: All text colors and backgrounds are theme-aware via useTheme().
//
// Props contract (same activeStepKey values as GenerationProgressDisplay):
//   activeStepKey: 'targets' | 'planning' | 'market' | 'finalizing' | 'complete' | 'error'
//   errorMsg, latestLog, formData, nutritionalTargets, results, mealPlan

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Target,
    ChefHat,
    ShoppingBag,
    Sparkles,
    CheckCircle,
    AlertTriangle,
    Flame,
    Droplet,
    Wheat,
} from 'lucide-react';
import { COLORS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

// ============================================
// SCENE DEFINITIONS
// ============================================
const SCENES = [
    {
        key: 'targets',
        emoji: '🎯',
        Icon: Target,
        headline: 'Analyzing your profile...',
        getDescription: (ctx) => {
            const cal = ctx.nutritionalTargets?.calories;
            const goal = ctx.formData?.goal;
            const goalLabels = {
                maintain: 'maintenance',
                cut_moderate: 'moderate cut',
                cut_aggressive: 'aggressive cut',
                bulk_lean: 'lean bulk',
                bulk_aggressive: 'aggressive bulk',
            };
            const label = goalLabels[goal] || 'your goals';
            if (cal && cal > 0) {
                return `Setting up ${cal.toLocaleString()} daily calories for a ${label} plan.`;
            }
            return `Calculating the perfect daily targets for your ${label}.`;
        },
        gradient: 'from-indigo-500 to-blue-500',
        progressRange: [0, 15],
    },
    {
        key: 'planning',
        emoji: '👨‍🍳',
        Icon: ChefHat,
        headline: 'Crafting your meals...',
        getDescription: (ctx) => {
            const meals = ctx.formData?.eatingOccasions || '3';
            const days = ctx.formData?.days || 7;
            const dietary = ctx.formData?.dietary;
            const cuisine = ctx.formData?.cuisine;
            let desc = `Designing ${meals} balanced meals per day across ${days} days`;
            if (dietary && dietary !== 'None') desc += ` (${dietary})`;
            if (cuisine && cuisine.trim()) desc += ` with ${cuisine} inspiration`;
            return desc + '.';
        },
        gradient: 'from-purple-500 to-pink-500',
        progressRange: [15, 45],
    },
    {
        key: 'market',
        emoji: '🛒',
        Icon: ShoppingBag,
        headline: 'Shopping for the best deals...',
        getDescription: (ctx) => {
            const store = ctx.formData?.store || 'your store';
            const count = Object.keys(ctx.results || {}).filter(
                (k) => ctx.results[k]?.source !== 'failed'
            ).length;
            if (count > 0) {
                return `Found ${count} item${count !== 1 ? 's' : ''} at ${store} so far...`;
            }
            return `Scanning ${store} for real-time prices on every ingredient.`;
        },
        gradient: 'from-orange-500 to-amber-500',
        progressRange: [45, 80],
    },
    {
        key: 'finalizing',
        emoji: '✨',
        Icon: Sparkles,
        headline: 'Putting it all together...',
        getDescription: (ctx) => {
            const cal = ctx.nutritionalTargets?.calories;
            if (cal && cal > 0) {
                return `Final nutrition check — ensuring every macro hits your ${cal.toLocaleString()} cal target.`;
            }
            return 'Running final nutrition calculations and assembling your dashboard.';
        },
        gradient: 'from-emerald-500 to-teal-500',
        progressRange: [80, 98],
    },
];

// ============================================
// ROTATING TIPS
// ============================================
const TIPS = [
    'Each meal is balanced to your exact macro split.',
    'We compare prices across hundreds of products.',
    'Plans use seasonal produce to save you money.',
    'Recipes are generated fresh — never repeated templates.',
    'Your macros are recalculated after every ingredient swap.',
    'Meal variety is optimized to avoid flavour fatigue.',
];

// ============================================
// SCENE ICON
// ============================================
const SceneIcon = ({ emoji, gradient }) => (
    <div
        className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}
        style={{ fontSize: '2rem' }}
    >
        {emoji}
    </div>
);

// ============================================
// PROGRESS DOTS
// ============================================
const ProgressDots = ({ total, activeIdx }) => (
    <div className="flex items-center space-x-2">
        {Array.from({ length: total }).map((_, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
                <div
                    key={i}
                    className="rounded-full transition-all duration-300"
                    style={{
                        width: active ? '24px' : '8px',
                        height: '8px',
                        background: done
                            ? COLORS.success.main
                            : active
                            ? `linear-gradient(to right, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`
                            : COLORS.gray[300],
                    }}
                />
            );
        })}
    </div>
);

// ============================================
// INGREDIENT PILLS (Concept A — progressive reveal)
// ============================================
const IngredientPills = ({ results }) => {
    const names = useMemo(() => {
        return Object.entries(results || {})
            .filter(([, v]) => v && v.source !== 'failed')
            .slice(-8)
            .map(([key, v]) => {
                const raw = v?.originalIngredient || key;
                const trimmed = raw.length > 20 ? raw.substring(0, 18) + '…' : raw;
                return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
            });
    }, [results]);

    if (names.length === 0) return null;

    return (
        <div className="mt-4 px-2">
            <div className="flex flex-wrap justify-center gap-2">
                {names.map((name, i) => (
                    <span
                        key={name + i}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                        style={{
                            backgroundColor: COLORS.success.light,
                            color: COLORS.success.dark,
                            animation: `fadeInUp 0.4s ease-out ${i * 80}ms backwards`,
                        }}
                    >
                        <CheckCircle size={11} className="mr-1 flex-shrink-0" />
                        {name}
                    </span>
                ))}
            </div>
        </div>
    );
};

// ============================================
// MEAL PREVIEW GRID (Concept A — Kitchen Counter)
// Skeletons that fill when mealPlan arrives
// ============================================
const MealPreviewGrid = ({ formData, activeStepKey, mealPlan, isDark }) => {
    const count = parseInt(formData?.eatingOccasions, 10) || 3;
    const labels = ['Breakfast', 'Lunch', 'Dinner', 'Snack 1', 'Snack 2'].slice(0, count);
    const day1 = mealPlan?.[0]?.meals || [];
    const hasData = day1.length > 0;

    return (
        <div className="mt-5 w-full max-w-sm mx-auto">
            <p
                className="text-[11px] font-semibold uppercase tracking-widest text-center mb-3"
                style={{ color: isDark ? '#6b7280' : COLORS.gray[400] }}
            >
                Day 1 Preview
            </p>
            <div className="grid grid-cols-2 gap-2.5">
                {labels.map((label, i) => {
                    const meal = hasData ? day1[i] : null;
                    return (
                        <div
                            key={label}
                            className="rounded-xl p-3"
                            style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.05)',
                                animation: `fadeInUp 0.3s ease-out ${i * 60}ms backwards`,
                            }}
                        >
                            {meal ? (
                                <>
                                    <p
                                        className="text-[10px] uppercase tracking-wider font-bold mb-1"
                                        style={{ color: isDark ? '#9ca3b0' : COLORS.gray[400] }}
                                    >
                                        {label}
                                    </p>
                                    <p
                                        className="text-xs font-semibold truncate"
                                        style={{ color: isDark ? '#f0f1f5' : COLORS.gray[800] }}
                                    >
                                        {meal.meal_name || meal.name || label}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p
                                        className="text-[10px] uppercase tracking-wider font-bold mb-1.5"
                                        style={{ color: isDark ? '#6b7280' : COLORS.gray[300] }}
                                    >
                                        {label}
                                    </p>
                                    <div
                                        className="h-3 rounded animate-skeleton mb-1.5"
                                        style={{ width: '80%', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : COLORS.gray[200] }}
                                    />
                                    <div
                                        className="h-3 rounded animate-skeleton"
                                        style={{ width: '55%', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : COLORS.gray[200] }}
                                    />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ============================================
// MACRO MINI DISPLAY (shows after targets)
// ============================================
const MacroMini = ({ nutritionalTargets, isDark }) => {
    const cal = nutritionalTargets?.calories;
    if (!cal || cal === 0) return null;

    const items = [
        { label: 'P', value: `${nutritionalTargets.protein}g`, color: COLORS.macros.protein.main },
        { label: 'F', value: `${nutritionalTargets.fat}g`, color: COLORS.macros.fat.main },
        { label: 'C', value: `${nutritionalTargets.carbs}g`, color: COLORS.macros.carbs.main },
    ];

    return (
        <div className="flex items-center justify-center space-x-4 mt-3 animate-fadeIn">
            {items.map((m) => (
                <div key={m.label} className="flex items-center space-x-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                    <span className="text-xs font-medium" style={{ color: isDark ? '#9ca3b0' : COLORS.gray[500] }}>
                        {m.value}
                    </span>
                </div>
            ))}
        </div>
    );
};

// ============================================
// COMPLETION CELEBRATION
// ============================================
const CompletionScene = ({ isDark }) => (
    <div className="flex flex-col items-center text-center animate-fadeIn">
        <div
            className="w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center animate-bounceIn"
            style={{
                backgroundColor: COLORS.success.light,
                boxShadow: '0 8px 32px rgba(16, 185, 129, 0.25)',
            }}
        >
            <CheckCircle size={40} style={{ color: COLORS.success.main }} />
        </div>
        <h3
            className="text-2xl md:text-3xl font-bold mt-6 mb-2"
            style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}
        >
            Your plan is ready!
        </h3>
        <p className="text-sm" style={{ color: isDark ? '#9ca3b0' : COLORS.gray[500] }}>
            Scroll down to explore your personalized meals.
        </p>
    </div>
);

// ============================================
// ERROR STATE
// ============================================
const ErrorScene = ({ errorMsg, isDark }) => (
    <div className="flex flex-col items-center text-center animate-fadeIn p-4">
        <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: COLORS.error.light }}
        >
            <AlertTriangle size={36} style={{ color: COLORS.error.main }} />
        </div>
        <h3
            className="text-xl font-bold mb-2"
            style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}
        >
            Something went wrong
        </h3>
        <p
            className="text-sm max-w-sm break-words"
            style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }}
        >
            {errorMsg || 'An error occurred during plan generation. Please try again.'}
        </p>
    </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
const StoryModeGeneration = ({
    activeStepKey,
    errorMsg,
    latestLog,
    formData,
    nutritionalTargets,
    results,
    mealPlan,
}) => {
    const { isDark } = useTheme();
    const [tipIdx, setTipIdx] = useState(0);
    const [progress, setProgress] = useState(0);
    const tipTimer = useRef(null);
    const animFrame = useRef(null);

    const isError = activeStepKey === 'error';
    const isComplete = activeStepKey === 'complete';
    const sceneIdx = SCENES.findIndex((s) => s.key === activeStepKey);
    const scene = SCENES[sceneIdx >= 0 ? sceneIdx : 0];

    // Context object for scene descriptions
    const ctx = { formData, nutritionalTargets, results };

    // Rotate tips
    useEffect(() => {
        if (isError || isComplete) return;
        tipTimer.current = setInterval(() => {
            setTipIdx((prev) => (prev + 1) % TIPS.length);
        }, 5000);
        return () => clearInterval(tipTimer.current);
    }, [isError, isComplete]);

    // Animate progress
    useEffect(() => {
        if (isError) return;
        if (isComplete) {
            setProgress(100);
            return;
        }
        const [min, max] = scene.progressRange;
        let frame;
        const tick = () => {
            setProgress((prev) => {
                if (prev >= max) return prev;
                const step = Math.random() * 0.4 + 0.1;
                return Math.min(prev + step, max);
            });
            frame = requestAnimationFrame(tick);
        };
        if (progress < min) setProgress(min);
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [scene, isError, isComplete]);

    const showIngredients = sceneIdx >= 2; // market + finalizing
    const showMealPreview = sceneIdx >= 1; // planning onwards

    // ── Theme-aware card background ──
    const cardBg = isDark
        ? isError
            ? 'rgba(239,68,68,0.08)'
            : 'rgba(30, 33, 48, 0.85)'
        : isError
            ? 'rgba(239,68,68,0.15)'
            : 'rgba(99,102,241,0.1)';

    const cardBorder = isDark ? '1px solid rgba(99,102,241,0.15)' : '1px solid rgba(99,102,241,0.12)';
    const cardShadow = isDark
        ? '0 2px 10px rgba(0,0,0,0.35), 0 0 0 1px rgba(99,102,241,0.06)'
        : '0 2px 8px rgba(0,0,0,0.04)';

    return (
        <div
            className="rounded-2xl overflow-hidden"
            style={{
                backgroundColor: cardBg,
                border: cardBorder,
                boxShadow: cardShadow,
                backdropFilter: isDark ? 'blur(20px) saturate(150%)' : undefined,
                WebkitBackdropFilter: isDark ? 'blur(20px) saturate(150%)' : undefined,
            }}
        >
            {/* --- Top Progress Bar --- */}
            {!isError && (
                <div className="relative w-full h-1.5 overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)' }}>
                    <div
                        className="absolute top-0 left-0 h-full rounded-r-full transition-all duration-700 ease-out"
                        style={{
                            width: `${progress}%`,
                            background: isComplete
                                ? COLORS.success.main
                                : `linear-gradient(to right, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`,
                        }}
                    />
                    {!isComplete && (
                        <div
                            className="absolute top-0 left-0 h-full w-full"
                            style={{
                                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 2s infinite linear',
                            }}
                        />
                    )}
                </div>
            )}

            <div className="px-5 py-6 md:px-8 md:py-8">
                {/* ERROR */}
                {isError && <ErrorScene errorMsg={errorMsg} isDark={isDark} />}

                {/* COMPLETE */}
                {isComplete && <CompletionScene isDark={isDark} />}

                {/* RUNNING — Story Mode */}
                {!isError && !isComplete && (
                    <div className="flex flex-col items-center text-center">
                        {/* Scene Icon */}
                        <SceneIcon emoji={scene.emoji} gradient={scene.gradient} />

                        {/* Headline (keyed for CSS transition) */}
                        <h3
                            key={scene.key + '-h'}
                            className="text-xl md:text-2xl font-bold mt-5 mb-2 animate-fadeIn"
                            style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}
                        >
                            {scene.headline}
                        </h3>

                        {/* Personalized description */}
                        <p
                            key={scene.key + '-d'}
                            className="text-sm md:text-base max-w-md animate-fadeIn"
                            style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }}
                        >
                            {scene.getDescription(ctx)}
                        </p>

                        {/* Macro targets (visible after first scene) */}
                        {sceneIdx >= 1 && <MacroMini nutritionalTargets={nutritionalTargets} isDark={isDark} />}

                        {/* Progressive ingredient pills */}
                        {showIngredients && <IngredientPills results={results} />}

                        {/* Meal preview grid */}
                        {showMealPreview && (
                            <MealPreviewGrid
                                formData={formData}
                                activeStepKey={activeStepKey}
                                mealPlan={mealPlan}
                                isDark={isDark}
                            />
                        )}

                        {/* Progress dots */}
                        <div className="mt-6">
                            <ProgressDots total={SCENES.length} activeIdx={sceneIdx >= 0 ? sceneIdx : 0} />
                        </div>

                        {/* Rotating tip */}
                        <div className="mt-4 h-8 flex items-center justify-center">
                            <p
                                key={`tip-${tipIdx}`}
                                className="text-xs italic animate-fadeIn"
                                style={{ color: isDark ? '#6b7280' : COLORS.gray[400] }}
                            >
                                💡 {TIPS[tipIdx]}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoryModeGeneration;