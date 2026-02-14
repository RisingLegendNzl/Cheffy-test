// web/src/components/wizard/StepProgressBar.jsx
// UPDATED: Full dark mode support — circles, labels, progress track.
import React from 'react';
import { COLORS } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';

const STEP_COLORS = {
  complete: COLORS.success.main,
  active: COLORS.primary[500],
  upcoming: COLORS.gray[300],
};

const StepProgressBar = ({ currentStep, steps, onStepClick, canReachStep }) => {
  const { isDark } = useTheme();
  const progress = ((currentStep + 1) / steps.length) * 100;

  const upcomingColor = isDark ? '#3d4158' : COLORS.gray[300];
  const upcomingBg = isDark ? '#252839' : COLORS.gray[50];
  const upcomingTextColor = isDark ? '#6b7280' : COLORS.gray[400];
  const trackBg = isDark ? '#2d3148' : COLORS.gray[200];

  return (
    <div className="pb-6">
      {/* Step indicators */}
      <div className="flex justify-between mb-3">
        {steps.map((step, i) => {
          const isComplete = i < currentStep;
          const isActive = i === currentStep;
          const isFuture = i > currentStep;
          const reachable =
            !isActive && (isComplete || (canReachStep ? canReachStep(i) : false));

          const color = isComplete
            ? STEP_COLORS.complete
            : isActive
            ? STEP_COLORS.active
            : upcomingColor;

          return (
            <div key={step.id} className="flex flex-col items-center flex-1">
              {/* Clickable circle */}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStepClick && onStepClick(i)}
                aria-label={`Go to step ${i + 1}: ${step.title}`}
                className="flex items-center justify-center rounded-full transition-all"
                style={{
                  width: '36px',
                  height: '36px',
                  fontSize: isComplete ? '16px' : '14px',
                  fontWeight: '700',
                  background: isComplete || isActive ? color : upcomingBg,
                  color: isComplete || isActive ? '#fff' : upcomingTextColor,
                  border: `2px solid ${color}`,
                  boxShadow: isActive
                    ? `0 0 0 4px ${COLORS.primary[500]}20`
                    : 'none',
                  transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  transitionDuration: '400ms',
                  transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                  cursor: reachable ? 'pointer' : isActive ? 'default' : 'not-allowed',
                  opacity: isFuture && !reachable ? 0.55 : 1,
                  outline: 'none',
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  if (reachable) {
                    e.currentTarget.style.boxShadow = `0 0 0 4px ${
                      isComplete ? STEP_COLORS.complete : COLORS.primary[500]
                    }25`;
                    e.currentTarget.style.transform = 'scale(1.12)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = isActive
                    ? `0 0 0 4px ${COLORS.primary[500]}20`
                    : 'none';
                  e.currentTarget.style.transform = isActive
                    ? 'scale(1.1)'
                    : 'scale(1)';
                }}
              >
                {isComplete ? '✓' : step.icon}
              </button>

              {/* Label */}
              <span
                className="mt-2 text-center whitespace-nowrap hidden sm:block"
                style={{
                  fontSize: '11px',
                  fontWeight: isActive ? '700' : '500',
                  color: isActive
                    ? (isDark ? '#a5b4fc' : COLORS.primary[600])
                    : isComplete
                    ? STEP_COLORS.complete
                    : upcomingTextColor,
                  letterSpacing: '0.01em',
                  transition: 'all 0.3s ease',
                  cursor: reachable ? 'pointer' : 'default',
                }}
                onClick={() => reachable && onStepClick && onStepClick(i)}
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
        style={{ height: '4px', background: trackBg }}
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