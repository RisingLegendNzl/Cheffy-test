// web/src/components/voice/TranscriptPanel.jsx
// =============================================================================
// TranscriptPanel — Live scrolling transcript of agent ↔ user dialogue
//
// REVAMP v2.0: Warmer kitchen-companion feel
//   - Chef hat icon for Cheffy messages
//   - Warmer label colors
//   - Friendlier empty state
//
// Props:
//   transcript {Array<{role, text, timestamp}>}
//   isSpeaking {boolean}
//   isDark     {boolean}
// =============================================================================

import React, { useEffect, useRef } from 'react';

const TranscriptPanel = ({ transcript = [], isSpeaking = false, isDark = false }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length]);

  const t = {
    bg: isDark ? 'rgba(15, 17, 23, 0.7)' : 'rgba(255, 255, 255, 0.7)',
    border: isDark ? '#2d3148' : '#e5e7eb',
    agentBg: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.06)',
    agentBorder: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.15)',
    agentText: isDark ? '#c7d2fe' : '#4338ca',
    agentLabel: isDark ? '#a5b4fc' : '#6366f1',
    userBg: isDark ? 'rgba(52, 211, 153, 0.1)' : 'rgba(52, 211, 153, 0.06)',
    userBorder: isDark ? 'rgba(52, 211, 153, 0.25)' : 'rgba(52, 211, 153, 0.15)',
    userText: isDark ? '#a7f3d0' : '#065f46',
    userLabel: isDark ? '#6ee7b7' : '#059669',
    emptyText: isDark ? '#6b7280' : '#9ca3af',
    timestamp: isDark ? '#4b5563' : '#d1d5db',
    headerBg: isDark ? 'rgba(15, 17, 23, 0.5)' : 'rgba(255, 255, 255, 0.5)',
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={{
      backgroundColor: t.bg,
      backdropFilter: 'blur(12px)',
      border: `1px solid ${t.border}`,
      borderRadius: '16px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '280px',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
        background: t.headerBg,
      }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          backgroundColor: isSpeaking ? '#34d399' : '#6366f1',
          boxShadow: isSpeaking ? '0 0 10px rgba(52,211,153,0.5)' : 'none',
          transition: 'all 0.3s ease',
        }} />
        <span style={{
          fontSize: '0.75rem', fontWeight: 600,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: isDark ? '#9ca3b0' : '#6b7280',
        }}>
          💬 Conversation
        </span>
        {isSpeaking && (
          <span style={{
            fontSize: '0.65rem', color: '#34d399',
            fontWeight: 500, marginLeft: 'auto',
          }}>
            Cheffy is talking…
          </span>
        )}
      </div>

      {/* Scrollable message area */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: '8px',
        minHeight: '100px',
      }}>
        {transcript.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: '6px',
          }}>
            <span style={{ fontSize: '1.5rem' }}>🎙️</span>
            <span style={{
              color: t.emptyText, fontSize: '0.82rem', fontStyle: 'italic',
            }}>
              Start talking — Cheffy is all ears!
            </span>
          </div>
        ) : (
          transcript.map((msg, i) => {
            const isAgent = msg.role === 'agent';
            return (
              <div
                key={`${msg.timestamp}-${i}`}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isAgent ? 'flex-start' : 'flex-end',
                  animation: 'fadeSlideIn 0.25s ease-out',
                }}
              >
                {/* Label */}
                <span style={{
                  fontSize: '0.65rem', fontWeight: 600,
                  color: isAgent ? t.agentLabel : t.userLabel,
                  marginBottom: '2px',
                  paddingLeft: isAgent ? '8px' : '0',
                  paddingRight: isAgent ? '0' : '8px',
                }}>
                  {isAgent ? '👨‍🍳 Cheffy' : '🙋 You'}
                </span>
                {/* Bubble */}
                <div style={{
                  maxWidth: '85%', padding: '10px 14px',
                  borderRadius: isAgent ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                  backgroundColor: isAgent ? t.agentBg : t.userBg,
                  border: `1px solid ${isAgent ? t.agentBorder : t.userBorder}`,
                  color: isAgent ? t.agentText : t.userText,
                  fontSize: '0.88rem', lineHeight: 1.55,
                }}>
                  {msg.text}
                </div>
                {/* Timestamp */}
                <span style={{
                  fontSize: '0.6rem', color: t.timestamp, marginTop: '2px',
                  paddingLeft: isAgent ? '8px' : '0',
                  paddingRight: isAgent ? '0' : '8px',
                }}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default TranscriptPanel;
