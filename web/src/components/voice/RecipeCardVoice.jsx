// web/src/components/voice/RecipeCardVoice.jsx
// =============================================================================
// RecipeCardVoice — Collapsible recipe card for the Voice Cooking page
//
// REVAMP v2.0: Kitchen-friendly ingredient chips and step cards
//   - Humanized ingredient names (snake_case → Title Case)
//   - Food emoji icons per ingredient
//   - Step cards with action icons
//   - Improved visual hierarchy
//
// Props:
//   meal   {object}  — Cheffy meal object
//   isDark {boolean}
// =============================================================================

import React, { useState } from 'react';
import { formatIngredientName, getIngredientEmoji } from '../../helpers/humanize.js';

const ChevronDown = ({ size = 20, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Step action icon helper
const getStepIcon = (step) => {
  if (!step) return '🍳';
  const lower = step.toLowerCase();
  if (/preheat|oven/.test(lower)) return '🔥';
  if (/chop|dice|slice|cut|mince/.test(lower)) return '🔪';
  if (/mix|stir|whisk|combine|toss/.test(lower)) return '🥄';
  if (/boil|simmer|cook|fry|sauté|saute|roast|bake|grill/.test(lower)) return '🍳';
  if (/serve|plate|garnish/.test(lower)) return '🍽️';
  if (/wash|rinse/.test(lower)) return '🚿';
  if (/marinate|season/.test(lower)) return '🧂';
  if (/rest|cool|chill/.test(lower)) return '❄️';
  return '👨‍🍳';
};

const RecipeCardVoice = ({ meal, isDark = false }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!meal) return null;

  const t = {
    cardBg: isDark ? 'rgba(30, 33, 48, 0.85)' : 'rgba(255, 255, 255, 0.85)',
    cardBorder: isDark ? '#2d3148' : '#e5e7eb',
    titleColor: isDark ? '#f0f1f5' : '#111827',
    descColor: isDark ? '#9ca3b0' : '#6b7280',
    sectionTitle: isDark ? '#a5b4fc' : '#6366f1',
    chipBg: isDark ? 'rgba(52, 211, 153, 0.08)' : 'rgba(52, 211, 153, 0.04)',
    chipBorder: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(52, 211, 153, 0.1)',
    chipText: isDark ? '#a7f3d0' : '#065f46',
    chipQty: isDark ? '#6ee7b7' : '#059669',
    stepBg: isDark ? 'rgba(99, 102, 241, 0.06)' : 'rgba(99, 102, 241, 0.03)',
    stepBorder: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)',
    stepNumBg: isDark ? '#6366f1' : '#6366f1',
    stepNumColor: '#ffffff',
    stepText: isDark ? '#d1d5db' : '#374151',
    chevronColor: isDark ? '#9ca3b0' : '#6b7280',
  };

  const items = meal.items || [];
  const instructions = meal.instructions || [];

  return (
    <div
      style={{
        borderRadius: '16px',
        border: `1px solid ${t.cardBorder}`,
        backgroundColor: t.cardBg,
        backdropFilter: 'blur(8px)',
        overflow: 'hidden',
      }}
    >
      {/* Clickable header */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: '0.95rem', fontWeight: 700,
          color: t.titleColor, lineHeight: 1.3,
        }}>
          📋 Full Recipe
        </span>
        <ChevronDown
          size={18}
          style={{
            color: t.chevronColor,
            transition: 'transform 0.3s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
            marginLeft: '12px',
          }}
        />
      </button>

      {/* Expandable body */}
      <div style={{
        maxHeight: isExpanded ? '2000px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 0.4s ease',
      }}>
        <div style={{ padding: '0 18px 18px' }}>
          {/* Description */}
          {meal.description && (
            <p style={{
              fontSize: '0.85rem', color: t.descColor,
              lineHeight: 1.6, marginBottom: '16px', fontStyle: 'italic',
            }}>
              {meal.description}
            </p>
          )}

          {/* Ingredients — chip layout with emojis and humanized names */}
          {items.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{
                fontSize: '0.75rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: t.sectionTitle, marginBottom: '8px',
              }}>
                🧺 Ingredients ({items.length})
              </h4>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '6px',
              }}>
                {items.map((item, i) => {
                  const qty = item.qty_value ?? item.qty ?? '';
                  const unit = item.qty_unit ?? item.unit ?? '';
                  // FIXED: Always humanize ingredient names
                  const name = formatIngredientName(item.key ?? item.name ?? '');
                  const emoji = getIngredientEmoji(name);

                  return (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: '5px 11px', borderRadius: '12px',
                      backgroundColor: t.chipBg,
                      border: `1px solid ${t.chipBorder}`,
                      fontSize: '0.78rem', lineHeight: 1.4,
                    }}>
                      <span style={{ fontSize: '0.85rem' }}>{emoji}</span>
                      {(qty || unit) && (
                        <span style={{ fontWeight: 600, color: t.chipQty }}>
                          {qty}{unit ? ` ${unit}` : ''}
                        </span>
                      )}
                      <span style={{ color: t.chipText }}>{name}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Steps — card layout with action icons */}
          {instructions.length > 0 && (
            <div>
              <h4 style={{
                fontSize: '0.75rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: t.sectionTitle, marginBottom: '10px',
              }}>
                👨‍🍳 Steps ({instructions.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {instructions.map((step, i) => {
                  const icon = getStepIcon(step);
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: '10px', alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: '12px',
                      backgroundColor: t.stepBg,
                      border: `1px solid ${t.stepBorder}`,
                    }}>
                      <span style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        backgroundColor: t.stepNumBg, color: t.stepNumColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.85rem', flexShrink: 0, marginTop: '1px',
                      }}>
                        {icon}
                      </span>
                      <div>
                        <span style={{
                          display: 'block', fontSize: '0.65rem', fontWeight: 700,
                          color: isDark ? '#818cf8' : '#6366f1',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          marginBottom: '2px',
                        }}>
                          Step {i + 1}
                        </span>
                        <span style={{
                          fontSize: '0.82rem', lineHeight: 1.55,
                          color: t.stepText,
                        }}>
                          {step}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipeCardVoice;
