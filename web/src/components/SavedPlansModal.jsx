// web/src/components/SavedPlansModal.jsx
// Theme-aware: heading, card backgrounds, and text all adapt to dark/light mode.
// Adds inline rename functionality for each saved plan.

import React, { useState, useRef, useEffect } from ‘react’;
import { X, Calendar, Trash2, Download, CheckCircle, Pencil, Check } from ‘lucide-react’;
import { COLORS, SHADOWS } from ‘../constants’;
import { useTheme } from ‘../contexts/ThemeContext’;

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
const [renameValue, setRenameValue] = useState(’’);
const [renameError, setRenameError] = useState(’’);
const [renameSaving, setRenameSaving] = useState(false);
const renameInputRef = useRef(null);
const { isDark } = useTheme();

```
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
    // Focus after React renders the input
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
        confirmRename();
    } else if (e.key === 'Escape') {
        cancelRename();
    }
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
                            const isRenaming = renamingPlanId === plan.planId;

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
                                            {/* ── Inline Rename or Static Title ── */}
                                            {isRenaming ? (
                                                <div className="flex items-center space-x-2">
                                                    <div className="flex-1 min-w-0">
                                                        <input
                                                            ref={renameInputRef}
                                                            type="text"
                                                            value={renameValue}
                                                            onChange={(e) => {
                                                                setRenameValue(e.target.value);
                                                                if (renameError) setRenameError('');
                                                            }}
                                                            onKeyDown={handleRenameKeyDown}
                                                            maxLength={80}
                                                            className="w-full px-2.5 py-1 rounded-lg text-sm font-bold transition-colors"
                                                            style={{
                                                                backgroundColor: renameInputBg,
                                                                border: `1px solid ${renameInputBorder}`,
                                                                color: renameInputColor,
                                                                outline: 'none',
                                                            }}
                                                            onFocus={(e) => {
                                                                e.currentTarget.style.borderColor = isDark ? '#6366f1' : COLORS.primary[500];
                                                            }}
                                                            onBlur={(e) => {
                                                                e.currentTarget.style.borderColor = renameInputBorder;
                                                            }}
                                                        />
                                                        {renameError && (
                                                            <p className="text-xs mt-1" style={{ color: errorColor }}>
                                                                {renameError}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {/* Confirm rename */}
                                                    <button
                                                        onClick={confirmRename}
                                                        disabled={renameSaving}
                                                        className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                                                        style={{ color: confirmBtnColor }}
                                                        title="Save name"
                                                    >
                                                        <Check size={18} />
                                                    </button>
                                                    {/* Cancel rename */}
                                                    <button
                                                        onClick={cancelRename}
                                                        className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                                                        style={{ color: closeIconColor }}
                                                        title="Cancel"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                            ) : (
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
                                                    {/* Rename button */}
                                                    <button
                                                        onClick={() => startRename(plan)}
                                                        className="p-1 rounded-lg transition-colors flex-shrink-0 opacity-60 hover:opacity-100"
                                                        style={{ color: renameBtnColor }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = renameBtnHoverBg)}
                                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                                        title="Rename plan"
                                                        aria-label="Rename plan"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                </div>
                                            )}

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
    </>
);
```

};

export default SavedPlansModal;