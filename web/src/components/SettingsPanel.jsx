// web/src/components/SettingsPanel.jsx
// UPDATED: Removed "Default Store" section, fixed Measurement Units persistence.
import React from 'react';
import {
  X,
  User,
  Info,
  Shield,
  Trash2,
  Eye,
  EyeOff,
  Terminal,
  ListX,
  Target,
  Cpu,
  Palette,
  Ruler,
} from 'lucide-react';
import { COLORS, Z_INDEX } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Settings panel/modal for app preferences.
 *
 * CHANGES from previous version:
 *  - REMOVED "Default Store" dropdown (store is set in preferences step).
 *  - REMOVED `currentStore`, `onStoreChange` props, `selectedStore` state, `handleSave`.
 *  - ADDED `measurementUnits` and `onMeasurementUnitsChange` props so the
 *    unit selection actually persists to formData / Firestore.
 */
const SettingsPanel = ({
  isOpen,
  onClose,
  onClearData,
  onEditProfile,
  // Measurement units (new)
  measurementUnits = 'metric',
  onMeasurementUnitsChange,
  // Logs
  showOrchestratorLogs = true,
  onToggleOrchestratorLogs,
  showFailedIngredientsLogs = true,
  onToggleFailedIngredientsLogs,
  showMacroDebugLog = false,
  onToggleMacroDebugLog = () => {},
  // AI Model
  selectedModel = 'gpt-5.1',
  onModelChange = () => {},
}) => {
  const { theme, setTheme, isDark } = useTheme();

  if (!isOpen) return null;

  const handleEditProfileClick = () => {
    if (onEditProfile) onEditProfile();
  };

  const handleClearAllData = () => {
    console.log('Attempting to clear all data.');
    if (onClearData) onClearData();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 animate-fadeIn"
        style={{ zIndex: Z_INDEX.modalBackdrop }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="settings-panel-body fixed top-0 right-0 bottom-0 w-full md:w-96 shadow-2xl overflow-y-auto animate-slideLeft"
        style={{
          zIndex: Z_INDEX.modal,
          backgroundColor: isDark ? '#181a24' : '#ffffff',
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6 flex items-center justify-between"
          style={{ zIndex: 10 }}
        >
          <h2 className="text-2xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-fast"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">

          {/* ─── Appearance / Theme Section ─── */}
          <div>
            <div className="flex items-center mb-4">
              <Palette size={20} className="mr-2" style={{ color: COLORS.primary[600] }} />
              <h3 className="font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                Appearance
              </h3>
            </div>

            <div className="flex gap-3">
              {[
                { key: 'light', label: 'Light' },
                { key: 'dark', label: 'Dark' },
                { key: 'system', label: 'System' },
              ].map((opt) => {
                const isActive = theme === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setTheme(opt.key)}
                    className="flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: isActive
                        ? isDark ? 'rgba(99,102,241,0.2)' : COLORS.primary[50]
                        : isDark ? '#1e2130' : COLORS.gray[100],
                      color: isActive
                        ? COLORS.primary[600]
                        : isDark ? '#9ca3b0' : COLORS.gray[600],
                      border: isActive
                        ? `2px solid ${COLORS.primary[500]}`
                        : `2px solid transparent`,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Measurement Units Section (FIXED — now persists) ─── */}
          <div>
            <div className="flex items-center mb-4">
              <Ruler size={20} className="mr-2" style={{ color: COLORS.primary[600] }} />
              <h3 className="font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                Measurement Units
              </h3>
            </div>

            <select
              value={measurementUnits}
              onChange={(e) => onMeasurementUnitsChange?.(e.target.value)}
              className="w-full p-3 border rounded-lg"
              style={{
                borderColor: isDark ? '#2d3148' : COLORS.gray[300],
                color: isDark ? '#f0f1f5' : COLORS.gray[900],
                backgroundColor: isDark ? '#1e2130' : '#ffffff',
              }}
            >
              <option value="metric">Metric (kg, cm)</option>
              <option value="imperial">Imperial (lb, ft/in)</option>
            </select>
          </div>

          {/* ─── AI Model Section ─── */}
          <div>
            <div className="flex items-center mb-4">
              <Cpu size={20} className="mr-2" style={{ color: COLORS.primary[600] }} />
              <h3 className="font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                AI Model
              </h3>
            </div>

            <div className="mb-4">
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: isDark ? '#d1d5db' : COLORS.gray[700] }}
              >
                Generation Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full p-3 border rounded-lg"
                style={{
                  borderColor: isDark ? '#2d3148' : COLORS.gray[300],
                  color: isDark ? '#f0f1f5' : COLORS.gray[900],
                  backgroundColor: isDark ? '#1e2130' : '#ffffff',
                }}
              >
                <option value="gpt-5.1">GPT-5.1 (Primary — Recommended)</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Faster)</option>
              </select>
            </div>

            <div
              className="flex items-center p-3 rounded-lg"
              style={{
                backgroundColor: isDark ? '#1e2130' : '#eff6ff',
                border: `1px solid ${isDark ? '#2d3148' : '#bfdbfe'}`,
              }}
            >
              <Info size={16} className="mr-2 flex-shrink-0" style={{ color: isDark ? '#818cf8' : '#3b82f6' }} />
              <span className="text-xs" style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }}>
                GPT-5.1 provides higher quality plans. Gemini 2.0 Flash is faster but may produce less varied meals.
              </span>
            </div>
          </div>

          {/* ─── Debug Logs Section ─── */}
          <div>
            <div className="flex items-center mb-4">
              <Terminal size={20} className="mr-2" style={{ color: COLORS.primary[600] }} />
              <h3 className="font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                Debug Logs
              </h3>
            </div>

            {[
              {
                label: 'Orchestrator Logs',
                icon: <Terminal size={16} />,
                value: showOrchestratorLogs,
                toggle: onToggleOrchestratorLogs,
              },
              {
                label: 'Failed Ingredients',
                icon: <ListX size={16} />,
                value: showFailedIngredientsLogs,
                toggle: onToggleFailedIngredientsLogs,
              },
              {
                label: 'Macro Debug',
                icon: <Target size={16} />,
                value: showMacroDebugLog,
                toggle: onToggleMacroDebugLog,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between p-3 rounded-lg mb-2"
                style={{
                  backgroundColor: isDark ? '#1e2130' : COLORS.gray[50],
                  border: `1px solid ${isDark ? '#2d3148' : COLORS.gray[200]}`,
                }}
              >
                <div className="flex items-center">
                  <span className="mr-2" style={{ color: isDark ? '#9ca3b0' : COLORS.gray[500] }}>
                    {item.icon}
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: isDark ? '#d1d5db' : COLORS.gray[700] }}
                  >
                    {item.label}
                  </span>
                </div>
                <button
                  onClick={() => item.toggle?.(!item.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: item.value
                      ? isDark ? 'rgba(16,185,129,0.15)' : '#d1fae5'
                      : isDark ? 'rgba(239,68,68,0.12)' : '#fee2e2',
                    color: item.value
                      ? isDark ? '#34d399' : '#059669'
                      : isDark ? '#f87171' : '#dc2626',
                  }}
                >
                  {item.value ? <Eye size={13} /> : <EyeOff size={13} />}
                  {item.value ? 'On' : 'Off'}
                </button>
              </div>
            ))}
          </div>

          {/* ─── Profile & Data Section ─── */}
          <div>
            <div className="flex items-center mb-4">
              <User size={20} className="mr-2" style={{ color: COLORS.primary[600] }} />
              <h3 className="font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                Profile & Data
              </h3>
            </div>

            <button
              onClick={handleEditProfileClick}
              className="w-full p-3 rounded-lg text-left font-medium transition-all mb-3"
              style={{
                backgroundColor: isDark ? '#1e2130' : COLORS.gray[50],
                color: isDark ? '#d1d5db' : COLORS.gray[700],
                border: `1px solid ${isDark ? '#2d3148' : COLORS.gray[200]}`,
              }}
            >
              Edit Profile
            </button>

            <button
              onClick={handleClearAllData}
              className="w-full p-3 rounded-lg text-left font-medium transition-all flex items-center gap-2"
              style={{
                backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
                color: isDark ? '#f87171' : '#dc2626',
                border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#fecaca'}`,
              }}
            >
              <Trash2 size={16} />
              Clear All Data
            </button>
          </div>

          {/* ─── About Section ─── */}
          <div
            className="text-center pt-4"
            style={{ borderTop: `1px solid ${isDark ? '#2d3148' : COLORS.gray[200]}` }}
          >
            <p className="text-xs" style={{ color: isDark ? '#6b7280' : COLORS.gray[400] }}>
              Cheffy v1.0.0
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;