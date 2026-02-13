// web/src/components/SavedPlansModal.jsx
// Theme-aware: heading, card backgrounds, and text all adapt to dark/light mode.
// Fixes issue #3: "My Saved Plans" heading visibility in dark mode.

import React, { useState } from 'react';
import { X, Calendar, Trash2, Download, CheckCircle } from 'lucide-react';
import { COLORS, SHADOWS } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

const SavedPlansModal = ({
    isOpen,
    onClose,
    savedPlans,
    activePlanId,
    onLoadPlan,
    onDeletePlan,
    loadingPlan
}) => {
    const [deletingPlanId, setDeletingPlanId] = useState(null);
    const { isDark } = useTheme();

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

    const formatDate = (isoString) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return 'Unknown date';
        }
    };

    // Theme-derived colours
    const modalBg = isDark ? '#1e2130' : '#ffffff';
    const headerBorder = isDark ? '#2d3148' : COLORS.gray[200];
    const headingColor = isDark ? '#f0f1f5' : COLORS.gray[900];
    const closeIconColor = isDark ? '#9ca3b0' : COLORS.gray[600];
    const closeHoverBg = isDark ? '#252839' : COLORS.gray[100];
    const emptyIconColor = isDark ? '#4b5563' : COLORS.gray[400];
    const emptyTitleColor = isDark ? '#9ca3b0' : COLORS.gray[600];
    const emptySubColor = isDark ? '#6b7280' : COLORS.gray[500];
    const planCardBorder = isDark ? '#2d3148' : COLORS.gray[200];
    const planCardActiveBorder = isDark ? '#6366f1' : COLORS.primary[300];
    const planCardActiveBg = isDark ? 'rgba(99,102,241,0.08)' : COLORS.primary[50];
    const planCardBg = isDark ? '#252839' : '#ffffff';
    const planNameColor = isDark ? '#f0f1f5' : COLORS.gray[900];
    const planMetaColor = isDark ? '#9ca3b0' : COLORS.gray[600];
    const planDotColor = isDark ? '#4b5563' : COLORS.gray[400];
    const activeLabel = isDark ? '#a5b4fc' : COLORS.primary[600];
    const loadBtnColor = isDark ? '#a5b4fc' : COLORS.primary[600];
    const loadBtnHoverBg = isDark ? 'rgba(99,102,241,0.1)' : '#ffffff';
    const deleteBtnHoverBg = isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2';

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 transition-opacity"
                onClick={onClose}
                style={{
                    backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                }}
            />

            {/* Modal */}
            <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <div
                    className="rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        backgroundColor: modalBg,
                        boxShadow: isDark
                            ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.08)'
                            : SHADOWS.xl,
                    }}
                >
                    {/* Header — Issue #3: heading must be visible in dark mode */}
                    <div
                        className="flex items-center justify-between p-6"
                        style={{ borderBottom: `1px solid ${headerBorder}` }}
                    >
                        <div className="flex items-center space-x-3">
                            <Calendar size={24} style={{ color: COLORS.primary[600] }} />
                            <h2
                                className="text-2xl font-bold"
                                style={{ color: headingColor }}
                            >
                                My Saved Plans
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg transition-colors"
                            aria-label="Close"
                            style={{ color: closeIconColor }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = closeHoverBg)}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
                        {savedPlans.length === 0 ? (
                            <div className="p-12 text-center">
                                <Calendar
                                    size={48}
                                    className="mx-auto mb-4 opacity-30"
                                    style={{ color: emptyIconColor }}
                                />
                                <p
                                    className="text-lg font-medium mb-2"
                                    style={{ color: emptyTitleColor }}
                                >
                                    No saved plans yet
                                </p>
                                <p
                                    className="text-sm"
                                    style={{ color: emptySubColor }}
                                >
                                    Generate a meal plan and save it to see it here
                                </p>
                            </div>
                        ) : (
                            <div className="p-6 space-y-3">
                                {savedPlans.map((plan) => {
                                    const isActive = plan.planId === activePlanId;
                                    const isDeleting = deletingPlanId === plan.planId;

                                    return (
                                        <div
                                            key={plan.planId}
                                            className="rounded-xl p-4 transition-all"
                                            style={{
                                                border: `1px solid ${isActive ? planCardActiveBorder : planCardBorder}`,
                                                backgroundColor: isActive ? planCardActiveBg : planCardBg,
                                                boxShadow: isDark
                                                    ? '0 2px 8px rgba(0,0,0,0.2)'
                                                    : undefined,
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center space-x-2">
                                                        <h3
                                                            className="font-bold truncate"
                                                            style={{ color: planNameColor }}
                                                        >
                                                            {plan.name || 'Untitled Plan'}
                                                        </h3>
                                                        {isActive && (
                                                            <span
                                                                className="flex items-center text-xs font-semibold"
                                                                style={{ color: activeLabel }}
                                                            >
                                                                <CheckCircle size={14} className="mr-1" />
                                                                Active
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center space-x-2 mt-1 text-sm">
                                                        <span style={{ color: planMetaColor }}>
                                                            {plan.mealPlan?.length || 0} days
                                                        </span>
                                                        <span style={{ color: planDotColor }}>•</span>
                                                        <span style={{ color: planMetaColor }}>
                                                            {formatDate(plan.createdAt)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center space-x-2 ml-4">
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
            </div>
        </>
    );
};

export default SavedPlansModal;