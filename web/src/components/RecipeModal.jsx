// web/src/components/RecipeModal.jsx
// =============================================================================
// RecipeModal — Full-screen recipe detail overlay
//
// REVAMP v3.0: Kitchen-inspired UI overhaul
//   - Ingredient chips with food emojis and humanized names
//   - Step cards with numbered badges and cooking-oriented microcopy
//   - Gradient hero header with meal type badge
//   - Macro summary pills in the header
//   - Improved spacing and hierarchy for glanceability
//   - Playful but minimal animations
//   - Dark/light theme fully supported
//
// [FIX v2.1] VoiceCookingButton import includes explicit .jsx extension
//            for Vercel Linux case-sensitive filesystem compatibility.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { X, ListChecks, ListOrdered, Clock, Flame, ChefHat, Utensils } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { formatIngredientName, getIngredientEmoji } from '../helpers/humanize.js';
import VoiceCookingButton from './voice/VoiceCookingButton.jsx';

const MODAL_Z = 9999;

// ── Cooking step time hints (adds a friendly touch) ──
const getStepTimeHint = (step) => {
  if (!step || typeof step !== 'string') return null;
  const lower = step.toLowerCase();
  // Extract minute mentions
  const minMatch = lower.match(/(\d+)\s*(?:–|-|to)\s*(\d+)\s*min/);
  if (minMatch) return `${minMatch[1]}–${minMatch[2]} min`;
  const singleMin = lower.match(/(\d+)\s*min/);
  if (singleMin) return `${singleMin[1]} min`;
  // Common time cues
  if (/preheat|heat/.test(lower) && /oven/.test(lower)) return '⏱ Preheat';
  if (/rest|cool|chill/.test(lower)) return '⏱ Rest';
  if (/boil|simmer/.test(lower)) return '🫧 Cook';
  return null;
};

// ── Step action icons ──
const getStepIcon = (step, index) => {
  if (!step) return '🍳';
  const lower = step.toLowerCase();
  if (/preheat|oven/.test(lower)) return '🔥';
  if (/chop|dice|slice|cut|mince/.test(lower)) return '🔪';
  if (/mix|stir|whisk|combine|toss/.test(lower)) return '🥄';
  if (/boil|simmer|cook|fry|sauté|saute|roast|bake|grill/.test(lower)) return '🍳';
  if (/serve|plate|garnish/.test(lower)) return '🍽️';
  if (/wash|rinse|clean/.test(lower)) return '🚿';
  if (/marinate|season|coat/.test(lower)) return '🧂';
  if (/rest|cool|chill/.test(lower)) return '❄️';
  if (/squeeze|pour|drizzle/.test(lower)) return '💧';
  return '👨‍🍳';
};

