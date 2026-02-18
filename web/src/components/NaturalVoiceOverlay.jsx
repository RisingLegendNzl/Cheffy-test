// web/src/components/NaturalVoiceOverlay.jsx
// =============================================================================
// NaturalVoiceOverlay — Cheffy Voice Cooking v3.0 (Phase 6)
//
// Full-screen conversational voice cooking companion overlay.
// Renders as a portal (escapes RecipeModal DOM tree).
//
// Phase 6 additions:
//   - Active timer display panel with live countdowns
//   - Language selector dropdown (30+ languages)
//   - Wake word state indicator
//   - TTS mode badge (stream vs queue)
//   - Proactive message visual indicators
//
// Preserved from v2.0:
//   - Live transcript + streaming assistant response
//   - Conversation history panel
//   - Visual state indicators (listening / thinking / speaking)
//   - Touch-friendly nav controls
//   - Interrupt-capable
//   - Ref-counted body scroll lock
//   - Theme-aware (dark/light mode)
// =============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Mic, MicOff, Volume2, Pause, Play,
    ChevronLeft, ChevronRight, AlertCircle, MessageCircle,
    ChevronDown, ChevronUp, Loader, Globe, Timer, Zap,
    Ear, Radio,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useNaturalVoice, isNaturalVoiceSupported, VOICE_STATE } from '../hooks/useNaturalVoice';
import { STT_LANGUAGES } from '../utils/streamingSTT';

const OVERLAY_Z = 10001;

// --- Ref-counted body scroll lock ---
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
        bg: 'rgba(15,15,20,0.97)',
        card: 'rgba(30,30,40,0.85)',
        cardBorder: 'rgba(255,255,255,0.06)',
        text: '#e2e8f0',
        textMuted: '#94a3b8',
        textDim: '#64748b',
        accent: '#818cf8',
        accentBg: 'rgba(129,140,248,0.12)',
        success: '#4ade80',
        warning: '#facc15',
        error: '#f87171',
        transcriptBg: 'rgba(30,41,59,0.7)',
        userBubble: 'rgba(99,102,241,0.15)',
        assistantBubble: 'rgba(30,30,40,0.6)',
        timerBg: 'rgba(250,204,21,0.08)',
        timerBorder: 'rgba(250,204,21,0.2)',
    } : {
        bg: 'rgba(248,250,252,0.97)',
        card: 'rgba(255,255,255,0.9)',
        cardBorder: 'rgba(0,0,0,0.06)',
        text: '#1e293b',
        textMuted: '#475569',
        textDim: '#94a3b8',
        accent: '#6366f1',
        accentBg: 'rgba(99,102,241,0.08)',
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
        transcriptBg: 'rgba(241,245,249,0.8)',
        userBubble: 'rgba(99,102,241,0.08)',
        assistantBubble: 'rgba(241,245,249,0.7)',
        timerBg: 'rgba(234,179,8,0.06)',
        timerBorder: 'rgba(234,179,8,0.2)',
    };
}

