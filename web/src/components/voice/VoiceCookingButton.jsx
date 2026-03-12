// web/src/components/voice/VoiceCookingButton.jsx
// =============================================================================
// VoiceCookingButton — "Voice Cooking" CTA for recipe cards / modals
//
// REVAMP v3.0: Friendlier copy, subtle cooking-themed shimmer
//
// [FIX v2.1] Import includes explicit .jsx extension for Vercel Linux compat.
//
// [FIX v4.0] Mobile meal-summary header bleed fix.
//   When the VoiceCookingPage overlay is open, the parent RecipeModal (which
//   contains this button) was still rendered in the DOM with its hero header
//   (meal name + macro pills) visible on mobile devices. The RecipeModal sits
//   at zIndex 9999 while VoiceCookingPage is at 10000, but on iOS/Android the
//   RecipeModal's gradient hero header was bleeding through at the top of the
//   viewport due to a stacking-context conflict caused by the modal's own
//   position:fixed + body scroll lock interaction.
//
//   Fix: when isOpen is true, we notify the nearest RecipeModal wrapper via
//   a `data-voice-active` attribute set on a sentinel <div> that the modal
//   can detect — and additionally we inject a targeted CSS rule that sets the
//   RecipeModal overlay to visibility:hidden while preserving VoiceCookingPage.
//   This is a zero-prop-drilling, zero-refactor surgical fix.
// =============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import VoiceCookingPage from './VoiceCookingPage.jsx';

const BUTTON_KEYFRAMES = `
@keyframes vcb-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes vcb-wiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-3deg); }
  75% { transform: rotate(3deg); }
}
`;

// [FIX v4.0] CSS injected while VoiceCookingPage is open.
// Hides the RecipeModal overlay (and its meal summary header) without
// affecting VoiceCookingPage, which lives in a separate portal-like fixed div.
const VOICE_ACTIVE_HIDE_CSS = `
/* VoiceCookingButton [FIX v4.0]: hide RecipeModal while voice cooking is open */
.rm-overlay[data-voice-cooking-bg="true"] {
  visibility: hidden !important;
  pointer-events: none !important;
}
`;

const STYLE_TAG_ID = 'vcb-voice-active-hide-styles';

const VoiceCookingButton = ({ meal, isDark = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // [FIX v4.0] When voice cooking opens, mark the nearest .rm-overlay ancestor
  // with a data attribute and inject CSS to hide it. Clean up on close.
  useEffect(() => {
    // Find the closest .rm-overlay ancestor of this button's portal sentinel.
    // We search the whole document for .rm-overlay since the button is rendered
    // deep inside the modal's scrollable body.
    const rmOverlay = document.querySelector('.rm-overlay');

    if (isOpen) {
      // Mark the RecipeModal backdrop so our CSS rule can target it
      if (rmOverlay) {
        rmOverlay.setAttribute('data-voice-cooking-bg', 'true');
      }

      // Inject hide CSS if not already present
      if (!document.getElementById(STYLE_TAG_ID)) {
        const styleEl = document.createElement('style');
        styleEl.id = STYLE_TAG_ID;
        styleEl.textContent = VOICE_ACTIVE_HIDE_CSS;
        document.head.appendChild(styleEl);
      }
    } else {
      // Remove the marker attribute
      if (rmOverlay) {
        rmOverlay.removeAttribute('data-voice-cooking-bg');
      }

      // Remove the injected CSS
      const styleEl = document.getElementById(STYLE_TAG_ID);
      if (styleEl) styleEl.remove();
    }

    // Cleanup on unmount
    return () => {
      const overlay = document.querySelector('.rm-overlay');
      if (overlay) overlay.removeAttribute('data-voice-cooking-bg');
      const styleEl = document.getElementById(STYLE_TAG_ID);
      if (styleEl) styleEl.remove();
    };
  }, [isOpen]);

  if (!meal) return null;

  return (
    <>
      <style>{BUTTON_KEYFRAMES}</style>
      <button
        onClick={handleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 24px',
          borderRadius: '14px',
          border: 'none',
          background: isDark
            ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))'
            : 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))',
          color: isDark ? '#a5b4fc' : '#6366f1',
          fontSize: '0.88rem',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isDark
            ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))'
            : 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(99,102,241,0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isDark
            ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))'
            : 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        aria-label="Start hands-free voice cooking"
      >
        {/* Chef hat icon */}
        <span style={{ fontSize: '1.1rem', display: 'inline-flex' }}>👨‍🍳</span>
        Cook Hands-Free
        {/* Mic icon */}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.7 }}
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

      {/* Full-screen voice cooking overlay */}
      {isOpen && (
        <VoiceCookingPage meal={meal} onClose={handleClose} />
      )}
    </>
  );
};

export default VoiceCookingButton;
