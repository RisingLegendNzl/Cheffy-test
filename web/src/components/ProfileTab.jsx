// web/src/components/ProfileTab.jsx
// Theme-aware: adapts Profile Card + Targets Card to dark/light mode.
// Fixes: issue #1 (purple stripe), issue #5 (Blueprint card in dark mode).
// FIX: Weight stat now reads formData.measurementUnits for dynamic kg/lb display.

import React, { useMemo } from 'react';
import {
  Target,
  Flame,
  Soup,
  Droplet,
  Wheat,
  User as UserIcon,
  Zap,
  TrendingUp,
  Scale,
  Percent,
  Activity,
  ChevronRight,
  CheckCircle,
} from 'lucide-react';
import { COLORS, GOAL_LABELS, ACTIVITY_LABELS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const getGoalColor = (goalKey) => {
  const entry = GOAL_LABELS[goalKey];
  return entry?.color || COLORS.primary[500];
};

const getGoalLabel = (goalKey) => {
  const entry = GOAL_LABELS[goalKey];
  return entry?.label || goalKey.replace(/_/g, ' ');
};

const getActivityLabel = (actKey) => {
  const entry = ACTIVITY_LABELS[actKey];
  return entry?.label || actKey;
};

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const MACRO_COLORS = {
  protein: { main: '#10b981', dark: '#059669', light: '#d1fae5' },
  fat:     { main: '#f59e0b', dark: '#d97706', light: '#fef3c7' },
  carbs:   { main: '#f97316', dark: '#ea580c', light: '#fed7aa' },
};

// ── Weight formatting helper (formData stores kg internally) ──
const formatWeight = (weightKg, units) => {
  if (!weightKg) return 'N/A';
  if (units === 'imperial') {
    return `${(parseFloat(weightKg) * 2.20462).toFixed(1)} lb`;
  }
  return `${weightKg} kg`;
};


// ─────────────────────────────────────────────────────────────
// PROFILE CARD (Element 1)
// ─────────────────────────────────────────────────────────────

const STAT_CONFIG = [
  { key: 'weight',   label: 'Weight',   Icon: Scale,    format: null }, // format handled dynamically
  { key: 'bodyFat',  label: 'Body Fat', Icon: Percent,  format: (v) => v ? `${v}%` : 'N/A' },
  { key: 'goal',     label: 'Goal',     Icon: Target,   format: null },
  { key: 'activity', label: 'Activity', Icon: Activity, format: null },
];

const ProfileCard = ({ formData }) => {
  const { isDark } = useTheme();
  const goalColor = getGoalColor(formData.goal);
  const units = formData.measurementUnits || 'metric';

  // Theme-derived colours
  const cardBg = isDark ? '#1e2130' : '#ffffff';
  const cardBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const headingColor = isDark ? '#a5b4fc' : COLORS.primary[700];
  const statBoxBg = isDark ? '#252839' : COLORS.gray[50];
  const statBoxBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const labelColor = isDark ? '#9ca3b0' : COLORS.gray[500];
  const valueColor = isDark ? '#f0f1f5' : COLORS.gray[900];

  return (
    <div
      className="profile-card-enhanced rounded-xl shadow-lg overflow-hidden"
      style={{
        backgroundColor: cardBg,
        border: `1px solid ${cardBorder}`,
      }}
    >
      {/* Issue #1: gradient stripe — uses .profile-card-stripe class
          which is hidden via CSS in dark mode (theme-variables.css) */}
      <div
        className="profile-card-stripe h-1"
        style={{
          background: `linear-gradient(90deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`,
        }}
      />

      <div className="p-6">
        <h3 className="text-xl font-bold flex items-center mb-4" style={{ color: headingColor }}>
          <UserIcon className="w-5 h-5 mr-2" />
          User Profile
        </h3>

        <div className="grid grid-cols-2 gap-4">
          {STAT_CONFIG.map((stat) => {
            const Icon = stat.Icon;

            if (stat.key === 'goal') {
              return (
                <div
                  key={stat.key}
                  className="profile-stat-box p-3 rounded-lg"
                  style={{
                    backgroundColor: hexToRgba(goalColor, isDark ? 0.15 : 0.10),
                    border: `1.5px solid ${hexToRgba(goalColor, isDark ? 0.35 : 0.25)}`,
                  }}
                >
                  <div className="flex items-center mb-1.5">
                    <Icon size={14} style={{ color: goalColor }} className="mr-1.5" />
                    <span className="text-sm" style={{ color: hexToRgba(goalColor, 0.7) }}>
                      {stat.label}
                    </span>
                  </div>
                  <span
                    className="text-sm font-bold leading-tight block"
                    style={{ color: goalColor }}
                  >
                    {getGoalLabel(formData.goal)}
                  </span>
                </div>
              );
            }

            if (stat.key === 'activity') {
              const actLabel = getActivityLabel(formData.activityLevel);
              return (
                <div
                  key={stat.key}
                  className="profile-stat-box p-3 rounded-lg"
                  style={{
                    backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : COLORS.primary[50],
                    border: `1.5px solid ${isDark ? 'rgba(99,102,241,0.2)' : COLORS.primary[200]}`,
                  }}
                >
                  <div className="flex items-center mb-1.5">
                    <Icon size={14} style={{ color: COLORS.primary[500] }} className="mr-1.5" />
                    <span className="text-sm" style={{ color: isDark ? '#818cf8' : COLORS.primary[400] }}>
                      {stat.label}
                    </span>
                  </div>
                  <span
                    className="text-sm font-bold leading-tight block"
                    style={{ color: isDark ? '#a5b4fc' : COLORS.primary[700] }}
                  >
                    {actLabel}
                  </span>
                </div>
              );
            }

            // Default stat box (weight, body fat)
            const rawValue = stat.key === 'weight' ? formData.weight : formData.bodyFat;

            // Weight uses dynamic unit formatting; others use their static format
            const displayValue = stat.key === 'weight'
              ? formatWeight(rawValue, units)
              : stat.format
                ? stat.format(rawValue)
                : rawValue || 'N/A';

            return (
              <div
                key={stat.key}
                className="profile-stat-box p-3 rounded-lg"
                style={{
                  backgroundColor: statBoxBg,
                  border: `1.5px solid ${statBoxBorder}`,
                }}
              >
                <div className="flex items-center mb-1.5">
                  <Icon size={14} style={{ color: isDark ? '#9ca3b0' : COLORS.gray[400] }} className="mr-1.5" />
                  <span className="text-sm" style={{ color: labelColor }}>
                    {stat.label}
                  </span>
                </div>
                <span className="text-lg font-bold" style={{ color: valueColor }}>
                  {displayValue}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────
// MACRO PROGRESS BAR — used inside TargetsCard
// ─────────────────────────────────────────────────────────────

const MacroProgressBar = ({ label, amount, unit, kcal, macroKey, Icon, percentage }) => {
  const { isDark } = useTheme();
  const colors = MACRO_COLORS[macroKey] || MACRO_COLORS.protein;
  const trackBg = isDark ? 'rgba(255,255,255,0.06)' : colors.light;
  const labelCol = isDark ? '#d1d5db' : COLORS.gray[700];
  const subCol = isDark ? '#6b7280' : COLORS.gray[400];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center mr-2"
            style={{ backgroundColor: isDark ? hexToRgba(colors.main, 0.15) : colors.light }}
          >
            <Icon size={14} style={{ color: colors.main }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: labelCol }}>{label}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold" style={{ color: colors.main }}>
            {amount}{unit}
          </span>
          <span className="text-xs ml-1" style={{ color: subCol }}>
            ({kcal} kcal)
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: trackBg }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(percentage, 100)}%`,
            background: `linear-gradient(90deg, ${colors.main}, ${colors.dark})`,
          }}
        />
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────
// TARGETS CARD (Element 2)
// ─────────────────────────────────────────────────────────────

const TargetsCard = ({ nutritionalTargets }) => {
  const { isDark } = useTheme();

  // Theme-derived colours
  const cardBg = isDark ? '#1e2130' : '#ffffff';
  const cardBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const headingColor = isDark ? '#a5b4fc' : COLORS.primary[700];
  const ringPanelBg = isDark
    ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))'
    : `linear-gradient(135deg, ${COLORS.primary[50]}, ${hexToRgba(COLORS.secondary[500], 0.05)})`;
  const ringPanelBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const macroCardBg = isDark ? '#252839' : '#ffffff';
  const footerBg = isDark
    ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))'
    : `linear-gradient(135deg, ${COLORS.primary[50]}, ${hexToRgba(COLORS.secondary[500], 0.05)})`;
  const footerIconBg = isDark ? 'rgba(99,102,241,0.15)' : COLORS.primary[50];
  const footerTitleColor = isDark ? '#e5e7eb' : COLORS.gray[900];
  const footerTextColor = isDark ? '#9ca3af' : COLORS.gray[600];
  const footerLinkColor = isDark ? '#818cf8' : COLORS.primary[600];
  const calLabelColor = isDark ? '#d1d5db' : COLORS.gray[700];
  const calSubColor = isDark ? '#6b7280' : COLORS.gray[400];

  const totalCal = nutritionalTargets.calories || 0;
  const proteinKcal = (nutritionalTargets.protein || 0) * 4;
  const fatKcal = (nutritionalTargets.fat || 0) * 9;
  const carbsKcal = (nutritionalTargets.carbs || 0) * 4;
  const macroTotal = proteinKcal + fatKcal + carbsKcal || 1;

  const macroRatios = {
    protein: (proteinKcal / macroTotal) * 100,
    fat: (fatKcal / macroTotal) * 100,
    carbs: (carbsKcal / macroTotal) * 100,
  };

  return (
    <div
      className="targets-card-surface rounded-xl shadow-lg overflow-hidden"
      style={{
        backgroundColor: cardBg,
        border: `1px solid ${cardBorder}`,
      }}
    >
      {/* Header */}
      <div className="p-6 pb-4">
        <h3 className="text-xl font-bold flex items-center" style={{ color: headingColor }}>
          <Target className="w-5 h-5 mr-2" />
          Your Daily Nutritional Blueprint
        </h3>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col md:flex-row">
        {/* Left: Calorie ring */}
        <div
          className="targets-card-ring-panel flex-1 p-6 flex flex-col items-center justify-center md:border-r"
          style={{
            background: ringPanelBg,
            borderRightColor: ringPanelBorder,
          }}
        >
          <div className="relative w-32 h-32 mb-3">
            <svg viewBox="0 0 128 128" className="w-full h-full">
              {/* Track */}
              <circle
                cx="64" cy="64" r="54"
                fill="none"
                strokeWidth="10"
                stroke={isDark ? 'rgba(255,255,255,0.06)' : COLORS.gray[100]}
              />
              {/* Filled arc */}
              <circle
                cx="64" cy="64" r="54"
                fill="none"
                strokeWidth="10"
                stroke={COLORS.primary[500]}
                strokeDasharray={`${2 * Math.PI * 54}`}
                strokeDashoffset={`${2 * Math.PI * 54 * 0.15}`}
                strokeLinecap="round"
                transform="rotate(-90 64 64)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Flame size={18} style={{ color: COLORS.primary[500] }} className="mb-1" />
              <span className="text-2xl font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                {totalCal}
              </span>
              <span className="text-xs" style={{ color: calSubColor }}>kcal / day</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-center" style={{ color: calLabelColor }}>
            Daily Calorie Target
          </p>
        </div>

        {/* Right: Macro breakdown */}
        <div className="targets-card-macro-panel flex-1 p-6 space-y-5" style={{ backgroundColor: macroCardBg }}>
          <MacroProgressBar
            label="Protein"
            amount={nutritionalTargets.protein}
            unit="g"
            kcal={nutritionalTargets.protein * 4}
            macroKey="protein"
            Icon={Soup}
            percentage={macroRatios.protein}
          />
          <MacroProgressBar
            label="Fat"
            amount={nutritionalTargets.fat}
            unit="g"
            kcal={nutritionalTargets.fat * 9}
            macroKey="fat"
            Icon={Droplet}
            percentage={macroRatios.fat}
          />
          <MacroProgressBar
            label="Carbs"
            amount={nutritionalTargets.carbs}
            unit="g"
            kcal={nutritionalTargets.carbs * 4}
            macroKey="carbs"
            Icon={Wheat}
            percentage={macroRatios.carbs}
          />
        </div>
      </div>

      {/* Gradient section divider */}
      <div className="section-gradient-divider" />

      {/* Footer Info Card */}
      <div
        className="targets-card-footer p-4"
        style={{ background: footerBg }}
      >
        <div className="flex items-start">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5"
            style={{ backgroundColor: footerIconBg }}
          >
            <TrendingUp className="w-4 h-4" style={{ color: COLORS.primary[600] }} />
          </div>
          <div className="text-sm">
            <p className="font-semibold mb-1" style={{ color: footerTitleColor }}>
              Track Your Progress
            </p>
            <p style={{ color: footerTextColor }}>
              Head to the{' '}
              <span className="font-semibold" style={{ color: footerLinkColor }}>
                Meals tab
              </span>{' '}
              to track your daily intake and see real-time progress
              <span className="footer-chevron-nudge ml-1">
                <ChevronRight size={14} style={{ color: isDark ? '#818cf8' : COLORS.primary[500] }} />
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────
// PROFILE TAB — Combines Profile Card + Targets Card
// ─────────────────────────────────────────────────────────────

const ProfileTab = ({ formData, nutritionalTargets }) => {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <ProfileCard formData={formData} />
      <TargetsCard nutritionalTargets={nutritionalTargets} />
    </div>
  );
};

export default ProfileTab;