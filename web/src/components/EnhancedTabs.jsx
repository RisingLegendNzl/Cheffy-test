// web/src/components/EnhancedTabs.jsx
// Sliding gradient tab bar with animated underline indicator,
// icon micro-animations, count badges, and hover states.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { LayoutDashboard, Utensils, ShoppingBag } from 'lucide-react';

/**
 * TAB DEFINITIONS
 * Each tab has an id (matching contentView values), a display label,
 * a lucide icon, and a flag indicating if it requires generated results.
 */
const TAB_DEFS = [
  { id: 'profile',     label: 'Summary',  Icon: LayoutDashboard, requiresResults: false },
  { id: 'meals',       label: 'Meals',    Icon: Utensils,        requiresResults: true  },
  { id: 'ingredients', label: 'Shopping',  Icon: ShoppingBag,     requiresResults: true  },
];

/**
 * EnhancedTabs
 *
 * Props:
 *  - activeTab       {string}  Current contentView value ('profile' | 'meals' | 'ingredients')
 *  - onTabChange     {func}    Callback to change tab
 *  - hasResults      {bool}    Whether a plan has been generated (shows/hides Meals & Shopping)
 *  - mealCount       {number}  Number of meals in the plan (shown as badge on Meals tab)
 *  - ingredientCount {number}  Number of unique ingredients (shown as badge on Shopping tab)
 */
const EnhancedTabs = ({
  activeTab = 'profile',
  onTabChange,
  hasResults = false,
  mealCount = 0,
  ingredientCount = 0,
}) => {
  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Filter visible tabs: Summary always visible; Meals & Shopping only when results exist
  const visibleTabs = TAB_DEFS.filter(t => !t.requiresResults || hasResults);

  // Measure and position the sliding indicator under the active tab
  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    const activeEl = tabRefs.current[activeTab];
    if (!container || !activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();

    setIndicatorStyle({
      left: tabRect.left - containerRect.left,
      width: tabRect.width,
    });
  }, [activeTab]);

  // Recalculate on mount, tab change, and window resize
  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator, hasResults]);

  // Badge values keyed by tab id
  const badges = {
    meals: mealCount > 0 ? mealCount : null,
    ingredients: ingredientCount > 0 ? ingredientCount : null,
  };

  return (
    <div ref={containerRef} className="enhanced-tabs-container">
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.Icon;
        const badge = badges[tab.id] || null;

        return (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[tab.id] = el; }}
            onClick={() => onTabChange(tab.id)}
            className={`enhanced-tab-button ${isActive ? 'enhanced-tab-button--active' : ''}`}
          >
            <span className="enhanced-tab-icon" key={`icon-${tab.id}-${isActive}`}>
              <Icon size={18} />
            </span>
            {tab.label}
            {badge !== null && (
              <span className="tab-count-badge">{badge}</span>
            )}
          </button>
        );
      })}

      {/* Sliding gradient underline */}
      <div
        className="enhanced-tabs-indicator"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
      />
    </div>
  );
};

export default EnhancedTabs;