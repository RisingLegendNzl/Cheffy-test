// web/src/components/wizard/DayPicker.jsx
import React from 'react';
import { COLORS, SHADOWS } from '../../constants';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

const DayPicker = ({ value, onChange }) => {
  const handleSelect = (day) => {
    onChange({ target: { name: 'days', value: day } });
  };

  return (
    <div>
      {/* Header row */}
      <div className="flex justify-between items-center mb-3">
        <span
          className="font-semibold uppercase"
          style={{
            fontSize: '11px',
            letterSpacing: '0.05em',
            color: COLORS.gray[400],
          }}
        >
          Plan Duration
        </span>
        <span
          className="font-bold"
          style={{ fontSize: '20px', color: COLORS.primary[600] }}
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
                border: `1.5px solid ${isSelected ? COLORS.primary[500] : COLORS.gray[200]}`,
                background: isSelected ? COLORS.primary[500] : '#fff',
                color: isSelected ? '#fff' : COLORS.gray[500],
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
