// web/src/components/voice/VoiceCookingPage.jsx
// =============================================================================
// VoiceCookingPage — Full-screen voice-guided cooking experience
//
// REVAMP v4.0: Kitchen Companion UI
//   - Large, glanceable step display for hands-free cooking
//   - Current step shown prominently with prev/next navigation
//   - Ingredient quick-reference panel
//   - Improved visual hierarchy for cooking situations
//   - Warm, kitchen-friendly color palette
//   - Better mobile scrolling and touch targets
//   - Humanized ingredient names throughout
//
// [FIX v3.0] Removed body scroll lock for mobile compatibility.
// [FIX v2.2] Bulletproof close handler.
// [FIX v2.1] Explicit .jsx extensions for Vercel Linux compat.
// =============================================================================

import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useElevenLabsConversation } from '../../hooks/useElevenLabsConversation.js';
import {
  DEMO_RECIPE,
  buildAgentSystemPrompt,
  buildFirstMessage,
} from '../../lib/recipe.js';
import { formatIngredientName, getIngredientEmoji } from '../../helpers/humanize.js';

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
  50% { box-shadow: 0 0 0 14px rgba(99, 102, 241, 0); }
}
@keyframes vc-dotBlink {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}
@keyframes vc-stepPop {
  0% { transform: scale(0.95); opacity: 0; }
  60% { transform: scale(1.02); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes vc-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
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

const ChevronLeftIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ── Status badge ──
const StatusBadge = ({ status, isSpeaking, isDark }) => {
  const configs = {
    idle: { label: 'Ready to cook', color: isDark ? '#9ca3b0' : '#6b7280', dot: isDark ? '#4b5563' : '#9ca3af' },
    connecting: { label: 'Connecting…', color: isDark ? '#fbbf24' : '#d97706', dot: '#f59e0b' },
    connected: {
      label: isSpeaking ? 'Cheffy is speaking…' : 'Listening…',
      color: isDark ? '#34d399' : '#059669',
      dot: '#10b981',
    },
    error: { label: 'Connection lost', color: '#ef4444', dot: '#ef4444' },
  };
  const cfg = configs[status] || configs.idle;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: '6px 14px', borderRadius: '20px',
      background: isDark ? 'rgba(30, 33, 48, 0.8)' : 'rgba(255,255,255,0.8)',
      backdropFilter: 'blur(8px)',
      border: `1px solid ${isDark ? '#2d3148' : '#e5e7eb'}`,
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        backgroundColor: cfg.dot,
        boxShadow: status === 'connected' ? `0 0 10px ${cfg.dot}` : 'none',
        animation: status === 'connecting' ? 'vc-dotBlink 1.2s ease-in-out infinite' : 'none',
      }} />
      <span style={{
        fontSize: '0.75rem', fontWeight: 600,
        color: cfg.color, letterSpacing: '0.02em',
      }}>
        {cfg.label}
      </span>
    </div>
  );
};

// ── Step action icon ──
const getStepIcon = (step) => {
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
  return '👨‍🍳';
};