const RecipeModal = ({ meal, onClose }) => {
    const { isDark } = useTheme();
    const scrollRef = useRef(null);
    const [activeStep, setActiveStep] = useState(-1); // -1 = none active

    useEffect(() => {
        if (!meal) return;

        const scrollY = window.scrollY;
        const orig = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            width: document.body.style.width,
            top: document.body.style.top,
            height: document.body.style.height,
        };

        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
        document.body.style.height = '100%';

        const id = 'recipe-modal-dvh-styles';
        let styleEl = document.getElementById(id);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = id;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            .rm-overlay {
                height: 100vh;
                height: 100dvh;
            }
            .rm-container {
                height: 100%;
                width: 100%;
                max-width: 100%;
                border-radius: 0;
            }
            @media (min-width: 672px) {
                .rm-container {
                    max-width: 672px;
                    height: auto;
                    max-height: min(90vh, 90dvh);
                    border-radius: 20px;
                }
            }
        `;

        return () => {
            document.body.style.overflow = orig.overflow;
            document.body.style.position = orig.position;
            document.body.style.width = orig.width;
            document.body.style.top = orig.top;
            document.body.style.height = orig.height;
            window.scrollTo(0, scrollY);

            const el = document.getElementById(id);
            if (el) el.remove();
        };
    }, [meal]);

    useEffect(() => {
        setActiveStep(-1);
    }, [meal]);

    if (!meal) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    // ── Theme tokens ──
    const t = {
        cardBg:          isDark ? '#1a1d2e' : '#ffffff',
        bodyBg:          isDark ? '#141723' : '#f8f9fb',
        headerBg:        isDark
            ? 'linear-gradient(135deg, #1e2240 0%, #2a1f4e 50%, #1a2238 100%)'
            : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
        headerText:      '#ffffff',
        headerSubtext:   'rgba(255,255,255,0.75)',
        closeBtnBg:      'rgba(255,255,255,0.15)',
        closeBtnColor:   '#ffffff',
        descColor:       isDark ? '#b8bdd0' : '#475569',
        sectionTitleClr: isDark ? '#e2e5f0' : '#1e293b',
        sectionSubClr:   isDark ? '#6b7394' : '#94a3b8',
        // Ingredient chips
        chipBg:          isDark ? 'rgba(99, 102, 241, 0.08)' : '#f0f0ff',
        chipBorder:      isDark ? 'rgba(99, 102, 241, 0.18)' : '#e0e0ff',
        chipText:        isDark ? '#c7d0e8' : '#334155',
        chipQty:         isDark ? '#a5b4fc' : '#6366f1',
        chipEmoji:       isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)',
        // Step cards
        stepCardBg:      isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
        stepCardBorder:  isDark ? 'rgba(99,102,241,0.1)' : '#e2e8f0',
        stepCardActive:  isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.05)',
        stepCardActiveBorder: isDark ? 'rgba(99,102,241,0.35)' : '#a5b4fc',
        stepNumBg:       isDark ? '#6366f1' : '#6366f1',
        stepNumColor:    '#ffffff',
        stepText:        isDark ? '#c7d0e8' : '#334155',
        stepTimeHint:    isDark ? '#818cf8' : '#8b5cf6',
        stepDone:        isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.06)',
        stepDoneBorder:  isDark ? 'rgba(16,185,129,0.3)' : '#a7f3d0',
        // Macro pills
        macroBg:         'rgba(255,255,255,0.15)',
        macroText:       '#ffffff',
        // Divider
        divider:         isDark ? 'rgba(99,102,241,0.08)' : '#f1f5f9',
    };

    const getIngredientNameDisplay = (item) => {
        if (typeof item === 'string') return formatIngredientName(item);
        const raw = item.key || item.name || item.ingredient || '';
        return formatIngredientName(raw);
    };

    const getIngredientQty = (item) => {
        if (typeof item !== 'object') return '';
        const val = item.qty ?? item.qty_value ?? item.quantity ?? item.amount ?? '';
        const unit = item.unit ?? item.qty_unit ?? '';
        if (val === '' && unit === '') return '';
        return `${val}${unit ? ' ' + unit : ''}`;
    };

    const macros = {
        cal: Math.round(meal.subtotal_kcal || 0),
        protein: Math.round(meal.subtotal_protein || 0),
        fat: Math.round(meal.subtotal_fat || 0),
        carbs: Math.round(meal.subtotal_carbs || 0),
    };

    const hasMacros = macros.cal > 0;
    const totalSteps = meal.instructions?.length || 0;
    const completedSteps = activeStep >= 0 ? activeStep + 1 : 0;
    const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    return (
        <div
            className="rm-overlay"
            onClick={handleBackdropClick}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                zIndex: MODAL_Z,
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.55)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0',
            }}
        >
            <div
                className="rm-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: t.cardBg,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    boxShadow: isDark
                        ? '0 0 0 1px rgba(99,102,241,0.2), 0 24px 48px -12px rgba(0,0,0,0.7)'
                        : '0 0 0 1px rgba(99,102,241,0.12), 0 24px 48px -12px rgba(0,0,0,0.3)',
                }}
            >
                {/* ═══════ HERO HEADER ═══════ */}
                <div
                    style={{
                        background: t.headerBg,
                        padding: '1.25rem 1.25rem 1rem',
                        paddingTop: 'max(1.25rem, calc(env(safe-area-inset-top) + 0.75rem))',
                        position: 'relative',
                        overflow: 'hidden',
                        flexShrink: 0,
                    }}
                >
                    {/* Decorative kitchen pattern overlay */}
                    <div style={{
                        position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }} />

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: 'max(12px, calc(env(safe-area-inset-top) + 4px))',
                            right: '12px',
                            width: '36px', height: '36px', borderRadius: '12px',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: t.closeBtnBg, color: t.closeBtnColor,
                            transition: 'background 0.15s',
                            zIndex: 3,
                        }}
                    >
                        <X size={18} />
                    </button>

                    {/* Meal type badge */}
                    {meal.type && (
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '4px 12px', borderRadius: '20px',
                            background: 'rgba(255,255,255,0.15)',
                            backdropFilter: 'blur(8px)',
                            fontSize: '0.7rem', fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                            color: t.headerText, marginBottom: '8px',
                        }}>
                            <Utensils size={12} />
                            {meal.type}
                        </div>
                    )}

                    {/* Title */}
                    <h3 style={{
                        fontSize: '1.35rem', fontWeight: 800, color: t.headerText,
                        margin: 0, lineHeight: 1.25, paddingRight: '40px',
                        fontFamily: "'Georgia', 'Times New Roman', serif",
                    }}>
                        {meal.name}
                    </h3>

                    {/* Macro pills row */}
                    {hasMacros && (
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px',
                        }}>
                            {[
                                { icon: '🔥', label: `${macros.cal} kcal` },
                                { icon: '💪', label: `${macros.protein}g protein` },
                                { icon: '🥑', label: `${macros.fat}g fat` },
                                { icon: '🌾', label: `${macros.carbs}g carbs` },
                            ].map(({ icon, label }) => (
                                <span key={label} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '3px 10px', borderRadius: '16px',
                                    background: t.macroBg,
                                    fontSize: '0.72rem', fontWeight: 600, color: t.macroText,
                                }}>
                                    <span style={{ fontSize: '0.75rem' }}>{icon}</span>
                                    {label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* ═══════ SCROLLABLE BODY ═══════ */}
                <div
                    ref={scrollRef}
                    style={{
                        flex: 1, minHeight: 0, overflowY: 'auto',
                        padding: '1.25rem',
                        background: t.bodyBg,
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    {/* Description */}
                    {meal.description && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{
                                color: t.descColor, fontSize: '0.95rem', lineHeight: '1.7',
                                margin: 0, fontStyle: 'italic',
                            }}>
                                {meal.description}
                            </p>
                        </div>
                    )}

                    {/* ─── INGREDIENTS SECTION ─── */}
                    {meal.items && meal.items.length > 0 && (
                        <div style={{ marginBottom: '1.75rem' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                marginBottom: '12px',
                            }}>
                                <span style={{ fontSize: '1.25rem' }}>🧺</span>
                                <h4 style={{
                                    fontSize: '1.05rem', fontWeight: 800,
                                    color: t.sectionTitleClr, margin: 0,
                                    fontFamily: "'Georgia', serif",
                                }}>
                                    What You'll Need
                                </h4>
                                <span style={{
                                    fontSize: '0.7rem', fontWeight: 600,
                                    color: t.sectionSubClr,
                                    padding: '2px 8px', borderRadius: '10px',
                                    background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                                }}>
                                    {meal.items.length} items
                                </span>
                            </div>

                            {/* Ingredient Chips Grid */}
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '8px',
                            }}>
                                {meal.items.map((item, i) => {
                                    const name = getIngredientNameDisplay(item);
                                    const qty = getIngredientQty(item);
                                    const emoji = getIngredientEmoji(name);
                                    if (!name) return null;

                                    return (
                                        <div
                                            key={i}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                                padding: '8px 14px 8px 10px',
                                                borderRadius: '14px',
                                                background: t.chipBg,
                                                border: `1px solid ${t.chipBorder}`,
                                                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                                cursor: 'default',
                                                animation: `rm-chipIn 0.3s ease-out ${i * 30}ms backwards`,
                                            }}
                                        >
                                            {/* Emoji icon */}
                                            <span style={{
                                                width: '28px', height: '28px',
                                                borderRadius: '8px',
                                                background: t.chipEmoji,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.9rem', flexShrink: 0,
                                            }}>
                                                {emoji}
                                            </span>
                                            <div style={{ minWidth: 0 }}>
                                                <span style={{
                                                    display: 'block',
                                                    fontSize: '0.82rem', fontWeight: 600,
                                                    color: t.chipText, lineHeight: 1.2,
                                                }}>
                                                    {name}
                                                </span>
                                                {qty && (
                                                    <span style={{
                                                        display: 'block',
                                                        fontSize: '0.7rem', fontWeight: 700,
                                                        color: t.chipQty, lineHeight: 1.3,
                                                    }}>
                                                        {qty}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    <div style={{
                        height: '1px',
                        background: isDark
                            ? 'linear-gradient(90deg, transparent, rgba(99,102,241,0.15), transparent)'
                            : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)',
                        margin: '0 0 1.5rem',
                    }} />

                    {/* ─── INSTRUCTIONS SECTION ─── */}
                    {meal.instructions && meal.instructions.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                marginBottom: '14px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1.25rem' }}>👨‍🍳</span>
                                    <h4 style={{
                                        fontSize: '1.05rem', fontWeight: 800,
                                        color: t.sectionTitleClr, margin: 0,
                                        fontFamily: "'Georgia', serif",
                                    }}>
                                        Let's Cook!
                                    </h4>
                                </div>

                                {/* Progress indicator */}
                                {activeStep >= 0 && (
                                    <span style={{
                                        fontSize: '0.7rem', fontWeight: 700,
                                        color: isDark ? '#34d399' : '#059669',
                                        padding: '3px 10px', borderRadius: '10px',
                                        background: isDark ? 'rgba(16,185,129,0.12)' : '#d1fae5',
                                    }}>
                                        {completedSteps}/{totalSteps} steps
                                    </span>
                                )}
                            </div>

                            {/* Progress bar */}
                            {activeStep >= 0 && (
                                <div style={{
                                    height: '3px', borderRadius: '2px',
                                    background: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
                                    marginBottom: '14px', overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%', borderRadius: '2px',
                                        width: `${progressPct}%`,
                                        background: 'linear-gradient(90deg, #6366f1, #10b981)',
                                        transition: 'width 0.4s ease',
                                    }} />
                                </div>
                            )}

                            {/* Step Cards */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {meal.instructions.map((step, i) => {
                                    const isActive = i === activeStep;
                                    const isDone = i < activeStep;
                                    const timeHint = getStepTimeHint(step);
                                    const icon = getStepIcon(step, i);

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => setActiveStep(i === activeStep ? -1 : i)}
                                            style={{
                                                display: 'flex', gap: '12px',
                                                padding: '14px',
                                                borderRadius: '14px',
                                                border: `1.5px solid ${
                                                    isDone ? t.stepDoneBorder
                                                    : isActive ? t.stepCardActiveBorder
                                                    : t.stepCardBorder
                                                }`,
                                                background: isDone ? t.stepDone
                                                    : isActive ? t.stepCardActive
                                                    : t.stepCardBg,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                width: '100%',
                                                fontFamily: 'inherit',
                                                transition: 'all 0.2s ease',
                                                animation: `rm-stepSlide 0.35s ease-out ${i * 50}ms backwards`,
                                                opacity: isDone ? 0.6 : 1,
                                            }}
                                        >
                                            {/* Step number badge */}
                                            <div style={{
                                                width: '36px', height: '36px', borderRadius: '10px',
                                                background: isDone
                                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                                    : isActive
                                                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                                    : isDark ? '#2d3148' : '#e2e8f0',
                                                color: isDone || isActive ? '#ffffff' : (isDark ? '#6b7394' : '#94a3b8'),
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: isDone ? '0.9rem' : '0.8rem',
                                                fontWeight: 700, flexShrink: 0,
                                                transition: 'all 0.2s ease',
                                            }}>
                                                {isDone ? '✓' : icon}
                                            </div>

                                            {/* Step content */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    marginBottom: '3px',
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.68rem', fontWeight: 700,
                                                        color: isActive
                                                            ? (isDark ? '#818cf8' : '#6366f1')
                                                            : (isDark ? '#6b7394' : '#94a3b8'),
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.06em',
                                                    }}>
                                                        Step {i + 1}
                                                    </span>
                                                    {timeHint && (
                                                        <span style={{
                                                            fontSize: '0.65rem', fontWeight: 600,
                                                            color: t.stepTimeHint,
                                                            padding: '1px 6px', borderRadius: '6px',
                                                            background: isDark ? 'rgba(129,140,248,0.1)' : 'rgba(139,92,246,0.08)',
                                                        }}>
                                                            {timeHint}
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{
                                                    fontSize: '0.88rem', lineHeight: '1.55',
                                                    color: t.stepText,
                                                    textDecoration: isDone ? 'line-through' : 'none',
                                                }}>
                                                    {step}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Completion message */}
                            {activeStep >= totalSteps - 1 && activeStep >= 0 && (
                                <div style={{
                                    textAlign: 'center', padding: '16px',
                                    marginTop: '12px', borderRadius: '14px',
                                    background: isDark ? 'rgba(16,185,129,0.1)' : '#ecfdf5',
                                    border: `1px solid ${isDark ? 'rgba(16,185,129,0.2)' : '#a7f3d0'}`,
                                    animation: 'rm-chipIn 0.4s ease-out',
                                }}>
                                    <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '4px' }}>🎉</span>
                                    <span style={{
                                        fontSize: '0.85rem', fontWeight: 700,
                                        color: isDark ? '#34d399' : '#059669',
                                    }}>
                                        All done! Time to enjoy your meal.
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── VOICE COOKING BUTTON ─── */}
                    {meal.instructions && meal.instructions.length > 0 && (
                        <div style={{
                            display: 'flex', justifyContent: 'center',
                            padding: '8px 0 16px',
                        }}>
                            <VoiceCookingButton meal={meal} isDark={isDark} />
                        </div>
                    )}
                </div>

                {/* ═══════ INLINE KEYFRAMES ═══════ */}
                <style>{`
                    @keyframes rm-chipIn {
                        from { opacity: 0; transform: translateY(8px) scale(0.95); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    @keyframes rm-stepSlide {
                        from { opacity: 0; transform: translateX(-12px); }
                        to { opacity: 1; transform: translateX(0); }
                    }
                `}</style>
            </div>
        </div>
    );
};

export default RecipeModal;
