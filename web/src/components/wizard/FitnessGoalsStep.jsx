// web/src/components/wizard/FitnessGoalsStep.jsx
import React from 'react';
import OptionCard from './OptionCard';
import { COLORS } from '../../constants';

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', icon: '🪑', label: 'Sedentary', desc: 'Desk job, minimal exercise' },
  { value: 'light', icon: '🚶', label: 'Lightly Active', desc: 'Light exercise 1–3 days/week' },
  { value: 'moderate', icon: '🏃', label: 'Moderately Active', desc: 'Moderate exercise 3–5 days/week' },
  { value: 'active', icon: '🏋️', label: 'Active', desc: 'Hard exercise 6–7 days/week' },
  { value: 'veryActive', icon: '⚡', label: 'Very Active', desc: 'Intense daily training or physical job' },
];

const GOAL_OPTIONS = [
  { value: 'cut_aggressive', icon: '🔥', label: 'Aggressive Cut', desc: '~25% calorie deficit' },
  { value: 'cut_moderate', icon: '📉', label: 'Moderate Cut', desc: '~15% calorie deficit' },
  { value: 'maintain', icon: '⚖️', label: 'Maintain', desc: 'Stay at current weight' },
  { value: 'bulk_lean', icon: '📈', label: 'Lean Bulk', desc: '~15% calorie surplus' },
  { value: 'bulk_aggressive', icon: '💪', label: 'Aggressive Bulk', desc: '~25% calorie surplus' },
];

const SectionLabel = ({ children, error }) => (
  <div
    className="font-semibold uppercase mb-2.5"
    style={{
      fontSize: '11px',
      letterSpacing: '0.05em',
      color: COLORS.gray[400],
    }}
  >
    {children}
    {error && (
      <span style={{ color: COLORS.error.main, textTransform: 'none', marginLeft: '6px' }}>
        — {error}
      </span>
    )}
  </div>
);

const FitnessGoalsStep = ({ formData, onChange, errors }) => {
  const handleSelect = (name, value) => {
    onChange({ target: { name, value } });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Activity Level */}
      <div>
        <SectionLabel error={errors.activityLevel}>Activity Level</SectionLabel>
        <div className="flex flex-col gap-2">
          {ACTIVITY_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              icon={opt.icon}
              label={opt.label}
              description={opt.desc}
              selected={formData.activityLevel === opt.value}
              onClick={() => handleSelect('activityLevel', opt.value)}
              accentColor="#f59e0b"
            />
          ))}
        </div>
      </div>

      {/* Fitness Goal */}
      <div>
        <SectionLabel error={errors.goal}>Fitness Goal</SectionLabel>
        <div className="flex flex-col gap-2">
          {GOAL_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              icon={opt.icon}
              label={opt.label}
              description={opt.desc}
              selected={formData.goal === opt.value}
              onClick={() => handleSelect('goal', opt.value)}
              accentColor={COLORS.primary[500]}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default FitnessGoalsStep;
