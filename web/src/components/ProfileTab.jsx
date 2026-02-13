// web/src/components/ProfileTab.jsx
// Theme-aware: adapts Profile Card + Targets Card to dark/light mode.
// Fixes: issue #1 (purple stripe), issue #5 (Blueprint card in dark mode).

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


// ─────────────────────────────────────────────────────────────
// PROFILE CARD (Element 1)
// ─────────────────────────────────────────────────────────────

const STAT_CONFIG = [
  { key: 'weight',   label: 'Weight',   Icon: Scale,    format: (v) => `${v}kg` },
  { key: 'bodyFat',  label: 'Body Fat', Icon: Percent,  format: (v) => v ? `${v}%` : 'N/A' },
  { key: 'goal',     label: 'Goal',     Icon: Target,   format: null },
  { key: 'activity', label: 'Activity', Icon: Activity, format: null },
];

const ProfileCard = ({ formData }) => {
  const { isDark } = useTheme();
  const goalColor = getGoalColor(formData.goal);

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
            const displayValue = stat.format ? stat.format(rawValue) : rawValue || 'N/A';

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
            <Icon className="w-3.5 h-3.5" style={{ color: colors.main }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: labelCol }}>
            {label}
          </span>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
            {amount}{unit}
          </span>
          <span className="text-xs ml-1" style={{ color: subCol }}>
            ({kcal} kcal · {percentage}%)
          </span>
        </div>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: trackBg }}
      >
        <div
          className="h-full rounded-full macro-bar-fill"
          style={{
            width: `${Math.min(percentage, 100)}%`,
            backgroundColor: colors.main,
          }}
        />
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────
// TARGETS CARD (Element 2) — "Your Daily Nutritional Blueprint"
// Issue #5: must match dark theme, kcal number must be visible
// ─────────────────────────────────────────────────────────────

