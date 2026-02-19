// web/src/components/Header.jsx
// ============================================================================
// Header — WELDED HEADER + SEGMENTED TABS (Concept 2)
//
// ARCHITECTURE CHANGE:
//  The tabs are now EMBEDDED inside the Header as a single DOM block.
//  This eliminates the gap that occurred when two separate fixed elements
//  (Header + StickyTabs) tried to stay aligned via prop relay.
//
//  The Header now renders:
//    1. The brand bar (logo, menu button)
//    2. The segmented tab control (welded directly below the brand bar)
//    3. A single bottom border + shadow for the combined unit
//
//  The StickyTabs component is still imported and used in MainApp, but
//  it is now a THIN WRAPPER that receives a ref to the Header's tab area
//  and measures it. Actually — to keep the refactor minimal and avoid
//  changing MainApp's component tree — the tabs are rendered HERE and
//  StickyTabs becomes a lightweight positioning shim.
//
//  Wait — simplest approach: we embed tabs directly in Header and
//  StickyTabs renders null (see StickyTabs.jsx). Header receives the
//  tab props it needs.
//
// NEW PROPS (added):
//  - activeTab       {string}  Current contentView value
//  - onTabChange     {func}    Tab change callback
//  - tabsHidden      {bool}    Hide the tab bar (Settings, Saved Plans, etc.)
//  - tabsDisabled    {bool}    Disable tab interaction (onboarding gate)
//
// EXISTING PROPS (unchanged):
//  - userId, userName, onOpenSettings, onNavigateToProfile,
//    onSignOut, onOpenSavedPlans, onHeaderHeightChange
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChefHat, Menu, X, User, Settings, LogOut, Bookmark, Utensils, ShoppingCart } from 'lucide-react';
import { COLORS, SPACING, SHADOWS, Z_INDEX } from '../constants';
import { APP_CONFIG } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

// ── Z-index strategy (unchanged) ──
const DROPDOWN_BACKDROP_Z = Z_INDEX.dropdown + 9;   // 1009
const DROPDOWN_PANEL_Z    = Z_INDEX.dropdown + 10;   // 1010

// ── Tab definitions ──
const TABS = [
  { id: 'profile',     label: 'Profile',  Icon: User },
  { id: 'meals',       label: 'Meals',    Icon: Utensils },
  { id: 'ingredients', label: 'Shop',     Icon: ShoppingCart },
];

const TRACK_HEIGHT = 40;
const TRACK_PADDING = 3;