// ═══════════════════════════════════════════════════════════════════════════
// CURRENT STEP CARD — Large, readable, designed for glancing while cooking
// ═══════════════════════════════════════════════════════════════════════════
const CurrentStepCard = ({ step, stepIndex, totalSteps, onPrev, onNext, isDark }) => {
  const icon = getStepIcon(step);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      key={stepIndex}
      style={{
        borderRadius: '20px',
        padding: '24px',
        background: isDark
          ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))'
          : 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))',
        border: `2px solid ${isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.15)'}`,
        position: 'relative',
        animation: 'vc-stepPop 0.35s ease-out',
        minHeight: '180px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Step header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>{icon}</span>
          <span style={{
            fontSize: '0.7rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: isDark ? '#818cf8' : '#6366f1',
          }}>
            Step {stepIndex + 1} of {totalSteps}
          </span>
        </div>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{
              width: i === stepIndex ? '16px' : '6px', height: '6px',
              borderRadius: '3px',
              background: i < stepIndex
                ? (isDark ? '#34d399' : '#10b981')
                : i === stepIndex
                ? (isDark ? '#818cf8' : '#6366f1')
                : (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'),
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>

      {/* Step text — LARGE for glanceability */}
      <p style={{
        fontSize: '1.15rem', lineHeight: 1.65, fontWeight: 500,
        color: isDark ? '#e2e5f0' : '#1e293b',
        flex: 1,
        margin: 0,
      }}>
        {step}
      </p>

      {/* Navigation arrows */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: '20px', gap: '12px',
      }}>
        <button
          onClick={onPrev}
          disabled={isFirst}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 18px', borderRadius: '12px',
            border: `1.5px solid ${isDark ? '#3d4158' : '#e2e8f0'}`,
            background: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
            color: isFirst
              ? (isDark ? '#4b5563' : '#cbd5e1')
              : (isDark ? '#d1d5db' : '#475569'),
            fontSize: '0.85rem', fontWeight: 600,
            cursor: isFirst ? 'not-allowed' : 'pointer',
            opacity: isFirst ? 0.4 : 1,
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
          }}
        >
          <ChevronLeftIcon size={18} />
          Prev
        </button>

        <span style={{
          fontSize: '0.75rem', fontWeight: 600,
          color: isDark ? '#6b7394' : '#94a3b8',
        }}>
          {isLast ? '🎉 Last step!' : `${totalSteps - stepIndex - 1} more to go`}
        </span>

        <button
          onClick={onNext}
          disabled={isLast}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 18px', borderRadius: '12px',
            border: 'none',
            background: isLast
              ? (isDark ? '#2d3148' : '#e2e8f0')
              : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: isLast
              ? (isDark ? '#4b5563' : '#cbd5e1')
              : '#ffffff',
            fontSize: '0.85rem', fontWeight: 600,
            cursor: isLast ? 'not-allowed' : 'pointer',
            opacity: isLast ? 0.4 : 1,
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
            boxShadow: isLast ? 'none' : '0 4px 12px rgba(99,102,241,0.25)',
          }}
        >
          Next
          <ChevronRightIcon size={18} />
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// INGREDIENT QUICK REFERENCE — Collapsible, shows humanized names
// ═══════════════════════════════════════════════════════════════════════════
const IngredientQuickRef = ({ items, isDark }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!items || items.length === 0) return null;

  return (
    <div style={{
      borderRadius: '14px',
      border: `1px solid ${isDark ? '#2d3148' : '#e5e7eb'}`,
      background: isDark ? 'rgba(30, 33, 48, 0.6)' : 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(8px)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{
          fontSize: '0.85rem', fontWeight: 700,
          color: isDark ? '#e2e5f0' : '#1e293b',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          🧺 Ingredients ({items.length})
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={isDark ? '#6b7394' : '#94a3b8'}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transition: 'transform 0.25s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div style={{
        maxHeight: isOpen ? '400px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.3s ease',
      }}>
        <div style={{
          padding: '0 16px 14px',
          display: 'flex', flexWrap: 'wrap', gap: '6px',
        }}>
          {items.map((item, i) => {
            const name = formatIngredientName(item.key || item.name || '');
            const qty = item.qty_value ?? item.qty ?? '';
            const unit = item.qty_unit ?? item.unit ?? '';
            const emoji = getIngredientEmoji(name);

            return (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 10px', borderRadius: '10px',
                background: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.04)',
                border: `1px solid ${isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)'}`,
                fontSize: '0.78rem', lineHeight: 1.3,
              }}>
                <span>{emoji}</span>
                <span style={{ fontWeight: 600, color: isDark ? '#818cf8' : '#6366f1' }}>
                  {qty}{unit ? ` ${unit}` : ''}
                </span>
                <span style={{ color: isDark ? '#c7d0e8' : '#475569' }}>{name}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================
const VoiceCookingPage = ({ meal: mealProp, onClose }) => {
  const { isDark } = useTheme();
  const meal = mealProp || DEMO_RECIPE;
  const [currentStep, setCurrentStep] = useState(0);

  const systemPrompt = useMemo(() => buildAgentSystemPrompt(meal), [meal]);
  const firstMessage = useMemo(() => buildFirstMessage(meal), [meal]);

  const {
    connect,
    disconnect,
    status,
    isSpeaking,
    transcript,
    error,
  } = useElevenLabsConversation({ systemPrompt, firstMessage });

  const savedScrollY = useRef(window.scrollY);
  const totalSteps = meal.instructions?.length || 0;

  useEffect(() => {
    savedScrollY.current = window.scrollY;
    return () => {
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

  const handleClose = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') {
      try {
        await Promise.race([
          disconnect(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch { /* swallow */ }
    }
    onClose?.();
  }, [status, disconnect, onClose]);

  const handleStartCooking = useCallback(() => { connect(); }, [connect]);
  const handleEndSession = useCallback(() => { disconnect(); }, [disconnect]);
  const handleTryAgain = useCallback(() => { connect(); }, [connect]);

  const handlePrevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  }, []);

  const handleNextStep = useCallback(() => {
    setCurrentStep(prev => Math.min(totalSteps - 1, prev + 1));
  }, [totalSteps]);

  // Theme tokens
  const bg = isDark
    ? 'linear-gradient(145deg, #0f1117 0%, #141728 40%, #1a1040 100%)'
    : 'linear-gradient(145deg, #f5f3ff 0%, #ede9fe 40%, #dbeafe 100%)';
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
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: bg, display: 'flex', flexDirection: 'column',
        animation: 'vc-fadeIn 0.3s ease-out', overflow: 'hidden',
      }}>
        {/* ── Top bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', flexShrink: 0,
        }}>
          <StatusBadge status={status} isSpeaking={isSpeaking} isDark={isDark} />
          <button
            onClick={handleClose}
            style={{
              width: '36px', height: '36px', borderRadius: '12px',
              border: 'none', backgroundColor: closeBtnBg, color: closeBtnColor,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background-color 0.2s',
            }}
            aria-label="Close voice cooking"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 16px 24px',
          display: 'flex', flexDirection: 'column', gap: '16px',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain', touchAction: 'pan-y',
        }}>

          {/* Chef hat + title */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: '4px', paddingBottom: '0',
            animation: 'vc-slideUp 0.5s ease-out',
          }}>
            <ChefHatAnimated isSpeaking={isSpeaking} status={status} />
            <h1 style={{
              margin: '8px 0 0', fontSize: '1.3rem', fontWeight: 800,
              color: titleColor, textAlign: 'center', lineHeight: 1.2,
              fontFamily: "'Georgia', 'Times New Roman', serif",
            }}>
              {meal.name}
            </h1>
            <p style={{
              margin: '4px 0 0', fontSize: '0.78rem',
              color: subtitleColor, textAlign: 'center',
            }}>
              🎙️ Hands-free cooking assistant
            </p>
          </div>

          {/* Action button area */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '12px', animation: 'vc-slideUp 0.6s ease-out',
          }}>
            {isIdle && (
              <button
                onClick={handleStartCooking}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '10px',
                  padding: '16px 36px', borderRadius: '16px', border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#ffffff', fontSize: '1.05rem', fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 6px 24px rgba(99,102,241,0.35)',
                  animation: 'vc-btnPulse 2.5s ease-in-out infinite',
                  transition: 'transform 0.15s ease',
                  fontFamily: 'inherit',
                }}
              >
                <MicIcon size={22} />
                Start Cooking with Cheffy
              </button>
            )}

            {isConnecting && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                padding: '14px 32px', borderRadius: '16px',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                color: isDark ? '#a5b4fc' : '#6366f1',
                fontSize: '1rem', fontWeight: 600,
              }}>
                <div style={{
                  width: '20px', height: '20px',
                  border: '2px solid currentColor', borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'vc-dotBlink 0.8s linear infinite',
                }} />
                Warming up the kitchen…
              </div>
            )}

            {isConnected && (
              <button
                onClick={handleEndSession}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '10px 24px', borderRadius: '14px',
                  border: `1.5px solid ${isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)'}`,
                  background: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)',
                  color: '#ef4444', fontSize: '0.85rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s ease',
                  fontFamily: 'inherit',
                }}
              >
                <PhoneOffIcon size={16} />
                End Session
              </button>
            )}

            {isError && (
              <div style={{ textAlign: 'center' }}>
                <p style={{
                  fontSize: '0.85rem', color: '#ef4444',
                  marginBottom: '12px', maxWidth: '300px',
                }}>
                  {error || 'Something went wrong. Please check your microphone permissions.'}
                </p>
                <button
                  onClick={handleTryAgain}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '12px 28px', borderRadius: '14px', border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#ffffff', fontSize: '0.9rem', fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.25)',
                    fontFamily: 'inherit',
                  }}
                >
                  <MicIcon size={18} />
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* ── CURRENT STEP CARD — The star of the show ── */}
          {totalSteps > 0 && (
            <div style={{ animation: 'vc-slideUp 0.65s ease-out' }}>
              <CurrentStepCard
                step={meal.instructions[currentStep]}
                stepIndex={currentStep}
                totalSteps={totalSteps}
                onPrev={handlePrevStep}
                onNext={handleNextStep}
                isDark={isDark}
              />
            </div>
          )}

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

          {/* Ingredient quick reference */}
          {meal.items && meal.items.length > 0 && (
            <div style={{ animation: 'vc-slideUp 0.7s ease-out' }}>
              <IngredientQuickRef items={meal.items} isDark={isDark} />
            </div>
          )}

          {/* Bottom spacer */}
          <div style={{ height: '24px', flexShrink: 0 }} />
        </div>
      </div>
    </>
  );
};

export default VoiceCookingPage;