const TargetsCard = ({ nutritionalTargets }) => {
  const { isDark } = useTheme();
  const hasTargets = nutritionalTargets.calories > 0;

  // SVG calorie ring calculations
  const size = 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Theme-derived colours
  const cardBg = isDark ? '#1e2130' : '#ffffff';
  const cardBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const ringPanelBg = isDark
    ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))'
    : `linear-gradient(135deg, ${COLORS.primary[50]}, ${COLORS.secondary[50]})`;
  const ringPanelBorderColor = isDark ? '#2d3148' : COLORS.gray[200];
  const dailyLabel = isDark ? '#9ca3b0' : COLORS.gray[600];
  const kcalValueColor = isDark ? '#ffffff' : COLORS.gray[900];
  const kcalUnitColor = isDark ? '#6b7280' : COLORS.gray[500];
  const ringTrackColor = isDark ? '#2d3148' : '#e5e7eb';
  const macroPanelBg = isDark ? '#1e2130' : 'transparent';
  const macroHeadingColor = isDark ? '#e5e7eb' : COLORS.gray[800];
  const footerBg = isDark
    ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))'
    : `linear-gradient(135deg, ${COLORS.primary[50]}, #f3e8ff)`;
  const footerIconBg = isDark ? 'rgba(99,102,241,0.15)' : COLORS.primary[100];
  const footerTitleColor = isDark ? '#a5b4fc' : COLORS.primary[800];
  const footerTextColor = isDark ? '#9ca3b0' : COLORS.gray[600];
  const footerLinkColor = isDark ? '#818cf8' : COLORS.primary[600];

  // Macro ratios
  const macroRatios = useMemo(() => {
    const { protein, fat, carbs } = nutritionalTargets;
    const proteinCal = protein * 4;
    const fatCal = fat * 9;
    const carbsCal = carbs * 4;
    const totalCal = proteinCal + fatCal + carbsCal;
    if (totalCal === 0) return { protein: 0, fat: 0, carbs: 0 };
    return {
      protein: Math.round((proteinCal / totalCal) * 100),
      fat: Math.round((fatCal / totalCal) * 100),
      carbs: Math.round((carbsCal / totalCal) * 100),
    };
  }, [nutritionalTargets]);

  // EMPTY STATE
  if (!hasTargets) {
    return (
      <div
        className="dashboard-card-wrapper rounded-xl shadow-lg border p-8 text-center overflow-hidden"
        style={{
          backgroundColor: isDark ? '#1e2130' : undefined,
          borderColor: isDark ? '#2d3148' : COLORS.primary[200],
          background: isDark ? '#1e2130' : `linear-gradient(to br, ${COLORS.primary[50]}, ${COLORS.secondary[50]})`,
        }}
      >
        <div
          className="empty-state-icon-breathe w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : COLORS.primary[100] }}
        >
          <Target className="w-10 h-10" style={{ color: isDark ? '#818cf8' : COLORS.primary[400] }} />
        </div>
        <h3 className="text-xl font-bold mb-2" style={{ color: isDark ? '#a5b4fc' : COLORS.primary[700] }}>
          No Targets Yet
        </h3>
        <p className="text-sm mb-4" style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }}>
          Generate a plan to see your personalized nutritional targets
        </p>
        <div className="flex items-center justify-center text-sm" style={{ color: isDark ? '#818cf8' : COLORS.primary[500] }}>
          <Zap className="w-4 h-4 mr-1 empty-state-zap" />
          Click "Generate Plan" to get started
        </div>
      </div>
    );
  }

  return (
    <div
      className="targets-card-surface dashboard-card-wrapper rounded-xl shadow-lg border overflow-hidden"
      style={{
        backgroundColor: cardBg,
        borderColor: cardBorder,
      }}
    >
      {/* Header */}
      <div
        className="text-white p-6"
        style={{
          background: `linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary[600]})`,
        }}
      >
        <h3 className="text-2xl font-bold text-center flex items-center justify-center">
          <Target className="w-6 h-6 mr-2" />
          Your Daily Nutritional Blueprint
        </h3>
        <p className="text-center text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Personalized for your goals
        </p>
      </div>

      {/* SPLIT VIEW LAYOUT */}
      <div className="grid md:grid-cols-2 gap-0">

        {/* LEFT SIDE: Calorie Target with ring */}
        <div
          className="targets-card-ring-panel p-8 flex flex-col items-center justify-center border-r"
          style={{
            background: ringPanelBg,
            borderRightColor: ringPanelBorderColor,
          }}
        >
          <p
            className="text-sm font-semibold uppercase tracking-wide mb-2"
            style={{ color: dailyLabel }}
          >
            Daily Target
          </p>

          {/* Calorie Ring */}
          <div className="relative mb-4" style={{ width: size, height: size }}>
            <svg
              className="transform -rotate-90"
              width={size}
              height={size}
              style={{ '--ring-circumference': circumference }}
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={ringTrackColor}
                strokeWidth={strokeWidth}
                fill="none"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="url(#calorieGradient)"
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={0}
                strokeLinecap="round"
                className="calorie-ring-fill"
              />
              <defs>
                <linearGradient id="calorieGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={COLORS.primary[500]} />
                  <stop offset="100%" stopColor={COLORS.secondary[500]} />
                </linearGradient>
              </defs>
            </svg>

            {/* Center text — Issue #5: kcal must be white/visible in dark mode */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Flame className="w-5 h-5 flame-heartbeat mb-1" style={{ color: COLORS.primary[500] }} />
              <span className="text-3xl font-bold" style={{ color: kcalValueColor }}>
                {nutritionalTargets.calories.toLocaleString()}
              </span>
              <span className="text-xs mt-0.5" style={{ color: kcalUnitColor }}>
                kcal/day
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Macro breakdown */}
        <div
          className="targets-card-macro-panel p-6 flex flex-col justify-center space-y-4"
          style={{ backgroundColor: macroPanelBg }}
        >
          <h4 className="text-base font-bold flex items-center" style={{ color: macroHeadingColor }}>
            <CheckCircle className="w-4 h-4 mr-2" style={{ color: COLORS.primary[500] }} />
            Macro Breakdown
          </h4>

          <div className="space-y-5">
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