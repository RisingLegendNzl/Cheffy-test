// web/src/components/wizard/StepProgressBar.jsx
import React from 'react';
import { COLORS } from '../../constants';

const STEP_COLORS = {
  complete: COLORS.success.main,
  active: COLORS.primary[500],
  upcoming: COLORS.gray[300],
};

const StepProgressBar = ({ currentStep, steps }) => {
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="pb-6">
      {/* Step indicators */}
      <div className="flex justify-between mb-3">
        {steps.map((step, i) => {
          const isComplete = i < currentStep;
          const isActive = i === currentStep;
          const color = isComplete
            ? STEP_COLORS.complete
            : isActive
            ? STEP_COLORS.active
            : STEP_COLORS.upcoming;

          return (
            <div key={step.id} className="flex flex-col items-center flex-1">
              {/* Circle */}
              <div
                className="flex items-center justify-center rounded-full transition-all"
                style={{
                  width: '36px',
                  height: '36px',
                  fontSize: isComplete ? '16px' : '14px',
                  fontWeight: '700',
                  background: isComplete || isActive ? color : COLORS.gray[50],
                  color: isComplete || isActive ? '#fff' : COLORS.gray[400],
                  border: `2px solid ${color}`,
                  boxShadow: isActive ? `0 0 0 4px ${COLORS.primary[500]}20` : 'none',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  transitionDuration: '400ms',
                  transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                {isComplete ? '✓' : step.icon}
              </div>

              {/* Label */}
              <span
                className="mt-2 text-center whitespace-nowrap hidden sm:block"
                style={{
                  fontSize: '11px',
                  fontWeight: isActive ? '700' : '500',
                  color: isActive
                    ? COLORS.primary[600]
                    : isComplete
                    ? STEP_COLORS.complete
                    : COLORS.gray[400],
                  letterSpacing: '0.01em',
                  transition: 'all 0.3s ease',
                }}
              >
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress track */}
      <div
        className="overflow-hidden rounded-full"
        style={{ height: '4px', background: COLORS.gray[200] }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${COLORS.primary[500]}, ${COLORS.success.main})`,
            transition: 'width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>
    </div>
  );
};

export default StepProgressBar;
