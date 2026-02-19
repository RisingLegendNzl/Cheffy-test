// web/src/components/wizard/PersonalInfoStep.jsx
import React from 'react';
import FloatingInput from './FloatingInput';
import FloatingSelect from './FloatingSelect';

const PersonalInfoStep = ({ formData, onChange, errors }) => {
  return (
    <div className="flex flex-col gap-4">
      <FloatingInput
        label="Name"
        name="name"
        value={formData.name}
        onChange={onChange}
        placeholder="What should we call you?"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FloatingInput
          label="Height"
          name="height"
          type="number"
          value={formData.height}
          onChange={onChange}
          suffix="cm"
          required
          error={errors.height}
          min="100"
          max="250"
        />
        <FloatingInput
          label="Weight"
          name="weight"
          type="number"
          value={formData.weight}
          onChange={onChange}
          suffix="kg"
          required
          error={errors.weight}
          min="30"
          max="300"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FloatingInput
          label="Age"
          name="age"
          type="number"
          value={formData.age}
          onChange={onChange}
          required
          error={errors.age}
          min="13"
          max="99"
        />
        <FloatingInput
          label="Body Fat %"
          name="bodyFat"
          type="number"
          value={formData.bodyFat}
          onChange={onChange}
          suffix="%"
          placeholder="Optional"
          error={errors.bodyFat}
          min="3"
          max="60"
        />
      </div>

      <FloatingSelect
        label="Gender"
        name="gender"
        value={formData.gender}
        onChange={onChange}
        required
        error={errors.gender}
        options={[
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ]}
      />
// UPDATED: Full dark mode support — inputs, labels, unit toggles, gender selector.
// All values stored internally as metric (cm, kg) in formData.
import React, { useState, useEffect, useCallback } from 'react';
import { COLORS } from '../../constants';
import { useTheme } from '../../contexts/ThemeContext';

// ── Conversion helpers ──────────────────────────────────────────────────────
const kgToLb = (kg) => {
  const val = parseFloat(kg);
  return isNaN(val) ? '' : (val * 2.20462).toFixed(1);
};
const lbToKg = (lb) => {
  const val = parseFloat(lb);
  return isNaN(val) ? '' : (val / 2.20462).toFixed(1);
};
const cmToFtIn = (cm) => {
  const val = parseFloat(cm);
  if (isNaN(val)) return { ft: '', inches: '' };
  const totalIn = val / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn % 12);
  return { ft: String(ft), inches: String(inches) };
};
const ftInToCm = (ft, inches) => {
  const f = parseInt(ft || 0, 10);
  const i = parseInt(inches || 0, 10);
  if (isNaN(f) && isNaN(i)) return '';
  return ((f * 12 + i) * 2.54).toFixed(1);
};

// ── Inline unit toggle (theme-aware) ────────────────────────────────────────
const UnitToggle = ({ options, value, onChange }) => {
  const { isDark } = useTheme();
  const borderColor = isDark ? '#3d4158' : COLORS.gray[300];
  const inactiveBg = isDark ? '#252839' : '#fff';
  const inactiveColor = isDark ? '#9ca3b0' : COLORS.gray[600];

  return (
    <div
      style={{
        display: 'inline-flex',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1.5px solid ${borderColor}`,
        flexShrink: 0,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: value === opt.value ? COLORS.primary[500] : inactiveBg,
            color: value === opt.value ? '#fff' : inactiveColor,
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// PersonalStep — "About You" wizard step
// ═════════════════════════════════════════════════════════════════════════════
const PersonalStep = ({ formData, onChange, errors = {}, measurementUnits = 'metric' }) => {
  const { isDark } = useTheme();

  // ── Local unit state (defaults from app-level setting) ──
  const [weightUnit, setWeightUnit] = useState(
    measurementUnits === 'imperial' ? 'lb' : 'kg'
  );
  const [heightUnit, setHeightUnit] = useState(
    measurementUnits === 'imperial' ? 'ft' : 'cm'
  );

  // ── Local display values (user sees their preferred unit) ──
  const [displayWeight, setDisplayWeight] = useState('');
  const [displayFt, setDisplayFt] = useState('');
  const [displayIn, setDisplayIn] = useState('');
  const [displayHeightCm, setDisplayHeightCm] = useState('');

  // ── Initialise display values from formData (metric) ──
  useEffect(() => {
    if (weightUnit === 'lb') {
      setDisplayWeight(formData.weight ? kgToLb(formData.weight) : '');
    } else {
      setDisplayWeight(formData.weight || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (heightUnit === 'ft') {
      if (formData.height) {
        const { ft, inches } = cmToFtIn(formData.height);
        setDisplayFt(ft);
        setDisplayIn(inches);
      }
    } else {
      setDisplayHeightCm(formData.height || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Unit‐switch handlers ──
  const handleWeightUnitChange = useCallback(
    (newUnit) => {
      if (newUnit === weightUnit) return;
      setWeightUnit(newUnit);
      if (newUnit === 'lb') {
        setDisplayWeight(formData.weight ? kgToLb(formData.weight) : '');
      } else {
        setDisplayWeight(formData.weight || '');
      }
    },
    [weightUnit, formData.weight]
  );

  const handleHeightUnitChange = useCallback(
    (newUnit) => {
      if (newUnit === heightUnit) return;
      setHeightUnit(newUnit);
      if (newUnit === 'ft') {
        if (formData.height) {
          const { ft, inches } = cmToFtIn(formData.height);
          setDisplayFt(ft);
          setDisplayIn(inches);
        } else {
          setDisplayFt('');
          setDisplayIn('');
        }
      } else {
        setDisplayHeightCm(formData.height || '');
      }
    },
    [heightUnit, formData.height]
  );

  // ── Input handlers (always write metric to formData) ──
  const handleWeightChange = (e) => {
    const val = e.target.value;
    setDisplayWeight(val);
    const metricVal = weightUnit === 'lb' ? lbToKg(val) : val;
    onChange({ target: { name: 'weight', value: metricVal } });
  };

  const handleHeightCmChange = (e) => {
    const val = e.target.value;
    setDisplayHeightCm(val);
    onChange({ target: { name: 'height', value: val } });
  };

  const handleFtChange = (e) => {
    const val = e.target.value;
    setDisplayFt(val);
    const cm = ftInToCm(val, displayIn);
    onChange({ target: { name: 'height', value: cm } });
  };

  const handleInChange = (e) => {
    const val = e.target.value;
    setDisplayIn(val);
    const cm = ftInToCm(displayFt, val);
    onChange({ target: { name: 'height', value: cm } });
  };

  // ── Theme-aware styles ──
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1.5px solid ${isDark ? '#3d4158' : COLORS.gray[300]}`,
    fontSize: '15px',
    color: isDark ? '#f0f1f5' : COLORS.gray[900],
    backgroundColor: isDark ? '#252839' : '#fff',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: isDark ? '#d1d5db' : COLORS.gray[700],
    marginBottom: '6px',
  };

  const errorStyle = {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '4px',
  };

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      {/* ── Name (required) ── */}
      <div>
        <label style={labelStyle}>
          Name <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
        </label>
        <input
          type="text"
          name="name"
          value={formData.name || ''}
          onChange={onChange}
          placeholder="Enter your name"
          autoComplete="given-name"
          style={{
            ...inputStyle,
            borderColor: errors.name ? '#ef4444' : (isDark ? '#3d4158' : COLORS.gray[300]),
          }}
        />
        {errors.name && <div style={errorStyle}>{errors.name}</div>}
      </div>

      {/* ── Gender ── */}
      <div>
        <label style={labelStyle}>Gender</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { value: 'male', label: 'Male', icon: '♂' },
            { value: 'female', label: 'Female', icon: '♀' },
          ].map((opt) => {
            const isActive = formData.gender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onChange({ target: { name: 'gender', value: opt.value } })
                }
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: `2px solid ${isActive ? COLORS.primary[500] : (isDark ? '#3d4158' : COLORS.gray[200])}`,
                  backgroundColor: isActive
                    ? `${COLORS.primary[500]}10`
                    : (isDark ? '#252839' : '#fff'),
                  color: isActive
                    ? (isDark ? '#a5b4fc' : COLORS.primary[700])
                    : (isDark ? '#9ca3b0' : COLORS.gray[600]),
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '18px' }}>{opt.icon}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
        {errors.gender && <div style={errorStyle}>{errors.gender}</div>}
      </div>

      {/* ── Weight with unit toggle ── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <label style={{ ...labelStyle, marginBottom: 0 }}>Weight</label>
          <UnitToggle
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
            value={weightUnit}
            onChange={handleWeightUnitChange}
          />
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={displayWeight}
          onChange={handleWeightChange}
          placeholder={weightUnit === 'kg' ? 'e.g. 75' : 'e.g. 165'}
          style={{
            ...inputStyle,
            borderColor: errors.weight ? '#ef4444' : (isDark ? '#3d4158' : COLORS.gray[300]),
          }}
        />
        {errors.weight && <div style={errorStyle}>{errors.weight}</div>}
      </div>

      {/* ── Height with unit toggle ── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <label style={{ ...labelStyle, marginBottom: 0 }}>Height</label>
          <UnitToggle
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'ft', label: 'ft / in' },
            ]}
            value={heightUnit}
            onChange={handleHeightUnitChange}
          />
        </div>

        {heightUnit === 'cm' ? (
          <input
            type="number"
            inputMode="decimal"
            value={displayHeightCm}
            onChange={handleHeightCmChange}
            placeholder="e.g. 180"
            style={{
              ...inputStyle,
              borderColor: errors.height ? '#ef4444' : (isDark ? '#3d4158' : COLORS.gray[300]),
            }}
          />
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                inputMode="numeric"
                value={displayFt}
                onChange={handleFtChange}
                placeholder="ft"
                style={{
                  ...inputStyle,
                  borderColor: errors.height ? '#ef4444' : (isDark ? '#3d4158' : COLORS.gray[300]),
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                inputMode="numeric"
                value={displayIn}
                onChange={handleInChange}
                placeholder="in"
                style={{
                  ...inputStyle,
                  borderColor: errors.height ? '#ef4444' : (isDark ? '#3d4158' : COLORS.gray[300]),
                }}
              />
            </div>
          </div>
        )}
        {errors.height && <div style={errorStyle}>{errors.height}</div>}
      </div>

      {/* ── Age ── */}
      <div>
        <label style={labelStyle}>Age</label>
        <input
          type="number"
          inputMode="numeric"
          name="age"
          value={formData.age || ''}
          onChange={onChange}
          placeholder="e.g. 30"
          style={{
            ...inputStyle,
            borderColor: errors.age ? '#ef4444' : (isDark ? '#3d4158' : COLORS.gray[300]),
          }}
        />
        {errors.age && <div style={errorStyle}>{errors.age}</div>}
      </div>

      {/* ── Body Fat % (optional) ── */}
      <div>
        <label style={labelStyle}>
          Body Fat %{' '}
          <span style={{ fontSize: '11px', fontWeight: 400, color: isDark ? '#6b7280' : COLORS.gray[400] }}>
            (optional)
          </span>
        </label>
        <input
          type="number"
          inputMode="decimal"
          name="bodyFat"
          value={formData.bodyFat || ''}
          onChange={onChange}
          placeholder="e.g. 18"
          style={{
            ...inputStyle,
            borderColor: errors.bodyFat ? '#ef4444' : (isDark ? '#3d4158' : COLORS.gray[300]),
          }}
        />
        {errors.bodyFat && <div style={errorStyle}>{errors.bodyFat}</div>}
      </div>
    </div>
  );
};

export default PersonalInfoStep;
export default PersonalStep;
