// web/src/components/DayTabBar.jsx
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Save, FolderDown, MoreVertical, X } from 'lucide-react';
import { COLORS } from '../constants';

/**
 * DayTabBar — Concept B "Segmented Timeline"
 *
 * STICKY FIX: Uses position:sticky with will-change:transform and is
 * rendered OUTSIDE the <div className="p-4"> wrapper in MainApp so that
 * no padding or overflow context prevents sticking.
 */
const DayTabBar = ({
    totalDays,
    selectedDay,
    onSelectDay,
    onSavePlan,
    onLoadPlans,
    savingPlan = false,
    loading = false,
}) => {
    const trackRef = useRef(null);
    const segmentRefs = useRef({});
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const barRef = useRef(null);

    const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
    const [caretLeft, setCaretLeft] = useState(0);
    const [hasInitialized, setHasInitialized] = useState(false);

    // ── Hide for single-day plans ──
    if (totalDays <= 1) return null;

    // ── Derive stable day list (WHITE-SCREEN FIX) ──
    const dayNumbers = useMemo(
        () => Array.from({ length: totalDays }, (_, i) => i + 1),
        [totalDays]
    );

    // ── Clamp selectedDay (WHITE-SCREEN FIX) ──
    const clampedDay = useMemo(() => {
        if (selectedDay < 1) return 1;
        if (selectedDay > totalDays) return 1;
        return selectedDay;
    }, [selectedDay, totalDays]);

    // ── Position the sliding pill + caret ──
    const positionPill = useCallback(() => {
        const track = trackRef.current;
        const activeBtn = segmentRefs.current[clampedDay];
        if (!track || !activeBtn) return;

        const trackRect = track.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        const left = btnRect.left - trackRect.left;
        const width = btnRect.width;
        const center = left + width / 2;

        setPillStyle({ left, width });
        setCaretLeft(center);

        if (!hasInitialized) setHasInitialized(true);
    }, [clampedDay, hasInitialized]);

    // Double-rAF for reliable initial positioning
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            requestAnimationFrame(positionPill);
        });
        return () => cancelAnimationFrame(id);
    }, [clampedDay, totalDays, positionPill]);

    useEffect(() => {
        window.addEventListener('resize', positionPill);
        return () => window.removeEventListener('resize', positionPill);
    }, [positionPill]);

    // ── Scroll-triggered shadow ──
    useEffect(() => {
        const el = barRef.current;
        if (!el) return;
        const onScroll = () => {
            el.classList.toggle('scrolled', window.scrollY > 8);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll(); // Check immediately
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // ── Close kebab menu on outside click ──
    useEffect(() => {
        if (!menuOpen) return;
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen]);

    const getLabel = (day) => {
        if (day === clampedDay) return `Day ${day}`;
        if (totalDays > 5) return `D${day}`;
        return `Day ${day}`;
    };

    // Suppress spring animation on very first render
    const springTransition = hasInitialized
        ? 'left 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'
        : 'none';
    const caretTransition = hasInitialized
        ? 'left 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'
        : 'none';

    return (
        <div
            ref={barRef}
            className="day-tab-bar-concept-b"
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 30,
                background: 'rgba(255, 255, 255, 0.94)',
                backdropFilter: 'blur(18px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(18px) saturate(1.6)',
                borderBottom: `1px solid ${COLORS.gray[200]}`,
                willChange: 'transform',
            }}
        >
            <div className="flex items-center">
                {/* ── Segmented Track ── */}
                <div className="flex-1" style={{ padding: '10px 12px 0 12px' }}>
                    <div
                        ref={trackRef}
                        style={{
                            position: 'relative',
                            display: 'flex',
                            background: COLORS.gray[100],
                            borderRadius: '12px',
                            padding: '3px',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Sliding Gradient Pill */}
                        <div
                            style={{
                                position: 'absolute',
                                top: '3px',
                                bottom: '3px',
                                left: `${pillStyle.left}px`,
                                width: `${pillStyle.width}px`,
                                borderRadius: '10px',
                                background: `linear-gradient(135deg, ${COLORS.primary[500]}, ${COLORS.secondary ? COLORS.secondary[500] : '#a855f7'})`,
                                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                                transition: springTransition,
                                zIndex: 1,
                            }}
                        />

                        {/* Segment Buttons */}
                        {dayNumbers.map((day) => {
                            const isActive = day === clampedDay;
                            return (
                                <button
                                    key={`seg-${day}`}
                                    ref={(el) => { segmentRefs.current[day] = el; }}
                                    onClick={() => onSelectDay(day)}
                                    className="concept-b-seg-btn"
                                    style={{
                                        position: 'relative',
                                        zIndex: 2,
                                        flex: totalDays <= 7 ? '1 1 0%' : undefined,
                                        minWidth: totalDays > 7 ? '64px' : undefined,
                                        padding: '10px 4px',
                                        background: 'none',
                                        border: 'none',
                                        fontFamily: 'inherit',
                                        fontWeight: isActive ? 700 : 600,
                                        fontSize: '13px',
                                        color: isActive ? '#ffffff' : COLORS.gray[500],
                                        cursor: 'pointer',
                                        transition: 'color 0.25s',
                                        textAlign: 'center',
                                        userSelect: 'none',
                                        whiteSpace: 'nowrap',
                                    }}
                                    aria-current={isActive ? 'true' : undefined}
                                >
                                    {getLabel(day)}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Caret Triangle ── */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            height: '8px',
                            marginTop: '-1px',
                            overflow: 'visible',
                            position: 'relative',
                        }}
                    >
                        <svg
                            viewBox="0 0 16 8"
                            width="14"
                            height="8"
                            style={{
                                position: 'absolute',
                                left: `${caretLeft - 7}px`,
                                transition: caretTransition,
                            }}
                        >
                            <polygon
                                points="0,0 16,0 8,8"
                                fill={COLORS.primary[500]}
                                style={{ filter: 'drop-shadow(0 2px 3px rgba(99, 102, 241, 0.2))' }}
                            />
                        </svg>
                    </div>
                </div>

                {/* ── Kebab Menu (Save / Load) ── */}
                <div
                    ref={menuRef}
                    className="relative flex-shrink-0 border-l"
                    style={{
                        borderColor: COLORS.gray[200],
                        alignSelf: 'stretch',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <button
                        onClick={() => setMenuOpen((o) => !o)}
                        className="flex items-center justify-center w-11 py-3.5 transition-colors duration-150 hover:bg-gray-100"
                        aria-label="Plan actions"
                        style={{ color: COLORS.gray[500], height: '100%' }}
                    >
                        {menuOpen ? <X size={18} /> : <MoreVertical size={18} />}
                    </button>

                    {menuOpen && (
                        <div
                            className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border py-1 z-50"
                            style={{ borderColor: COLORS.gray[200] }}
                        >
                            <button
                                onClick={() => { setMenuOpen(false); onSavePlan?.(); }}
                                disabled={savingPlan || loading}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ color: COLORS.gray[800] }}
                            >
                                <Save size={16} style={{ color: COLORS.primary[600] }} />
                                {savingPlan ? 'Saving…' : 'Save Plan'}
                            </button>
                            <button
                                onClick={() => { setMenuOpen(false); onLoadPlans?.(); }}
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

            <style>{`
                .day-tab-bar-concept-b.scrolled {
                    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.07) !important;
                }
                .concept-b-seg-btn:not([aria-current="true"]):hover {
                    color: ${COLORS.gray[700]} !important;
                }
            `}</style>
        </div>
    );
};

export default DayTabBar;