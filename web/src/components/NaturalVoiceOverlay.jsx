// web/src/components/NaturalVoiceOverlay.jsx
// =============================================================================
// NaturalVoiceOverlay — Full-screen conversational voice cooking companion
//
// Replaces VoiceCookingOverlay with the Natural Voice Mode experience.
// Uses useNaturalVoice hook for streaming STT → LLM → TTS loop.
//
// Features:
// - Live transcript display (partials + finals)
// - Streaming assistant response display
// - Conversation history panel
// - Visual state indicators (listening, thinking, speaking)
// - Touch-friendly navigation controls
// - Interrupt-capable (user can speak during TTS)
//
// DARK MODE: Theme-aware via useTheme()
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Mic, MicOff, Volume2, Pause, Play,
    ChevronLeft, ChevronRight, AlertCircle, MessageCircle,
    ChevronDown, ChevronUp, Loader, Wifi, WifiOff,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useNaturalVoice, isNaturalVoiceSupported, VOICE_STATE } from '../hooks/useNaturalVoice';

const OVERLAY_Z = 10001;

// --- Ref-counted body scroll lock (shared with other modals) ---
let scrollLockCount = 0;
let savedBodyStyles = null;

function acquireScrollLock() {
    if (scrollLockCount === 0) {
        savedBodyStyles = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            width: document.body.style.width,
            top: document.body.style.top,
        };
        const scrollY = window.scrollY;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.top = `-${scrollY}px`;
    }
    scrollLockCount++;
}

function releaseScrollLock() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0 && savedBodyStyles) {
        const scrollY = parseInt(document.body.style.top || '0', 10) * -1;
        Object.assign(document.body.style, savedBodyStyles);
        savedBodyStyles = null;
        window.scrollTo(0, scrollY);
    }
}

