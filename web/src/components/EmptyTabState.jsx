// web/src/components/EmptyTabState.jsx
// ============================================================================
// EmptyTabState — Polished empty-state card for Meals & Shopping tabs
// when no plan has been generated yet.
//
// Replaces the old plain-text "Generate a plan to view {contentView}. )}"
// block that had a stray `)}`  rendering in the UI.
// ============================================================================

import React from 'react';
import { Utensils, ShoppingCart, Sparkles } from 'lucide-react';
import { COLORS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

const TAB_META = {
    meals: {
        Icon: Utensils,
        title: 'No meals yet',
        description: 'Generate a plan to see your personalised meals for each day.',
        accentFrom: '#6366f1',
        accentTo: '#8b5cf6',
    },
    ingredients: {
        Icon: ShoppingCart,
        title: 'No shopping list yet',
        description: 'Generate a plan to view your ingredients and estimated costs.',
        accentFrom: '#6366f1',
        accentTo: '#a78bfa',
    },
};

const EmptyTabState = ({ tab = 'meals' }) => {
    const { isDark } = useTheme();
    const meta = TAB_META[tab] || TAB_META.meals;
    const { Icon, title, description, accentFrom, accentTo } = meta;

    // Theme-derived tokens
    const cardBg = isDark ? '#1e2130' : '#f9fafb';
    const cardBorder = isDark ? '1px solid #2d3148' : '1px solid #e5e7eb';
    const titleColor = isDark ? '#f0f1f5' : COLORS.gray[800];
    const descColor = isDark ? '#9ca3b0' : COLORS.gray[500];
    const iconBubbleBg = isDark
        ? 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.10))'
        : 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))';
    const sparkleColor = isDark ? '#6366f1' : COLORS.gray[400];

    return (
        <div
            className="flex flex-col items-center justify-center py-16 px-6 select-none"
            style={{ minHeight: 260 }}
        >
            {/* Icon bubble */}
            <div
                className="relative flex items-center justify-center rounded-2xl mb-5 empty-state-icon-breathe"
                style={{
                    width: 72,
                    height: 72,
                    background: iconBubbleBg,
                    boxShadow: isDark
                        ? '0 0 24px rgba(99,102,241,0.08)'
                        : '0 0 20px rgba(99,102,241,0.06)',
                }}
            >
                <Icon
                    size={32}
                    strokeWidth={1.6}
                    style={{
                        color: accentFrom,
                        filter: `drop-shadow(0 2px 6px ${accentFrom}33)`,
                    }}
                />

                {/* Decorative sparkle */}
                <Sparkles
                    size={14}
                    strokeWidth={2}
                    className="absolute -top-1 -right-1"
                    style={{ color: sparkleColor, opacity: 0.55 }}
                />
            </div>

            {/* Title */}
            <h3
                className="text-base font-semibold mb-1.5 tracking-tight"
                style={{ color: titleColor }}
            >
                {title}
            </h3>

            {/* Description */}
            <p
                className="text-sm text-center max-w-xs leading-relaxed"
                style={{ color: descColor }}
            >
                {description}
            </p>
        </div>
    );
};

export default EmptyTabState;