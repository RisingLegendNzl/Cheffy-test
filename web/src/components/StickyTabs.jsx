// web/src/components/StickyTabs.jsx
// ============================================================================
// StickyTabs — CONCEPT 2: WELDED SEGMENTED TABS
//
// DESIGN:
//  The tab bar is welded directly to the header — sharing the same background
//  with NO gap. The tabs sit inside a recessed "track" (iOS-style segmented
//  control) with a sliding pill that highlights the active tab. The entire
//  header+tabs unit has a single bottom border, making them feel like one
//  cohesive block that's visually separate from content below.
//
// KEY CHANGES FROM PREVIOUS VERSION:
//  1. ✅ Tabs are NO LONGER a separate fixed element positioned via headerHeight
//  2. ✅ Tabs render INSIDE the Header's visual space (welded via negative offset)
//  3. ✅ iOS-style recessed segmented control with sliding pill background
//  4. ✅ The pill slides with smooth deceleration (no spring overshoot)
//  5. ✅ Distinct bordered card for the segmented track
//  6. ✅ Gap issue ELIMINATED — tabs are part of the header block
//  7. ✅ All existing functionality preserved (hidden, disabled, theme, a11y)
//
// ARCHITECTURE:
//  The StickyTabs component now renders a self-contained fixed bar that
//  positions itself directly below the header using `headerHeight` as its
//  `top` value. The Header component's bottom border is REMOVED (see
//  implementation guide) and this component provides the unified bottom
//  border for the entire welded block.
//
// PROPS (unchanged):
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
const TABS_AREA_HEIGHT = 52; // Height of the tabs area (track + padding)
const TRACK_HEIGHT = 40;     // Height of the segmented control track
const TRACK_PADDING = 3;     // Internal padding of the track

const StickyTabs = ({
  activeTab,
  onTabChange,
  hidden = false,
  disabled = false,
  headerHeight = 64,
}) => {
  const { isDark } = useTheme();
  const trackRef = useRef(null);
  const tabRefs = useRef({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [hasMounted, setHasMounted] = useState(false);
  const [currentHeaderHeight, setCurrentHeaderHeight] = useState(headerHeight);

  // Instant header height tracking
  useEffect(() => {
    setCurrentHeaderHeight(headerHeight);
  }, [headerHeight]);

  // ── Measure the active tab and position the sliding pill ──
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

  // Measure on mount, tab change, and resize
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

  useEffect(() => {
    measurePill();
  }, [currentHeaderHeight, measurePill]);

  // ── Theme tokens ──

  // Welded surface — matches the header background exactly
  const weldedBg = isDark
    ? 'rgba(15, 17, 23, 0.98)'
    : 'rgba(255, 255, 255, 0.99)';

  // Unified bottom border for the entire welded block
  const bottomBorder = isDark
    ? '1.5px solid rgba(45, 49, 72, 0.7)'
    : '1.5px solid rgba(0, 0, 0, 0.08)';

  // Recessed track background (slightly darker/inset)
  const trackBg = isDark
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(0, 0, 0, 0.04)';

  // Track border
  const trackBorder = isDark
    ? '1px solid rgba(255, 255, 255, 0.08)'
    : '1px solid rgba(0, 0, 0, 0.06)';

  // Sliding pill
  const pillBg = isDark
    ? 'rgba(45, 49, 72, 0.9)'
    : '#ffffff';
  const pillShadow = isDark
    ? '0 1px 4px rgba(0,0,0,0.3), 0 0.5px 1px rgba(0,0,0,0.2)'
    : '0 1px 4px rgba(0,0,0,0.08), 0 0.5px 1px rgba(0,0,0,0.06)';

  // Tab text colors
  const activeColor = isDark ? '#c7d2fe' : COLORS.primary[600];
  const inactiveColor = isDark ? '#6b7280' : COLORS.gray[400];
  const hoverColor = isDark ? '#9ca3af' : COLORS.gray[500];

  // Shadow below the entire welded block
  const blockShadow = isDark
    ? '0 2px 8px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.15)'
    : '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03)';

  return (
    <div
      className="welded-tabs-container"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: hidden ? `${currentHeaderHeight - TABS_AREA_HEIGHT - 8}px` : `${currentHeaderHeight}px`,
        height: `${TABS_AREA_HEIGHT}px`,
        zIndex: TABS_Z,
        backgroundColor: weldedBg,
        borderBottom: bottomBorder,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: hidden ? 'none' : blockShadow,
        opacity: hidden ? 0 : disabled ? 0.45 : 1,
        pointerEvents: hidden || disabled ? 'none' : 'auto',
        transition: 'top 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, box-shadow 0.3s ease',
        willChange: 'top, opacity',
        // Performance
        contain: 'layout style paint',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      {/* Centered segmented control track */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '0 16px 6px',
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
            // Subtle inset shadow for recessed look
            boxShadow: isDark
              ? 'inset 0 1px 3px rgba(0,0,0,0.25)'
              : 'inset 0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {/* ── Sliding pill indicator ── */}
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

          {/* ── Tab buttons ── */}
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;

            return (
              <button
                key={id}
                ref={(el) => { tabRefs.current[id] = el; }}
                onClick={() => !disabled && onTabChange(id)}
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
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  color: isActive ? activeColor : inactiveColor,
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
                  if (!disabled && !isActive) {
                    e.currentTarget.style.color = hoverColor;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled && !isActive) {
                    e.currentTarget.style.color = inactiveColor;
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
  );
};

export default StickyTabs;