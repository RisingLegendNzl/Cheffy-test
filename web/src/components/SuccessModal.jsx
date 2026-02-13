// web/src/components/SuccessModal.jsx
import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle, X, ChevronRight } from 'lucide-react';
import { COLORS, Z_INDEX, SHADOWS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Success modal shown after plan generation.
 * Now requires a mandatory plan name before the user can view the plan.
 */
const SuccessModal = ({
  isVisible,
  title = 'Success!',
  message,
  stats = [],
  onClose,
  onViewPlan,
  autoDismiss = false,      // Changed default: don't auto-dismiss since user must enter name
  dismissDelay = 3000,
}) => {
  const { isDark } = useTheme();

  // ── Plan Name State ──
  const [planName, setPlanName] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isVisible) {
      setPlanName('');
      setNameError('');
      setIsSubmitting(false);
      // Focus the input after a brief delay for animation
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isVisible]);

  // Auto-dismiss only if autoDismiss is explicitly true (legacy behavior)
  useEffect(() => {
    if (isVisible && autoDismiss && dismissDelay > 0) {
      const timer = setTimeout(() => {
        onClose && onClose();
      }, dismissDelay);
      return () => clearTimeout(timer);
    }
  }, [isVisible, autoDismiss, dismissDelay, onClose]);

  if (!isVisible) return null;

  const trimmedName = planName.trim();
  const isNameValid = trimmedName.length > 0;

  const handleNameChange = (e) => {
    setPlanName(e.target.value);
    if (nameError) setNameError('');
  };

  const handleViewPlan = async () => {
    if (!isNameValid) {
      setNameError('Please enter a plan name to continue.');
      inputRef.current?.focus();
      return;
    }
    if (isSubmitting) return; // Prevent double-submission

    setIsSubmitting(true);
    try {
      // onViewPlan now receives the plan name so MainApp can save with it
      await onViewPlan(trimmedName);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isNameValid && !isSubmitting) {
      handleViewPlan();
    }
  };

  // ── Theme-derived colours ──
  const modalBg = isDark ? '#1e2130' : '#ffffff';
  const inputBg = isDark ? '#252839' : '#ffffff';
  const inputBorder = nameError
    ? COLORS.error.main
    : isDark ? '#2d3148' : COLORS.gray[300];
  const inputFocusBorder = isDark ? '#6366f1' : COLORS.primary[500];
  const inputColor = isDark ? '#f0f1f5' : COLORS.gray[900];
  const placeholderColor = isDark ? '#6b7280' : COLORS.gray[400];
  const labelColor = isDark ? '#d1d5db' : COLORS.gray[700];
  const errorColor = COLORS.error?.main || '#ef4444';
  const titleColor = isDark ? '#f0f1f5' : COLORS.gray[900];
  const messageColor = isDark ? '#9ca3b0' : COLORS.gray[600];
  const statBg = isDark ? '#252839' : COLORS.gray[50];
  const statBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const statLabelColor = isDark ? '#9ca3b0' : COLORS.gray[600];
  const closeBtnColor = isDark ? '#6b7280' : COLORS.gray[400];
  const closeBtnHover = isDark ? '#252839' : COLORS.gray[100];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-fadeIn"
      style={{
        zIndex: Z_INDEX.modal,
        backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.5)',
      }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-8 max-w-md w-full animate-bounceIn relative"
        style={{
          backgroundColor: modalBg,
          boxShadow: SHADOWS['2xl'],
          border: isDark ? '1px solid #2d3148' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full transition-colors"
          style={{ color: closeBtnColor }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = closeBtnHover)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <X size={20} />
        </button>

        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center animate-pulse"
            style={{
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : COLORS.success.light,
            }}
          >
            <CheckCircle size={40} style={{ color: COLORS.success.main }} />
          </div>
        </div>

        {/* Title */}
        <h3
          className="text-2xl font-bold text-center mb-2"
          style={{ color: titleColor }}
        >
          {title}
        </h3>

        {/* Message */}
        {message && (
          <p
            className="text-center text-sm mb-6"
            style={{ color: messageColor }}
          >
            {message}
          </p>
        )}

        {/* Stats Grid */}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="p-4 rounded-lg text-center"
                style={{
                  backgroundColor: statBg,
                  border: `1px solid ${statBorder}`,
                }}
              >
                <p className="text-2xl font-bold mb-1" style={{ color: stat.color || COLORS.primary[600] }}>
                  {stat.value}
                </p>
                <p className="text-xs" style={{ color: statLabelColor }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Mandatory Plan Name Input ── */}
        <div className="mb-4">
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: labelColor }}
          >
            Plan Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={planName}
            onChange={handleNameChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter plan name"
            maxLength={80}
            className="w-full px-4 py-2.5 rounded-lg text-sm transition-colors"
            style={{
              backgroundColor: inputBg,
              border: `1px solid ${inputBorder}`,
              color: inputColor,
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = inputFocusBorder;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)'}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = nameError ? errorColor : (isDark ? '#2d3148' : COLORS.gray[300]);
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          {nameError && (
            <p className="text-xs mt-1.5" style={{ color: errorColor }}>
              {nameError}
            </p>
          )}
        </div>

        {/* View Plan Button — disabled until name is valid */}
        {onViewPlan && (
          <button
            onClick={handleViewPlan}
            disabled={!isNameValid || isSubmitting}
            className="w-full flex items-center justify-center py-3 rounded-lg font-semibold transition-all"
            style={{
              backgroundColor: isNameValid && !isSubmitting
                ? COLORS.primary[500]
                : isDark ? '#2d3148' : COLORS.gray[200],
              color: isNameValid && !isSubmitting
                ? '#ffffff'
                : isDark ? '#6b7280' : COLORS.gray[400],
              cursor: isNameValid && !isSubmitting ? 'pointer' : 'not-allowed',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Saving…' : 'View My Plan'}
            {!isSubmitting && <ChevronRight size={20} className="ml-2" />}
          </button>
        )}
      </div>
    </div>
  );
};

export default SuccessModal;