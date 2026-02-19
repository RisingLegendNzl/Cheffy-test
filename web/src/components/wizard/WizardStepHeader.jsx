// web/src/components/wizard/WizardStepHeader.jsx
// UPDATED: Full dark mode support — title, subtitle, icon container background.
import React from 'react';
import { COLORS } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';

const WizardStepHeader = ({ step }) => {
  const { isDark } = useTheme();

  return (
    <div className="flex items-center gap-3.5 px-6 pt-6 pb-0">
      {/* Icon container */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-xl"
        style={{
          width: '48px',
          height: '48px',
          fontSize: '24px',
          backgroundColor: `${step.accentColor}${isDark ? '1a' : '14'}`,
        }}
      >
        {step.icon}
      </div>

      {/* Text */}
      <div>
        <h2
          className="text-xl font-bold"
          style={{
            color: isDark ? '#f0f1f5' : COLORS.gray[900],
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {step.title}
        </h2>
        <p
          className="text-sm mt-0.5"
          style={{
            color: isDark ? '#9ca3b0' : COLORS.gray[500],
            margin: 0,
          }}
        >
          {step.subtitle}
        </p>
      </div>
    </div>
  );
};

export default WizardStepHeader;
