// web/src/components/ProfileTab.jsx
// Enhanced UI: gradient identity stripe, stat micro-icons with stagger entrance,
// goal colour-coded CARD (full container), animated calorie ring, cascading macro progress bars,
// macro icon badges, gradient footer with chevron nudge, living-border dashboard wrapper.

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

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Return a goal-specific colour from the GOAL_LABELS constant map. */
const getGoalColor = (goalKey) => {
  const entry = GOAL_LABELS[goalKey];
  return entry?.color || COLORS.primary[500];
};

/** Return the human-readable goal label. */
const getGoalLabel = (goalKey) => {
  const entry = GOAL_LABELS[goalKey];
  return entry?.label || goalKey.replace(/_/g, ' ');
};

/** Return the human-readable activity label. */
const getActivityLabel = (actKey) => {
  const entry = ACTIVITY_LABELS[actKey];
  return entry?.label || actKey;
};

/** Hex colour → rgba at given opacity */
const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Macro colour tokens keyed by macro id (maps to COLORS.macros)
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
  { key: 'goal',     label: 'Goal',     Icon: Target,   format: null },    // special render
  { key: 'activity', label: 'Activity', Icon: Activity, format: null },    // special render
];

const ProfileCard = ({ formData }) => {
  const goalColor = getGoalColor(formData.goal);

  return (
    <div className="profile-card-enhanced bg-white rounded-xl shadow-lg border overflow-hidden">
      {/* ── Gradient identity stripe ── */}
      <div
        className="h-1"
        style={{
          background: `linear-gradient(90deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`,
        }}
      />

      <div className="p-6">
        {/* ── Heading ── */}
        <h3 className="text-xl font-bold flex items-center mb-4" style={{ color: COLORS.primary[700] }}>
          <UserIcon className="w-5 h-5 mr-2" />
          User Profile
        </h3>

        {/* ── 2×2 stat grid with stagger entrance ── */}
        <div className="grid grid-cols-2 gap-4">
          {STAT_CONFIG.map((stat) => {
            const Icon = stat.Icon;

            // ── REDESIGNED: Goal as full-card colour state ──
            if (stat.key === 'goal') {
              return (
                <div
                  key={stat.key}
                  className="profile-stat-box p-3 rounded-lg"
                  style={{
                    backgroundColor: hexToRgba(goalColor, 0.10),
                    border: `1.5px solid ${hexToRgba(goalColor, 0.25)}`,
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

            // Special rendering for Activity
            if (stat.key === 'activity') {
              return (
                <div key={stat.key} className="profile-stat-box bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center mb-1">
                    <Icon size={14} style={{ color: COLORS.primary[400] }} className="mr-1.5" />
                    <span className="text-sm text-gray-500">{stat.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">
                    {getActivityLabel(formData.activityLevel)}
                  </span>
                </div>
              );
            }

            // Default stat rendering
            return (
              <div key={stat.key} className="profile-stat-box bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center mb-1">
                  <Icon size={14} style={{ color: COLORS.primary[400] }} className="mr-1.5" />
                  <span className="text-sm text-gray-500">{stat.label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-800">
                  {stat.format ? stat.format(formData[stat.key]) : formData[stat.key]}
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
// MACRO PROGRESS BAR (Element 2)
// ─────────────────────────────────────────────────────────────

const MacroProgressBar = ({ label, amount, unit, kcal, macroKey, Icon, percentage }) => {
  const colors = MACRO_COLORS[macroKey];

  return (
    <div className="macro-row space-y-1.5">
      {/* Label row with icon badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center mr-2"
            style={{ backgroundColor: colors.light }}
          >
            <Icon size={12} style={{ color: colors.dark }} />
          </div>
          <span className="text-sm font-semibold text-gray-700">{label}</span>
        </div>
        <span className="text-sm font-bold" style={{ color: colors.main }}>
          {amount}{unit}
          <span className="text-xs text-gray-400 ml-1">({kcal} kcal)</span>
        </span>
      </div>

      {/* Progress bar with fill animation */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-2 rounded-full macro-bar-fill macro-bar-fill--${macroKey}`}
          style={{
            background: `linear-gradient(90deg, ${colors.main}, ${colors.dark})`,
          }}
        />
      </div>

      {/* Percentage with coloured number */}
      <p className="text-xs text-right">
        <span className="font-semibold" style={{ color: colors.main }}>{percentage}%</span>
        <span className="text-gray-500"> of daily calories</span>
      </p>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────
// TARGETS CARD (Element 3 — main dashboard content)
// ─────────────────────────────────────────────────────────────

const TargetsCard = ({ nutritionalTargets }) => {
  const hasTargets = nutritionalTargets.calories > 0;

  // ── EMPTY STATE ──
  if (!hasTargets) {
    return (
      <div className="dashboard-card-wrapper bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl shadow-lg border border-indigo-200 p-8 text-center overflow-hidden">
        <div className="empty-state-icon-breathe w-20 h-20 mx-auto mb-4 bg-indigo-100 rounded-full flex items-center justify-center">
          <Target className="w-10 h-10 text-indigo-400" />
        </div>
        <h3 className="text-xl font-bold text-indigo-700 mb-2">
          No Targets Yet
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          Generate a plan to see your personalized nutritional targets
        </p>
        <div className="flex items-center justify-center text-sm text-indigo-500">
          <Zap className="w-4 h-4 mr-1 empty-state-zap" />
          Click "Generate Plan" to get started
        </div>
      </div>
    );
  }

  // ── Calculate macro ratios ──
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

  // ── SVG calorie ring calculations ──
  const size = 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="dashboard-card-wrapper bg-white rounded-xl shadow-lg border overflow-hidden">
      {/* ── Header ── */}
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

      {/* ── SPLIT VIEW LAYOUT ── */}
      <div className="grid md:grid-cols-2 gap-0">

        {/* LEFT SIDE: Calorie Target with animated ring */}
        <div
          className="p-8 flex flex-col items-center justify-center border-r"
          style={{
            background: `linear-gradient(135deg, ${COLORS.primary[50]}, ${COLORS.secondary[50]})`,
          }}
        >
          <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">
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
              {/* Background circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#e5e7eb"
                strokeWidth={strokeWidth}
                fill="none"
              />
              {/* Animated filled circle */}
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

            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Flame className="w-5 h-5 flame-heartbeat mb-1" style={{ color: COLORS.primary[500] }} />
              <span className="text-3xl font-bold" style={{ color: COLORS.gray[900] }}>
                {nutritionalTargets.calories.toLocaleString()}
              </span>
              <span className="text-xs text-gray-500 mt-0.5">kcal/day</span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Macro breakdown */}
        <div className="p-6 flex flex-col justify-center space-y-4">
          <h4 className="text-base font-bold text-gray-800 flex items-center">
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

      {/* ── Gradient section divider ── */}
      <div className="section-gradient-divider" />

      {/* ── Footer Info Card ── */}
      <div
        className="p-4"
        style={{
          background: `linear-gradient(135deg, ${COLORS.primary[50]}, #f3e8ff)`,
        }}
      >
        <div className="flex items-start">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5"
            style={{ backgroundColor: COLORS.primary[100] }}
          >
            <TrendingUp className="w-4 h-4" style={{ color: COLORS.primary[600] }} />
          </div>
          <div className="text-sm text-gray-700">
            <p className="font-semibold mb-1" style={{ color: COLORS.primary[800] }}>
              Track Your Progress
            </p>
            <p className="text-gray-600">
              Head to the{' '}
              <span className="font-semibold" style={{ color: COLORS.primary[600] }}>
                Meals tab
              </span>{' '}
              to track your daily intake and see real-time progress
              <span className="footer-chevron-nudge ml-1">
                <ChevronRight size={14} style={{ color: COLORS.primary[500] }} />
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