// web/src/components/ProductMatchLogViewer.jsx
// =============================================
// Replaces FailedIngredientLogViewer with a comprehensive Product Match Trace viewer.
// Shows per-ingredient trace data: queries, raw results, scoring, selection, rejections.
//
// Version: 1.0.0

import React, { useState, useMemo, useCallback } from 'react';
import { Search, Download, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle, Filter } from 'lucide-react';

// ============================================================================
// FILTER OPTIONS
// ============================================================================
const FILTER_OPTIONS = [
    { key: 'all', label: 'All', color: 'bg-gray-600' },
    { key: 'failed', label: 'Failed', color: 'bg-red-600' },
    { key: 'success', label: 'Success', color: 'bg-green-600' },
    { key: 'error', label: 'Errors', color: 'bg-yellow-600' },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const OutcomeIcon = ({ outcome }) => {
    switch (outcome) {
        case 'success': return <CheckCircle size={14} className="text-green-400 flex-shrink-0" />;
        case 'failed': return <XCircle size={14} className="text-red-400 flex-shrink-0" />;
        case 'error': return <AlertTriangle size={14} className="text-yellow-400 flex-shrink-0" />;
        default: return <div className="w-3.5 h-3.5 rounded-full bg-gray-500 flex-shrink-0" />;
    }
};

const AttemptBadge = ({ status }) => {
    const colors = {
        success: 'bg-green-700 text-green-200',
        no_match: 'bg-red-700 text-red-200',
        no_match_post_filter: 'bg-orange-700 text-orange-200',
        fetch_error: 'bg-yellow-700 text-yellow-200',
        pending: 'bg-gray-600 text-gray-300',
    };
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${colors[status] || colors.pending}`}>
            {status}
        </span>
    );
};

const ScoreBar = ({ score }) => {
    const width = Math.round(score * 100);
    const color = score >= 0.8 ? 'bg-green-500' : score >= 0.6 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-1.5 min-w-[80px]">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
            </div>
            <span className="text-[10px] font-mono text-gray-400 w-8">{score.toFixed(2)}</span>
        </div>
    );
};

// ============================================================================
// SINGLE TRACE ITEM
// ============================================================================

const TraceItem = ({ trace }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border border-gray-700/50 rounded-md overflow-hidden">
            {/* Header - always visible */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
            >
                <OutcomeIcon outcome={trace.outcome} />
                <span className="font-mono text-xs text-white flex-1 truncate">{trace.ingredient}</span>
                {trace.selection && (
                    <span className="text-[10px] text-gray-400 truncate max-w-[200px] hidden sm:inline">
                        → {trace.selection.productName}
                    </span>
                )}
                {trace.selection?.score != null && <ScoreBar score={trace.selection.score} />}
                <span className="text-[10px] text-gray-500 font-mono">{trace.durationMs}ms</span>
                {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="px-3 pb-3 space-y-2 bg-gray-900/50 border-t border-gray-700/30">
                    {/* Queries */}
                    <div className="pt-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Queries</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-[11px] font-mono">
                            <div><span className="text-blue-400">tight:</span> <span className="text-gray-300">{trace.queries.tight || 'N/A'}</span></div>
                            <div><span className="text-green-400">normal:</span> <span className="text-gray-300">{trace.queries.normal || 'N/A'}</span></div>
                            <div><span className="text-yellow-400">wide:</span> <span className="text-gray-300">{trace.queries.wide || 'N/A'}</span></div>
                        </div>
                    </div>

                    {/* Validation Rules */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Validation Rules</p>
                        <div className="text-[11px] font-mono space-y-0.5">
                            <div><span className="text-gray-500">required:</span> <span className="text-cyan-300">[{trace.validationRules.requiredWords.join(', ')}]</span></div>
                            <div><span className="text-gray-500">negative:</span> <span className="text-red-300">[{trace.validationRules.negativeKeywords.join(', ')}]</span></div>
                            <div><span className="text-gray-500">categories:</span> <span className="text-purple-300">[{trace.validationRules.allowedCategories.join(', ')}]</span></div>
                        </div>
                    </div>

                    {/* Query Attempts */}
                    {trace.attempts.map((attempt, idx) => (
                        <div key={idx} className="border border-gray-700/30 rounded p-2">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-bold text-gray-300 uppercase">{attempt.queryType}</span>
                                <AttemptBadge status={attempt.status} />
                                <span className="text-[10px] text-gray-500 font-mono">
                                    raw:{attempt.rawCount} pass:{attempt.passCount} best:{attempt.bestScore}
                                </span>
                            </div>
                            <p className="text-[11px] font-mono text-gray-400 mb-1.5">
                                Query: <span className="text-white">"{attempt.queryString}"</span>
                            </p>

                            {/* Raw results */}
                            {attempt.rawResults.length > 0 && (
                                <div className="mb-1">
                                    <p className="text-[9px] text-gray-500 uppercase">API Results ({attempt.rawCount} total, showing {attempt.rawResults.length})</p>
                                    {attempt.rawResults.map((raw, i) => (
                                        <div key={i} className="text-[10px] font-mono text-gray-400 pl-2 border-l border-gray-700 ml-1 mt-0.5">
                                            {i + 1}. "{raw.name}" <span className="text-gray-600">${raw.price || '?'} {raw.size || ''}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Scored results */}
                            {attempt.scoredResults.length > 0 && (
                                <div className="mb-1">
                                    <p className="text-[9px] text-green-500 uppercase">Passed Scoring</p>
                                    {attempt.scoredResults.map((scored, i) => (
                                        <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-green-300 pl-2 border-l border-green-700/50 ml-1 mt-0.5">
                                            <span className="truncate flex-1">★ "{scored.name}"</span>
                                            <ScoreBar score={scored.score} />
                                            <span className="text-gray-500">${scored.price || '?'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rejections */}
                            {attempt.rejections.length > 0 && (
                                <div>
                                    <p className="text-[9px] text-red-500 uppercase">Rejections</p>
                                    {attempt.rejections.map((rej, i) => (
                                        <div key={i} className="text-[10px] font-mono text-red-300/70 pl-2 border-l border-red-700/30 ml-1 mt-0.5">
                                            ✗ "{rej.name}" → <span className="text-red-400">{rej.reason}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Final Selection */}
                    {trace.selection && (
                        <div className="bg-green-900/30 border border-green-700/40 rounded p-2">
                            <p className="text-[10px] font-bold text-green-400 uppercase">Selected Product</p>
                            <p className="text-[11px] font-mono text-white">{trace.selection.productName}</p>
                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                ${trace.selection.price || '?'} | {trace.selection.size || '?'} | 
                                score: {trace.selection.score != null ? trace.selection.score.toFixed(3) : 'N/A'} | 
                                via: {trace.selection.viaQueryType} ({trace.selection.source})
                            </div>
                        </div>
                    )}

                    {/* Failure / Error */}
                    {trace.outcome === 'failed' && (
                        <div className="bg-red-900/30 border border-red-700/40 rounded p-2">
                            <p className="text-[10px] font-bold text-red-400 uppercase">No Product Found</p>
                            <p className="text-[11px] font-mono text-red-300">{trace.failureReason || 'All queries exhausted without a match'}</p>
                        </div>
                    )}
                    {trace.outcome === 'error' && (
                        <div className="bg-yellow-900/30 border border-yellow-700/40 rounded p-2">
                            <p className="text-[10px] font-bold text-yellow-400 uppercase">Error</p>
                            <p className="text-[11px] font-mono text-yellow-300">{trace.errorMessage}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ProductMatchLogViewer = ({ matchTraces = [], onDownload }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [filter, setFilter] = useState('all');
    const [searchText, setSearchText] = useState('');

    const filteredTraces = useMemo(() => {
        let result = matchTraces;
        if (filter !== 'all') {
            result = result.filter(t => t.outcome === filter);
        }
        if (searchText.trim()) {
            const q = searchText.toLowerCase();
            result = result.filter(t =>
                t.ingredient.toLowerCase().includes(q) ||
                (t.selection?.productName || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [matchTraces, filter, searchText]);

    const stats = useMemo(() => ({
        total: matchTraces.length,
        success: matchTraces.filter(t => t.outcome === 'success').length,
        failed: matchTraces.filter(t => t.outcome === 'failed').length,
        error: matchTraces.filter(t => t.outcome === 'error').length,
    }), [matchTraces]);

    if (!matchTraces || matchTraces.length === 0) return null;

    return (
        <div className="w-full bg-gray-900/95 text-gray-100 font-mono text-xs shadow-inner border-t-2 border-indigo-700">
            {/* Header Bar */}
            <div className="p-2.5 bg-gray-800/90 border-b border-gray-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-indigo-400" />
                    <h3 className="font-bold text-sm">Product Match Trace</h3>
                    <div className="flex gap-1.5 ml-2">
                        <span className="px-1.5 py-0.5 rounded bg-gray-700 text-[10px]">{stats.total} total</span>
                        <span className="px-1.5 py-0.5 rounded bg-green-800 text-green-200 text-[10px]">{stats.success} ✓</span>
                        {stats.failed > 0 && <span className="px-1.5 py-0.5 rounded bg-red-800 text-red-200 text-[10px]">{stats.failed} ✗</span>}
                        {stats.error > 0 && <span className="px-1.5 py-0.5 rounded bg-yellow-800 text-yellow-200 text-[10px]">{stats.error} ⚠</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Filter buttons */}
                    <div className="hidden sm:flex gap-1">
                        {FILTER_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setFilter(opt.key)}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                    filter === opt.key
                                        ? `${opt.color} text-white`
                                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={onDownload}
                        className="flex items-center px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-semibold"
                        title="Download Match Trace Report"
                    >
                        <Download size={12} className="mr-1" /> Report
                    </button>
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="text-gray-400 hover:text-white"
                    >
                        {isOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </button>
                </div>
            </div>

            {/* Content */}
            {isOpen && (
                <div className="max-h-72 overflow-y-auto">
                    {/* Search bar */}
                    <div className="px-3 py-1.5 border-b border-gray-800">
                        <input
                            type="text"
                            placeholder="Search ingredient or product..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    {/* Mobile filter */}
                    <div className="sm:hidden flex gap-1 px-3 py-1.5 border-b border-gray-800">
                        {FILTER_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setFilter(opt.key)}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    filter === opt.key
                                        ? `${opt.color} text-white`
                                        : 'bg-gray-700 text-gray-400'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Trace list */}
                    <div className="p-2 space-y-1">
                        {filteredTraces.length === 0 ? (
                            <p className="text-center text-gray-500 py-4">No traces match the current filter.</p>
                        ) : (
                            filteredTraces.map((trace, index) => (
                                <TraceItem key={`${trace.ingredient}-${index}`} trace={trace} />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductMatchLogViewer;