// web/src/components/SavedPlansModal.jsx
// ============================================================================
// SavedPlansModal — Theme-aware modal for loading/managing saved plans.
//
// UPDATES:
// 1. Body scroll lock (iOS-safe position:fixed technique) when open.
//    Prevents background scroll bleed. No layout jump.
// 2. Clean state reset on close.
// 3. Inline rename functionality preserved.
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { X, Calendar, Trash2, Download, CheckCircle, Pencil, Check } from 'lucide-react';
import { COLORS, SHADOWS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

const SavedPlansModal = ({
    isOpen,
    onClose,
    savedPlans,
    activePlanId,
    onLoadPlan,
    onDeletePlan,
    onRenamePlan,
    loadingPlan
}) => {
    const [deletingPlanId, setDeletingPlanId] = useState(null);
    const [renamingPlanId, setRenamingPlanId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameError, setRenameError] = useState('');
    const [renameSaving, setRenameSaving] = useState(false);
    const renameInputRef = useRef(null);
    const scrollYRef = useRef(0);
    const { isDark } = useTheme();

    // ── Body scroll lock (iOS-safe position:fixed technique) ──
    useEffect(() => {
        if (!isOpen) return;

        scrollYRef.current = window.scrollY;
        const scrollY = scrollYRef.current;
        const body = document.body;
        const html = document.documentElement;

        // Calculate scrollbar width to prevent layout jump
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

        // Lock
        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.left = '0';
        body.style.right = '0';
        body.style.overflow = 'hidden';
        html.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            body.style.paddingRight = `${scrollbarWidth}px`;
        }

        return () => {
            // Unlock
            body.style.position = '';
            body.style.top = '';
            body.style.left = '';
            body.style.right = '';
            body.style.overflow = '';
            html.style.overflow = '';
            body.style.paddingRight = '';
            window.scrollTo(0, scrollY);
        };
    }, [isOpen]);

    // ── Clean state reset when modal closes ──
    useEffect(() => {
        if (!isOpen) {
            setDeletingPlanId(null);
            setRenamingPlanId(null);
            setRenameValue('');
            setRenameError('');
            setRenameSaving(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleLoadClick = async (planId) => {
        const success = await onLoadPlan(planId);
        if (success) {
            onClose();
        }
    };

    const handleDeleteClick = async (planId) => {
        if (!window.confirm('Are you sure you want to delete this plan?')) {
            return;
        }
        setDeletingPlanId(planId);
        await onDeletePlan(planId);
        setDeletingPlanId(null);
    };

    // ── Rename handlers ──
    const startRename = (plan) => {
        setRenamingPlanId(plan.planId);
        setRenameValue(plan.name || '');
        setRenameError('');
        setTimeout(() => renameInputRef.current?.focus(), 50);
    };

    const cancelRename = () => {
        setRenamingPlanId(null);
        setRenameValue('');
        setRenameError('');
    };

    const confirmRename = async () => {
        const trimmed = renameValue.trim();
        if (!trimmed) {
            setRenameError('Name cannot be empty.');
            renameInputRef.current?.focus();
            return;
        }
        if (renameSaving) return;

        setRenameSaving(true);
        try {
            if (onRenamePlan) {
                await onRenamePlan(renamingPlanId, trimmed);
            }
            setRenamingPlanId(null);
            setRenameValue('');
            setRenameError('');
        } catch {
            setRenameError('Failed to rename. Try again.');
        } finally {
            setRenameSaving(false);
        }
    };

    const handleRenameKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmRename();
        } else if (e.key === 'Escape') {
            cancelRename();
        }
    };

    const isDeleting = deletingPlanId !== null;

    // Theme-derived colours
    const modalBg = isDark ? '#1e2130' : '#ffffff';
    const headerBorder = isDark ? '#2d3148' : COLORS.gray[200];
    const headingColor = isDark ? '#f0f1f5' : COLORS.gray[900];
    const closeIconColor = isDark ? '#9ca3b0' : COLORS.gray[500];
    const closeHoverBg = isDark ? '#252839' : COLORS.gray[100];
    const emptyTextColor = isDark ? '#6b7280' : COLORS.gray[500];
    const cardBg = isDark ? '#252839' : COLORS.gray[50];
    const cardBorder = isDark ? '#2d3148' : COLORS.gray[200];
    const cardHoverBg = isDark ? '#2d3148' : COLORS.gray[100];
    const planNameColor = isDark ? '#f0f1f5' : COLORS.gray[900];
    const planMetaColor = isDark ? '#9ca3b0' : COLORS.gray[500];
    const activeBadgeBg = isDark ? 'rgba(99,102,241,0.15)' : '#eef2ff';
    const activeBadgeColor = isDark ? '#a5b4fc' : COLORS.primary[600];
    const loadBtnColor = isDark ? '#a5b4fc' : COLORS.primary[600];
    const loadBtnHoverBg = isDark ? 'rgba(99,102,241,0.1)' : '#ffffff';
    const deleteBtnHoverBg = isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2';
    const renameBtnColor = isDark ? '#9ca3b0' : COLORS.gray[500];
    const renameBtnHoverBg = isDark ? 'rgba(156,163,176,0.1)' : COLORS.gray[100];
    const renameInputBg = isDark ? '#1e2130' : '#ffffff';
    const renameInputBorder = renameError
        ? (COLORS.error?.main || '#ef4444')
        : isDark ? '#3d4160' : COLORS.gray[300];
    const renameInputColor = isDark ? '#f0f1f5' : COLORS.gray[900];
    const confirmBtnColor = COLORS.success?.main || '#10b981';
    const errorColor = COLORS.error?.main || '#ef4444';

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 transition-opacity"
                onClick={onClose}
                style={{
                    backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.5)',
                }}
            />

            {/* Modal */}
            <div
                className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 mx-auto max-w-lg rounded-2xl overflow-hidden"
                style={{
                    backgroundColor: modalBg,
                    boxShadow: SHADOWS['2xl'],
                    border: isDark ? '1px solid #2d3148' : undefined,
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4"
                    style={{ borderBottom: `1px solid ${headerBorder}` }}
                >
                    <h2
                        className="text-lg font-bold"
                        style={{ color: headingColor }}
                    >
                        My Saved Plans
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full transition-colors"
                        style={{ color: closeIconColor }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = closeHoverBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {(!savedPlans || savedPlans.length === 0) ? (
                        <div className="p-8 text-center">
                            <Calendar size={40} className="mx-auto mb-3" style={{ color: emptyTextColor }} />
                            <p className="text-sm" style={{ color: emptyTextColor }}>
                                No saved plans yet. Generate a meal plan to get started!
                            </p>
                        </div>
                    ) : (
                        <div className="p-4 space-y-3">
                            {savedPlans.map((plan) => {
                                const isActive = plan.planId === activePlanId;
                                const isRenaming = renamingPlanId === plan.planId;

                                return (
                                    <div
                                        key={plan.planId}
                                        className="p-4 rounded-xl border transition-colors"
                                        style={{
                                            backgroundColor: isActive ? activeBadgeBg : cardBg,
                                            borderColor: isActive ? activeBadgeColor : cardBorder,
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive) e.currentTarget.style.backgroundColor = cardHoverBg;
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive) e.currentTarget.style.backgroundColor = cardBg;
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0 mr-3">
                                                {isRenaming ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            ref={renameInputRef}
                                                            type="text"
                                                            value={renameValue}
                                                            onChange={(e) => {
                                                                setRenameValue(e.target.value);
                                                                setRenameError('');
                                                            }}
                                                            onKeyDown={handleRenameKeyDown}
                                                            className="flex-1 text-sm px-2 py-1 rounded border outline-none"
                                                            style={{
                                                                backgroundColor: renameInputBg,
                                                                borderColor: renameInputBorder,
                                                                color: renameInputColor,
                                                            }}
                                                            disabled={renameSaving}
                                                        />
                                                        <button
                                                            onClick={confirmRename}
                                                            disabled={renameSaving}
                                                            className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                                            style={{ color: confirmBtnColor }}
                                                        >
                                                            <Check size={18} />
                                                        </button>
                                                        <button
                                                            onClick={cancelRename}
                                                            disabled={renameSaving}
                                                            className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                                            style={{ color: closeIconColor }}
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-2">
                                                            <h3
                                                                className="text-sm font-semibold truncate"
                                                                style={{ color: planNameColor }}
                                                            >
                                                                {plan.name || 'Untitled Plan'}
                                                            </h3>
                                                            {isActive && (
                                                                <span
                                                                    className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                                                                    style={{
                                                                        backgroundColor: activeBadgeBg,
                                                                        color: activeBadgeColor,
                                                                    }}
                                                                >
                                                                    <CheckCircle size={12} />
                                                                    Active
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p
                                                            className="text-xs mt-1"
                                                            style={{ color: planMetaColor }}
                                                        >
                                                            {plan.createdAt
                                                                ? new Date(plan.createdAt).toLocaleDateString(undefined, {
                                                                      year: 'numeric',
                                                                      month: 'short',
                                                                      day: 'numeric',
                                                                  })
                                                                : 'Unknown date'}
                                                            {plan.days && ` · ${plan.days} days`}
                                                        </p>
                                                    </>
                                                )}
                                                {renameError && isRenaming && (
                                                    <p className="text-xs mt-1" style={{ color: errorColor }}>
                                                        {renameError}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Action buttons */}
                                            <div className="flex items-center gap-1">
                                                {!isRenaming && (
                                                    <button
                                                        onClick={() => startRename(plan)}
                                                        disabled={loadingPlan || isDeleting}
                                                        className="p-2 rounded-lg transition-colors disabled:opacity-50"
                                                        style={{ color: renameBtnColor }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = renameBtnHoverBg)}
                                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                                        aria-label="Rename plan"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleLoadClick(plan.planId)}
                                                    disabled={loadingPlan || isDeleting}
                                                    className="p-2 rounded-lg transition-colors disabled:opacity-50"
                                                    style={{ color: loadBtnColor }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = loadBtnHoverBg)}
                                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                                    aria-label="Load plan"
                                                >
                                                    <Download size={20} />
                                                </button>

                                                <button
                                                    onClick={() => handleDeleteClick(plan.planId)}
                                                    disabled={loadingPlan || isDeleting}
                                                    className="p-2 rounded-lg transition-colors disabled:opacity-50"
                                                    style={{ color: COLORS.error.main }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = deleteBtnHoverBg)}
                                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                                    aria-label="Delete plan"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default SavedPlansModal;