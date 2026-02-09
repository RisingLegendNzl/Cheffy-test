// web/src/components/wizard/WizardStepHeader.jsx
import React from 'react';
import { COLORS } from '../../constants';

const WizardStepHeader = ({ step }) => {
  return (
    <div className="flex items-center gap-3.5 px-6 pt-6 pb-0">
      {/* Icon container */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-xl"
        style={{
          width: '48px',
          height: '48px',
          fontSize: '24px',
          backgroundColor: `${step.accentColor}14`,
        }}
      >
        {step.icon}
      </div>

      {/* Text */}
      <div>
        <h2
          className="text-xl font-bold"
          style={{ color: COLORS.gray[900], letterSpacing: '-0.01em', margin: 0 }}
        >
          {step.title}
        </h2>
        <p
          className="text-sm mt-0.5"
          style={{ color: COLORS.gray[500], margin: 0 }}
        >
          {step.subtitle}
        </p>
      </div>
    </div>
  );
};

export default WizardStepHeader;
