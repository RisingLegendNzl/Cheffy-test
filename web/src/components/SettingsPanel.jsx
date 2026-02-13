// web/src/components/SettingsPanel.jsx
import React, { useState } from 'react';
import { 
  X, 
  User, 
  Store, 
  Globe, 
  Info, 
  Shield,
  ChevronRight,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Terminal,
  ListX,
  Target,
  Cpu,
  Sun,
  Moon,
  Palette
} from 'lucide-react';
import { COLORS, Z_INDEX, SHADOWS } from '../constants';
import { APP_CONFIG } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Settings panel/modal for app preferences.
 * Now includes Appearance section for Dark/Light mode toggle.
 */
const SettingsPanel = ({ 
  isOpen, 
  onClose,
  currentStore = 'Woolworths',
  onStoreChange,
  onClearData,
  onEditProfile,
  showOrchestratorLogs = true,
  onToggleOrchestratorLogs,
  showFailedIngredientsLogs = true,
  onToggleFailedIngredientsLogs,
  showMacroDebugLog = false,
  onToggleMacroDebugLog = () => {},
  selectedModel = 'gpt-5.1',
  onModelChange = () => {},
}) => {
  const [selectedStore, setSelectedStore] = useState(currentStore);
  const { theme, setTheme, isDark } = useTheme();

  if (!isOpen) return null;

  const handleSave = () => {
    if (onStoreChange) {
      onStoreChange(selectedStore);
    }
    onClose();
  };

  const handleEditProfileClick = () => {
    if (onEditProfile) {
      onEditProfile();
    }
  };

  const handleClearAllData = () => {
    console.log('Attempting to clear all data. (Confirmation skipped)');
    if (onClearData) {
      onClearData();
    }
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

            <div
              className="flex rounded-xl overflow-hidden"
              style={{
                border: `2px solid ${isDark ? '#2d3148' : COLORS.gray[200]}`,
                backgroundColor: isDark ? '#1e2130' : COLORS.gray[50],
              }}
            >
              {/* Light Mode Button */}
              <button
                onClick={() => setTheme('light')}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 font-semibold text-sm transition-all duration-200"
                style={{
                  backgroundColor: !isDark ? COLORS.primary[500] : 'transparent',
                  color: !isDark ? '#ffffff' : (isDark ? '#9ca3b0' : COLORS.gray[500]),
                }}
              >
                <Sun size={16} />
                Light
              </button>

              {/* Dark Mode Button */}
              <button
                onClick={() => setTheme('dark')}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 font-semibold text-sm transition-all duration-200"
                style={{
                  backgroundColor: isDark ? COLORS.primary[500] : 'transparent',
                  color: isDark ? '#ffffff' : COLORS.gray[500],
                }}
              >
                <Moon size={16} />
                Dark
              </button>
            </div>

            <p className="text-xs mt-3" style={{ color: isDark ? '#6b7280' : COLORS.gray[500] }}>
              Your preference is saved automatically and persists across sessions.
            </p>
          </div>

          {/* ─── Preferences Section ─── */}
          <div>
            <div className="flex items-center mb-4">
              <Store size={20} className="mr-2" style={{ color: COLORS.primary[600] }} />
              <h3 className="font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                Preferences
              </h3>
            </div>

            {/* Default Store */}
            <div className="mb-4">
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: isDark ? '#d1d5db' : COLORS.gray[700] }}
              >
                Default Store
              </label>
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full p-3 border rounded-lg"
                style={{
                  borderColor: isDark ? '#2d3148' : COLORS.gray[300],
                  color: isDark ? '#f0f1f5' : COLORS.gray[900],
                  backgroundColor: isDark ? '#1e2130' : '#ffffff',
                }}
              >
                <option value="Woolworths">Woolworths</option>
                <option value="Coles">Coles</option>
              </select>
            </div>

            {/* Units */}
            <div className="mb-4">
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: isDark ? '#d1d5db' : COLORS.gray[700] }}
              >
                Measurement Units
              </label>
              <select
                className="w-full p-3 border rounded-lg"
                style={{
                  borderColor: isDark ? '#2d3148' : COLORS.gray[300],
                  color: isDark ? '#f0f1f5' : COLORS.gray[900],
                  backgroundColor: isDark ? '#1e2130' : '#ffffff',
                }}
              >
                <option value="metric">Metric (kg, g)</option>
                <option value="imperial">Imperial (lb, oz)</option>
              </select>
            </div>
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
                backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : COLORS.primary[50],
              }}
            >
              <Info size={14} className="mr-2 flex-shrink-0" style={{ color: COLORS.primary[600] }} />
              <p className="text-xs" style={{ color: isDark ? '#a5b4fc' : COLORS.primary[700] }}>
                <strong>Current:</strong> {selectedModel === 'gpt-5.1' ? 'GPT-5.1' : 'Gemini 2.0 Flash'}.
                {' '}The selected model is used for meal plan generation. If it fails, the other model is used as a fallback automatically.
              </p>
            </div>
          </div>

          {/* ─── Diagnostics Section ─── */}
          <div>
            <div className="flex items-center mb-4">
              <Terminal size={20} className="mr-2" style={{ color: COLORS.primary[600] }} />
              <h3 className="font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                Diagnostics
              </h3>
            </div>

            {/* Orchestrator Logs Toggle */}
            <div
              className="flex items-center justify-between p-4 rounded-lg mb-3 transition-fast"
              style={{
                backgroundColor: isDark ? '#1e2130' : COLORS.gray[50],
              }}
            >
              <div className="flex items-center">
                <Terminal size={16} className="mr-2" style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }} />
                <label className="text-sm font-semibold" style={{ color: isDark ? '#d1d5db' : COLORS.gray[700] }}>
                  Orchestrator Logs
                </label>
              </div>
              <button
                onClick={() => onToggleOrchestratorLogs && onToggleOrchestratorLogs(!showOrchestratorLogs)}
                className="p-2 rounded-lg transition-fast"
                style={{
                  backgroundColor: showOrchestratorLogs ? COLORS.success.light : (isDark ? '#2d3148' : COLORS.gray[200]),
                  color: showOrchestratorLogs ? COLORS.success.dark : (isDark ? '#6b7280' : COLORS.gray[600]),
                }}
              >
                {showOrchestratorLogs ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            {/* Failed Ingredients Logs Toggle */}
            <div
              className="flex items-center justify-between p-4 rounded-lg mb-3 transition-fast"
              style={{
                backgroundColor: isDark ? '#1e2130' : COLORS.gray[50],
              }}
            >
              <div className="flex items-center">
                <ListX size={16} className="mr-2" style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }} />
                <label className="text-sm font-semibold" style={{ color: isDark ? '#d1d5db' : COLORS.gray[700] }}>
                  Failed Ingredients Log
                </label>
              </div>
              <button
                onClick={() => onToggleFailedIngredientsLogs && onToggleFailedIngredientsLogs(!showFailedIngredientsLogs)}
                className="p-2 rounded-lg transition-fast"
                style={{
                  backgroundColor: showFailedIngredientsLogs ? COLORS.success.light : (isDark ? '#2d3148' : COLORS.gray[200]),
                  color: showFailedIngredientsLogs ? COLORS.success.dark : (isDark ? '#6b7280' : COLORS.gray[600]),
                }}
              >
                {showFailedIngredientsLogs ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            {/* Macro Debug Log Toggle */}
            <div
              className="flex items-center justify-between p-4 rounded-lg mb-3 transition-fast"
              style={{
                backgroundColor: isDark ? '#1e2130' : COLORS.gray[50],
              }}
            >
              <div className="flex items-center">
                <Target size={16} className="mr-2" style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }} />
                <label className="text-sm font-semibold" style={{ color: isDark ? '#d1d5db' : COLORS.gray[700] }}>
                  Macro Debug Log
                </label>
              </div>
              <button
                onClick={() => onToggleMacroDebugLog(!showMacroDebugLog)}
                className="p-2 rounded-lg transition-fast"
                style={{
                  backgroundColor: showMacroDebugLog ? COLORS.success.light : (isDark ? '#2d3148' : COLORS.gray[200]),
                  color: showMacroDebugLog ? COLORS.success.dark : (isDark ? '#6b7280' : COLORS.gray[600]),
                }}
              >
                {showMacroDebugLog ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            <p className="text-xs mt-3" style={{ color: isDark ? '#6b7280' : COLORS.gray[500] }}>
              Toggle diagnostic logs on/off. These are useful for troubleshooting but can clutter the interface.
            </p>
          </div>

          {/* ─── About Section ─── */}
          <div>
            <div className="flex items-center mb-4">
              <Info size={20} className="mr-2" style={{ color: COLORS.primary[600] }} />
              <h3 className="font-bold" style={{ color: isDark ? '#f0f1f5' : COLORS.gray[900] }}>
                About
              </h3>
            </div>
            <div className="space-y-2 text-sm">
              <p style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }}>
                <strong>App Name:</strong> {APP_CONFIG.name}
              </p>
              <p style={{ color: isDark ? '#9ca3b0' : COLORS.gray[600] }}>
                <strong>Version:</strong> {APP_CONFIG.version}
              </p>
              <button
                className="flex items-center text-indigo-600 hover:text-indigo-700"
              >
                View Privacy Policy
                <ChevronRight size={16} className="ml-1" />
              </button>
            </div>
          </div>

          {/* ─── Danger Zone ─── */}
          <div>
            <div className="flex items-center mb-4">
              <Trash2 size={20} className="mr-2" style={{ color: COLORS.error.main }} />
              <h3 className="font-bold" style={{ color: COLORS.error.main }}>
                Danger Zone
              </h3>
            </div>
            <button
              onClick={handleClearAllData}
              className="w-full p-4 border-2 rounded-lg transition-fast"
              style={{
                backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
                borderColor: isDark ? 'rgba(239,68,68,0.25)' : '#fecaca',
                color: COLORS.error.main,
              }}
            >
              <Trash2 size={20} className="inline mr-2" />
              Clear All Data
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="settings-panel-footer sticky bottom-0 border-t p-6 flex space-x-3"
          style={{
            borderColor: isDark ? '#2d3148' : COLORS.gray[200],
            backgroundColor: isDark ? '#181a24' : '#ffffff',
          }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-lg font-semibold border transition-fast"
            style={{
              borderColor: isDark ? '#2d3148' : COLORS.gray[300],
              color: isDark ? '#d1d5db' : COLORS.gray[700],
              backgroundColor: isDark ? '#1e2130' : 'transparent',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-lg font-semibold text-white hover-lift transition-spring"
            style={{ backgroundColor: COLORS.primary[500] }}
          >
            <Save size={18} className="inline mr-2" />
            Save Changes
          </button>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;