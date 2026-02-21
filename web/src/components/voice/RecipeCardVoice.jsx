// web/src/components/voice/RecipeCardVoice.jsx
// =============================================================================
// RecipeCardVoice — Collapsible recipe card for the Voice Cooking page
//
// Shows recipe name, ingredients, and step-by-step instructions in a
// collapsible card. Expanded by default so the user can reference the
// recipe while cooking hands-free.
//
// Props:
//   meal   {object}  — Cheffy meal object
//   isDark {boolean}
// =============================================================================

import React, { useState } from 'react';

const ChevronDown = ({ size = 20, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const RecipeCardVoice = ({ meal, isDark = false }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!meal) return null;

  const t = {
    cardBg: isDark ? 'rgba(30, 33, 48, 0.85)' : 'rgba(255, 255, 255, 0.85)',
    cardBorder: isDark ? '#2d3148' : '#e5e7eb',
    titleColor: isDark ? '#f0f1f5' : '#111827',
    descColor: isDark ? '#9ca3b0' : '#6b7280',
    sectionTitle: isDark ? '#a5b4fc' : '#6366f1',
    stepBg: isDark ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.04)',
    stepBorder: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
    stepNumBg: isDark ? '#6366f1' : '#6366f1',
    stepNumColor: '#ffffff',
    stepText: isDark ? '#d1d5db' : '#374151',
    ingredientBg: isDark ? 'rgba(52, 211, 153, 0.08)' : 'rgba(52, 211, 153, 0.04)',
    ingredientBorder: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(52, 211, 153, 0.1)',
    ingredientText: isDark ? '#a7f3d0' : '#065f46',
    ingredientQty: isDark ? '#6ee7b7' : '#059669',
    chevronColor: isDark ? '#9ca3b0' : '#6b7280',
  };

  const items = meal.items || [];
  const instructions = meal.instructions || [];

  return (
    <div
      style={{
        backgroundColor: t.cardBg,
        backdropFilter: 'blur(12px)',
        border: `1px solid ${t.cardBorder}`,
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Header — always visible, click to toggle */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 700,
              color: t.titleColor,
              lineHeight: 1.3,
            }}
          >
            📋 {meal.name}
          </h3>
          {meal.description && !isExpanded && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '0.8rem',
                color: t.descColor,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {meal.description}
            </p>
          )}
        </div>
        <ChevronDown
          size={20}
          style={{
            color: t.chevronColor,
            transition: 'transform 0.25s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
            marginLeft: '12px',
          }}
        />
      </button>

      {/* Expandable body */}
      <div
        style={{
          maxHeight: isExpanded ? '2000px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.4s ease',
        }}
      >
        <div style={{ padding: '0 18px 18px' }}>
          {/* Description */}
          {meal.description && (
            <p
              style={{
                fontSize: '0.85rem',
                color: t.descColor,
                lineHeight: 1.6,
                marginBottom: '16px',
              }}
            >
              {meal.description}
            </p>
          )}

          {/* Ingredients */}
          {items.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: t.sectionTitle,
                  marginBottom: '8px',
                }}
              >
                Ingredients ({items.length})
              </h4>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                {items.map((item, i) => {
                  const qty = item.qty_value ?? item.qty ?? '';
                  const unit = item.qty_unit ?? item.unit ?? '';
                  const name = item.key ?? item.name ?? '';
                  return (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: t.ingredientBg,
                        border: `1px solid ${t.ingredientBorder}`,
                        fontSize: '0.75rem',
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: t.ingredientQty }}>
                        {qty}{unit ? ` ${unit}` : ''}
                      </span>
                      <span style={{ color: t.ingredientText }}>{name}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Steps */}
          {instructions.length > 0 && (
            <div>
              <h4
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: t.sectionTitle,
                  marginBottom: '10px',
                }}
              >
                Steps ({instructions.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {instructions.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: t.stepBg,
                      border: `1px solid ${t.stepBorder}`,
                    }}
                  >
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '7px',
                        backgroundColor: t.stepNumBg,
                        color: t.stepNumColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: '1px',
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      style={{
                        fontSize: '0.82rem',
                        lineHeight: 1.55,
                        color: t.stepText,
                      }}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipeCardVoice;
