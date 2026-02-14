// web/src/components/RecipeModal.jsx
// =============================================================================
// RecipeModal — Full-screen recipe detail overlay
//
// DARK MODE: All colors are now theme-aware via useTheme().
//
// FIX: Ingredient field mapping corrected to match backend data structure:
//   item.key  → ingredient name (NOT item.name / item.ingredient)
//   item.qty  → numeric quantity (NOT item.quantity / item.amount)
//   item.unit → unit string like "g", "ml" etc.
//
// FIXES APPLIED:
// 1. z-index raised to 9999 — above Header (1020), BottomNav (1030),
//    SettingsPanel (1050), ProductDetailModal (1001), and log bar (100).
// 2. Overlay uses position:fixed inset:0 and the modal fills 100% of
//    that container. No maxHeight:90vh, no alignItems:flex-end.
//    On desktop (>=672 px) the modal is inset with margin/padding and
//    border-radius via an injected <style> tag using 100dvh with vh fallback.
// 3. Body scroll is locked with the iOS-safe position:fixed technique
//    and restored (including scroll position) on unmount.
// 4. The header (with the X button) is flexShrink:0 and pinned at the
//    top of a flex column; the scrollable body uses flex:1 + minHeight:0
//    so overflow is always confined to the content area.
// 5. A 3px colored top-border, box-shadow ring, and subtle background
//    tint give the modal clear visual separation from the backdrop.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { X, ListChecks, ListOrdered } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const MODAL_Z = 9999; // Above everything in the app

