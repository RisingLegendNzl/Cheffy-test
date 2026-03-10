// web/src/components/voice/VoiceCookingPage.jsx
// =============================================================================
// VoiceCookingPage — Full-screen voice-guided cooking experience
//
// [FIX v2.1] All local imports include explicit .jsx extensions to prevent
// Rollup resolution failures on Vercel's case-sensitive Linux filesystem.
// macOS resolves ./ChefHatAnimated → ChefHatAnimated.jsx silently,
// but Linux does NOT.
//
// [FIX v2.2] Body scroll lock cleanup is now bulletproof:
//   - handleClose uses try/finally so onClose() ALWAYS fires even if
//     disconnect() throws or never resolves (with a 3s timeout).
//   - useEffect cleanup also resets documentElement overflow as a safety net.
//   - Prevents the "permanently un-scrollable app" bug.
//
// [FIX v3.0] Removed body scroll lock entirely for mobile compatibility.
//   - The component already uses position:fixed inset:0 as a full-screen
//     overlay, which naturally prevents interaction with content behind it.
//   - The previous body scroll lock (position:fixed + overflow:hidden on
//     document.body) was PREVENTING mobile users from scrolling WITHIN the
//     voice cooking page itself, because iOS/Android treat body-level
//     position:fixed + overflow:hidden as a global scroll kill.
//   - The internal scrollable container (overflowY:'auto' with
//     WebkitOverflowScrolling:'touch') now works correctly on mobile.
//   - Scroll position save/restore on close is handled via a ref instead
//     of body manipulation, so the user returns to their previous position
//     when voice cooking is dismissed.
//   - Desktop behavior is completely unchanged since the overlay already
//     covered the full viewport.
// =============================================================================

import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useElevenLabsConversation } from '../../hooks/useElevenLabsConversation.js';
import {
  DEMO_RECIPE,
  buildAgentSystemPrompt,
  buildFirstMessage,
} from '../../lib/recipe.js';
import { COOKING_VOICES, DEFAULT_VOICE_ID } from '../../lib/voiceConfig.js';

import ChefHatAnimated from './ChefHatAnimated.jsx';
import TranscriptPanel from './TranscriptPanel.jsx';

// ── Inline keyframes ──
const PAGE_KEYFRAMES = `
@keyframes vc-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes vc-slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes vc-btnPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
  50% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); }
}
@keyframes vc-dotBlink {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}
`;

// ── Icons (inline SVG to avoid extra imports) ──
const MicIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const XIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const PhoneOffIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </svg>
);

