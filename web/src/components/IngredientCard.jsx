// web/src/components/IngredientCard.jsx
// =============================================================================
// Glass Morphism Product Card — Concept C Implementation
//
// REDESIGN: Replaces "Shadow Depth Breathing" with frosted glass aesthetic.
// Features:
//   - Translucent background with backdrop-filter blur
//   - Radial glow accent on hover
//   - Gradient CTA button matching Cheffy brand (indigo → purple)
//   - Size displayed as a floating pill
//   - Full dark mode + light mode via CSS custom properties
//   - Maintained: entry animation, press states, cheapest variant,
//     null price handling, reduced-motion support, a11y focus styles
//
// NO LOGIC CHANGES — identical props interface and behavior.
// =============================================================================

import React, { useRef, useCallback } from 'react';

const IngredientCard = ({
  ingredientName,
  price,
  size,
  isCheapest,
  onViewProduct,
  index = 0,
}) => {
  const cardRef = useRef(null);
  const buttonRef = useRef(null);

  const handleCardPointerDown = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.classList.add('glass-card--pressed');
  }, []);

  const handleCardPointerUp = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.classList.remove('glass-card--pressed');
  }, []);

  const handleButtonPointerDown = useCallback((e) => {
    e.stopPropagation();
    const el = buttonRef.current;
    if (!el) return;
    el.classList.add('glass-btn--pressed');
  }, []);

  const handleButtonPointerUp = useCallback((e) => {
    e.stopPropagation();
    const el = buttonRef.current;
    if (!el) return;
    el.classList.remove('glass-btn--pressed');
    el.classList.add('glass-btn--confirm');
    setTimeout(() => {
      if (el) el.classList.remove('glass-btn--confirm');
    }, 350);
  }, []);

  // Null-safe price formatting
  const hasPrice = typeof price === 'number' && !isNaN(price);
  const formattedPrice = hasPrice ? price.toFixed(2) : null;

  const ambientTintClass = isCheapest ? 'glass-card--cheapest' : '';

  return (
    <div
      ref={cardRef}
      className={`glass-card glass-card--animate ${ambientTintClass}`}
      style={{
        '--entry-delay': `${(index * 0.04).toFixed(2)}s`,
      }}
      onPointerDown={handleCardPointerDown}
      onPointerUp={handleCardPointerUp}
      onPointerLeave={handleCardPointerUp}
    >
      {/* Radial glow accent — visible on hover */}
      <div className="glass-card__glow" />

      {/* Top Row: Product Name + Cheapest Badge */}
      <div className="glass-card__header">
        <div className="glass-card__name">
          {ingredientName}
        </div>

        {isCheapest && (
          <div className="glass-card__badge">
            Cheapest
          </div>
        )}
      </div>

      {/* Price + Size Row */}
      <div className="glass-card__row">
        {formattedPrice !== null ? (
          <span className="glass-card__price">
            ${formattedPrice}
          </span>
        ) : (
          <span className="glass-card__price glass-card__price--na">
            Price N/A
          </span>
        )}
        {size && (
          <span className="glass-card__size-pill">{size}</span>
        )}
      </div>

      {/* View Product Button — gradient CTA */}
      <button
        ref={buttonRef}
        onClick={onViewProduct}
        className="glass-card__btn"
        onPointerDown={handleButtonPointerDown}
        onPointerUp={handleButtonPointerUp}
        onPointerLeave={(e) => {
          e.stopPropagation();
          const el = buttonRef.current;
          if (el) el.classList.remove('glass-btn--pressed');
        }}
      >
        <span className="glass-card__btn-label">View Product</span>
        <svg
          className="glass-card__chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* ── Scoped styles ── */}
      <style>{`
        /* ==============================================
           KEYFRAMES
           ============================================== */

        @keyframes glass-cardEntry {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes glass-confirmRing {
          0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          50%  { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15); }
          100% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
        }

        @keyframes glass-chevronNudge {
          0%   { transform: translateX(0); }
          40%  { transform: translateX(5px); }
          70%  { transform: translateX(3px); }
          100% { transform: translateX(4px); }
        }


        /* ==============================================
           CARD BASE — Glass Morphism
           ============================================== */

        .glass-card {
          position: relative;
          border-radius: 18px;
          padding: 20px;
          overflow: hidden;
          cursor: default;
          /* Dark mode defaults (overridden by [data-theme="light"]) */
          background: linear-gradient(
            135deg,
            rgba(30, 33, 48, 0.85),
            rgba(37, 40, 57, 0.65)
          );
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          border: 1px solid rgba(99, 102, 241, 0.12);
          box-shadow:
            0 2px 10px rgba(0, 0, 0, 0.35),
            0 0 0 1px rgba(99, 102, 241, 0.06);
          transition:
            border-color 0.3s ease,
            box-shadow 0.3s ease,
            transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            background 0.3s ease;
        }

        .glass-card--animate {
          opacity: 0;
          animation:
            glass-cardEntry 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards var(--entry-delay, 0s);
        }


        /* ==============================================
           LIGHT MODE OVERRIDES
           ============================================== */

        [data-theme="light"] .glass-card {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.80),
            rgba(245, 243, 255, 0.60)
          );
          backdrop-filter: blur(16px) saturate(120%);
          -webkit-backdrop-filter: blur(16px) saturate(120%);
          border: 1px solid rgba(99, 102, 241, 0.10);
          box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.04),
            0 0 0 1px rgba(99, 102, 241, 0.04);
        }


        /* ==============================================
           RADIAL GLOW (hover accent)
           ============================================== */

        .glass-card__glow {
          position: absolute;
          top: -50%;
          right: -50%;
          width: 100%;
          height: 100%;
          background: radial-gradient(
            circle,
            rgba(99, 102, 241, 0.06) 0%,
            transparent 60%
          );
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .glass-card:hover .glass-card__glow {
          opacity: 1;
        }

        [data-theme="light"] .glass-card__glow {
          background: radial-gradient(
            circle,
            rgba(99, 102, 241, 0.04) 0%,
            transparent 60%
          );
        }


        /* ==============================================
           HOVER STATE
           ============================================== */

        .glass-card:hover {
          border-color: rgba(99, 102, 241, 0.3);
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(99, 102, 241, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          transform: translateY(-2px);
        }

        [data-theme="light"] .glass-card:hover {
          border-color: rgba(99, 102, 241, 0.20);
          box-shadow:
            0 8px 32px rgba(99, 102, 241, 0.08),
            0 0 0 1px rgba(99, 102, 241, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
        }


        /* ==============================================
           PRESS STATE
           ============================================== */

        .glass-card--pressed {
          transform: translateY(1px) !important;
          box-shadow:
            0 1px 4px rgba(0, 0, 0, 0.2),
            0 0 0 1px rgba(99, 102, 241, 0.06) !important;
          transition:
            box-shadow 0.08s ease-out,
            transform 0.08s ease-out !important;
        }

        .glass-card:not(.glass-card--pressed) {
          transition:
            box-shadow 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            border-color 0.2s ease,
            background 0.3s ease;
        }


        /* ==============================================
           CHEAPEST VARIANT — green tinted border
           ============================================== */

        .glass-card--cheapest {
          border-color: rgba(16, 185, 129, 0.2);
          box-shadow:
            0 2px 10px rgba(0, 0, 0, 0.35),
            0 4px 12px rgba(16, 185, 129, 0.08);
        }

        .glass-card--cheapest:hover {
          border-color: rgba(16, 185, 129, 0.35);
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 8px 24px rgba(16, 185, 129, 0.12) !important;
        }

        [data-theme="light"] .glass-card--cheapest {
          border-color: rgba(16, 185, 129, 0.15);
          box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.04),
            0 4px 12px rgba(16, 185, 129, 0.06);
        }

        [data-theme="light"] .glass-card--cheapest:hover {
          border-color: rgba(16, 185, 129, 0.30);
          box-shadow:
            0 8px 32px rgba(16, 185, 129, 0.08),
            0 8px 24px rgba(16, 185, 129, 0.10) !important;
        }

        .glass-card--cheapest.glass-card--pressed {
          box-shadow:
            0 1px 4px rgba(0, 0, 0, 0.2),
            0 1px 4px rgba(16, 185, 129, 0.04) !important;
        }


        /* ==============================================
           HEADER — product name + badge
           ============================================== */

        .glass-card__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
          gap: 12px;
          position: relative;
          z-index: 1;
        }

        .glass-card__name {
          font-size: 16px;
          font-weight: 600;
          color: var(--color-text-primary, #f0f1f5);
          line-height: 1.4;
          flex: 1;
        }

        .glass-card__badge {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
          white-space: nowrap;
          flex-shrink: 0;
        }


        /* ==============================================
           PRICE + SIZE ROW
           ============================================== */

        .glass-card__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          position: relative;
          z-index: 1;
        }

        .glass-card__price {
          font-size: 22px;
          font-weight: 700;
          color: #10b981;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
        }

        /* Muted style for missing price */
        .glass-card__price--na {
          color: var(--color-text-tertiary, #6b7280);
          font-weight: 600;
          font-size: 16px;
          font-style: italic;
        }

        .glass-card__size-pill {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--color-text-secondary, #9ca3b0);
          font-size: 12px;
          font-weight: 600;
          padding: 5px 12px;
          border-radius: 20px;
        }

        [data-theme="light"] .glass-card__size-pill {
          background: rgba(99, 102, 241, 0.06);
          border: 1px solid rgba(99, 102, 241, 0.12);
          color: var(--color-text-secondary, #4b5563);
        }


        /* ==============================================
           VIEW PRODUCT BUTTON — Gradient CTA
           ============================================== */

        .glass-card__btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          z-index: 1;
          overflow: hidden;
          font-family: inherit;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
          transition:
            box-shadow 0.2s ease,
            transform 0.2s ease;
        }

        .glass-card__btn:hover {
          box-shadow: 0 6px 24px rgba(99, 102, 241, 0.45);
          transform: translateY(-1px);
        }

        .glass-card__btn:active {
          transform: scale(0.97);
        }

        [data-theme="light"] .glass-card__btn {
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.25);
        }

        [data-theme="light"] .glass-card__btn:hover {
          box-shadow: 0 6px 24px rgba(99, 102, 241, 0.35);
        }

        .glass-card__btn-label {
          position: relative;
          z-index: 1;
        }

        .glass-card__chevron {
          position: relative;
          z-index: 1;
          color: rgba(255, 255, 255, 0.85);
          transition:
            transform 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            color 0.15s ease;
          flex-shrink: 0;
        }

        .glass-card__btn:hover .glass-card__chevron {
          animation: glass-chevronNudge 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
          color: #ffffff;
        }

        /* Shimmer pass on hover */
        .glass-card__btn::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            105deg,
            transparent 40%,
            rgba(255, 255, 255, 0.2) 50%,
            transparent 60%
          );
          transition: none;
          z-index: 0;
        }

        .glass-card__btn:hover::after {
          animation: glass-shimmerPass 0.6s ease-in-out forwards;
        }

        @keyframes glass-shimmerPass {
          from { left: -100%; }
          to   { left: 100%; }
        }


        /* Button press state */

        .glass-btn--pressed {
          transform: scale(0.97) !important;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2) !important;
          transition:
            transform 0.08s ease-out,
            box-shadow 0s !important;
        }

        .glass-card__btn:not(.glass-btn--pressed) {
          transition:
            transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            box-shadow 0.35s ease;
        }

        /* Button confirmation ring-flash */
        .glass-btn--confirm {
          animation: glass-confirmRing 0.35s ease-out forwards;
        }

        /* Button keyboard focus */
        .glass-card__btn:focus-visible {
          outline: 2px solid #a5b4fc;
          outline-offset: 3px;
        }


        /* ==============================================
           REDUCED MOTION
           ============================================== */

        @media (prefers-reduced-motion: reduce) {
          .glass-card,
          .glass-card--animate {
            animation: none !important;
            opacity: 1;
            transform: none;
          }

          .glass-card:hover {
            transform: none;
          }

          .glass-card--pressed {
            transform: none !important;
          }

          .glass-card__btn::after {
            display: none;
          }

          .glass-card__btn:hover .glass-card__chevron {
            animation: none;
            transform: translateX(3px);
          }

          .glass-btn--pressed {
            transform: none !important;
          }

          .glass-btn--confirm {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
};

export default IngredientCard;