// web/src/components/wizard/OptionCard.jsx
import React from 'react';
import { COLORS } from '../../constants';
// UPDATED: Full dark mode support — card backgrounds, text, borders, radio indicator.
import React from 'react';
import { COLORS } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';

const OptionCard = ({
  icon,
  label,
  description,
  selected,
  onClick,
  accentColor = COLORS.primary[500],
}) => {
  const { isDark } = useTheme();

  const unselectedBg = isDark ? '#252839' : '#fff';
  const unselectedBorder = isDark ? '#3d4158' : COLORS.gray[200];
  const labelColor = selected ? accentColor : (isDark ? '#f0f1f5' : COLORS.gray[900]);
  const descColor = isDark ? '#6b7280' : COLORS.gray[400];
  const radioBorder = selected ? accentColor : (isDark ? '#4d5170' : COLORS.gray[300]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left rounded-xl transition-all"
      style={{
        padding: '14px 16px',
        border: `1.5px solid ${selected ? accentColor : COLORS.gray[200]}`,
        background: selected ? `${accentColor}08` : '#fff',
        boxShadow: selected
          ? `0 0 0 3px ${accentColor}15`
        border: `1.5px solid ${selected ? accentColor : unselectedBorder}`,
        background: selected ? `${accentColor}08` : unselectedBg,
        boxShadow: selected
          ? `0 0 0 3px ${accentColor}15`
          : isDark
          ? '0 1px 2px rgba(0,0,0,0.2)'
          : '0 1px 2px rgba(0,0,0,0.04)',
        transform: selected ? 'scale(1.01)' : 'scale(1)',
        cursor: 'pointer',
        transitionDuration: '200ms',
        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Icon */}
      <span className="text-xl flex-shrink-0" style={{ fontSize: '22px' }}>
        {icon}
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-semibold"
          style={{ color: selected ? accentColor : COLORS.gray[900] }}
          style={{ color: labelColor }}
        >
          {label}
        </div>
        {description && (
          <div
            className="text-xs mt-0.5"
            style={{ color: COLORS.gray[400] }}
            style={{ color: descColor }}
          >
            {description}
          </div>
        )}
      </div>

      {/* Radio indicator */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-full transition-all"
        style={{
          width: '20px',
          height: '20px',
          border: `2px solid ${selected ? accentColor : COLORS.gray[300]}`,
          border: `2px solid ${radioBorder}`,
          background: selected ? accentColor : 'transparent',
          transitionDuration: '200ms',
        }}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5L4.5 7.5L8 3"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </button>
  );
};

export default OptionCard;
export default OptionCard;
