// web/src/components/VoiceCookingOverlay.jsx
// =============================================================================
// VoiceCookingOverlay — Full-screen voice cooking companion
//
// [FIX] v1.1.0 — Navigation freeze resolved:
//   1. Renders via createPortal(…, document.body) so the overlay escapes
//      RecipeModal's DOM tree. Previously it was a direct child of
//      RecipeModal, meaning its position:fixed div and body scroll lock
//      fought with the parent modal's identical lock — corrupting
//      document.body styles on cleanup and leaving navigation frozen.
//   2. Body scroll lock now uses a ref-counted approach: it only restores
//      body styles if no other modal still holds a lock. This prevents
//      the race condition where VoiceCookingOverlay cleanup would undo
//      RecipeModal's scroll lock (and vice versa).
//   3. Escape key handler added for keyboard accessibility.
//
// Design:
// - Full viewport overlay (like RecipeModal)
// - Large, readable step text (kitchen-friendly)
// - Prominent voice status indicator (listening / speaking / paused)
// - Touch-friendly navigation buttons
// - Minimal distractions — focused on the current step
//
// DARK MODE: Theme-aware via useTheme()
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Mic, MicOff, Volume2, VolumeX, Pause, Play,
    ChevronLeft, ChevronRight, RotateCcw, AlertCircle,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useVoiceCooking, isVoiceCookingSupported } from '../hooks/useVoiceCooking';

const OVERLAY_Z = 10001; // Above RecipeModal (9999)

// ---------------------------------------------------------------------------
// [FIX] Ref-counted body scroll lock
// Multiple overlays (RecipeModal + VoiceCookingOverlay) can be open at once.
// We track how many locks are active so we only restore body styles when the
// LAST lock releases. This eliminates the cleanup race that froze navigation.
// ---------------------------------------------------------------------------
let scrollLockCount = 0;
let savedBodyStyles = null;
let savedScrollY = 0;

