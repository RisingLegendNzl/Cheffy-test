// web/src/components/wizard/DayPicker.jsx
// Full dark mode support — day buttons, labels, borders.
import React from 'react';
import { COLORS, SHADOWS } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

const DayPicker = ({ value, onChange }) => {
  const { isDark } = useTheme();

  const handleSelect = (day) => {
    onChange({ target: { name: 'days', value: day } });
  };

  const labelColor = isDark ? '#9ca3b0' : COLORS.gray[400];
  const valueColor = isDark ? '#a5b4fc' : COLORS.primary[600];
  const unselectedBg = isDark ? '#252839' : '#fff';
  const unselectedBorder = isDark ? '#3d4158' : COLORS.gray[200];
  const unselectedColor = isDark ? '#6b7280' : COLORS.gray[500];

  return (
    <div>
      {/* Header row */}
      <div className="flex justify-between items-center mb-3">
        <span
          className="font-semibold uppercase"
          style={{
            fontSize: '11px',
            letterSpacing: '0.05em',
            color: labelColor,
          }}
        >
          Plan Duration
        </span>
        <span
          className="font-bold"
          style={{ fontSize: '20px', color: valueColor }}
        >
          {value} day{value > 1 ? 's' : ''}
        </span>
      </div>

      {/* Day buttons */}
      <div className="flex gap-1.5">
        {DAYS.map((day) => {
          const isSelected = day === value;
          return (
            <button
              key={day}
              type="button"
              onClick={() => handleSelect(day)}
              className="flex-1 rounded-lg font-medium transition-all"
              style={{
                height: '44px',
                fontSize: '15px',
                fontWeight: isSelected ? '700' : '500',
                border: `1.5px solid ${isSelected ? COLORS.primary[500] : unselectedBorder}`,
                background: isSelected ? COLORS.primary[500] : unselectedBg,
                color: isSelected ? '#fff' : unselectedColor,
                transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                boxShadow: isSelected ? SHADOWS.md : 'none',
                cursor: 'pointer',
                transitionDuration: '200ms',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DayPicker;
