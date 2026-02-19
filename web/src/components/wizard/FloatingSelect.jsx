// web/src/components/wizard/FloatingSelect.jsx
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { COLORS } from '../../constants';
// UPDATED: Full dark mode support — backgrounds, borders, text, chevron, option dropdown.
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { COLORS } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';

const FloatingSelect = ({
  label,
  name,
  value,
  onChange,
  options = [],
  error,
  required,
}) => {
  const [focused, setFocused] = useState(false);
  const { isDark } = useTheme();

  const borderColor = error
    ? COLORS.error.main
    : focused
    ? COLORS.primary[500]
    : isDark
    ? '#3d4158'
    : COLORS.gray[200];

  const glowColor = error ? COLORS.error.main : COLORS.primary[500];

  const baseBg = isDark ? '#252839' : '#fff';
  const focusBg = isDark ? '#2a2d42' : '#fefefe';
  const textColor = isDark ? '#f0f1f5' : COLORS.gray[900];
  const labelColor = error
    ? COLORS.error.main
    : focused
    ? (isDark ? '#818cf8' : COLORS.primary[600])
    : (isDark ? '#9ca3b0' : COLORS.gray[400]);
  const chevronColor = isDark ? '#6b7280' : COLORS.gray[400];

  return (
    <div>
      {/* Select container */}
      <div
        className="relative rounded-xl transition-all"
        style={{
          border: `1.5px solid ${borderColor}`,
          background: focused ? '#fefefe' : '#fff',
          boxShadow: focused
            ? `0 0 0 3px ${glowColor}14, 0 0 20px ${glowColor}08`
          background: focused ? focusBg : baseBg,
          boxShadow: focused
            ? `0 0 0 3px ${glowColor}14, 0 0 20px ${glowColor}08`
            : isDark
            ? '0 1px 2px rgba(0,0,0,0.2)'
            : '0 1px 2px rgba(0,0,0,0.04)',
          transitionDuration: '200ms',
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Label (always pinned top for selects since they always have a value) */}
        <label
          className="absolute left-3.5 pointer-events-none"
          style={{
            top: '6px',
            fontSize: '11px',
            fontWeight: '600',
            color: error
              ? COLORS.error.main
              : focused
              ? COLORS.primary[600]
              : COLORS.gray[400],
            color: labelColor,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            transition: 'color 200ms ease',
            zIndex: 1,
          }}
        >
          {label}
          {required && (
            <span style={{ color: COLORS.error.main, marginLeft: '2px' }}>*</span>
          )}
        </label>

        {/* Select element */}
        <select
          name={name}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full bg-transparent border-none outline-none rounded-xl cursor-pointer appearance-none"
          className="w-full border-none outline-none rounded-xl cursor-pointer appearance-none"
          style={{
            padding: '24px 40px 8px 14px',
            fontSize: '15px',
            fontWeight: '500',
            color: COLORS.gray[900],
            fontFamily: 'inherit',
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
            color: textColor,
            fontFamily: 'inherit',
            backgroundColor: 'transparent',
          }}
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              style={{
                backgroundColor: isDark ? '#1e2130' : '#fff',
                color: isDark ? '#f0f1f5' : COLORS.gray[900],
              }}
            >
              {opt.label}
            </option>
          ))}
        </select>

        {/* Custom chevron */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <ChevronDown size={16} style={{ color: COLORS.gray[400] }} />
          <ChevronDown size={16} style={{ color: chevronColor }} />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p
          className="mt-1.5 pl-1"
          style={{ fontSize: '12px', fontWeight: '500', color: COLORS.error.main }}
        >
          {error}
        </p>
      )}
    </div>
  );
};

export default FloatingSelect;
export default FloatingSelect;
