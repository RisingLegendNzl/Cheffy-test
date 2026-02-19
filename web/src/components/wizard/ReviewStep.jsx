// web/src/components/wizard/ReviewStep.jsx
// UPDATED: Full dark mode support — summary sections, items, cuisine text.
import React from 'react';
import MacroPreviewCard from './MacroPreviewCard';
import { COLORS } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';

// Human-readable label maps
const ACTIVITY_LABELS = {
  sedentary: 'Sedentary',
  light: 'Lightly Active',
  moderate: 'Moderately Active',
  active: 'Active',
  veryActive: 'Very Active',
};

const GOAL_LABELS = {
  maintain: 'Maintain',
  cut_moderate: 'Moderate Cut',
  cut_aggressive: 'Aggressive Cut',
  bulk_lean: 'Lean Bulk',
  bulk_aggressive: 'Aggressive Bulk',
};

// ── Conversion helpers ──
const formatHeight = (heightCm, units) => {
  if (!heightCm) return '—';
  if (units === 'imperial') {
    const totalIn = parseFloat(heightCm) / 2.54;
    const ft = Math.floor(totalIn / 12);
    const inches = Math.round(totalIn % 12);
    return `${ft}' ${inches}"`;
  }
  return `${heightCm} cm`;
};

const formatWeight = (weightKg, units) => {
  if (!weightKg) return '—';
  if (units === 'imperial') {
    return `${(parseFloat(weightKg) * 2.20462).toFixed(1)} lb`;
  }
  return `${weightKg} kg`;
};

const SummaryItem = ({ label, value, isDark }) => (
  <div>
    <div style={{ fontSize: '11px', color: isDark ? '#6b7280' : COLORS.gray[400], marginBottom: '2px' }}>
      {label}
    </div>
    <div style={{ fontSize: '14px', fontWeight: '600', color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
      {value || '—'}
    </div>
  </div>
);

const SummarySection = ({ icon, title, children, isDark }) => (
  <div
    className="rounded-xl p-4"
    style={{
      background: isDark ? '#252839' : COLORS.gray[50],
      border: `1px solid ${isDark ? '#3d4158' : COLORS.gray[200]}`,
    }}
  >
    <div className="flex items-center gap-2 mb-3">
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <span
        className="font-bold uppercase"
        style={{
          fontSize: '13px',
          letterSpacing: '0.05em',
          color: isDark ? '#9ca3b0' : COLORS.gray[600],
        }}
      >
        {title}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</div>
  </div>
);

const ReviewStep = ({ formData, measurementUnits = 'metric' }) => {
  const { isDark } = useTheme();

  return (
    <div className="flex flex-col gap-5">
      {/* Macro preview (most important visual) */}
      <MacroPreviewCard formData={formData} />

      {/* Profile summary */}
      <SummarySection icon="👤" title="Profile" isDark={isDark}>
        <SummaryItem label="Name" value={formData.name || '—'} isDark={isDark} />
        <SummaryItem label="Height" value={formatHeight(formData.height, measurementUnits)} isDark={isDark} />
        <SummaryItem label="Weight" value={formatWeight(formData.weight, measurementUnits)} isDark={isDark} />
        <SummaryItem label="Age" value={formData.age} isDark={isDark} />
        <SummaryItem
          label="Body Fat"
          value={formData.bodyFat ? `${formData.bodyFat}%` : 'Not set'}
          isDark={isDark}
        />
        <SummaryItem
          label="Gender"
          value={formData.gender === 'male' ? 'Male' : 'Female'}
          isDark={isDark}
        />
      </SummarySection>

      {/* Goals summary */}
      <SummarySection icon="🎯" title="Goals" isDark={isDark}>
        <SummaryItem
          label="Activity"
          value={ACTIVITY_LABELS[formData.activityLevel] || formData.activityLevel}
          isDark={isDark}
        />
        <SummaryItem
          label="Goal"
          value={GOAL_LABELS[formData.goal] || formData.goal}
          isDark={isDark}
        />
        <SummaryItem
          label="Diet"
          value={formData.dietary === 'None' ? 'No Restrictions' : formData.dietary}
          isDark={isDark}
        />
      </SummarySection>

      {/* Plan summary */}
      <SummarySection icon="🍳" title="Plan" isDark={isDark}>
        <SummaryItem
          label="Duration"
          value={`${formData.days} day${formData.days > 1 ? 's' : ''}`}
          isDark={isDark}
        />
        <SummaryItem label="Meals/Day" value={formData.eatingOccasions} isDark={isDark} />
        <SummaryItem label="Store" value={formData.store} isDark={isDark} />
        <SummaryItem label="Budget" value={formData.costPriority} isDark={isDark} />
        <SummaryItem label="Variety" value={formData.mealVariety} isDark={isDark} />
      </SummarySection>

      {/* Meal Inspiration summary (only shown if user provided input) */}
      {formData.cuisine && formData.cuisine.trim() && (
        <SummarySection icon="👨‍🍳" title="Meal Inspiration" isDark={isDark}>
          <div className="col-span-2">
            <div style={{
              fontSize: '14px',
              fontWeight: '500',
              color: isDark ? '#d1d5db' : COLORS.gray[700],
              lineHeight: '1.5',
            }}>
              {formData.cuisine}
            </div>
          </div>
        </SummarySection>
      )}
    </div>
  );
};

export default ReviewStep;