const RecipeModal = ({ meal, onClose }) => {
    const { isDark } = useTheme();
    const scrollRef = useRef(null);

    // ── Robust body scroll lock (iOS-safe) + inject dvh helper CSS ──
    useEffect(() => {
        if (!meal) return;

        // Save current state
        const scrollY = window.scrollY;
        const orig = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            width: document.body.style.width,
            top: document.body.style.top,
            height: document.body.style.height,
        };

        // Lock body
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
        document.body.style.height = '100%';

        // Inject dynamic-viewport-height helper CSS
        const id = 'recipe-modal-dvh-styles';
        let styleEl = document.getElementById(id);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = id;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            /* Full-viewport overlay — dvh with vh fallback */
            .rm-overlay {
                height: 100vh;
                height: 100dvh;
            }

            /* Mobile-first: modal fills the overlay entirely */
            .rm-container {
                height: 100%;
                width: 100%;
                max-width: 100%;
                border-radius: 0;
            }

            /* Desktop: centered card with breathing room */
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
            // Restore body
            document.body.style.overflow = orig.overflow;
            document.body.style.position = orig.position;
            document.body.style.width = orig.width;
            document.body.style.top = orig.top;
            document.body.style.height = orig.height;
            window.scrollTo(0, scrollY);

            // Clean up style tag
            const el = document.getElementById(id);
            if (el) el.remove();
        };
    }, [meal]);

    if (!meal) return null;

    // Close on backdrop click (not on the card itself)
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    // ── Theme tokens ──
    const t = {
        cardBg:          isDark ? '#1e2130' : '#ffffff',
        headerBg:        isDark ? '#1e2130' : '#ffffff',
        headerBorder:    isDark ? '#2d3148' : '#e5e7eb',
        titleColor:      isDark ? '#f0f1f5' : '#111827',
        closeBtnBg:      isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        closeBtnColor:   isDark ? '#d1d5db' : '#6b7280',
        bodyBg:          isDark ? '#181a24' : '#ffffff',
        descColor:       isDark ? '#d1d5db' : '#374151',
        sectionTitleClr: isDark ? '#f0f1f5' : '#111827',
        ingredientIconBg:isDark ? 'rgba(99,102,241,0.15)' : '#e0e7ff',
        stepsIconBg:     isDark ? 'rgba(16,185,129,0.15)' : '#d1fae5',
        stepsIconColor:  isDark ? '#34d399' : '#059669',
        ingredientBg:    isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb',
        ingredientBorder:isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
        ingredientText:  isDark ? '#e5e7eb' : '#374151',
        ingredientQty:   isDark ? '#a5b4fc' : '#6366f1',
        stepNumBg:       isDark ? 'rgba(16,185,129,0.15)' : '#d1fae5',
        stepNumColor:    isDark ? '#34d399' : '#047857',
        stepText:        isDark ? '#d1d5db' : '#374151',
    };

    // ── Extract ingredient display fields ──
    // Backend shape: { key: "chicken breast", qty: 200, unit: "g", stateHint, methodHint }
    // Fallbacks cover alternative shapes (name/ingredient, quantity/amount)
    const getIngredientName = (item) => {
        if (typeof item === 'string') return item;
        return item.key || item.name || item.ingredient || '';
    };

    const getIngredientQty = (item) => {
        if (typeof item !== 'object') return '';
        const val = item.qty ?? item.qty_value ?? item.quantity ?? item.amount ?? '';
        const unit = item.unit ?? item.qty_unit ?? '';
        if (val === '' && unit === '') return '';
        return `${val}${unit}`;
    };

    return (
        /* ── BACKDROP ── */
        <div
            className="rm-overlay"
            onClick={handleBackdropClick}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: MODAL_Z,
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0',
            }}
        >
            {/* ── MODAL CARD ── */}
            <div
                className="rm-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: t.cardBg,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    // Visual containment: colored top accent + ring shadow
                    borderTop: '3.5px solid #6366f1',
                    boxShadow: isDark
                        ? '0 0 0 1px rgba(99,102,241,0.15), 0 24px 48px -12px rgba(0,0,0,0.6)'
                        : '0 0 0 1px rgba(99,102,241,0.12), 0 24px 48px -12px rgba(0,0,0,0.3)',
                }}
            >
                {/* ── HEADER (pinned, never scrolls) ── */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '1rem 1.25rem',
                        paddingTop:
                            'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))',
                        borderBottom: `1px solid ${t.headerBorder}`,
                        backgroundColor: t.headerBg,
                        flexShrink: 0,
                        minHeight: '64px',
                        zIndex: 2,
                    }}
                >
                    {/* Title */}
                    <h3
                        style={{
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            color: t.titleColor,
                            margin: 0,
                            lineHeight: 1.3,
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {meal.meal_name || meal.name || 'Recipe'}
                    </h3>

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: t.closeBtnBg,
                            color: t.closeBtnColor,
                            flexShrink: 0,
                            transition: 'background 0.15s',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* ── SCROLLABLE BODY ── */}
                <div
                    ref={scrollRef}
                    style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        padding: '1.25rem',
                        background: t.bodyBg,
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    {/* Description */}
                    {meal.description && (
                        <div style={{ marginBottom: '2rem' }}>
                            <p
                                style={{
                                    color: t.descColor,
                                    fontSize: '1rem',
                                    lineHeight: '1.625',
                                    margin: 0,
                                }}
                            >
                                {meal.description}
                            </p>
                        </div>
                    )}

                    {/* Ingredients */}
                    {meal.items && meal.items.length > 0 && (
                        <div style={{ marginBottom: '2rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '1rem',
                                }}
                            >
                                <div
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        backgroundColor: t.ingredientIconBg,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <ListChecks size={20} color="#4f46e5" />
                                </div>
                                <h4
                                    style={{
                                        fontSize: '1.25rem',
                                        fontWeight: 700,
                                        color: t.sectionTitleClr,
                                        margin: 0,
                                    }}
                                >
                                    Ingredients
                                </h4>
                            </div>

                            <ul
                                style={{
                                    listStyle: 'none',
                                    padding: 0,
                                    margin: 0,
                                }}
                            >
                                {meal.items.map((item, index) => {
                                    const name = getIngredientName(item);
                                    const qty = getIngredientQty(item);
                                    return (
                                        <li
                                            key={index}
                                            style={{
                                                padding: '0.625rem 0.75rem',
                                                borderRadius: '8px',
                                                backgroundColor:
                                                    index % 2 === 0
                                                        ? t.ingredientBg
                                                        : 'transparent',
                                                borderBottom: `1px solid ${t.ingredientBorder}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                            }}
                                        >
                                            {qty && (
                                                <span
                                                    style={{
                                                        fontWeight: 600,
                                                        color: t.ingredientQty,
                                                        fontSize: '0.875rem',
                                                        minWidth: '60px',
                                                    }}
                                                >
                                                    {qty}
                                                </span>
                                            )}
                                            <span
                                                style={{
                                                    color: t.ingredientText,
                                                    fontSize: '0.95rem',
                                                    lineHeight: 1.4,
                                                }}
                                            >
                                                {name}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {/* Instructions */}
                    {meal.instructions && meal.instructions.length > 0 && (
                        <div style={{ marginBottom: '2rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    marginBottom: '1rem',
                                }}
                            >
                                <div
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        backgroundColor: t.stepsIconBg,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <ListOrdered size={20} color={t.stepsIconColor} />
                                </div>
                                <h4
                                    style={{
                                        fontSize: '1.25rem',
                                        fontWeight: 700,
                                        color: t.sectionTitleClr,
                                        margin: 0,
                                    }}
                                >
                                    Instructions
                                </h4>
                            </div>
                            <ol
                                style={{
                                    listStyle: 'none',
                                    padding: 0,
                                    margin: 0,
                                }}
                            >
                                {meal.instructions.map((step, index) => (
                                    <li
                                        key={index}
                                        style={{
                                            display: 'flex',
                                            gap: '1rem',
                                            marginBottom: '1rem',
                                            color: t.stepText,
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                backgroundColor: t.stepNumBg,
                                                color: t.stepNumColor,
                                                fontWeight: 700,
                                                fontSize: '0.875rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {index + 1}
                                        </span>
                                        <span
                                            style={{
                                                flex: 1,
                                                fontSize: '1rem',
                                                lineHeight: '1.625',
                                                paddingTop: '0.125rem',
                                            }}
                                        >
                                            {step}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* Bottom safe-area spacer */}
                    <div
                        style={{
                            height: '2rem',
                            paddingBottom: 'env(safe-area-inset-bottom)',
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default RecipeModal;