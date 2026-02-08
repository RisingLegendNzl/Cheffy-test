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
// SCENE ICON (animated large emoji with glow)
// ============================================
const SceneIcon = ({ emoji, gradient }) => (
    <div className="relative flex items-center justify-center">
        {/* Outer glow */}
        <div
            className={`absolute w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br ${gradient} opacity-[0.12]`}
            style={{ animation: 'pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite' }}
        />
        {/* Ping ring */}
        <div
            className={`absolute w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-br ${gradient}`}
            style={{ opacity: 0.08, animation: 'ping 2.5s cubic-bezier(0,0,0.2,1) infinite' }}
        />
        {/* Icon circle */}
        <div
            className="relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center"
            style={{
                background: `linear-gradient(135deg, ${COLORS.primary[50]}, ${COLORS.secondary[50]})`,
                boxShadow: '0 8px 32px rgba(99, 102, 241, 0.18)',
            }}
        >
            <span className="text-4xl md:text-5xl select-none" role="img">
                {emoji}
            </span>
        </div>
    </div>
);

// ============================================
// PROGRESS DOTS (bottom indicator)
// ============================================
const ProgressDots = ({ total, activeIdx }) => (
    <div className="flex items-center justify-center space-x-2">
        {Array.from({ length: total }).map((_, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
                <div
                    key={i}
                    className="transition-all duration-500 rounded-full"
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
const MealPreviewGrid = ({ formData, activeStepKey, mealPlan }) => {
    const count = parseInt(formData?.eatingOccasions, 10) || 3;
    const labels = ['Breakfast', 'Lunch', 'Dinner', 'Snack 1', 'Snack 2'].slice(0, count);
    const day1 = mealPlan?.[0]?.meals || [];
    const hasData = day1.length > 0;

    return (
        <div className="mt-5 w-full max-w-sm mx-auto">
            <p
                className="text-[11px] font-semibold uppercase tracking-widest text-center mb-3"
                style={{ color: COLORS.gray[400] }}
            >
                Day 1 Preview
            </p>
            <div className="grid grid-cols-2 gap-2.5">
                {labels.map((label, i) => {
                    const meal = hasData ? day1[i] : null;

                    return (
                        <div
                            key={label}
                            className="rounded-xl border overflow-hidden transition-all duration-700"
                            style={{
                                minHeight: '82px',
                                padding: '12px',
                                background: meal ? '#ffffff' : 'rgba(249,250,251,0.7)',
                                borderColor: meal ? COLORS.primary[200] : COLORS.gray[150] || COLORS.gray[200],
                                boxShadow: meal ? '0 2px 12px rgba(99,102,241,0.08)' : 'none',
                                animation: meal ? `fadeInUp 0.5s ease-out ${i * 120}ms backwards` : 'none',
                            }}
                        >
                            {meal ? (
                                <>
                                    <p
                                        className="text-[10px] uppercase tracking-wider font-bold mb-1"
                                        style={{ color: COLORS.primary[400] }}
                                    >
                                        {label}
                                    </p>
                                    <p
                                        className="text-sm font-semibold leading-tight"
                                        style={{ color: COLORS.gray[800] }}
                                    >
                                        {meal.name}
                                    </p>
                                    {meal.totalCalories && (
                                        <div className="flex items-center mt-1.5 space-x-1">
                                            <Flame size={11} style={{ color: COLORS.macros.calories.main }} />
                                            <span className="text-xs font-medium" style={{ color: COLORS.gray[500] }}>
                                                {Math.round(meal.totalCalories)} cal
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p
                                        className="text-[10px] uppercase tracking-wider font-bold mb-1.5"
                                        style={{ color: COLORS.gray[300] }}
                                    >
                                        {label}
                                    </p>
                                    <div
                                        className="h-3 rounded animate-skeleton mb-1.5"
                                        style={{ width: '80%', backgroundColor: COLORS.gray[200] }}
                                    />
                                    <div
                                        className="h-3 rounded animate-skeleton"
                                        style={{ width: '55%', backgroundColor: COLORS.gray[200] }}
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
const MacroMini = ({ nutritionalTargets }) => {
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
                    <span className="text-xs font-medium" style={{ color: COLORS.gray[500] }}>
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
const CompletionScene = () => (
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
        <h3 className="text-2xl md:text-3xl font-bold mt-6 mb-2" style={{ color: COLORS.gray[900] }}>
            Your plan is ready!
        </h3>
        <p className="text-sm" style={{ color: COLORS.gray[500] }}>
            Scroll down to explore your personalized meals.
        </p>
    </div>
);

// ============================================
// ERROR STATE
// ============================================
const ErrorScene = ({ errorMsg }) => (
    <div className="flex flex-col items-center text-center animate-fadeIn p-4">
        <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: COLORS.error.light }}
        >
            <AlertTriangle size={36} style={{ color: COLORS.error.main }} />
        </div>
        <h3 className="text-xl font-bold mb-2" style={{ color: COLORS.gray[900] }}>
            Something went wrong
        </h3>
        <p className="text-sm max-w-sm break-words" style={{ color: COLORS.gray[600] }}>
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
    const [tipIdx, setTipIdx] = useState(0);
    const [progress, setProgress] = useState(0);
    const tipTimer = useRef(null);
    const animFrame = useRef(null);

    const isError = activeStepKey === 'error';
    const isComplete = activeStepKey === 'complete';
    const sceneIdx = SCENES.findIndex((s) => s.key === activeStepKey);
    const scene = SCENES[sceneIdx >= 0 ? sceneIdx : 0];

    const ctx = useMemo(
        () => ({ formData, nutritionalTargets, results }),
        [formData, nutritionalTargets, results]
    );

    // --- Smooth progress bar ---
    useEffect(() => {
        if (isError) return;
        if (isComplete) {
            setProgress(100);
            return;
        }

        const [min, max] = scene.progressRange;
        const start = Date.now();
        const dur = 10000; // 10s per scene

        const tick = () => {
            const t = Math.min((Date.now() - start) / dur, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            setProgress((prev) => Math.max(prev, Math.round(min + (max - min) * eased)));
            if (t < 1) animFrame.current = requestAnimationFrame(tick);
        };

        animFrame.current = requestAnimationFrame(tick);
        return () => {
            if (animFrame.current) cancelAnimationFrame(animFrame.current);
        };
    }, [sceneIdx, isComplete, isError, scene.progressRange]);

    // --- Rotating tips ---
    useEffect(() => {
        if (isComplete || isError) {
            clearInterval(tipTimer.current);
            return;
        }
        tipTimer.current = setInterval(() => {
            setTipIdx((p) => (p + 1) % TIPS.length);
        }, 5000);
        return () => clearInterval(tipTimer.current);
    }, [isComplete, isError]);

    // Determine content visibility
    const showIngredients = activeStepKey === 'market' && Object.keys(results || {}).length > 0;
    const showMealPreview = ['market', 'finalizing', 'complete'].includes(activeStepKey);

    return (
        <div
            className="w-full rounded-2xl overflow-hidden transition-all duration-500"
            style={{
                background: isComplete
                    ? `linear-gradient(135deg, ${COLORS.success.light}, #f0fdf4, #ffffff)`
                    : isError
                    ? `linear-gradient(135deg, ${COLORS.error.light}, #fff5f5, #ffffff)`
                    : 'linear-gradient(135deg, #f5f3ff, #eef2ff, #ffffff)',
                boxShadow: '0 8px 40px rgba(99,102,241,0.08), 0 1px 3px rgba(0,0,0,0.06)',
                border: `1px solid ${isError ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.1)'}`,
            }}
        >
            {/* --- Top Progress Bar --- */}
            {!isError && (
                <div className="relative w-full h-1.5 overflow-hidden" style={{ backgroundColor: 'rgba(99,102,241,0.06)' }}>
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
                {isError && <ErrorScene errorMsg={errorMsg} />}

                {/* COMPLETE */}
                {isComplete && <CompletionScene />}

                {/* RUNNING — Story Mode */}
                {!isError && !isComplete && (
                    <div className="flex flex-col items-center text-center">
                        {/* Scene Icon */}
                        <SceneIcon emoji={scene.emoji} gradient={scene.gradient} />

                        {/* Headline (keyed for CSS transition) */}
                        <h3
                            key={scene.key + '-h'}
                            className="text-xl md:text-2xl font-bold mt-5 mb-2 animate-fadeIn"
                            style={{ color: COLORS.gray[900] }}
                        >
                            {scene.headline}
                        </h3>

                        {/* Personalized description */}
                        <p
                            key={scene.key + '-d'}
                            className="text-sm md:text-base max-w-md animate-fadeIn"
                            style={{ color: COLORS.gray[600] }}
                        >
                            {scene.getDescription(ctx)}
                        </p>

                        {/* Macro targets (visible after first scene) */}
                        {sceneIdx >= 1 && <MacroMini nutritionalTargets={nutritionalTargets} />}

                        {/* Progressive ingredient pills */}
                        {showIngredients && <IngredientPills results={results} />}

                        {/* Meal preview grid */}
                        {showMealPreview && (
                            <MealPreviewGrid
                                formData={formData}
                                activeStepKey={activeStepKey}
                                mealPlan={mealPlan}
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
                                style={{ color: COLORS.gray[400] }}
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