// web/src/components/wizard/FloatingInput.jsx
import React, { useState } from 'react';
import { COLORS } from '../../constants';

const FloatingInput = ({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  placeholder,
  suffix,
  required,
  min,
  max,
  step,
}) => {
  const [focused, setFocused] = useState(false);
  const hasValue = value !== '' && value !== undefined && value !== null;
  const isActive = focused || hasValue;

  const borderColor = error
    ? COLORS.error.main
    : focused
    ? COLORS.primary[500]
    : COLORS.gray[200];

  const glowColor = error ? COLORS.error.main : COLORS.primary[500];

  return (
    <div>
      {/* Input container */}
      <div
        className="relative rounded-xl transition-all"
        style={{
          border: `1.5px solid ${borderColor}`,
          background: focused ? '#fefefe' : '#fff',
          boxShadow: focused
            ? `0 0 0 3px ${glowColor}14, 0 0 20px ${glowColor}08`
            : '0 1px 2px rgba(0,0,0,0.04)',
          transitionDuration: '200ms',
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Floating label */}
        <label
          className="absolute left-3.5 pointer-events-none transition-all"
          style={{
            top: isActive ? '6px' : '50%',
            transform: isActive ? 'none' : 'translateY(-50%)',
            fontSize: isActive ? '11px' : '14px',
            fontWeight: isActive ? '600' : '400',
            color: error
              ? COLORS.error.main
              : focused
              ? COLORS.primary[600]
              : COLORS.gray[400],
            letterSpacing: isActive ? '0.02em' : '0',
            textTransform: isActive ? 'uppercase' : 'none',
            transitionDuration: '200ms',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: 1,
          }}
        >
          {label}
          {required && (
            <span style={{ color: COLORS.error.main, marginLeft: '2px' }}>*</span>
          )}
        </label>

        {/* Input */}
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? placeholder : ''}
          min={min}
          max={max}
          step={step}
          className="w-full bg-transparent border-none outline-none rounded-xl"
          style={{
            padding: isActive ? '24px 14px 8px' : '16px 14px',
            paddingRight: suffix ? '48px' : '14px',
            fontSize: '15px',
            fontWeight: '500',
            color: COLORS.gray[900],
            fontFamily: 'inherit',
          }}
        />

        {/* Suffix badge */}
        {suffix && (
          <span
            className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              fontSize: '13px',
              fontWeight: '600',
              color: COLORS.gray[400],
              letterSpacing: '0.02em',
            }}
          >
            {suffix}
          </span>
        )}
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

export default FloatingInput;
