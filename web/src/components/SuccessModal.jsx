// web/src/components/SuccessModal.jsx
// =============================================================================
// SuccessModal – Persistent modal shown after plan generation.
//
// BEHAVIOUR:
// 1. The modal is persistent: clicking outside does NOT close it.
// 2. The only way to dismiss is to enter a valid plan name AND click
//    “View My Plan”. There is no X/close button.
// 3. While visible, background scrolling is fully locked using the
//    iOS-safe position:fixed technique (same as RecipeModal).
// 4. The backdrop blocks all interaction with elements underneath.
// 5. autoDismiss is disabled – the modal stays until the user acts.
// 6. Double-submission is prevented with an isSubmitting guard.
//
// PROPS (changed):
// - onViewPlan(planName: string) – now receives the trimmed plan name.
//   MainApp should save the plan with this name, then navigate.
// - onClose – still accepted but ONLY called programmatically after
//   successful submission (never by user click or timer).
// =============================================================================

import React, { useEffect, useState, useRef, useCallback } from ‘react’;
import { CheckCircle, ChevronRight, Loader } from ‘lucide-react’;
import { COLORS, Z_INDEX, SHADOWS } from ‘../constants’;
import { useTheme } from ‘../contexts/ThemeContext’;

const SuccessModal = ({
isVisible,
title = ‘Success!’,
message,
stats = [],
onClose,
onViewPlan,
// Legacy props kept for API compat but effectively unused:
autoDismiss = false,
dismissDelay = 0,
}) => {
const { isDark } = useTheme();

```
// ── Plan Name State ──
const [planName, setPlanName] = useState('');
const [nameError, setNameError] = useState('');
const [isSubmitting, setIsSubmitting] = useState(false);
const inputRef = useRef(null);

// ── Scroll-lock bookkeeping ──
const scrollYRef = useRef(0);

// ── Reset internal state every time the modal opens ──
useEffect(() => {
    if (isVisible) {
        setPlanName('');
        setNameError('');
        setIsSubmitting(false);
        // Focus input after the entrance animation settles
        const timer = setTimeout(() => inputRef.current?.focus(), 350);
        return () => clearTimeout(timer);
    }
}, [isVisible]);

// ── Body scroll lock (iOS-safe position:fixed technique) ──
useEffect(() => {
    if (!isVisible) return;

    // Save current scroll so we can restore it on unmount
    scrollYRef.current = window.scrollY;

    const scrollY = scrollYRef.current;
    const body = document.body;
    const html = document.documentElement;

    // Lock
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
        // Unlock
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.overflow = '';
        html.style.overflow = '';
        window.scrollTo(0, scrollY);
    };
}, [isVisible]);

// ── Derived state ──
const trimmedName = planName.trim();
const isNameValid = trimmedName.length > 0;

// ── Handlers ──
const handleNameChange = useCallback((e) => {
    setPlanName(e.target.value);
    setNameError('');
}, []);

const handleViewPlan = useCallback(async () => {
    if (!isNameValid) {
        setNameError('Please enter a plan name to continue.');
        inputRef.current?.focus();
        return;
    }
    if (isSubmitting) return; // guard against double-click

    setIsSubmitting(true);
    try {
        if (onViewPlan) {
            await onViewPlan(trimmedName);
        }
        // onClose is called by MainApp after onViewPlan succeeds
    } catch (err) {
        console.error('[SuccessModal] onViewPlan error:', err);
        setNameError('Something went wrong. Please try again.');
        setIsSubmitting(false);
    }
}, [isNameValid, isSubmitting, trimmedName, onViewPlan]);

const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && isNameValid && !isSubmitting) {
        handleViewPlan();
    }
}, [isNameValid, isSubmitting, handleViewPlan]);

// ── Early return ──
if (!isVisible) return null;

// ── Theme-derived tokens ──
const modalBg        = isDark ? '#1e2130' : '#ffffff';
const modalBorder    = isDark ? '1px solid #2d3148' : 'none';
const titleColor     = isDark ? '#f0f1f5' : COLORS.gray[900];
const messageColor   = isDark ? '#9ca3b0' : COLORS.gray[600];
const labelColor     = isDark ? '#d1d5db' : COLORS.gray[700];
const inputBg        = isDark ? '#252839' : '#ffffff';
const inputBorder    = nameError
    ? (COLORS.error?.main || '#ef4444')
    : isDark ? '#2d3148' : COLORS.gray[300];
const inputFocusBorder = isDark ? '#6366f1' : COLORS.primary[500];
const inputFocusRing   = isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)';
const inputColor     = isDark ? '#f0f1f5' : COLORS.gray[900];
const errorColor     = COLORS.error?.main || '#ef4444';
const statBg         = isDark ? '#252839' : COLORS.gray[50];
const statBorder     = isDark ? '#2d3148' : COLORS.gray[200];
const statLabel      = isDark ? '#9ca3b0' : COLORS.gray[600];
const successIconBg  = isDark ? 'rgba(16,185,129,0.15)' : (COLORS.success?.light || '#d1fae5');
const backdropBg     = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.6)';

const btnEnabled     = isNameValid && !isSubmitting;
const btnBg          = btnEnabled ? COLORS.primary[500] : (isDark ? '#2d3148' : COLORS.gray[200]);
const btnColor       = btnEnabled ? '#ffffff' : (isDark ? '#6b7280' : COLORS.gray[400]);
const btnCursor      = btnEnabled ? 'pointer' : 'not-allowed';

return (
    <>
        {/* ── Backdrop: blocks ALL interaction, no onClick dismiss ── */}
        <div
            className="fixed inset-0"
            style={{
                zIndex: Z_INDEX.modal,
                backgroundColor: backdropBg,
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
            }}
            aria-hidden="true"
        />

        {/* ── Modal container: centred, no click-outside handler ── */}
        <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: Z_INDEX.modal + 1 }}
            // Intentionally NO onClick -- the modal cannot be dismissed by
            // clicking outside. Only the "View My Plan" button closes it.
        >
            <div
                className="rounded-2xl w-full max-w-md animate-bounceIn"
                role="dialog"
                aria-modal="true"
                aria-label="Name your plan"
                style={{
                    backgroundColor: modalBg,
                    border: modalBorder,
                    boxShadow: SHADOWS['2xl'],
                    // Ensure the card never exceeds viewport
                    maxHeight: 'calc(100vh - 2rem)',
                    overflowY: 'auto',
                }}
            >
                <div className="p-8">
                    {/* ── Success Icon ── */}
                    <div className="flex justify-center mb-6">
                        <div
                            className="w-20 h-20 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: successIconBg }}
                        >
                            <CheckCircle
                                size={40}
                                style={{ color: COLORS.success?.main || '#10b981' }}
                            />
                        </div>
                    </div>

                    {/* ── Title ── */}
                    <h3
                        className="text-2xl font-bold text-center mb-2"
                        style={{ color: titleColor }}
                    >
                        {title}
                    </h3>

                    {/* ── Message ── */}
                    {message && (
                        <p
                            className="text-center text-sm mb-6"
                            style={{ color: messageColor }}
                        >
                            {message}
                        </p>
                    )}

                    {/* ── Stats Grid ── */}
                    {stats.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {stats.map((stat, index) => (
                                <div
                                    key={index}
                                    className="p-4 rounded-lg text-center"
                                    style={{
                                        backgroundColor: statBg,
                                        border: `1px solid ${statBorder}`,
                                    }}
                                >
                                    <p
                                        className="text-2xl font-bold mb-1"
                                        style={{ color: stat.color || COLORS.primary[600] }}
                                    >
                                        {stat.value}
                                    </p>
                                    <p className="text-xs" style={{ color: statLabel }}>
                                        {stat.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Mandatory Plan Name Input ── */}
                    <div className="mb-5">
                        <label
                            htmlFor="plan-name-input"
                            className="block text-sm font-medium mb-1.5"
                            style={{ color: labelColor }}
                        >
                            Plan Name
                        </label>
                        <input
                            id="plan-name-input"
                            ref={inputRef}
                            type="text"
                            value={planName}
                            onChange={handleNameChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter plan name"
                            maxLength={80}
                            disabled={isSubmitting}
                            autoComplete="off"
                            className="w-full px-4 py-2.5 rounded-lg text-sm transition-colors"
                            style={{
                                backgroundColor: inputBg,
                                border: `1px solid ${inputBorder}`,
                                color: inputColor,
                                outline: 'none',
                                opacity: isSubmitting ? 0.6 : 1,
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.borderColor = inputFocusBorder;
                                e.currentTarget.style.boxShadow = `0 0 0 3px ${inputFocusRing}`;
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.borderColor = nameError
                                    ? errorColor
                                    : (isDark ? '#2d3148' : COLORS.gray[300]);
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        />
                        {nameError && (
                            <p
                                className="text-xs mt-1.5"
                                style={{ color: errorColor }}
                                role="alert"
                            >
                                {nameError}
                            </p>
                        )}
                    </div>

                    {/* ── View Plan Button (disabled until name is valid) ── */}
                    <button
                        onClick={handleViewPlan}
                        disabled={!btnEnabled}
                        className="w-full flex items-center justify-center py-3 rounded-lg font-semibold transition-all"
                        style={{
                            backgroundColor: btnBg,
                            color: btnColor,
                            cursor: btnCursor,
                            opacity: isSubmitting ? 0.7 : 1,
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader size={18} className="mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                View My Plan
                                <ChevronRight size={20} className="ml-2" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    </>
);
```

};

export default SuccessModal;