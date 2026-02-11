// web/src/components/wizard/ReviewStep.jsx
import React from 'react';
import MacroPreviewCard from './MacroPreviewCard';
import { COLORS } from '../../constants';

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

const SummaryItem = ({ label, value }) => (
  <div>
    <div style={{ fontSize: '11px', color: COLORS.gray[400], marginBottom: '2px' }}>
      {label}
    </div>
    <div style={{ fontSize: '14px', fontWeight: '600', color: COLORS.gray[900] }}>
      {value || '—'}
    </div>
  </div>
);

const SummarySection = ({ icon, title, children }) => (
  <div
    className="rounded-xl p-4"
    style={{
      background: COLORS.gray[50],
      border: `1px solid ${COLORS.gray[200]}`,
    }}
  >
    <div className="flex items-center gap-2 mb-3">
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <span
        className="font-bold uppercase"
        style={{
          fontSize: '13px',
          letterSpacing: '0.05em',
          color: COLORS.gray[600],
        }}
      >
        {title}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</div>
  </div>
);

const ReviewStep = ({ formData }) => {
  return (
    <div className="flex flex-col gap-5">
      {/* Macro preview (most important visual) */}
      <MacroPreviewCard formData={formData} />

      {/* Profile summary */}
      <SummarySection icon="👤" title="Profile">
        <SummaryItem label="Name" value={formData.name || '—'} />
        <SummaryItem label="Height" value={`${formData.height} cm`} />
        <SummaryItem label="Weight" value={`${formData.weight} kg`} />
        <SummaryItem label="Age" value={formData.age} />
        <SummaryItem
          label="Body Fat"
          value={formData.bodyFat ? `${formData.bodyFat}%` : 'Not set'}
        />
        <SummaryItem
          label="Gender"
          value={formData.gender === 'male' ? 'Male' : 'Female'}
        />
      </SummarySection>

      {/* Goals summary */}
      <SummarySection icon="🎯" title="Goals">
        <SummaryItem
          label="Activity"
          value={ACTIVITY_LABELS[formData.activityLevel] || formData.activityLevel}
        />
        <SummaryItem
          label="Goal"
          value={GOAL_LABELS[formData.goal] || formData.goal}
        />
      </SummarySection>

      {/* Plan summary */}
      <SummarySection icon="🍳" title="Plan">
        <SummaryItem
          label="Duration"
          value={`${formData.days} day${formData.days > 1 ? 's' : ''}`}
        />
        <SummaryItem label="Meals/Day" value={formData.eatingOccasions} />
        <SummaryItem label="Store" value={formData.store} />
        <SummaryItem label="Budget" value={formData.costPriority} />
        <SummaryItem label="Variety" value={formData.mealVariety} />
      </SummarySection>

      {/* Meal Inspiration summary (only shown if user provided input) */}
      {formData.cuisine && formData.cuisine.trim() && (
        <SummarySection icon="👨‍🍳" title="Meal Inspiration">
          <div className="col-span-2">
            <div style={{ fontSize: '14px', fontWeight: '500', color: COLORS.gray[700], lineHeight: '1.5' }}>
              {formData.cuisine}
            </div>
          </div>
        </SummarySection>
      )}
    </div>
  );
};

export default ReviewStep;