// ── Status badge ──
const StatusBadge = ({ status, isSpeaking, isDark }) => {
  const configs = {
    idle: { label: 'Ready to cook', color: isDark ? '#9ca3b0' : '#6b7280', dot: isDark ? '#4b5563' : '#9ca3af' },
    connecting: { label: 'Connecting…', color: isDark ? '#fbbf24' : '#d97706', dot: '#f59e0b' },
    connected: {
      label: isSpeaking ? 'Chef is speaking…' : 'Listening…',
      color: isDark ? '#34d399' : '#059669',
      dot: '#10b981',
    },
    error: { label: 'Connection lost', color: '#ef4444', dot: '#ef4444' },
  };
  const cfg = configs[status] || configs.idle;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 14px',
        borderRadius: '20px',
        background: isDark
          ? 'rgba(30, 33, 48, 0.7)' : 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${isDark ? '#2d3148' : '#e5e7eb'}`,
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: cfg.dot,
          boxShadow: status === 'connected' ? `0 0 8px ${cfg.dot}` : 'none',
          animation: status === 'connecting' ? 'vc-dotBlink 1.2s ease-in-out infinite' : 'none',
        }}
      />
      <span
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: cfg.color,
          letterSpacing: '0.02em',
        }}
      >
        {cfg.label}
      </span>
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================
const VoiceCookingPage = ({ meal: mealProp, onClose }) => {
  const { isDark } = useTheme();
  const meal = mealProp || DEMO_RECIPE;

  const [selectedVoiceId, setSelectedVoiceId] = useState(DEFAULT_VOICE_ID);

  const systemPrompt = useMemo(() => buildAgentSystemPrompt(meal), [meal]);
  const firstMessage = useMemo(() => buildFirstMessage(meal), [meal]);

  const {
    connect,
    disconnect,
    status,
    isSpeaking,
    transcript,
    error,
  } = useElevenLabsConversation({ systemPrompt, firstMessage, voiceId: selectedVoiceId });

  // [FIX v3.0] Save scroll position on mount so we can restore it on close.
  // NO body scroll lock — the fixed overlay already covers the viewport and
  // prevents interaction with background content. Locking body scroll was
  // killing mobile scroll entirely (including within this overlay).
  const savedScrollY = useRef(window.scrollY);

  useEffect(() => {
    savedScrollY.current = window.scrollY;

    return () => {
      // Safety net: if any other component left stale body styles, clean them.
      // This does NOT set them — it only clears residual state.
      const body = document.body;
      const html = document.documentElement;
      if (body.style.position === 'fixed' && !document.querySelector('[data-scroll-lock]')) {
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        body.style.overflow = '';
        body.style.height = '';
        html.style.overflow = '';
        window.scrollTo(0, savedScrollY.current);
      }
    };
  }, []);

  // [FIX v2.2] Bulletproof close handler — onClose() ALWAYS fires
  const handleClose = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') {
      try {
        // Race disconnect against a timeout so we never hang forever
        await Promise.race([
          disconnect(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // Swallow disconnect errors — closing the UI is more important
      }
    }
    onClose?.();
  }, [status, disconnect, onClose]);

  const handleStartCooking = useCallback(() => {
    connect();
  }, [connect]);

  const handleEndSession = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const handleTryAgain = useCallback(() => {
    connect();
  }, [connect]);

  // ── Theme tokens ──
  const bg = isDark
    ? 'linear-gradient(145deg, #0f1117 0%, #181a2e 40%, #1a1040 100%)'
    : 'linear-gradient(145deg, #f0f0ff 0%, #e8e0ff 40%, #dbeafe 100%)';
  const closeBtnBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const closeBtnColor = isDark ? '#9ca3b0' : '#6b7280';
  const titleColor = isDark ? '#f0f1f5' : '#111827';
  const subtitleColor = isDark ? '#6b7280' : '#9ca3af';

  const isIdle = status === 'idle';
  const isConnected = status === 'connected';
  const isError = status === 'error';
  const isConnecting = status === 'connecting';

  return (
    <>
      <style>{PAGE_KEYFRAMES}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: bg,
          display: 'flex',
          flexDirection: 'column',
          animation: 'vc-fadeIn 0.3s ease-out',
          // [FIX v3.0] The overlay itself is the scroll boundary.
          // overflow:hidden on the outer wrapper prevents background bleed,
          // while the inner scrollable div handles content scrolling.
          overflow: 'hidden',
        }}
      >
        {/* ── Top bar ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            flexShrink: 0,
          }}
        >
          <StatusBadge status={status} isSpeaking={isSpeaking} isDark={isDark} />
          <button
            onClick={handleClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: closeBtnBg,
              color: closeBtnColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s',
            }}
            aria-label="Close voice cooking"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            WebkitOverflowScrolling: 'touch',
            // [FIX v3.0] Ensure touch scrolling works on mobile and
            // scroll doesn't propagate to the body behind the overlay.
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >
          {/* Chef hat + title block */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '8px',
              paddingBottom: '4px',
              animation: 'vc-slideUp 0.5s ease-out',
            }}
          >
            <ChefHatAnimated isSpeaking={isSpeaking} status={status} />
            <h1
              style={{
                margin: '12px 0 0',
                fontSize: '1.4rem',
                fontWeight: 800,
                color: titleColor,
                textAlign: 'center',
                lineHeight: 1.2,
                fontFamily: "'Georgia', 'Times New Roman', serif",
              }}
            >
              Voice Cooking
            </h1>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '0.8rem',
                color: subtitleColor,
                textAlign: 'center',
              }}
            >
              Hands-free cooking guidance powered by AI
            </p>
          </div>

          {/* Voice selector — shown before session starts */}
          {(isIdle || isError) && (
            <div
              style={{
                animation: 'vc-slideUp 0.55s ease-out',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isDark ? '#6b7280' : '#9ca3af',
                }}
              >
                Chef Voice
              </span>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {COOKING_VOICES.map((voice) => {
                  const isSelected = selectedVoiceId === voice.voice_id;
                  return (
                    <button
                      key={voice.voice_id}
                      onClick={() => setSelectedVoiceId(voice.voice_id)}
                      title={voice.description}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: isSelected
                          ? '1.5px solid #6366f1'
                          : `1.5px solid ${isDark ? '#2d3148' : '#e5e7eb'}`,
                        background: isSelected
                          ? isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)'
                          : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                        color: isSelected
                          ? isDark ? '#a5b4fc' : '#4f46e5'
                          : isDark ? '#9ca3b0' : '#6b7280',
                        fontSize: '0.78rem',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {voice.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action button area */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              animation: 'vc-slideUp 0.6s ease-out',
            }}
          >
            {isIdle && (
              <button
                onClick={handleStartCooking}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 32px',
                  borderRadius: '16px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
                  animation: 'vc-btnPulse 2.5s ease-in-out infinite',
                  transition: 'transform 0.15s ease',
                }}
              >
                <MicIcon size={20} />
                Start Cooking
              </button>
            )}

            {isConnecting && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 32px',
                  borderRadius: '16px',
                  background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  color: isDark ? '#a5b4fc' : '#6366f1',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid currentColor',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'vc-dotBlink 0.8s linear infinite',
                  }}
                />
                Connecting…
              </div>
            )}

            {isConnected && (
              <button
                onClick={handleEndSession}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 24px',
                  borderRadius: '14px',
                  border: `1.5px solid ${isDark
                    ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)'}`,
                  background: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)',
                  color: '#ef4444',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <PhoneOffIcon size={16} />
                End Session
              </button>
            )}

            {isError && (
              <div style={{ textAlign: 'center' }}>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: '#ef4444',
                    marginBottom: '12px',
                    maxWidth: '300px',
                  }}
                >
                  {error || 'Something went wrong. Please check your microphone permissions.'}
                </p>
                <button
                  onClick={handleTryAgain}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 28px',
                    borderRadius: '14px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(99,102,241,0.25)',
                  }}
                >
                  <MicIcon size={18} />
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* Transcript */}
          {(isConnected || transcript.length > 0) && (
            <div style={{ animation: 'vc-slideUp 0.5s ease-out' }}>
              <TranscriptPanel
                transcript={transcript}
                isSpeaking={isSpeaking}
                isDark={isDark}
              />
            </div>
          )}

          {/* Bottom spacer for mobile safe area */}
          <div style={{ height: '24px', flexShrink: 0 }} />
        </div>
      </div>
    </>
  );
};

export default VoiceCookingPage;
