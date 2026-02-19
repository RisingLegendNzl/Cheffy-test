// web/src/components/wizard/MealInspirationStep.jsx
// UPDATED: Full dark mode support — hero section, textarea, chips, skip note.
import React, { useState, useCallback } from 'react';
import { ChefHat, Sparkles, Lightbulb, X } from 'lucide-react';
import { COLORS } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';

const INSPIRATION_EXAMPLES = [
  'Mediterranean — grilled halloumi, lemon herb chicken, falafel bowls',
  'Anime-inspired — ramen like Naruto, Japanese curry, onigiri bento boxes',
  'Spicy Thai street food — pad krapao, tom yum, green curry',
  'Cozy comfort food — mac & cheese, shepherd\'s pie, slow-cooked stews',
  'Mexican fiesta — burrito bowls, carnitas tacos, enchiladas',
  'Clean high-protein — grilled salmon, chicken stir-fry, egg white wraps',
];

const MealInspirationStep = ({ formData, onChange }) => {
  const [focused, setFocused] = useState(false);
  const { isDark } = useTheme();
  const [currentExample] = useState(
    () => INSPIRATION_EXAMPLES[Math.floor(Math.random() * INSPIRATION_EXAMPLES.length)]
  );

  const hasValue = formData.cuisine && formData.cuisine.trim().length > 0;

  const handleChange = (e) => {
    onChange(e);
  };

  const handleClear = useCallback(() => {
    onChange({
      target: { name: 'cuisine', value: '' },
    });
  }, [onChange]);

  const applyExample = (example) => {
    const text = example;
    onChange({
      target: { name: 'cuisine', value: text },
    });
  };

  // ── Theme palette ──
  const heroBg = isDark
    ? 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.05))'
    : 'linear-gradient(135deg, #8b5cf610, #6366f108)';
  const heroTitle = isDark ? '#f0f1f5' : COLORS.gray[900];
  const heroDesc = isDark ? '#9ca3b0' : COLORS.gray[500];
  const textareaBg = isDark ? '#252839' : '#fff';
  const textareaFocusBg = isDark ? '#2a2d42' : '#fefefe';
  const textareaBorder = focused ? '#8b5cf6' : (isDark ? '#3d4158' : COLORS.gray[200]);
  const textareaColor = isDark ? '#f0f1f5' : COLORS.gray[900];
  const labelColor = focused ? '#8b5cf6' : (isDark ? '#9ca3b0' : COLORS.gray[400]);
  const chipBg = isDark ? '#252839' : COLORS.gray[50];
  const chipBorder = isDark ? '#3d4158' : COLORS.gray[200];
  const chipColor = isDark ? '#d1d5db' : COLORS.gray[600];
  const chipLabelColor = isDark ? '#9ca3b0' : COLORS.gray[400];
  const skipBg = isDark ? '#252839' : COLORS.gray[50];
  const skipBorder = isDark ? '#3d4158' : COLORS.gray[200];
  const skipColor = isDark ? '#6b7280' : COLORS.gray[400];
  const skipStrong = isDark ? '#d1d5db' : COLORS.gray[600];
  const clearBg = isDark ? '#1e2130' : COLORS.gray[50];
  const clearColor = isDark ? '#9ca3b0' : COLORS.gray[400];
  const clearHoverBg = isDark ? '#252839' : COLORS.gray[100];

  return (
    <div className="flex flex-col gap-5">
      {/* Hero section with chef hat */}
      <div
        className="text-center py-4 rounded-2xl"
        style={{ background: heroBg }}
      >
        <div
          className="inline-flex items-center justify-center rounded-2xl mb-3"
          style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)',
          }}
        >
          <ChefHat size={32} color="#fff" />
        </div>

        <h3
          className="text-lg font-bold mb-1"
          style={{ color: heroTitle }}
        >
          What meals are you dreaming of?
        </h3>
        <p
          className="text-sm px-4 max-w-sm mx-auto"
          style={{ color: heroDesc, lineHeight: '1.5' }}
        >
          Describe any kind of food you can imagine — cultural cuisines, TV show-inspired dishes,
          cartoon foods, comfort classics, or anything else.
        </p>
      </div>

      {/* Large textarea input */}
      <div>
        <div
          className="relative rounded-xl transition-all"
          style={{
            border: `1.5px solid ${textareaBorder}`,
            background: focused ? textareaFocusBg : textareaBg,
            boxShadow: focused
              ? `0 0 0 3px rgba(139, 92, 246, 0.08), 0 0 20px rgba(139, 92, 246, 0.04)`
              : isDark
              ? '0 1px 2px rgba(0,0,0,0.2)'
              : '0 1px 2px rgba(0,0,0,0.04)',
            transitionDuration: '200ms',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Label */}
          <label
            className="absolute left-3.5 pointer-events-none"
            style={{
              top: '10px',
              fontSize: '11px',
              fontWeight: '600',
              color: labelColor,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              transition: 'color 200ms ease',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sparkles size={12} />
            Your Meal Vision
          </label>

          {/* Textarea */}
          <textarea
            name="cuisine"
            value={formData.cuisine || ''}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={currentExample}
            rows={4}
            className="w-full border-none outline-none rounded-xl resize-none"
            style={{
              padding: '32px 14px 12px',
              fontSize: '15px',
              fontWeight: '500',
              color: textareaColor,
              fontFamily: 'inherit',
              lineHeight: '1.6',
              backgroundColor: 'transparent',
            }}
          />

          {/* Clear button */}
          {hasValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute flex items-center gap-1 rounded-lg transition-all"
              style={{
                bottom: '8px',
                right: '8px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '600',
                background: clearBg,
                color: clearColor,
                border: `1px solid ${isDark ? '#3d4158' : COLORS.gray[200]}`,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = clearHoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = clearBg)}
            >
              <X size={10} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Inspiration chips */}
      <div>
        <p
          className="text-xs font-semibold uppercase mb-2 px-1"
          style={{
            color: chipLabelColor,
            letterSpacing: '0.05em',
          }}
        >
          Tap for inspiration
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '🌊 Mediterranean', value: 'Mediterranean — grilled halloumi, herb-crusted fish, fresh salads' },
            { label: '🍜 Anime Ramen', value: 'Anime-inspired — hearty ramen bowls, Japanese curry rice, bento boxes' },
            { label: '🌮 Mexican Fiesta', value: 'Mexican street food — burrito bowls, carnitas tacos, enchiladas' },
            { label: '🍛 Spicy Curry', value: 'Spicy curries — Thai green curry, butter chicken, laksa' },
            { label: '🏠 Comfort Food', value: 'Cozy comfort food — mac & cheese, shepherd\'s pie, slow-cooked stews' },
            { label: '🥗 Clean & Lean', value: 'Clean high-protein — grilled salmon, chicken stir-fry, fresh bowls' },
          ].map((chip) => {
            const isChipSelected = formData.cuisine === chip.value;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => applyExample(chip.value)}
                className="rounded-full transition-all hover:scale-105 active:scale-95"
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: '500',
                  background: isChipSelected
                    ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                    : chipBg,
                  color: isChipSelected ? '#fff' : chipColor,
                  border: `1px solid ${isChipSelected ? 'transparent' : chipBorder}`,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Skip note */}
      <div
        className="text-center rounded-lg py-2.5 px-4"
        style={{
          background: skipBg,
          border: `1px dashed ${skipBorder}`,
        }}
      >
        <p
          style={{
            fontSize: '13px',
            color: skipColor,
            margin: 0,
          }}
        >
          No inspiration? No worries — just hit <strong style={{ color: skipStrong }}>Continue</strong> and
          we'll create a balanced, varied plan for you.
        </p>
      </div>
    </div>
  );
};

export default MealInspirationStep;