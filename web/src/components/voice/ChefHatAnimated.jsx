// web/src/components/voice/ChefHatAnimated.jsx
// =============================================================================
// ChefHatAnimated — Animated chef hat with glow rings
//
// Props:
//   isSpeaking {boolean} — true when the agent is actively speaking
//   status     {string}  — session status for colour changes
//
// Animations:
//   - Idle: gentle float + soft glow
//   - Speaking: pulse scale + shake + bright glow rings
//   - Connecting: slow spin
// =============================================================================

import React from 'react';

// Inline keyframes (injected once via <style>)
const KEYFRAMES = `
@keyframes chefhat-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
}
@keyframes chefhat-pulse {
  0%, 100% { transform: scale(1); }
  25% { transform: scale(1.08) rotate(-2deg); }
  50% { transform: scale(1.04) rotate(0deg); }
  75% { transform: scale(1.08) rotate(2deg); }
}
@keyframes chefhat-shake {
  0%, 100% { transform: rotate(0deg); }
  10% { transform: rotate(-3deg); }
  20% { transform: rotate(3deg); }
  30% { transform: rotate(-2deg); }
  40% { transform: rotate(2deg); }
  50% { transform: rotate(0deg); }
}
@keyframes chefhat-glow-pulse {
  0%, 100% { opacity: 0.15; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.15); }
}
@keyframes chefhat-glow-bright {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.25); }
}
@keyframes chefhat-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

const ChefHatAnimated = ({ isSpeaking = false, status = 'idle' }) => {
  const isConnecting = status === 'connecting';
  const isConnected = status === 'connected';
  const isError = status === 'error';

  // Determine animation class
  let hatAnimation = 'chefhat-float 3s ease-in-out infinite';
  let glowAnimation = 'chefhat-glow-pulse 3s ease-in-out infinite';
  let glowColor = 'rgba(99, 102, 241, 0.3)'; // indigo

  if (isConnecting) {
    hatAnimation = 'chefhat-spin 2s linear infinite';
    glowColor = 'rgba(250, 204, 21, 0.3)'; // amber
    glowAnimation = 'chefhat-glow-pulse 1.5s ease-in-out infinite';
  } else if (isSpeaking && isConnected) {
    hatAnimation = 'chefhat-pulse 0.6s ease-in-out infinite';
    glowColor = 'rgba(52, 211, 153, 0.4)'; // emerald
    glowAnimation = 'chefhat-glow-bright 0.8s ease-in-out infinite';
  } else if (isError) {
    glowColor = 'rgba(239, 68, 68, 0.3)'; // red
  }

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        style={{
          position: 'relative',
          width: '120px',
          height: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Outer glow ring */}
        <div
          style={{
            position: 'absolute',
            inset: '-12px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            animation: glowAnimation,
            pointerEvents: 'none',
          }}
        />
        {/* Middle glow ring */}
        <div
          style={{
            position: 'absolute',
            inset: '-4px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${glowColor.replace('0.3', '0.15').replace('0.4', '0.2')} 0%, transparent 60%)`,
            animation: glowAnimation,
            animationDelay: '0.3s',
            pointerEvents: 'none',
          }}
        />
        {/* Hat container */}
        <div
          style={{
            animation: hatAnimation,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            filter: isError ? 'grayscale(0.6)' : 'none',
          }}
        >
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
          >
            {/* Hat body */}
            <ellipse cx="40" cy="60" rx="26" ry="6" fill="#e5e7eb" />
            <rect x="14" y="48" width="52" height="12" rx="3" fill="#f3f4f6" />
            <rect x="14" y="48" width="52" height="3" rx="1.5" fill="#d1d5db" />
            {/* Hat poof */}
            <circle cx="40" cy="30" r="20" fill="white" />
            <circle cx="28" cy="34" r="14" fill="white" />
            <circle cx="52" cy="34" r="14" fill="white" />
            <circle cx="34" cy="22" r="12" fill="white" />
            <circle cx="48" cy="22" r="12" fill="white" />
            <circle cx="40" cy="18" r="10" fill="#fafafa" />
            {/* Face (simple) */}
            <circle cx="34" cy="56" r="1.5" fill="#6366f1" />
            <circle cx="46" cy="56" r="1.5" fill="#6366f1" />
            {/* Smile — wider when speaking */}
            <path
              d={
                isSpeaking
                  ? 'M34 60 Q40 66 46 60' // open smile
                  : 'M36 60 Q40 63 44 60' // gentle smile
              }
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      </div>
    </>
  );
};

export default ChefHatAnimated;
