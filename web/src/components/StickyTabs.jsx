// web/src/components/StickyTabs.jsx
// ============================================================================
// StickyTabs — Primary navigation tabs positioned directly under the header.
//
// Replaces BottomNav. Tabs stick below the header and remain visible during
// scroll within Profile / Meals / Shop views. They are hidden when inside
// Edit Profile or My Saved Plans views.
//
// UPDATED:
//  - Accepts `headerHeight` prop (measured in real-time by Header.jsx)
//    so the tabs always sit flush beneath the header, whether it's in
//    expanded state (~80px with subtitle) or collapsed state (~64px).
//  - z-index 990 — below Header (1020) and dropdown (1009/1010),
//    above general content. Burger menu renders on top of tabs.
// ============================================================================

import React from 'react';
import { User, Utensils, ShoppingCart } from 'lucide-react';
import { COLORS, SHADOWS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

const TABS = [
  { id: 'profile',     label: 'Profile',  Icon: User },
  { id: 'meals',       label: 'Meals',    Icon: Utensils },
  { id: 'ingredients', label: 'Shop',     Icon: ShoppingCart },
];

// z-index: BELOW Header (1020) and dropdown menu (1009/1010),
// above general page content. Modals (1040+) also layer above.
const TABS_Z = 990;

/**
 * StickyTabs
 *
 * Props:
 *  - activeTab    {string}  Current contentView value
 *  - onTabChange  {func}    Tab change callback
 *  - hidden       {bool}    When true, tabs slide out of view (used when
 *                            Edit Profile, My Saved Plans, or Settings is active)
 *  - disabled     {bool}    Disable interaction (e.g. during onboarding gate)
 *  - headerHeight {number}  Measured height of the Header in px (default 64)
 */
const StickyTabs = ({
  activeTab,
  onTabChange,
  hidden = false,
  disabled = false,
  headerHeight = 64,
}) => {
  const { isDark } = useTheme();

  // Theme-derived colours
  const tabBg = isDark ? 'rgba(24, 26, 36, 0.97)' : 'rgba(255, 255, 255, 0.97)';
  const borderColor = isDark ? '#2d3148' : COLORS.gray[200];
  const activeColor = isDark ? '#a5b4fc' : COLORS.primary[600];
  const inactiveColor = isDark ? '#6b7280' : COLORS.gray[400];
  const activeBgColor = isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.06)';
  const hoverBgColor = isDark ? 'rgba(99, 102, 241, 0.06)' : 'rgba(99, 102, 241, 0.03)';
  const indicatorColor = isDark ? '#818cf8' : COLORS.primary[600];

  return (
    <div
      className="fixed left-0 right-0 transition-all duration-300 ease-in-out"
      style={{
        // Dynamic top: tracks the header's measured height so tabs sit
        // flush beneath it in both expanded and collapsed states.
        top: hidden ? '-60px' : `${headerHeight}px`,
        zIndex: TABS_Z,
        backgroundColor: tabBg,
        borderBottom: `1px solid ${borderColor}`,
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        opacity: hidden ? 0 : (disabled ? 0.5 : 1),
        pointerEvents: hidden || disabled ? 'none' : 'auto',
        boxShadow: isDark
          ? '0 2px 8px rgba(0,0,0,0.3)'
          : '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => !disabled && onTabChange(id)}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 relative transition-all duration-200"
                style={{
                  color: isActive ? activeColor : inactiveColor,
                  backgroundColor: isActive ? activeBgColor : 'transparent',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  maxWidth: '200px',
                }}
                onMouseEnter={(e) => {
                  if (!isActive && !disabled) {
                    e.currentTarget.style.backgroundColor = hoverBgColor;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{label}</span>

                {/* Active indicator bar */}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                    style={{
                      width: '40%',
                      height: '2.5px',
                      backgroundColor: indicatorColor,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StickyTabs;