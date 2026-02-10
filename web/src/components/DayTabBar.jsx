// web/src/components/DayTabBar.jsx
import React, { useRef, useEffect, useMemo } from 'react';
import { Save, FolderDown, MoreVertical, X } from 'lucide-react';
import { COLORS } from '../constants';

/**
 * DayTabBar — Sticky horizontal tab strip for switching between plan days.
 *
 * Replaces the old DaySidebar + Save/Load card approach.
 *   • Hidden entirely for single-day plans (totalDays === 1).
 *   • Horizontally scrollable on mobile when days exceed screen width.
 *   • Active tab: gradient underline + bold text; inactive: muted.
 *   • On desktop (≤7 days): all tabs visible without scrolling.
 *   • Integrated kebab menu for Save / Load actions (top-right).
 *
 * WHITE-SCREEN FIX (v14.1):
 *   • Uses useMemo to derive stable day list, preventing unnecessary
 *     re-renders when totalDays hasn't actually changed.
 *   • Clamps selectedDay to valid bounds before rendering active state,
 *     preventing a brief flash of no-active-tab during plan transitions.
 */
const DayTabBar = ({
    totalDays,
    selectedDay,
    onSelectDay,
    // Save / Load action props
    onSavePlan,
    onLoadPlans,
    savingPlan = false,
    loading = false,
}) => {
    const scrollContainerRef = useRef(null);
    const activeTabRef = useRef(null);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const menuRef = useRef(null);

    // ── Hide for single-day plans ──
    if (totalDays <= 1) return null;

    // ── WHITE-SCREEN FIX: Derive a stable day list ──
    // useMemo ensures we don't create a new array on every render unless
    // totalDays actually changes. This stabilises React's reconciliation.
    const dayNumbers = useMemo(
        () => Array.from({ length: totalDays }, (_, i) => i + 1),
        [totalDays]
    );

    // ── WHITE-SCREEN FIX: Clamp selectedDay for rendering ──
    // During plan transitions, selectedDay might momentarily be > totalDays.
    // Clamp it so we always highlight a valid tab (or none if truly invalid).
    const clampedSelectedDay = useMemo(() => {
        if (selectedDay < 1) return 1;
        if (selectedDay > totalDays) return 1;
        return selectedDay;
    }, [selectedDay, totalDays]);

    // ── Auto-scroll active tab into view on mount / day change ──
    useEffect(() => {
        if (activeTabRef.current && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const tab = activeTabRef.current;
            const containerRect = container.getBoundingClientRect();
            const tabRect = tab.getBoundingClientRect();

            // Only scroll if the tab is partially off-screen
            if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
                tab.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center',
                });
            }
        }
    }, [clampedSelectedDay]);

    // ── Close kebab menu on outside click ──
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [menuOpen]);

    return (
        <div
            className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b"
            style={{ borderColor: COLORS.gray[200] }}
        >
            <div className="flex items-center">
                {/* ── Tab strip (scrollable) ── */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 flex overflow-x-auto scrollbar-hide"
                    style={{
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                    }}
                >
                    {dayNumbers.map((day) => {
                        const isActive = day === clampedSelectedDay;

                        return (
                            <button
                                key={`day-tab-${day}`}
                                ref={isActive ? activeTabRef : null}
                                onClick={() => onSelectDay(day)}
                                className="relative flex-shrink-0 px-5 py-3.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
                                style={{
                                    color: isActive ? COLORS.primary[700] : COLORS.gray[500],
                                    fontWeight: isActive ? 700 : 500,
                                    // On desktop with ≤7 days, distribute tabs evenly
                                    ...(totalDays <= 7
                                        ? { flex: '1 1 0%', textAlign: 'center' }
                                        : { minWidth: '80px', textAlign: 'center' }),
                                }}
                                aria-current={isActive ? 'true' : undefined}
                            >
                                {/* Label */}
                                <span className="relative z-10">Day {day}</span>

                                {/* Gradient underline for active tab */}
                                {isActive && (
                                    <span
                                        className="absolute bottom-0 left-2 right-2 h-[3px] rounded-full"
                                        style={{
                                            background: `linear-gradient(90deg, ${COLORS.primary[500]}, ${COLORS.secondary[500]})`,
                                        }}
                                    />
                                )}

                                {/* Hover underline for inactive tabs */}
                                {!isActive && (
                                    <span
                                        className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full opacity-0 hover-underline transition-opacity duration-200"
                                        style={{ backgroundColor: COLORS.gray[300] }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ── Kebab action menu (Save / Load) ── */}
                <div ref={menuRef} className="relative flex-shrink-0 border-l" style={{ borderColor: COLORS.gray[200] }}>
                    <button
                        onClick={() => setMenuOpen((o) => !o)}
                        className="flex items-center justify-center w-11 h-full py-3.5 transition-colors duration-150 hover:bg-gray-100"
                        aria-label="Plan actions"
                        style={{ color: COLORS.gray[500] }}
                    >
                        {menuOpen ? <X size={18} /> : <MoreVertical size={18} />}
                    </button>

                    {/* Dropdown */}
                    {menuOpen && (
                        <div
                            className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border py-1 z-50"
                            style={{ borderColor: COLORS.gray[200] }}
                        >
                            <button
                                onClick={() => {
                                    setMenuOpen(false);
                                    onSavePlan?.();
                                }}
                                disabled={savingPlan || loading}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ color: COLORS.gray[800] }}
                            >
                                <Save size={16} style={{ color: COLORS.primary[600] }} />
                                {savingPlan ? 'Saving…' : 'Save Plan'}
                            </button>

                            <button
                                onClick={() => {
                                    setMenuOpen(false);
                                    onLoadPlans?.();
                                }}
                                disabled={loading}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ color: COLORS.gray[800] }}
                            >
                                <FolderDown size={16} style={{ color: COLORS.primary[600] }} />
                                Load Plans
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Utility CSS (scrollbar hide + hover underline) ── */}
            <style>{`
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                button:hover .hover-underline { opacity: 1 !important; }
            `}</style>
        </div>
    );
};

export default DayTabBar;