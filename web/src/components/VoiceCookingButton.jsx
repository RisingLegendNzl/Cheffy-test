// web/src/components/VoiceCookingButton.jsx
// =============================================================================
// VoiceCookingButton — Trigger button for voice cooking mode
//
// Drop this into RecipeModal's header or body.
// Handles its own state (overlay visibility) so RecipeModal only needs
// to render <VoiceCookingButton meal={meal} /> — no other changes.
//
// Gracefully hides itself if voice cooking is not supported.
// =============================================================================

import React, { useState } from 'react';
import { Mic } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import VoiceCookingOverlay, { isVoiceCookingSupported } from './VoiceCookingOverlay';

const VoiceCookingButton = ({ meal }) => {
    const { isDark } = useTheme();
    const [showOverlay, setShowOverlay] = useState(false);

    // Don't render if not supported or no instructions
    if (!isVoiceCookingSupported() || !meal?.instructions?.length) {
        return null;
    }

    const btnBg = isDark
        ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))'
        : 'linear-gradient(135deg, #eef2ff, #f5f3ff)';
    const btnBorder = isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)';
    const btnText = isDark ? '#a5b4fc' : '#4f46e5';

    return (
        <>
            <button
                onClick={() => setShowOverlay(true)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: `1.5px solid ${btnBorder}`,
                    background: btnBg,
                    color: btnText,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    width: '100%',
                    justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.2)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                }}
            >
                <Mic size={18} />
                <span>Start Voice Cooking</span>
            </button>

            {showOverlay && (
                <VoiceCookingOverlay
                    meal={meal}
                    onClose={() => setShowOverlay(false)}
                />
            )}
        </>
    );
};

export default VoiceCookingButton;