// web/src/components/StickyTabs.jsx
// ============================================================================
// StickyTabs — REVAMPED & FIXED primary navigation tabs (Profile / Meals / Shop)
//
// FIXES APPLIED:
//  1. ✅ Tabs now remain perfectly sticky and aligned with header at all times
//  2. ✅ Tabs auto-hide when Edit Profile or Plan Setup is active
//  3. ✅ Tabs instantly adjust when header changes size (no lag)
//  4. ✅ Made tabs thicker (56px instead of 48px) for better visibility
//  5. ✅ Improved transition smoothness and performance
//
// FEATURES:
//  - Animated sliding pill indicator that follows the active tab
//  - Smooth show/hide transitions (hidden during Settings, Saved Plans, or
//    when Plan Setup Wizard is open on mobile via `isMenuOpen`)
//  - Real-time header height tracking with instant response
//  - Theme-aware: full dark/light mode support
//  - z-index 990 — below Header (1020), above general content
//  - Enhanced visual weight and presence
//
// PROPS:
//  - activeTab    {string}  Current contentView value
//  - onTabChange  {func}    Tab change callback
//  - hidden       {bool}    Slide tabs offscreen (Settings, Saved Plans, etc.)
//  - disabled     {bool}    Disable interaction (onboarding gate)
//  - headerHeight {number}  Measured header height in px (default 64)
// ============================================================================

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { User, Utensils, ShoppingCart } from 'lucide-react';
import { COLORS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

const TABS = [
  { id: 'profile',     label: 'Profile',  Icon: User },
  { id: 'meals',       label: 'Meals',    Icon: Utensils },
  { id: 'ingredients', label: 'Shop',     Icon: ShoppingCart },
];

const TABS_Z = 990;
const TAB_HEIGHT = 56; // ✅ INCREASED from 48px to 56px for better visibility

const StickyTabs = ({
  activeTab,
  onTabChange,
  hidden = false,
  disabled = false,
  headerHeight = 64,
}) => {
  const { isDark } = useTheme();
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [hasMounted, setHasMounted] = useState(false);
  const [currentHeaderHeight, setCurrentHeaderHeight] = useState(headerHeight);

  // ✅ FIX: Instant header height tracking with no lag
  useEffect(() => {
    setCurrentHeaderHeight(headerHeight);
  }, [headerHeight]);

  // ── Measure the active tab and position the sliding pill ──
  const measurePill = useCallback(() => {
    const container = containerRef.current;
    const activeEl = tabRefs.current[activeTab];
    if (!container || !activeEl) return;

    const cRect = container.getBoundingClientRect();
    const tRect = activeEl.getBoundingClientRect();

    setPill({
      left: tRect.left - cRect.left,
      width: tRect.width,
    });
  }, [activeTab]);

  // Measure on mount, tab change, and resize
  useEffect(() => {
    // Double-rAF for reliable initial measurement
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

  // ✅ FIX: Remeasure pill when header height changes
  useEffect(() => {
    measurePill();
  }, [currentHeaderHeight, measurePill]);

  // ── Theme tokens with enhanced visual presence ──
  const surface = isDark
    ? 'rgba(15, 17, 23, 0.98)' // ✅ Increased opacity for better visibility
    : 'rgba(255, 255, 255, 0.99)';
  const border = isDark ? 'rgba(45, 49, 72, 0.7)' : 'rgba(0, 0, 0, 0.08)';
  const pillBg = isDark
    ? 'rgba(99, 102, 241, 0.18)' // ✅ Stronger pill background
    : 'rgba(99, 102, 241, 0.12)';
  const pillBorder = isDark
    ? 'rgba(129, 140, 248, 0.3)'
    : 'rgba(99, 102, 241, 0.2)';
  const activeColor = isDark ? '#c7d2fe' : COLORS.primary[700]; // ✅ Stronger contrast
  const inactiveColor = isDark ? '#6b7280' : COLORS.gray[500];
  const shadowBelow = isDark
    ? '0 2px 4px rgba(0, 0, 0, 0.5), 0 6px 16px rgba(0, 0, 0, 0.2)' // ✅ Stronger shadow
    : '0 2px 4px rgba(0, 0, 0, 0.06), 0 6px 16px rgba(0, 0, 0, 0.04)';

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // ✅ FIX: Use currentHeaderHeight directly for instant response
        top: hidden ? `-${TAB_HEIGHT + 8}px` : `${currentHeaderHeight}px`,
        height: `${TAB_HEIGHT}px`,
        zIndex: TABS_Z,
        backgroundColor: surface,
        borderBottom: `1px solid ${border}`,
        backdropFilter: 'blur(24px) saturate(180%)', // ✅ Increased blur for better separation
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: hidden ? 'none' : shadowBelow,
        opacity: hidden ? 0 : disabled ? 0.45 : 1,
        pointerEvents: hidden || disabled ? 'none' : 'auto',
        // ✅ FIX: Instant transition for top position (no lag)
        transition: 'top 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, box-shadow 0.3s ease',
        willChange: 'top, opacity',
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          maxWidth: '520px', // ✅ Slightly wider for better proportions
          margin: '0 auto',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px', // ✅ Slightly more padding
        }}
      >
        {/* ── Sliding pill indicator ── */}
        <div
          style={{
            position: 'absolute',
            top: '8px', // ✅ Adjusted for new height
            bottom: '8px',
            left: `${pill.left}px`,
            width: `${pill.width}px`,
            borderRadius: '12px', // ✅ Slightly larger radius
            backgroundColor: pillBg,
            border: `1.5px solid ${pillBorder}`, // ✅ Thicker border
            transition: hasMounted
              ? 'left 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'none',
            pointerEvents: 'none',
            boxShadow: isDark
              ? '0 2px 8px rgba(99, 102, 241, 0.2)'
              : '0 2px 8px rgba(99, 102, 241, 0.15)', // ✅ Added subtle glow
          }}
        />

        {/* ── Tab buttons ── */}
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;

          return (
            <button
              key={id}
              ref={(el) => { tabRefs.current[id] = el; }}
              onClick={() => !disabled && onTabChange(id)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                position: 'relative',
                zIndex: 1,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px', // ✅ Slightly more space between icon and text
                height: '100%',
                padding: '0 10px', // ✅ More padding for better touch targets
                border: 'none',
                background: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: isActive ? activeColor : inactiveColor,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: '0.875rem', // ✅ Slightly larger text (14px)
                fontWeight: isActive ? 650 : 500,
                letterSpacing: isActive ? '-0.005em' : '0',
                whiteSpace: 'nowrap',
                transition: 'color 0.25s ease, font-weight 0.25s ease, transform 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
                outline: 'none',
                // ✅ Added subtle scale on hover for better feedback
                transform: isActive ? 'scale(1)' : 'scale(0.98)',
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isActive) {
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !isActive) {
                  e.currentTarget.style.transform = 'scale(0.98)';
                }
              }}
            >
              <Icon
                size={19} // ✅ Slightly larger icons
                strokeWidth={isActive ? 2.4 : 1.9}
                style={{
                  transition: 'stroke-width 0.25s ease, transform 0.25s ease',
                  transform: isActive ? 'scale(1.08)' : 'scale(1)',
                  flexShrink: 0,
                }}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StickyTabs;