// web/src/components/wizard/PersonalInfoStep.jsx
// UPDATED: Name is now mandatory, unit selectors for weight (kg/lb) and height (cm/ft+in).
// All values stored internally as metric (cm, kg) in formData.
import React, { useState, useEffect, useCallback } from 'react';
import { COLORS } from '../../constants';

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

// ── Shared styles ───────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: `1.5px solid ${COLORS.gray[300]}`,
  fontSize: '15px',
  color: COLORS.gray[900],
  backgroundColor: '#fff',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: COLORS.gray[700],
  marginBottom: '6px',
};

const errorStyle = {
  fontSize: '12px',
  color: '#ef4444',
  marginTop: '4px',
};

// ── Inline unit toggle ──────────────────────────────────────────────────────
const UnitToggle = ({ options, value, onChange }) => (
  <div
    style={{
      display: 'inline-flex',
      borderRadius: '8px',
      overflow: 'hidden',
      border: `1.5px solid ${COLORS.gray[300]}`,
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
          backgroundColor: value === opt.value ? COLORS.primary[500] : '#fff',
          color: value === opt.value ? '#fff' : COLORS.gray[600],
          transition: 'all 0.15s',
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// PersonalInfoStep — "About You" wizard step
// ═════════════════════════════════════════════════════════════════════════════
const PersonalInfoStep = ({ formData, onChange, errors = {}, measurementUnits = 'metric' }) => {
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

  // ── Unit‐switch handlers (convert display without touching formData) ──
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

  const handleHeightChangeCm = (e) => {
    const val = e.target.value;
    setDisplayHeightCm(val);
    onChange({ target: { name: 'height', value: val } });
  };

  const handleHeightChangeFt = (e) => {
    const val = e.target.value;
    setDisplayFt(val);
    const metricVal = ftInToCm(val, displayIn);
    onChange({ target: { name: 'height', value: metricVal } });
  };

  const handleHeightChangeIn = (e) => {
    const val = e.target.value;
    setDisplayIn(val);
    const metricVal = ftInToCm(displayFt, val);
    onChange({ target: { name: 'height', value: metricVal } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Name ── */}
      <div>
        <label style={labelStyle}>Name</label>
        <input
          type="text"
          name="name"
          value={formData.name || ''}
          onChange={onChange}
          placeholder="Enter your name"
          style={{
            ...inputStyle,
            borderColor: errors.name ? '#ef4444' : COLORS.gray[300],
          }}
        />
        {errors.name && <div style={errorStyle}>{errors.name}</div>}
      </div>

      {/* ── Gender ── */}
      <div>
        <label style={labelStyle}>Gender</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['male', 'female'].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange({ target: { name: 'gender', value: g } })}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: `1.5px solid ${
                  formData.gender === g ? COLORS.primary[500] : COLORS.gray[300]
                }`,
                backgroundColor:
                  formData.gender === g ? COLORS.primary[50] : '#fff',
                color:
                  formData.gender === g ? COLORS.primary[700] : COLORS.gray[700],
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        {errors.gender && <div style={errorStyle}>{errors.gender}</div>}
      </div>

      {/* ── Weight ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Weight</label>
          <UnitToggle
            options={[
              { label: 'kg', value: 'kg' },
              { label: 'lb', value: 'lb' },
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
          placeholder={weightUnit === 'lb' ? 'e.g. 165' : 'e.g. 75'}
          style={{
            ...inputStyle,
            borderColor: errors.weight ? '#ef4444' : COLORS.gray[300],
          }}
        />
        {errors.weight && <div style={errorStyle}>{errors.weight}</div>}
      </div>

      {/* ── Height ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Height</label>
          <UnitToggle
            options={[
              { label: 'cm', value: 'cm' },
              { label: 'ft', value: 'ft' },
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
            onChange={handleHeightChangeCm}
            placeholder="e.g. 180"
            style={{
              ...inputStyle,
              borderColor: errors.height ? '#ef4444' : COLORS.gray[300],
            }}
          />
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                inputMode="numeric"
                value={displayFt}
                onChange={handleHeightChangeFt}
                placeholder="ft"
                style={{
                  ...inputStyle,
                  borderColor: errors.height ? '#ef4444' : COLORS.gray[300],
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                inputMode="numeric"
                value={displayIn}
                onChange={handleHeightChangeIn}
                placeholder="in"
                style={{
                  ...inputStyle,
                  borderColor: errors.height ? '#ef4444' : COLORS.gray[300],
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
            borderColor: errors.age ? '#ef4444' : COLORS.gray[300],
          }}
        />
        {errors.age && <div style={errorStyle}>{errors.age}</div>}
      </div>

      {/* ── Body Fat % (optional) ── */}
      <div>
        <label style={labelStyle}>
          Body Fat %{' '}
          <span style={{ fontSize: '11px', fontWeight: 400, color: COLORS.gray[400] }}>
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
            borderColor: errors.bodyFat ? '#ef4444' : COLORS.gray[300],
          }}
        />
        {errors.bodyFat && <div style={errorStyle}>{errors.bodyFat}</div>}
      </div>
    </div>
  );
};

export default PersonalInfoStep;