function acquireScrollLock() {
    if (scrollLockCount === 0) {
        savedScrollY = window.scrollY;
        savedBodyStyles = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            width: document.body.style.width,
            top: document.body.style.top,
        };
        document.body.style.position = 'fixed';
        document.body.style.top = `-${savedScrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
    }
    scrollLockCount += 1;
}

function releaseScrollLock() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0 && savedBodyStyles) {
        document.body.style.overflow = savedBodyStyles.overflow;
        document.body.style.position = savedBodyStyles.position;
        document.body.style.width = savedBodyStyles.width;
        document.body.style.top = savedBodyStyles.top;
        window.scrollTo(0, savedScrollY);
        savedBodyStyles = null;
    }
}

const VoiceCookingOverlay = ({ meal, onClose }) => {
    const { isDark } = useTheme();
    const scrollRef = useRef(null);

    const steps = meal?.instructions || [];
    const ingredients = meal?.items || [];
    const mealName = meal?.name || 'this recipe';

    const vc = useVoiceCooking({ steps, ingredients, mealName });

    // Auto-start on mount
    useEffect(() => {
        if (steps.length > 0) {
            // Small delay to let the overlay animate in
            const timer = setTimeout(() => vc.start(), 400);
            return () => clearTimeout(timer);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // [FIX] Ref-counted body scroll lock — safe with RecipeModal's lock
    useEffect(() => {
        acquireScrollLock();
        return () => releaseScrollLock();
    }, []);

    // [FIX] Escape key handler
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleClose = () => {
        vc.stop();
        onClose();
    };

    // --- Theme Tokens ---
    const t = {
        bg: isDark ? '#0f1117' : '#f9fafb',
        cardBg: isDark ? '#1e2130' : '#ffffff',
        border: isDark ? '#2d3148' : '#e5e7eb',
        textPrimary: isDark ? '#f0f1f5' : '#111827',
        textSecondary: isDark ? '#9ca3b0' : '#6b7280',
        textMuted: isDark ? '#6b7280' : '#9ca3af',
        brandBg: isDark ? 'rgba(99, 102, 241, 0.12)' : '#eef2ff',
        brandText: isDark ? '#a5b4fc' : '#4f46e5',
        activeBg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#d1fae5',
        activeText: isDark ? '#34d399' : '#059669',
        dangerBg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
        dangerText: isDark ? '#f87171' : '#dc2626',
        btnBg: isDark ? '#252839' : '#f3f4f6',
        btnHover: isDark ? '#2d3148' : '#e5e7eb',
        stepBg: isDark ? '#181a24' : '#ffffff',
        progressBg: isDark ? '#2d3148' : '#e5e7eb',
        progressFill: isDark ? '#818cf8' : '#6366f1',
    };

    // --- Status Indicator ---
    const statusConfig = {
        IDLE: { icon: VolumeX, label: 'Ready', color: t.textMuted, pulse: false },
        LOADING: { icon: Volume2, label: 'Starting...', color: t.brandText, pulse: true },
        SPEAKING: { icon: Volume2, label: 'Speaking', color: t.activeText, pulse: true },
        LISTENING: { icon: Mic, label: 'Listening', color: t.brandText, pulse: true },
        PAUSED: { icon: Pause, label: 'Paused', color: t.textSecondary, pulse: false },
    };
    const status = statusConfig[vc.state] || statusConfig.IDLE;
    const StatusIcon = status.icon;

    const progressPct = steps.length > 0
        ? ((vc.currentStep + 1) / steps.length) * 100
        : 0;

    // --- Overlay content (rendered via portal) ---
    const overlayContent = (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: OVERLAY_Z,
                backgroundColor: t.bg,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* ── HEADER ── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    paddingTop: 'max(12px, env(safe-area-inset-top, 12px))',
                    borderBottom: `1px solid ${t.border}`,
                    backgroundColor: t.cardBg,
                    flexShrink: 0,
                }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: t.textPrimary,
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        🎙️ Voice Cooking
                    </h2>
                    <p style={{
                        fontSize: '0.8rem',
                        color: t.textSecondary,
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {mealName}
                    </p>
                </div>

                {/* Status Badge */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    backgroundColor: status.pulse
                        ? (vc.isListening ? t.brandBg : t.activeBg)
                        : t.btnBg,
                    flexShrink: 0,
                    marginRight: '12px',
                }}>
                    <StatusIcon
                        size={16}
                        color={status.color}
                        style={status.pulse ? { animation: 'vcPulse 1.5s ease-in-out infinite' } : {}}
                    />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: status.color }}>
                        {status.label}
                    </span>
                </div>

                <button
                    onClick={handleClose}
                    style={{
                        width: 36, height: 36,
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: t.btnBg,
                        color: t.textSecondary,
                        flexShrink: 0,
                    }}
                    aria-label="Exit voice cooking"
                >
                    <X size={20} />
                </button>
            </div>

            {/* ── PROGRESS BAR ── */}
            <div style={{
                height: 4,
                backgroundColor: t.progressBg,
                flexShrink: 0,
            }}>
                <div style={{
                    height: '100%',
                    width: `${progressPct}%`,
                    backgroundColor: t.progressFill,
                    borderRadius: '0 2px 2px 0',
                    transition: 'width 0.3s ease',
                }} />
            </div>

            {/* ── MAIN CONTENT ── */}
            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '24px',
                }}
            >
                {/* Error Display */}
                {vc.error && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: t.dangerBg,
                        color: t.dangerText,
                        fontSize: '0.85rem',
                        maxWidth: '400px',
                        width: '100%',
                    }}>
                        <AlertCircle size={20} style={{ flexShrink: 0 }} />
                        <span>{vc.error}</span>
                    </div>
                )}

                {/* Step Counter */}
                <p style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: t.brandText,
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                }}>
                    Step {vc.currentStep + 1} of {steps.length}
                </p>

                {/* Step Text */}
                <div style={{
                    backgroundColor: t.stepBg,
                    border: `1px solid ${t.border}`,
                    borderRadius: '16px',
                    padding: '28px 24px',
                    maxWidth: '480px',
                    width: '100%',
                    textAlign: 'center',
                }}>
                    <p style={{
                        fontSize: '1.25rem',
                        lineHeight: 1.6,
                        color: t.textPrimary,
                        margin: 0,
                        fontWeight: 500,
                    }}>
                        {steps[vc.currentStep] || 'No step available.'}
                    </p>
                </div>

                {/* Transcript (when listening) */}
                {vc.isListening && vc.transcript && (
                    <p style={{
                        fontSize: '0.8rem',
                        color: t.textMuted,
                        fontStyle: 'italic',
                        margin: 0,
                    }}>
                        "{vc.transcript}"
                    </p>
                )}

                {/* Step dots */}
                {steps.length <= 20 && (
                    <div style={{
                        display: 'flex',
                        gap: '6px',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        maxWidth: '300px',
                    }}>
                        {steps.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => vc.goToStep(i)}
                                style={{
                                    width: i === vc.currentStep ? 28 : 10,
                                    height: 10,
                                    borderRadius: 5,
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: i === vc.currentStep
                                        ? t.progressFill
                                        : i < vc.currentStep
                                            ? (isDark ? '#4b5563' : '#d1d5db')
                                            : t.progressBg,
                                    transition: 'all 0.2s ease',
                                }}
                                aria-label={`Go to step ${i + 1}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── BOTTOM CONTROLS ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                padding: '16px 20px',
                paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
                borderTop: `1px solid ${t.border}`,
                backgroundColor: t.cardBg,
                flexShrink: 0,
            }}>
                {/* Previous */}
                <ControlButton
                    icon={ChevronLeft}
                    label="Previous"
                    onClick={vc.prevStep}
                    disabled={vc.currentStep === 0}
                    t={t}
                    size="md"
                />

                {/* Repeat */}
                <ControlButton
                    icon={RotateCcw}
                    label="Repeat"
                    onClick={() => vc.goToStep(vc.currentStep)}
                    t={t}
                    size="md"
                />

                {/* Play / Pause (Primary) */}
                <button
                    onClick={vc.pauseResume}
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: `linear-gradient(135deg, #6366f1, #8b5cf6)`,
                        color: '#ffffff',
                        boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    aria-label={vc.isPaused ? 'Resume' : 'Pause'}
                >
                    {vc.isPaused ? <Play size={28} /> : <Pause size={28} />}
                </button>

                {/* Next */}
                <ControlButton
                    icon={ChevronRight}
                    label="Next"
                    onClick={vc.nextStep}
                    disabled={vc.currentStep >= steps.length - 1}
                    t={t}
                    size="md"
                />

                {/* Mic indicator */}
                <ControlButton
                    icon={vc.micPermission === 'denied' ? MicOff : Mic}
                    label={vc.isListening ? 'On' : 'Mic'}
                    onClick={() => {}} // Informational only
                    t={t}
                    size="md"
                    highlight={vc.isListening}
                />
            </div>

            {/* ── ANIMATIONS ── */}
            <style>{`
                @keyframes vcPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );

    // [FIX] Portal to document.body — escapes RecipeModal's DOM tree
    // This prevents the overlay from being trapped inside the modal's
    // overflow:hidden container and eliminates body scroll lock conflicts.
    return createPortal(overlayContent, document.body);
};

// --- Control Button Sub-component ---
const ControlButton = ({ icon: Icon, label, onClick, disabled, t, size = 'md', highlight = false }) => {
    const dim = size === 'lg' ? 56 : 44;
    const iconSize = size === 'lg' ? 24 : 20;

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: dim,
                height: dim,
                borderRadius: 12,
                border: 'none',
                cursor: disabled ? 'default' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                background: highlight ? t.activeBg : t.btnBg,
                color: highlight ? t.activeText : (disabled ? t.textMuted : t.textSecondary),
                opacity: disabled ? 0.4 : 1,
                transition: 'background 0.15s, opacity 0.15s',
            }}
            aria-label={label}
        >
            <Icon size={iconSize} />
            <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{label}</span>
        </button>
    );
};

export default VoiceCookingOverlay;
export { isVoiceCookingSupported };