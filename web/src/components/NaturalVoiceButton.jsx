// web/src/components/NaturalVoiceButton.jsx
// =============================================================================
// NaturalVoiceButton — Cheffy Voice Cooking v3.0 (Phase 6)
//
// Drop-in replacement for VoiceCookingButton.
// Phase 6 additions:
//   - Optional "Hey Cheffy" wake word toggle
//   - Wake word state indicator (listening / idle)
//   - Passes wake word config down to overlay
//
// Usage:
//   <NaturalVoiceButton meal={meal} />
//   <NaturalVoiceButton meal={meal} enableWakeWord />
// =============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, Ear, EarOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import NaturalVoiceOverlay, { isNaturalVoiceSupported } from './NaturalVoiceOverlay';
import { WakeWordDetector, isWakeWordSupported, WAKE_STATE } from '../utils/wakeWordDetector';

const NaturalVoiceButton = ({ meal, enableWakeWord = false }) => {
    const { isDark } = useTheme();
    const [showOverlay, setShowOverlay] = useState(false);
    const [wakeActive, setWakeActive] = useState(false);
    const [wakeState, setWakeState] = useState('idle');
    const detectorRef = useRef(null);

    // Don't render if not supported or no instructions
    if (!isNaturalVoiceSupported() || !meal?.instructions?.length) {
        return null;
    }

    const canWake = enableWakeWord && isWakeWordSupported();

    // --- Wake word lifecycle ---
    const startWakeWord = useCallback(async () => {
        if (detectorRef.current) return;

        const detector = new WakeWordDetector({
            sensitivity: 0.6,
            onWakeWord: () => {
                // Auto-open overlay
                setShowOverlay(true);
                // Pause detection while overlay is open
                detectorRef.current?.pause();
            },
            onStateChange: (state) => setWakeState(state),
            onError: (err) => {
                console.warn('[NaturalVoiceButton] Wake word error:', err);
                if (err.fatal) {
                    setWakeActive(false);
                    setWakeState('error');
                }
            },
        });

        detectorRef.current = detector;
        await detector.start();
        setWakeActive(true);
    }, []);

    const stopWakeWord = useCallback(() => {
        detectorRef.current?.destroy();
        detectorRef.current = null;
        setWakeActive(false);
        setWakeState('idle');
    }, []);

    const toggleWakeWord = useCallback(async () => {
        if (wakeActive) {
            stopWakeWord();
        } else {
            await startWakeWord();
        }
    }, [wakeActive, startWakeWord, stopWakeWord]);

    // Resume wake word when overlay closes
    const handleOverlayClose = useCallback(() => {
        setShowOverlay(false);
        if (wakeActive && detectorRef.current) {
            detectorRef.current.resume();
        }
    }, [wakeActive]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            detectorRef.current?.destroy();
            detectorRef.current = null;
        };
    }, []);

    // --- Styles ---
    const btnBg = isDark
        ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))'
        : 'linear-gradient(135deg, #eef2ff, #f5f3ff)';
    const btnBorder = isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)';
    const btnText = isDark ? '#a5b4fc' : '#4f46e5';

    const wakeBtnBg = wakeActive
        ? (isDark ? 'rgba(74,222,128,0.15)' : 'rgba(34,197,94,0.08)')
        : (isDark ? 'rgba(100,116,139,0.15)' : 'rgba(148,163,184,0.08)');
    const wakeBtnColor = wakeActive
        ? (isDark ? '#4ade80' : '#16a34a')
        : (isDark ? '#64748b' : '#94a3b8');

    return (
        <>
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                {/* Main voice cooking button */}
                <button
                    onClick={() => setShowOverlay(true)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 18px', borderRadius: '12px',
                        border: `1.5px solid ${btnBorder}`,
                        background: btnBg, color: btnText,
                        fontSize: '0.875rem', fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                        flex: 1, justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.2)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    <Mic size={18} />
                    <span>🗣️ Natural Voice Cooking</span>
                </button>

                {/* Wake word toggle (only if enabled) */}
                {canWake && (
                    <button
                        onClick={toggleWakeWord}
                        title={wakeActive ? 'Disable "Hey Cheffy" wake word' : 'Enable "Hey Cheffy" wake word'}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '44px', borderRadius: '12px',
                            border: `1.5px solid ${wakeActive ? (isDark ? 'rgba(74,222,128,0.3)' : 'rgba(34,197,94,0.2)') : btnBorder}`,
                            background: wakeBtnBg, color: wakeBtnColor,
                            cursor: 'pointer', transition: 'all 0.15s ease',
                            position: 'relative',
                        }}
                    >
                        {wakeActive ? <Ear size={18} /> : <EarOff size={18} />}
                        {/* Pulse dot when actively listening */}
                        {wakeState === 'listening' && (
                            <span style={{
                                position: 'absolute', top: '6px', right: '6px',
                                width: '6px', height: '6px', borderRadius: '50%',
                                background: '#4ade80',
                                animation: 'wkPulse 1.5s ease-in-out infinite',
                            }} />
                        )}
                    </button>
                )}
            </div>

            {/* Wake word pulse animation */}
            {canWake && <style>{`@keyframes wkPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>}

            {showOverlay && (
                <NaturalVoiceOverlay
                    meal={meal}
                    onClose={handleOverlayClose}
                />
            )}
        </>
    );
};

export default NaturalVoiceButton;
