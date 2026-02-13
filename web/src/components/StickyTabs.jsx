// web/src/components/StickyTabs.jsx
// ============================================================================
// StickyTabs — Revamped primary navigation tabs (Profile / Meals / Shop)
//
// FEATURES:
//  - Animated sliding pill indicator that follows the active tab
//  - Smooth show/hide transitions (hidden during Settings, Saved Plans, or
//    when Plan Setup Wizard is open on mobile via `isMenuOpen`)
//  - Tracks `headerHeight` in real-time so tabs sit flush beneath the header
//  - Theme-aware: full dark/light mode support
//  - z-index 990 — below Header (1020), above general content
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
const TAB_HEIGHT = 48; // px — compact but comfortably tappable

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

  // ── Theme tokens ──
  const surface = isDark
    ? 'rgba(15, 17, 23, 0.96)'
    : 'rgba(255, 255, 255, 0.98)';
  const border = isDark ? 'rgba(45, 49, 72, 0.6)' : 'rgba(0, 0, 0, 0.06)';
  const pillBg = isDark
    ? 'rgba(99, 102, 241, 0.15)'
    : 'rgba(99, 102, 241, 0.08)';
  const pillBorder = isDark
    ? 'rgba(129, 140, 248, 0.25)'
    : 'rgba(99, 102, 241, 0.15)';
  const activeColor = isDark ? '#a5b4fc' : COLORS.primary[600];
  const inactiveColor = isDark ? '#6b7280' : COLORS.gray[400];
  const shadowBelow = isDark
    ? '0 1px 3px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.15)'
    : '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.02)';

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: hidden ? `-${TAB_HEIGHT + 8}px` : `${headerHeight}px`,
        height: `${TAB_HEIGHT}px`,
        zIndex: TABS_Z,
        backgroundColor: surface,
        borderBottom: `1px solid ${border}`,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: hidden ? 'none' : shadowBelow,
        opacity: hidden ? 0 : disabled ? 0.45 : 1,
        pointerEvents: hidden || disabled ? 'none' : 'auto',
        transition: 'top 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, box-shadow 0.3s ease',
        willChange: 'top, opacity',
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          maxWidth: '480px',
          margin: '0 auto',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px',
        }}
      >
        {/* ── Sliding pill indicator ── */}
        <div
          style={{
            position: 'absolute',
            top: '6px',
            bottom: '6px',
            left: `${pill.left}px`,
            width: `${pill.width}px`,
            borderRadius: '10px',
            backgroundColor: pillBg,
            border: `1px solid ${pillBorder}`,
            transition: hasMounted
              ? 'left 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'none',
            pointerEvents: 'none',
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
                gap: '7px',
                height: '100%',
                padding: '0 8px',
                border: 'none',
                background: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: isActive ? activeColor : inactiveColor,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: '0.8125rem',
                fontWeight: isActive ? 650 : 500,
                letterSpacing: isActive ? '-0.005em' : '0',
                whiteSpace: 'nowrap',
                transition: 'color 0.25s ease, font-weight 0.25s ease',
                WebkitTapHighlightColor: 'transparent',
                outline: 'none',
              }}
            >
              <Icon
                size={17}
                strokeWidth={isActive ? 2.4 : 1.8}
                style={{
                  transition: 'stroke-width 0.25s ease, transform 0.25s ease',
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
  );
};

export default StickyTabs;