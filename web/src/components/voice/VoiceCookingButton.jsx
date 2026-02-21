// web/src/components/voice/VoiceCookingButton.jsx
// =============================================================================
// VoiceCookingButton — "Voice Cooking" CTA for recipe cards / modals
//
// Renders a styled button with microphone icon that opens the
// VoiceCookingPage full-screen overlay.
//
// Props:
//   meal    {object}  — Cheffy meal object to pass to VoiceCookingPage
//   isDark  {boolean}
//
// Usage in RecipeModal:
//   import VoiceCookingButton from './voice/VoiceCookingButton';
//   <VoiceCookingButton meal={meal} />
// =============================================================================

import React, { useState, useCallback } from 'react';
import VoiceCookingPage from './VoiceCookingPage';

const BUTTON_KEYFRAMES = `
@keyframes vcb-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
`;

const VoiceCookingButton = ({ meal, isDark = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (!meal) return null;

  return (
    <>
      <style>{BUTTON_KEYFRAMES}</style>
      <button
        onClick={handleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          borderRadius: '12px',
          border: 'none',
          background: isDark
            ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))'
            : 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))',
          color: isDark ? '#a5b4fc' : '#6366f1',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isDark
            ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))'
            : 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isDark
            ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))'
            : 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        aria-label="Start voice cooking"
      >
        {/* Mic icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        Voice Cooking
      </button>

      {/* Full-screen voice cooking overlay */}
      {isOpen && (
        <VoiceCookingPage meal={meal} onClose={handleClose} />
      )}
    </>
  );
};

export default VoiceCookingButton;
