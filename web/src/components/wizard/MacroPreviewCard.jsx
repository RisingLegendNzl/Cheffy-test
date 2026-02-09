// web/src/components/wizard/MacroPreviewCard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { COLORS } from '../../constants';

// Animated counter hook
const useAnimatedNumber = (target, duration = 600) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const start = display;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return display;
};

// Individual macro display
const MacroItem = ({ icon, label, value, unit }) => {
  const animatedValue = useAnimatedNumber(value);

  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ fontSize: '14px' }}>{icon}</span>
        <span
          className="font-semibold uppercase"
          style={{ fontSize: '11px', letterSpacing: '0.05em', opacity: 0.7 }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.02em' }}>
        {animatedValue.toLocaleString()}
        <span
          style={{ fontSize: '13px', fontWeight: '500', opacity: 0.6, marginLeft: '3px' }}
        >
          {unit}
        </span>
      </div>
    </div>
  );
};

const MacroPreviewCard = ({ formData }) => {
  // Parse inputs
  const w = parseFloat(formData.weight) || 75;
  const h = parseFloat(formData.height) || 180;
  const a = parseInt(formData.age, 10) || 30;
  const g = formData.gender || 'male';

  // Mifflin-St Jeor (mirrors api/plan/targets.js)
  const bmr =
    g === 'male'
      ? 10 * w + 6.25 * h - 5 * a + 5
      : 10 * w + 6.25 * h - 5 * a - 161;

  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9,
  };

  const goalAdjustments = {
    maintain: 0,
    cut_moderate: -0.15,
    cut_aggressive: -0.25,
    bulk_lean: 0.15,
    bulk_aggressive: 0.25,
  };

  const tdee = bmr * (activityMultipliers[formData.activityLevel] || 1.55);
  const adj = goalAdjustments[formData.goal] || 0;
  const calories = Math.max(1200, Math.round(tdee * (1 + adj)));

  // Macro estimation
  const proteinG = Math.round(w * 2);
  const fatG = Math.round((calories * 0.25) / 9);
  const carbG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);

  const macros = [
    { icon: '🔥', label: 'Calories', value: calories, unit: 'kcal' },
    { icon: '💪', label: 'Protein', value: proteinG, unit: 'g' },
    { icon: '🌾', label: 'Carbs', value: Math.max(0, carbG), unit: 'g' },
    { icon: '🥑', label: 'Fat', value: fatG, unit: 'g' },
  ];

  return (
    <div
      className="rounded-2xl p-6 text-white"
      style={{
        background: `linear-gradient(135deg, ${COLORS.primary[900]}, ${COLORS.primary[700]})`,
      }}
    >
      {/* Header */}
      <div
        className="font-semibold uppercase mb-1"
        style={{ fontSize: '11px', letterSpacing: '0.08em', opacity: 0.7 }}
      >
        Estimated Daily Targets
      </div>
      <div className="mb-5" style={{ fontSize: '13px', opacity: 0.5 }}>
        Based on your profile. Final values calculated server-side.
      </div>

      {/* Macro grid */}
      <div className="grid grid-cols-2 gap-3">
        {macros.map((m) => (
          <MacroItem key={m.label} {...m} />
        ))}
      </div>
    </div>
  );
};

export default MacroPreviewCard;