// --- Format seconds as mm:ss ---
function fmtTime(seconds) {
    if (seconds == null || seconds < 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// =============================================================================
// LANGUAGE PICKER (populated languages)
// =============================================================================

// Filter to commonly useful cooking languages (subset of STT_LANGUAGES)
const POPULAR_LANGUAGES = [
    'en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'pt-BR',
    'ja', 'ko', 'zh', 'hi', 'ru', 'tr', 'nl', 'pl', 'sv',
    'ar', 'th', 'vi', 'id',
];

function LanguagePicker({ currentLang, onSelect, theme }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('pointerdown', handler);
        return () => document.removeEventListener('pointerdown', handler);
    }, [open]);

    const currentLabel = STT_LANGUAGES[currentLang]?.label || 'English';

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', borderRadius: '8px',
                    border: `1px solid ${theme.cardBorder}`,
                    background: theme.card, color: theme.textMuted,
                    fontSize: '0.75rem', cursor: 'pointer',
                }}
                title="Change STT language"
            >
                <Globe size={13} />
                <span>{currentLabel}</span>
                <ChevronDown size={11} />
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 99,
                    marginTop: '4px', minWidth: '180px', maxHeight: '260px',
                    overflowY: 'auto', borderRadius: '10px',
                    border: `1px solid ${theme.cardBorder}`,
                    background: theme.bg, boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                }}>
                    {POPULAR_LANGUAGES.map((code) => {
                        const lang = STT_LANGUAGES[code];
                        if (!lang) return null;
                        const active = code === currentLang;
                        return (
                            <button
                                key={code}
                                onClick={() => { onSelect(code); setOpen(false); }}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '8px 14px', border: 'none', cursor: 'pointer',
                                    background: active ? theme.accentBg : 'transparent',
                                    color: active ? theme.accent : theme.text,
                                    fontSize: '0.8rem', fontWeight: active ? 600 : 400,
                                }}
                            >
                                {lang.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// TIMER PANEL
// =============================================================================

function TimerPanel({ timers, theme }) {
    if (!timers || timers.length === 0) return null;

    return (
        <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '8px',
            padding: '8px 12px', borderRadius: '10px',
            background: theme.timerBg, border: `1px solid ${theme.timerBorder}`,
        }}>
            {timers.map((t) => {
                const pct = t.totalSeconds > 0
                    ? Math.max(0, Math.min(100, ((t.totalSeconds - t.remainingSeconds) / t.totalSeconds) * 100))
                    : 100;
                const urgent = t.remainingSeconds <= 60;
                return (
                    <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px', borderRadius: '8px',
                        background: urgent ? 'rgba(239,68,68,0.1)' : 'rgba(250,204,21,0.06)',
                        border: `1px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'rgba(250,204,21,0.15)'}`,
                        fontSize: '0.75rem',
                    }}>
                        <Timer size={13} style={{ color: urgent ? theme.error : theme.warning }} />
                        <span style={{ color: theme.textMuted, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.label}
                        </span>
                        <span style={{
                            fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                            color: urgent ? theme.error : theme.warning,
                            minWidth: '42px', textAlign: 'right',
                        }}>
                            {t.isPaused ? '⏸' : fmtTime(t.remainingSeconds)}
                        </span>
                        {/* Tiny progress bar */}
                        <div style={{ width: '40px', height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '2px', background: urgent ? theme.error : theme.warning, transition: 'width 1s linear' }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// =============================================================================
// STATE INDICATOR
// =============================================================================

function StateIndicator({ voiceState, theme, sttProvider, ttsMode, wakeWordState }) {
    let icon, label, color, pulse;

    switch (voiceState) {
        case VOICE_STATE.GREETING:
            icon = <Volume2 size={20} />; label = 'Cheffy is saying hello…'; color = theme.accent; pulse = true;
            break;
        case VOICE_STATE.WAITING_FOR_READY:
            icon = <Mic size={20} />; label = 'Say "yes" when you\'re ready!'; color = theme.success; pulse = true;
            break;
        case VOICE_STATE.LISTENING:
            icon = <Mic size={20} />; label = 'Listening…'; color = theme.success; pulse = true;
            break;
        case VOICE_STATE.PROCESSING:
            icon = <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />;
            label = 'Thinking…'; color = theme.accent; pulse = false;
            break;
        case VOICE_STATE.SPEAKING:
            icon = <Volume2 size={20} />; label = 'Speaking…'; color = theme.accent; pulse = true;
            break;
        case VOICE_STATE.INTERRUPTED:
            icon = <Mic size={20} />; label = 'Interrupted'; color = theme.warning; pulse = false;
            break;
        case VOICE_STATE.PAUSED:
            icon = <Pause size={20} />; label = 'Paused'; color = theme.textDim; pulse = false;
            break;
        case VOICE_STATE.ERROR:
            icon = <AlertCircle size={20} />; label = 'Error'; color = theme.error; pulse = false;
            break;
        default:
            icon = <MicOff size={20} />; label = 'Idle'; color = theme.textDim; pulse = false;
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 40, height: 40, borderRadius: '50%',
                background: `${color}15`,
                boxShadow: pulse ? `0 0 0 6px ${color}10` : 'none',
                transition: 'all 0.3s ease',
                animation: pulse ? 'voicePulse 2s ease-in-out infinite' : 'none',
            }}>
                <span style={{ color }}>{icon}</span>
            </div>

            <div style={{ flex: 1 }}>
                <div style={{ color, fontWeight: 600, fontSize: '0.9rem' }}>{label}</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                    {/* STT provider badge */}
                    <span style={{ fontSize: '0.65rem', color: theme.textDim }}>
                        STT: {sttProvider === 'deepgram' ? '🟢 Deepgram' : '🟡 Web Speech'}
                    </span>
                    {/* TTS mode badge */}
                    <span style={{ fontSize: '0.65rem', color: theme.textDim }}>
                        TTS: {ttsMode === 'stream' ? '⚡ Stream' : '📦 Queue'}
                    </span>
                    {/* Wake word indicator */}
                    {wakeWordState === 'listening' && (
                        <span style={{ fontSize: '0.65rem', color: theme.success }}>
                            <Ear size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Wake
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// CONVERSATION HISTORY
// =============================================================================

function ConversationHistory({ log, theme, expanded, onToggle }) {
    const bottomRef = useRef(null);

    useEffect(() => {
        if (expanded && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [log.length, expanded]);

    if (log.length === 0) return null;

    return (
        <div style={{
            borderRadius: '12px', border: `1px solid ${theme.cardBorder}`,
            background: theme.card, overflow: 'hidden',
        }}>
            <button onClick={onToggle} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '10px 14px', border: 'none',
                background: 'transparent', color: theme.textMuted,
                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageCircle size={14} /> Conversation ({log.length})
                </span>
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {expanded && (
                <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '0 12px 10px 12px' }}>
                    {log.map((entry, i) => (
                        <div key={i} style={{
                            padding: '8px 12px', borderRadius: '10px', marginBottom: '6px',
                            background: entry.role === 'user' ? theme.userBubble : theme.assistantBubble,
                            fontSize: '0.8rem', color: theme.text, lineHeight: 1.45,
                        }}>
                            <span style={{ fontWeight: 600, fontSize: '0.7rem', color: theme.textDim, display: 'block', marginBottom: '2px' }}>
                                {entry.role === 'user' ? '🧑 You' : '👨‍🍳 Cheffy'}
                            </span>
                            {entry.content}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            )}
        </div>
    );
}

// =============================================================================
// MAIN OVERLAY
// =============================================================================

export { isNaturalVoiceSupported };

export default function NaturalVoiceOverlay({ meal, onClose }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    const steps = meal?.instructions || [];
    const ingredients = meal?.ingredients || [];
    const mealName = meal?.name || meal?.title || 'this recipe';

    const voice = useNaturalVoice({ mealName, steps, ingredients });
    const [historyExpanded, setHistoryExpanded] = useState(false);

    // Scroll lock
    useEffect(() => {
        acquireScrollLock();
        return () => releaseScrollLock();
    }, []);

    // Auto-start session on mount
    useEffect(() => {
        if (!voice.isActive) {
            voice.start();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Escape key closes
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') handleClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleClose = useCallback(() => {
        voice.stop();
        onClose?.();
    }, [voice, onClose]);

    // Progress — 0 during greeting/waiting
    const isPreLoop = voice.isGreeting || voice.isWaitingForReady;
    const progress = (steps.length > 0 && !isPreLoop)
        ? ((voice.currentStep + 1) / steps.length) * 100
        : 0;

    // --- Portal render ---
    return createPortal(
        <div style={{
            position: 'fixed', inset: 0, zIndex: OVERLAY_Z,
            background: theme.bg, display: 'flex', flexDirection: 'column',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            {/* === CSS Animations === */}
            <style>{`
                @keyframes voicePulse {
                    0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
                    50% { box-shadow: 0 0 0 10px transparent; opacity: 0.85; }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>

            {/* === HEADER === */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderBottom: `1px solid ${theme.cardBorder}`,
            }}>
                <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: theme.text }}>
                        👨‍🍳 Cheffy — Voice Cooking
                    </div>
                    <div style={{ fontSize: '0.75rem', color: theme.textMuted, marginTop: '2px' }}>
                        {mealName}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Language picker */}
                    <LanguagePicker
                        currentLang={voice.language}
                        onSelect={voice.setLanguage}
                        theme={theme}
                    />
                    {/* Close button */}
                    <button onClick={handleClose} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 36, height: 36, borderRadius: '50%',
                        border: `1px solid ${theme.cardBorder}`,
                        background: theme.card, color: theme.textMuted, cursor: 'pointer',
                    }}>
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* === PROGRESS BAR === */}
            <div style={{ height: '3px', background: theme.cardBorder, position: 'relative' }}>
                <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${progress}%`, background: theme.accent,
                    transition: 'width 0.3s ease', borderRadius: '0 3px 3px 0',
                }} />
            </div>

            {/* === MAIN CONTENT (scrollable) === */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

                {/* ── GREETING / WAITING: Welcome panel instead of step ── */}
                {(voice.isGreeting || voice.isWaitingForReady) ? (
                    <div style={{
                        padding: '24px 20px', borderRadius: '16px',
                        background: theme.card, border: `1px solid ${theme.cardBorder}`,
                        marginBottom: '12px', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>👨‍🍳</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: theme.text, marginBottom: '6px' }}>
                            {mealName}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: theme.textMuted, lineHeight: 1.5 }}>
                            {voice.isGreeting
                                ? 'Cheffy is getting ready…'
                                : 'Say "yes", "start", or "let\'s go" to begin!'}
                        </div>
                        <div style={{
                            marginTop: '12px', fontSize: '0.72rem', color: theme.textDim,
                            padding: '6px 12px', borderRadius: '8px',
                            background: theme.accentBg, display: 'inline-block',
                        }}>
                            {steps.length} steps
                        </div>
                    </div>
                ) : (
                    /* ── ACTIVE: Normal step display ── */
                    <div style={{
                        padding: '14px 16px', borderRadius: '12px',
                        background: theme.card, border: `1px solid ${theme.cardBorder}`,
                        marginBottom: '12px',
                    }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                            Step {voice.currentStep + 1} of {steps.length}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: theme.text, lineHeight: 1.5 }}>
                            {steps[voice.currentStep] || 'Waiting to begin...'}
                        </div>
                    </div>
                )}

                {/* Active Timers */}
                {voice.activeTimers?.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                        <TimerPanel timers={voice.activeTimers} theme={theme} />
                    </div>
                )}

                {/* State Indicator */}
                <div style={{ marginBottom: '12px' }}>
                    <StateIndicator
                        voiceState={voice.voiceState}
                        theme={theme}
                        sttProvider={voice.sttProvider}
                        ttsMode={voice.ttsMode}
                        wakeWordState={voice.wakeWordState}
                    />
                </div>

                {/* Live Transcript (partial) */}
                {voice.transcript && (
                    <div style={{
                        padding: '10px 14px', borderRadius: '10px',
                        background: theme.transcriptBg,
                        fontSize: '0.85rem', color: theme.textMuted,
                        fontStyle: 'italic', marginBottom: '10px',
                    }}>
                        🎤 {voice.transcript}
                    </div>
                )}

                {/* Streaming Assistant Response */}
                {voice.assistantText && (
                    <div style={{
                        padding: '10px 14px', borderRadius: '10px',
                        background: theme.assistantBubble,
                        border: `1px solid ${theme.cardBorder}`,
                        fontSize: '0.85rem', color: theme.text,
                        lineHeight: 1.5, marginBottom: '10px',
                    }}>
                        <span style={{ fontWeight: 600, fontSize: '0.7rem', color: theme.textDim }}>
                            👨‍🍳 Cheffy
                        </span>
                        <div style={{ marginTop: '4px' }}>
                            {voice.assistantText.replace(/\[ACTION:[A-Z_]+(?::\d+)?\]/g, '')}
                            {voice.isLLMStreaming && (
                                <span style={{ display: 'inline-block', width: '6px', height: '14px', background: theme.accent, marginLeft: '2px', animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
                            )}
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {voice.error && (
                    <div style={{
                        padding: '10px 14px', borderRadius: '10px',
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: theme.error, fontSize: '0.82rem',
                        marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                        <AlertCircle size={16} /> {voice.error}
                    </div>
                )}

                {/* Conversation History */}
                <ConversationHistory
                    log={voice.conversationLog}
                    theme={theme}
                    expanded={historyExpanded}
                    onToggle={() => setHistoryExpanded(!historyExpanded)}
                />
            </div>

            {/* === BOTTOM CONTROLS === */}
            <div style={{
                padding: '12px 16px', borderTop: `1px solid ${theme.cardBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                // Dim entire control bar during greeting/waiting
                opacity: (voice.isGreeting || voice.isWaitingForReady) ? 0.35 : 1,
                pointerEvents: (voice.isGreeting || voice.isWaitingForReady) ? 'none' : 'auto',
                transition: 'opacity 0.3s ease',
            }}>
                {/* Prev */}
                <button onClick={voice.prevStep} disabled={voice.currentStep <= 0} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 44, height: 44, borderRadius: '50%',
                    border: `1px solid ${theme.cardBorder}`,
                    background: theme.card, color: voice.currentStep <= 0 ? theme.textDim : theme.text,
                    cursor: voice.currentStep <= 0 ? 'not-allowed' : 'pointer',
                    opacity: voice.currentStep <= 0 ? 0.4 : 1,
                }}>
                    <ChevronLeft size={20} />
                </button>

                {/* Pause / Resume */}
                <button
                    onClick={voice.isPaused ? voice.resume : voice.pause}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 56, height: 56, borderRadius: '50%',
                        border: 'none', cursor: 'pointer',
                        background: voice.isPaused
                            ? `linear-gradient(135deg, ${theme.success}, #22c55e)`
                            : `linear-gradient(135deg, ${theme.accent}, #8b5cf6)`,
                        color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                    }}
                >
                    {voice.isPaused ? <Play size={24} /> : <Pause size={24} />}
                </button>

                {/* Next */}
                <button onClick={voice.nextStep} disabled={voice.currentStep >= steps.length - 1} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 44, height: 44, borderRadius: '50%',
                    border: `1px solid ${theme.cardBorder}`,
                    background: theme.card,
                    color: voice.currentStep >= steps.length - 1 ? theme.textDim : theme.text,
                    cursor: voice.currentStep >= steps.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: voice.currentStep >= steps.length - 1 ? 0.4 : 1,
                }}>
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Blink cursor animation */}
            <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
        </div>,
        document.body,
    );
}
