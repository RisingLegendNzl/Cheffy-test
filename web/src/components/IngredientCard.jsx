// web/src/components/IngredientCard.jsx
// Enhanced ingredient card with "Shadow Depth Breathing" visual concept
// Features: two-layer shadow system, ambient breathing animation, green price,
// purple "View Product" button, spring tap-back, cheapest variant, a11y motion support
//
// FIX: Graceful null price handling — shows "Price N/A" in muted gray
// instead of a bare "$" when no price data is available.

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
    el.classList.add('ingredient-card--pressed');
  }, []);

  const handleCardPointerUp = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.classList.remove('ingredient-card--pressed');
  }, []);

  const handleButtonPointerDown = useCallback((e) => {
    e.stopPropagation();
    const el = buttonRef.current;
    if (!el) return;
    el.classList.add('ingredient-btn--pressed');
  }, []);

  const handleButtonPointerUp = useCallback((e) => {
    e.stopPropagation();
    const el = buttonRef.current;
    if (!el) return;
    el.classList.remove('ingredient-btn--pressed');
    el.classList.add('ingredient-btn--confirm');
    setTimeout(() => {
      if (el) el.classList.remove('ingredient-btn--confirm');
    }, 350);
  }, []);

  // FIX: Null-safe price formatting
  const hasPrice = typeof price === 'number' && !isNaN(price);
  const formattedPrice = hasPrice ? price.toFixed(2) : null;

  const breathingDelay = `${(index * 0.6).toFixed(1)}s`;

  const ambientTintClass = isCheapest
    ? 'ingredient-card--cheapest'
    : '';

  return (
    <div
      ref={cardRef}
      className={`ingredient-card-compact ingredient-card--breathing ${ambientTintClass}`}
      style={{
        '--breathing-delay': breathingDelay,
        '--entry-delay': `${(index * 0.04).toFixed(2)}s`,
      }}
      onPointerDown={handleCardPointerDown}
      onPointerUp={handleCardPointerUp}
      onPointerLeave={handleCardPointerUp}
    >
      {/* Top Row: Product Name + Cheapest Badge */}
      <div className="ingredient-card__header">
        <div className="ingredient-card__name">
          {ingredientName}
        </div>

        {isCheapest && (
          <div className="ingredient-card__badge">
            Cheapest
          </div>
        )}
      </div>

      {/* Second Row: Price (green) + Size */}
      <div className="ingredient-card__meta">
        {/* FIX: Show "$X.XX" in green when price exists, "Price N/A" in gray when null */}
        {formattedPrice !== null ? (
          <span className="ingredient-card__price">
            ${formattedPrice}
          </span>
        ) : (
          <span className="ingredient-card__price ingredient-card__price--na">
            Price N/A
          </span>
        )}
        {size && (
          <>
            <span className="ingredient-card__dot">•</span>
            <span className="ingredient-card__size">{size}</span>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="ingredient-card__divider" />

      {/* View Product Button (purple) */}
      <button
        ref={buttonRef}
        onClick={onViewProduct}
        className="ingredient-card__button"
        onPointerDown={handleButtonPointerDown}
        onPointerUp={handleButtonPointerUp}
        onPointerLeave={(e) => {
          e.stopPropagation();
          const el = buttonRef.current;
          if (el) el.classList.remove('ingredient-btn--pressed');
        }}
      >
        <span className="ingredient-card__button-label">View Product</span>
        <svg
          className="ingredient-card__chevron"
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

      {/* Scoped styles */}
      <style>{`
        /* ==============================================
           KEYFRAMES — Shadow Depth Breathing
           ============================================== */

        @keyframes sdb-cardEntry {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes sdb-breathe {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-1.5px);
          }
        }

        @keyframes sdb-chevronNudge {
          0%   { transform: translateX(0); }
          40%  { transform: translateX(5px); }
          70%  { transform: translateX(3px); }
          100% { transform: translateX(4px); }
        }

        @keyframes sdb-confirmRing {
          0% {
            box-shadow: 0 0 0 0 rgba(192, 132, 252, 0.4);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(192, 132, 252, 0.15);
          }
          100% {
            box-shadow: 0 0 0 6px rgba(192, 132, 252, 0);
          }
        }


        /* ==============================================
           CARD BASE
           ============================================== */

        .ingredient-card-compact {
          position: relative;
          background: #ffffff;
          border-radius: 12px;
          padding: 16px;
          border: 1px solid #f3e8ff;
          cursor: default;

          box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.06),
            0 4px 12px rgba(99, 102, 241, 0.04);

          opacity: 0;
          animation:
            sdb-cardEntry 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards var(--entry-delay, 0s);

          transition:
            box-shadow 0.2s ease,
            transform 0.2s ease,
            border-color 0.2s ease;
        }

        .ingredient-card--breathing {
          animation:
            sdb-cardEntry 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards var(--entry-delay, 0s),
            sdb-breathe 4s cubic-bezier(0.4, 0, 0.6, 1) infinite var(--breathing-delay, 0s);
        }


        /* ==============================================
           HOVER STATE (desktop)
           ============================================== */

        .ingredient-card-compact:hover {
          transform: translateY(-3px);
          border-color: #e9d5ff;

          box-shadow:
            0 2px 6px rgba(0, 0, 0, 0.08),
            0 8px 24px rgba(99, 102, 241, 0.10);

          animation-play-state: paused, paused;
        }


        /* ==============================================
           TAP / PRESS STATE
           ============================================== */

        .ingredient-card--pressed {
          transform: translateY(1px) !important;

          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.04),
            0 1px 4px rgba(99, 102, 241, 0.02) !important;

          transition:
            box-shadow 0.08s ease-out,
            transform 0.08s ease-out !important;
        }

        .ingredient-card-compact:not(.ingredient-card--pressed) {
          transition:
            box-shadow 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            border-color 0.2s ease;
        }


        /* ==============================================
           CHEAPEST VARIANT — green ambient shadow
           ============================================== */

        .ingredient-card--cheapest {
          box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.06),
            0 4px 12px rgba(16, 185, 129, 0.05);
        }

        .ingredient-card--cheapest:hover {
          box-shadow:
            0 2px 6px rgba(0, 0, 0, 0.08),
            0 8px 24px rgba(16, 185, 129, 0.12) !important;
        }

        .ingredient-card--cheapest.ingredient-card--pressed {
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.04),
            0 1px 4px rgba(16, 185, 129, 0.02) !important;
        }


        /* ==============================================
           HEADER — product name + badge
           ============================================== */

        .ingredient-card__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 4px;
          gap: 12px;
        }

        .ingredient-card__name {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          line-height: 1.4;
          flex: 1;
        }

        .ingredient-card__badge {
          background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
          color: #ffffff;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 2px 8px rgba(72, 187, 120, 0.3);
          white-space: nowrap;
          flex-shrink: 0;
        }


        /* ==============================================
           META ROW — price (green) + dot + size
           ============================================== */

        .ingredient-card__meta {
          font-size: 14px;
          color: #718096;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .ingredient-card__price {
          font-weight: 700;
          color: #10b981;
          font-size: 16px;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.01em;
        }

        /* FIX: Muted style for missing price */
        .ingredient-card__price--na {
          color: #a0aec0;
          font-weight: 600;
          font-size: 14px;
          font-style: italic;
        }

        .ingredient-card__dot {
          color: #cbd5e0;
        }

        .ingredient-card__size {
          color: #718096;
          font-weight: 500;
        }


        /* ==============================================
           DIVIDER
           ============================================== */

        .ingredient-card__divider {
          border-top: 1px solid #f0f0f0;
          margin-bottom: 12px;
        }


        /* ==============================================
           VIEW PRODUCT BUTTON — purple / amethyst
           ============================================== */

        .ingredient-card__button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          padding: 10px;
          background: #faf5ff;
          border: 1px solid #e9d5ff;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          color: #a855f7;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition:
            background 0.15s ease,
            border-color 0.15s ease,
            color 0.15s ease,
            transform 0.15s ease,
            box-shadow 0.15s ease;
        }

        .ingredient-card__button-label {
          position: relative;
          z-index: 1;
        }

        .ingredient-card__chevron {
          position: relative;
          z-index: 1;
          color: #d8b4fe;
          transition:
            transform 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            color 0.15s ease;
          flex-shrink: 0;
        }


        /* Button hover (desktop) */

        .ingredient-card__button:hover {
          background: #f3e8ff;
          border-color: #d8b4fe;
          color: #9333ea;
        }

        .ingredient-card__button:hover .ingredient-card__chevron {
          animation: sdb-chevronNudge 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
          color: #a855f7;
        }

        /* Shimmer pass on hover */
        .ingredient-card__button::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            105deg,
            transparent 40%,
            rgba(255, 255, 255, 0.35) 50%,
            transparent 60%
          );
          transition: none;
          z-index: 0;
        }

        .ingredient-card__button:hover::after {
          animation: sdb-shimmerPass 0.6s ease-in-out forwards;
        }

        @keyframes sdb-shimmerPass {
          from { left: -100%; }
          to   { left: 100%; }
        }


        /* Button press state */

        .ingredient-btn--pressed {
          transform: scale(0.97) !important;
          background: #e9d5ff !important;
          transition:
            transform 0.08s ease-out,
            background 0s !important;
        }

        .ingredient-card__button:not(.ingredient-btn--pressed) {
          transition:
            transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55),
            background 0.2s ease,
            border-color 0.15s ease,
            color 0.15s ease,
            box-shadow 0.35s ease;
        }


        /* Button confirmation ring-flash (mobile) */

        .ingredient-btn--confirm {
          animation: sdb-confirmRing 0.35s ease-out forwards;
        }


        /* Button keyboard focus */

        .ingredient-card__button:focus-visible {
          outline: 2px solid #c084fc;
          outline-offset: 3px;
        }


        /* Button active (fallback) */

        .ingredient-card__button:active {
          transform: scale(0.97);
        }


        /* ==============================================
           REDUCED MOTION — disable all animations
           ============================================== */

        @media (prefers-reduced-motion: reduce) {
          .ingredient-card-compact,
          .ingredient-card--breathing {
            animation: none !important;
            opacity: 1;
            transform: none;
          }

          .ingredient-card-compact:hover {
            transform: none;
          }

          .ingredient-card--pressed {
            transform: none !important;
          }

          .ingredient-card__button::after {
            display: none;
          }

          .ingredient-card__button:hover .ingredient-card__chevron {
            animation: none;
            transform: translateX(3px);
          }

          .ingredient-btn--pressed {
            transform: none !important;
          }

          .ingredient-btn--confirm {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
};

export default IngredientCard;