const Header = ({
  // Existing props
  userId,
  userName,
  onOpenSettings,
  onNavigateToProfile,
  onSignOut,
  onOpenSavedPlans,
  onHeaderHeightChange,
  // NEW: Tab props
  activeTab = 'profile',
  onTabChange,
  tabsHidden = false,
  tabsDisabled = false,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isDark } = useTheme();
  const headerRef = useRef(null);
  const trackRef = useRef(null);
  const tabRefs = useRef({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [hasMounted, setHasMounted] = useState(false);

  // ── Scroll listener ──
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Measure total header height (brand bar + tabs) and notify parent ──
  const reportHeight = useCallback(() => {
    if (headerRef.current && onHeaderHeightChange) {
      const h = headerRef.current.getBoundingClientRect().height;
      onHeaderHeightChange(h);
    }
  }, [onHeaderHeightChange]);

  // Report height when scroll state or tabs visibility changes
  useEffect(() => {
    reportHeight();
  }, [isScrolled, tabsHidden, reportHeight]);

  useEffect(() => {
    window.addEventListener('resize', reportHeight);
    return () => window.removeEventListener('resize', reportHeight);
  }, [reportHeight]);

  // ── Pill measurement ──
  const measurePill = useCallback(() => {
    const track = trackRef.current;
    const activeEl = tabRefs.current[activeTab];
    if (!track || !activeEl) return;

    const trackRect = track.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();

    setPill({
      left: tabRect.left - trackRect.left,
      width: tabRect.width,
    });
  }, [activeTab]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        measurePill();
        setHasMounted(true);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [measurePill]);

  useEffect(() => {
    window.addEventListener('resize', measurePill);
    return () => window.removeEventListener('resize', measurePill);
  }, [measurePill]);

  // Remeasure pill when tabs show/hide or scroll state changes
  useEffect(() => {
    if (!tabsHidden) {
      requestAnimationFrame(measurePill);
    }
  }, [tabsHidden, isScrolled, measurePill]);

  // ── Display name ──
  const displayName = (() => {
    if (userName && userName.trim()) return userName.trim();
    if (userId && userId.startsWith('local_')) return 'Local User';
    return userId || 'User';
  })();

  // ── Theme colours (Header) ──
  const headerBg = isDark
    ? (isScrolled ? 'rgba(15, 17, 23, 0.98)' : 'rgba(15, 17, 23, 0.6)')
    : (isScrolled ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0)');
  const borderColor = isDark ? 'rgba(45, 49, 72, 0.7)' : 'rgba(0, 0, 0, 0.08)';
  const titleColor = isDark ? '#f0f1f5' : COLORS.gray[900];
  const subtitleColor = isDark ? '#6b7280' : COLORS.gray[500];
  const menuBtnColor = isDark ? '#d1d5db' : COLORS.gray[700];

  // ── Theme colours (Dropdown) ──
  const dropdownBg = isDark ? '#1e2130' : '#ffffff';
  const dropdownBorder = isDark ? '#2d3148' : COLORS.gray[200];
  const dropdownShadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.08)'
    : SHADOWS['2xl'];
  const userInfoBg = isDark ? '#252839' : COLORS.gray[50];
  const userInfoLabel = isDark ? '#6b7280' : COLORS.gray[500];
  const userInfoName = isDark ? '#f0f1f5' : COLORS.gray[900];
  const menuItemColor = isDark ? '#e5e7eb' : COLORS.gray[900];
  const menuIconColor = isDark ? '#9ca3b0' : COLORS.gray[600];
  const menuHoverBg = isDark ? '#252839' : COLORS.gray[50];
  const dividerColor = isDark ? '#2d3148' : COLORS.gray[200];
  const versionColor = isDark ? '#4b5563' : COLORS.gray[400];

  // ── Theme colours (Tabs — segmented control) ──
  const trackBg = isDark
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(0, 0, 0, 0.04)';
  const trackBorder = isDark
    ? '1px solid rgba(255, 255, 255, 0.08)'
    : '1px solid rgba(0, 0, 0, 0.06)';
  const pillBg = isDark ? 'rgba(45, 49, 72, 0.9)' : '#ffffff';
  const pillShadow = isDark
    ? '0 1px 4px rgba(0,0,0,0.3), 0 0.5px 1px rgba(0,0,0,0.2)'
    : '0 1px 4px rgba(0,0,0,0.08), 0 0.5px 1px rgba(0,0,0,0.06)';
  const tabActiveColor = isDark ? '#c7d2fe' : COLORS.primary[600];
  const tabInactiveColor = isDark ? '#6b7280' : COLORS.gray[400];
  const tabHoverColor = isDark ? '#9ca3af' : COLORS.gray[500];

  // ── Block shadow (only when scrolled, covers combined unit) ──
  const blockShadow = isScrolled
    ? (isDark
        ? '0 2px 8px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.15)'
        : '0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 12px rgba(0, 0, 0, 0.04)')
    : 'none';

  // Dropdown top: measure from the header ref for accuracy
  // Use approximate values matching brand bar + tabs
  const dropdownTop = isScrolled
    ? `${tabsHidden ? 64 : 112}px`
    : `${tabsHidden ? 80 : 128}px`;

  return (
    <>
      {/* ════════════════════════════════════════════════════════════════════
          WELDED HEADER BLOCK — brand bar + tabs in a single fixed element
          ════════════════════════════════════════════════════════════════════ */}
      <header
        ref={headerRef}
        className="fixed top-0 left-0 right-0 transition-all duration-300"
        style={{
          zIndex: Z_INDEX.sticky,
          backgroundColor: headerBg,
          borderBottom: isScrolled || !tabsHidden ? `1.5px solid ${borderColor}` : '1.5px solid transparent',
          backdropFilter: isScrolled ? 'blur(20px) saturate(180%)' : 'none',
          WebkitBackdropFilter: isScrolled ? 'blur(20px) saturate(180%)' : 'none',
          boxShadow: blockShadow,
        }}
      >
        {/* ── Brand bar ── */}
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div
            className={`flex items-center justify-between transition-all duration-300 ${
              isScrolled ? 'py-3' : 'py-4'
            }`}
          >
            {/* Logo and Brand */}
            <div className="flex items-center space-x-3">
              <div
                className={`bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isScrolled ? 'w-10 h-10' : 'w-12 h-12'
                }`}
              >
                <ChefHat className="text-white" size={isScrolled ? 20 : 24} />
              </div>
              <div>
                <h1
                  className={`font-bold font-poppins transition-all duration-300 ${
                    isScrolled ? 'text-xl' : 'text-2xl'
                  }`}
                  style={{ color: titleColor }}
                >
                  Cheffy
                </h1>
                {!isScrolled && (
                  <p className="text-xs" style={{ color: subtitleColor }}>
                    Your AI Meal Planner
                  </p>
                )}
              </div>
            </div>

            {/* User Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-full transition-colors"
              style={{ color: menuBtnColor }}
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* ── Welded Segmented Tabs ── */}
        <div
          className="welded-tabs-area"
          style={{
            overflow: 'hidden',
            maxHeight: tabsHidden ? '0px' : '52px',
            opacity: tabsHidden ? 0 : tabsDisabled ? 0.45 : 1,
            pointerEvents: tabsHidden || tabsDisabled ? 'none' : 'auto',
            transition: 'max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
            willChange: 'max-height, opacity',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '52px',
              padding: '0 16px 8px',
            }}
          >
            <div
              ref={trackRef}
              className="welded-tabs-track"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: trackBg,
                border: trackBorder,
                borderRadius: '14px',
                padding: `${TRACK_PADDING}px`,
                width: '100%',
                maxWidth: '400px',
                height: `${TRACK_HEIGHT}px`,
                boxShadow: isDark
                  ? 'inset 0 1px 3px rgba(0,0,0,0.25)'
                  : 'inset 0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              {/* Sliding pill */}
              <div
                className="welded-tabs-pill"
                style={{
                  position: 'absolute',
                  top: `${TRACK_PADDING}px`,
                  bottom: `${TRACK_PADDING}px`,
                  left: `${pill.left}px`,
                  width: `${pill.width}px`,
                  borderRadius: '11px',
                  backgroundColor: pillBg,
                  boxShadow: pillShadow,
                  transition: hasMounted
                    ? 'left 0.35s cubic-bezier(0.25, 1, 0.5, 1), width 0.35s cubic-bezier(0.25, 1, 0.5, 1)'
                    : 'none',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />

              {/* Tab buttons */}
              {TABS.map(({ id, label, Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    ref={(el) => { tabRefs.current[id] = el; }}
                    onClick={() => !tabsDisabled && onTabChange && onTabChange(id)}
                    aria-current={isActive ? 'page' : undefined}
                    className="welded-tabs-button"
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      height: '100%',
                      padding: '0 8px',
                      border: 'none',
                      background: 'none',
                      cursor: tabsDisabled ? 'not-allowed' : 'pointer',
                      color: isActive ? tabActiveColor : tabInactiveColor,
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 500,
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                      transition: 'color 0.25s ease',
                      WebkitTapHighlightColor: 'transparent',
                      outline: 'none',
                      borderRadius: '11px',
                    }}
                    onMouseEnter={(e) => {
                      if (!tabsDisabled && !isActive) {
                        e.currentTarget.style.color = tabHoverColor;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!tabsDisabled && !isActive) {
                        e.currentTarget.style.color = tabInactiveColor;
                      }
                    }}
                  >
                    <Icon
                      size={17}
                      strokeWidth={isActive ? 2.3 : 1.8}
                      style={{
                        transition: 'stroke-width 0.25s ease, transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
                        transform: isActive ? 'scale(1.05)' : 'scale(1)',
                        flexShrink: 0,
                      }}
                    />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════
          DROPDOWN MENU (unchanged, except dropdownTop is adjusted)
          ════════════════════════════════════════════════════════════════════ */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 animate-fadeIn"
            style={{
              zIndex: DROPDOWN_BACKDROP_Z,
              backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)',
            }}
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Menu Panel */}
          <div
            className="fixed right-4 w-64 rounded-xl animate-scaleIn"
            style={{
              top: dropdownTop,
              zIndex: DROPDOWN_PANEL_Z,
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              boxShadow: dropdownShadow,
            }}
          >
            <div className="p-2">
              {/* User Info */}
              {userId && (
                <div
                  className="px-4 py-3 mb-2 rounded-lg"
                  style={{ backgroundColor: userInfoBg }}
                >
                  <p className="text-xs mb-1" style={{ color: userInfoLabel }}>
                    Signed in as
                  </p>
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: userInfoName }}
                  >
                    {displayName}
                  </p>
                </div>
              )}

              {/* Menu Items */}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onNavigateToProfile && onNavigateToProfile();
                }}
                className="w-full flex items-center px-4 py-3 rounded-lg text-sm transition-colors"
                style={{ color: menuItemColor }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = menuHoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <User size={18} className="mr-3" style={{ color: menuIconColor }} />
                <span>Edit Profile</span>
              </button>

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSavedPlans && onOpenSavedPlans();
                }}
                className="w-full flex items-center px-4 py-3 rounded-lg text-sm transition-colors"
                style={{ color: menuItemColor }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = menuHoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Bookmark size={18} className="mr-3" style={{ color: menuIconColor }} />
                <span>My Saved Plans</span>
              </button>

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSettings && onOpenSettings();
                }}
                className="w-full flex items-center px-4 py-3 rounded-lg text-sm transition-colors"
                style={{ color: menuItemColor }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = menuHoverBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Settings size={18} className="mr-3" style={{ color: menuIconColor }} />
                <span>Settings</span>
              </button>

              {/* Divider */}
              <div
                className="my-1 mx-2"
                style={{ borderTop: `1px solid ${dividerColor}` }}
              />

              {/* Sign Out */}
              {userId && (
                <>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSignOut && onSignOut();
                    }}
                    className="w-full flex items-center px-4 py-3 rounded-lg text-sm transition-colors"
                    style={{ color: COLORS.error.dark }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <LogOut size={18} className="mr-3" style={{ color: COLORS.error.main }} />
                    <span>Sign Out</span>
                  </button>
                </>
              )}
            </div>

            {/* App Version */}
            <div
              className="px-4 py-2 text-center"
              style={{
                borderTop: `1px solid ${dividerColor}`,
              }}
            >
              <p className="text-xs" style={{ color: versionColor }}>
                v{APP_CONFIG.version}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Spacer — matches header height (brand bar + tabs) */}
      <div
        style={{
          height: isScrolled
            ? (tabsHidden ? '64px' : '116px')
            : (tabsHidden ? '80px' : '132px'),
          transition: 'height 0.3s ease',
        }}
      />
    </>
  );
};

export default Header;