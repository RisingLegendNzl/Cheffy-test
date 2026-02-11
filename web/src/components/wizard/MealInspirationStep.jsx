// web/src/components/wizard/MealInspirationStep.jsx
import React, { useState } from 'react';
import { ChefHat, Sparkles, Lightbulb } from 'lucide-react';
import { COLORS } from '../../constants';

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
  const [currentExample] = useState(
    () => INSPIRATION_EXAMPLES[Math.floor(Math.random() * INSPIRATION_EXAMPLES.length)]
  );

  const hasValue = formData.cuisine && formData.cuisine.trim().length > 0;

  const handleChange = (e) => {
    onChange(e);
  };

  const applyExample = (example) => {
    // Extract just the descriptive part before the dash
    const text = example;
    onChange({
      target: { name: 'cuisine', value: text },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Hero section with chef hat */}
      <div
        className="text-center py-4 rounded-2xl"
        style={{
          background: `linear-gradient(135deg, #8b5cf610, #6366f108)`,
        }}
      >
        <div
          className="inline-flex items-center justify-center rounded-2xl mb-3"
          style={{
            width: '64px',
            height: '64px',
            background: `linear-gradient(135deg, #8b5cf6, #6366f1)`,
            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)',
          }}
        >
          <ChefHat size={32} color="#fff" />
        </div>

        <h3
          className="text-lg font-bold mb-1"
          style={{ color: COLORS.gray[900] }}
        >
          What meals are you dreaming of?
        </h3>
        <p
          className="text-sm px-4 max-w-sm mx-auto"
          style={{ color: COLORS.gray[500], lineHeight: '1.5' }}
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
            border: `1.5px solid ${
              focused ? '#8b5cf6' : COLORS.gray[200]
            }`,
            background: focused ? '#fefefe' : '#fff',
            boxShadow: focused
              ? `0 0 0 3px rgba(139, 92, 246, 0.08), 0 0 20px rgba(139, 92, 246, 0.04)`
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
              color: focused ? '#8b5cf6' : COLORS.gray[400],
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
            className="w-full bg-transparent border-none outline-none rounded-xl resize-none"
            style={{
              padding: '32px 14px 12px',
              fontSize: '15px',
              fontWeight: '500',
              color: COLORS.gray[900],
              fontFamily: 'inherit',
              lineHeight: '1.6',
            }}
          />
        </div>

        {/* Character hint */}
        <div
          className="flex items-center justify-between mt-2 px-1"
          style={{ fontSize: '12px', color: COLORS.gray[400] }}
        >
          <span className="flex items-center gap-1">
            <Lightbulb size={12} />
            Be as creative or specific as you like
          </span>
          {hasValue && (
            <span style={{ color: '#8b5cf6', fontWeight: '500' }}>
              {formData.cuisine.length} chars
            </span>
          )}
        </div>
      </div>

      {/* Inspiration chips */}
      <div>
        <p
          className="text-xs font-semibold uppercase mb-2 px-1"
          style={{
            color: COLORS.gray[400],
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
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => applyExample(chip.value)}
              className="rounded-full transition-all hover:scale-105 active:scale-95"
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: '500',
                background:
                  formData.cuisine === chip.value
                    ? 'linear-gradient(135deg, #8b5cf6, #6366f1)'
                    : COLORS.gray[50],
                color:
                  formData.cuisine === chip.value ? '#fff' : COLORS.gray[600],
                border: `1px solid ${
                  formData.cuisine === chip.value
                    ? 'transparent'
                    : COLORS.gray[200]
                }`,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Skip note */}
      <div
        className="text-center rounded-lg py-2.5 px-4"
        style={{
          background: COLORS.gray[50],
          border: `1px dashed ${COLORS.gray[200]}`,
        }}
      >
        <p
          style={{
            fontSize: '13px',
            color: COLORS.gray[400],
            margin: 0,
          }}
        >
          No inspiration? No worries — just hit <strong style={{ color: COLORS.gray[600] }}>Continue</strong> and
          we'll create a balanced, varied plan for you.
        </p>
      </div>
    </div>
  );
};

export default MealInspirationStep;