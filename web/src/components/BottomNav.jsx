// web/src/components/BottomNav.jsx
import React from 'react';
import { Home, Utensils, ShoppingCart, User, Plus } from 'lucide-react';
import { COLORS, Z_INDEX, SHADOWS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Bottom navigation bar — primary navigation for all screen sizes.
 * Theme-aware: adapts background, borders, and icon colours to dark/light.
 */
const BottomNav = ({ 
  activeTab, 
  onTabChange, 
  showPlanButton = true,
  onNewPlan,
  disabled = false,
}) => {
  const { isDark } = useTheme();

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'meals', label: 'Meals', icon: Utensils },
    { id: 'ingredients', label: 'Shop', icon: ShoppingCart },
  ];

  const handleTabClick = (tabId) => {
    if (disabled) return;
    onTabChange(tabId);
  };

  // Theme-derived colours
  const navBg = isDark ? 'rgba(24, 26, 36, 0.95)' : '#ffffff';
  const navBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const navShadow = isDark
    ? '0 -4px 20px rgba(0,0,0,0.4)'
    : SHADOWS.xl;
  const activeColor = isDark ? '#a5b4fc' : COLORS.primary[600];
  const inactiveColor = isDark ? '#4b5563' : COLORS.gray[400];
  const activeLabelColor = isDark ? '#a5b4fc' : COLORS.primary[600];
  const inactiveLabelColor = isDark ? '#6b7280' : COLORS.gray[400];
  const indicatorColor = isDark ? '#818cf8' : COLORS.primary[600];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0"
      style={{
        zIndex: Z_INDEX.fixed,
        backgroundColor: navBg,
        borderTop: `1px solid ${navBorder}`,
        boxShadow: navShadow,
        backdropFilter: isDark ? 'blur(16px) saturate(180%)' : undefined,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        transition: 'opacity 0.2s ease',
      }}
    >
      <div className="flex items-center justify-around h-16 px-2 max-w-7xl mx-auto">
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          if (showPlanButton && index === 1) {
            return (
              <React.Fragment key={`group-${tab.id}`}>
                {/* Generate Plan FAB */}
                <button
                  onClick={() => !disabled && onNewPlan && onNewPlan()}
                  className="relative -mt-8 w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`,
                  }}
                  aria-label="Generate new plan"
                  disabled={disabled}
                >
                  <Plus size={28} className="text-white" />
                </button>

                {/* Regular tab */}
                <button
                  onClick={() => handleTabClick(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center h-full transition-all ${
                    isActive ? 'scale-105' : 'scale-100'
                  }`}
                  style={{
                    color: isActive ? activeColor : inactiveColor,
                  }}
                  disabled={disabled}
                >
                  <Icon size={22} className="mb-1" />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: isActive ? activeLabelColor : inactiveLabelColor }}
                  >
                    {tab.label}
                  </span>
                  {isActive && (
                    <div
                      className="absolute bottom-0 w-12 h-1 rounded-t-full"
                      style={{ backgroundColor: indicatorColor }}
                    />
                  )}
                </button>
              </React.Fragment>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center h-full relative transition-all ${
                isActive ? 'scale-105' : 'scale-100'
              }`}
              style={{
                color: isActive ? activeColor : inactiveColor,
              }}
              disabled={disabled}
            >
              <Icon size={22} className="mb-1" />
              <span
                className="text-xs font-semibold"
                style={{ color: isActive ? activeLabelColor : inactiveLabelColor }}
              >
                {tab.label}
              </span>
              {isActive && (
                <div
                  className="absolute bottom-0 w-12 h-1 rounded-t-full"
                  style={{ backgroundColor: indicatorColor }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;