// --- Theme tokens ---
function getTheme(isDark) {
    return isDark ? {
        bg: '#0f0f14',
        cardBg: '#1a1a24',
        border: 'rgba(255,255,255,0.08)',
        textPrimary: '#f0f0f5',
        textSecondary: '#9ca3af',
        textMuted: '#6b7280',
        brandBg: 'rgba(99,102,241,0.15)',
        brandText: '#a5b4fc',
        activeBg: 'rgba(52,211,153,0.15)',
        activeText: '#6ee7b7',
        errorBg: 'rgba(239,68,68,0.15)',
        errorText: '#fca5a5',
        btnBg: 'rgba(255,255,255,0.06)',
        bubbleUser: 'rgba(99,102,241,0.2)',
        bubbleAssistant: 'rgba(255,255,255,0.06)',
        processingBg: 'rgba(251,191,36,0.15)',
        processingText: '#fcd34d',
    } : {
        bg: '#f8fafc',
        cardBg: '#ffffff',
        border: '#e5e7eb',
        textPrimary: '#111827',
        textSecondary: '#6b7280',
        textMuted: '#9ca3af',
        brandBg: '#eef2ff',
        brandText: '#4f46e5',
        activeBg: '#ecfdf5',
        activeText: '#059669',
        errorBg: '#fef2f2',
        errorText: '#dc2626',
        btnBg: '#f3f4f6',
        bubbleUser: '#eef2ff',
        bubbleAssistant: '#f9fafb',
        processingBg: '#fffbeb',
        processingText: '#d97706',
    };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const NaturalVoiceOverlay = ({ meal, onClose }) => {
    const { isDark } = useTheme();
    const t = getTheme(isDark);

    const mealName = meal?.name || meal?.title || 'this recipe';
    const steps = meal?.instructions || [];
    const ingredients = meal?.items || meal?.ingredients || [];

    const vc = useNaturalVoice({ mealName, steps, ingredients });

    const [showHistory, setShowHistory] = useState(false);
    const historyEndRef = useRef(null);
    const overlayRef = useRef(null);

    // Body scroll lock
    useEffect(() => {
        acquireScrollLock();
        return () => releaseScrollLock();
    }, []);

    // Auto-start session on mount
    useEffect(() => {
        vc.start();
        return () => vc.stop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Escape key to close
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') {
                vc.stop();
                onClose();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [vc, onClose]);

    // Auto-scroll conversation history
    useEffect(() => {
        if (showHistory) {
            historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [vc.conversationLog, showHistory]);

    // --- Status display ---
    const statusConfig = {
        [VOICE_STATE.IDLE]:        { icon: Mic,         label: 'Ready',       color: t.textMuted,       pulse: false, bg: t.btnBg },
        [VOICE_STATE.LISTENING]:   { icon: Mic,         label: 'Listening',   color: t.brandText,       pulse: true,  bg: t.brandBg },
        [VOICE_STATE.PROCESSING]:  { icon: Loader,      label: 'Thinking',    color: t.processingText,  pulse: true,  bg: t.processingBg },
        [VOICE_STATE.SPEAKING]:    { icon: Volume2,     label: 'Speaking',    color: t.activeText,      pulse: true,  bg: t.activeBg },
        [VOICE_STATE.INTERRUPTED]: { icon: Mic,         label: 'Heard you',   color: t.processingText,  pulse: false, bg: t.processingBg },
        [VOICE_STATE.PAUSED]:      { icon: Pause,       label: 'Paused',      color: t.textMuted,       pulse: false, bg: t.btnBg },
        [VOICE_STATE.ERROR]:       { icon: AlertCircle,  label: 'Error',       color: t.errorText,       pulse: false, bg: t.errorBg },
    };

    const status = statusConfig[vc.voiceState] || statusConfig[VOICE_STATE.IDLE];
    const StatusIcon = status.icon;

    // --- Progress ---
    const progress = steps.length > 0
        ? ((vc.currentStep + 1) / steps.length) * 100
        : 0;

    // --- Handle close ---
    const handleClose = () => {
        vc.stop();
        onClose();
    };

    // =======================================================================
    // RENDER
    // =======================================================================

    const overlayContent = (
        <div
            ref={overlayRef}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: OVERLAY_Z,
                backgroundColor: t.bg,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
            }}
        >
            {/* ── HEADER ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                paddingTop: 'max(12px, env(safe-area-inset-top, 12px))',
                borderBottom: `1px solid ${t.border}`,
                backgroundColor: t.cardBg,
                flexShrink: 0,
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{
                        fontSize: '1rem', fontWeight: 700, color: t.textPrimary,
                        margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        🎙️ Voice Cooking
                    </h2>
                    <p style={{
                        fontSize: '0.8rem', color: t.textSecondary, margin: 0,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {mealName}
                    </p>
                </div>

                {/* Status Badge */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '20px',
                    backgroundColor: status.bg, flexShrink: 0, marginRight: '12px',
                }}>
                    <StatusIcon
                        size={16}
                        color={status.color}
                        style={status.pulse ? { animation: 'nvPulse 1.5s ease-in-out infinite' } : {}}
                    />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: status.color }}>
                        {status.label}
                    </span>
                    {vc.sttProvider && (
                        <span style={{ fontSize: '0.6rem', color: t.textMuted, marginLeft: '4px' }}>
                            {vc.sttProvider === 'deepgram' ? '🟢' : '🟡'}
                        </span>
                    )}
                </div>

                <button
                    onClick={handleClose}
                    style={{
                        width: 36, height: 36, borderRadius: 10, border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', background: t.btnBg, color: t.textSecondary,
                        flexShrink: 0,
                    }}
                    aria-label="Close voice cooking"
                >
                    <X size={20} />
                </button>
            </div>

            {/* ── PROGRESS BAR ── */}
            <div style={{ height: '3px', backgroundColor: t.border, flexShrink: 0 }}>
                <div style={{
                    height: '100%', width: `${progress}%`,
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    transition: 'width 0.4s ease',
                }} />
            </div>

            {/* ── MAIN CONTENT ── */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                padding: '20px 16px', overflow: 'auto', gap: '16px',
            }}>
                {/* Step Counter */}
                <div style={{ textAlign: 'center' }}>
                    <span style={{
                        fontSize: '0.75rem', fontWeight: 600, color: t.brandText,
                        textTransform: 'uppercase', letterSpacing: '1px',
                    }}>
                        Step {vc.currentStep + 1} of {steps.length}
                    </span>
                </div>

                {/* Current Step Text */}
                <div style={{
                    backgroundColor: t.cardBg, borderRadius: '16px',
                    padding: '24px 20px', border: `1px solid ${t.border}`,
                    maxHeight: '35vh', overflow: 'auto',
                }}>
                    <p style={{
                        fontSize: '1.15rem', lineHeight: '1.7', color: t.textPrimary,
                        margin: 0, fontWeight: 400,
                    }}>
                        {steps[vc.currentStep] || 'No step available.'}
                    </p>
                </div>

                {/* Live Transcript / Assistant Response */}
                <div style={{
                    backgroundColor: t.cardBg, borderRadius: '12px',
                    padding: '14px 16px', border: `1px solid ${t.border}`,
                    minHeight: '60px',
                }}>
                    {vc.transcript && (
                        <div style={{ marginBottom: vc.assistantText ? '8px' : 0 }}>
                            <span style={{
                                fontSize: '0.7rem', fontWeight: 600, color: t.brandText,
                                textTransform: 'uppercase', letterSpacing: '0.5px',
                            }}>You</span>
                            <p style={{
                                fontSize: '0.9rem', color: t.textSecondary, margin: '4px 0 0',
                                fontStyle: 'italic',
                            }}>
                                {vc.transcript}
                            </p>
                        </div>
                    )}

                    {vc.assistantText && (
                        <div>
                            <span style={{
                                fontSize: '0.7rem', fontWeight: 600, color: t.activeText,
                                textTransform: 'uppercase', letterSpacing: '0.5px',
                            }}>Cheffy</span>
                            <p style={{
                                fontSize: '0.9rem', color: t.textPrimary, margin: '4px 0 0',
                            }}>
                                {vc.assistantText.replace(/\[ACTION:[A-Z_]+(?::\d+)?\]/g, '').trim()}
                                {vc.isLLMStreaming && (
                                    <span style={{ color: t.brandText, animation: 'nvBlink 1s infinite' }}>▊</span>
                                )}
                            </p>
                        </div>
                    )}

                    {!vc.transcript && !vc.assistantText && (
                        <p style={{
                            fontSize: '0.85rem', color: t.textMuted, margin: 0,
                            textAlign: 'center', fontStyle: 'italic',
                        }}>
                            {vc.isListening ? 'Listening... say anything!' :
                             vc.isSpeaking ? 'Speaking... interrupt me anytime!' :
                             vc.isProcessing ? 'Thinking...' :
                             vc.isPaused ? 'Paused — tap resume to continue' :
                             'Starting voice mode...'}
                        </p>
                    )}
                </div>

                {/* Error display */}
                {vc.error && (
                    <div style={{
                        backgroundColor: t.errorBg, borderRadius: '10px',
                        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                        <AlertCircle size={16} color={t.errorText} />
                        <span style={{ fontSize: '0.8rem', color: t.errorText }}>{vc.error}</span>
                    </div>
                )}

                {/* Conversation History (collapsible) */}
                {vc.conversationLog.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: t.textMuted, fontSize: '0.75rem', fontWeight: 600,
                                padding: '4px 0',
                            }}
                        >
                            <MessageCircle size={14} />
                            <span>Conversation ({vc.conversationLog.length})</span>
                            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {showHistory && (
                            <div style={{
                                maxHeight: '30vh', overflow: 'auto', marginTop: '8px',
                                display: 'flex', flexDirection: 'column', gap: '8px',
                            }}>
                                {vc.conversationLog.map((msg, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            padding: '8px 12px', borderRadius: '10px',
                                            backgroundColor: msg.role === 'user' ? t.bubbleUser : t.bubbleAssistant,
                                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                            maxWidth: '85%',
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: 600,
                                            color: msg.role === 'user' ? t.brandText : t.activeText,
                                            textTransform: 'uppercase',
                                        }}>
                                            {msg.role === 'user' ? 'You' : 'Cheffy'}
                                        </span>
                                        <p style={{
                                            fontSize: '0.8rem', color: t.textPrimary,
                                            margin: '2px 0 0', lineHeight: '1.4',
                                        }}>
                                            {msg.content}
                                        </p>
                                    </div>
                                ))}
                                <div ref={historyEndRef} />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── CONTROLS ── */}
            <div style={{
                padding: '12px 16px',
                paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
                borderTop: `1px solid ${t.border}`,
                backgroundColor: t.cardBg,
                display: 'flex', justifyContent: 'center', gap: '12px',
                flexShrink: 0,
            }}>
                {/* Previous */}
                <ControlButton
                    icon={ChevronLeft} label="Prev"
                    onClick={vc.prevStep}
                    disabled={vc.currentStep <= 0}
                    t={t}
                />

                {/* Pause / Resume */}
                <button
                    onClick={vc.isPaused ? vc.resume : vc.pause}
                    style={{
                        width: 56, height: 56, borderRadius: 16, border: 'none',
                        cursor: 'pointer', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 2,
                        background: vc.isPaused ? t.activeBg : t.brandBg,
                        color: vc.isPaused ? t.activeText : t.brandText,
                        transition: 'all 0.15s',
                    }}
                    aria-label={vc.isPaused ? 'Resume' : 'Pause'}
                >
                    {vc.isPaused ? <Play size={28} /> : <Pause size={28} />}
                </button>

                {/* Next */}
                <ControlButton
                    icon={ChevronRight} label="Next"
                    onClick={vc.nextStep}
                    disabled={vc.currentStep >= steps.length - 1}
                    t={t}
                />

                {/* Mic Status Indicator */}
                <ControlButton
                    icon={vc.micPermission === 'denied' ? MicOff : Mic}
                    label={vc.isListening ? 'On' : 'Mic'}
                    onClick={() => {}}
                    t={t}
                    highlight={vc.isListening}
                />
            </div>

            {/* ── ANIMATIONS ── */}
            <style>{`
                @keyframes nvPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
                @keyframes nvBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );

    return createPortal(overlayContent, document.body);
};

// --- Control Button ---
const ControlButton = ({ icon: Icon, label, onClick, disabled, t, highlight = false }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        style={{
            width: 44, height: 44, borderRadius: 12, border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            background: highlight ? t.activeBg : t.btnBg,
            color: highlight ? t.activeText : (disabled ? t.textMuted : t.textSecondary),
            opacity: disabled ? 0.4 : 1,
            transition: 'background 0.15s, opacity 0.15s',
        }}
        aria-label={label}
    >
        <Icon size={20} />
        <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{label}</span>
    </button>
);

export default NaturalVoiceOverlay;
export { isNaturalVoiceSupported };