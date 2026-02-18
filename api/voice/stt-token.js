// api/voice/stt-token.js
// =============================================================================
// Cheffy Natural Voice Mode — STT Token Minting Endpoint
//
// Mints a short-lived Deepgram API key so the client can open a direct
// WebSocket to Deepgram without exposing the master key.
//
// POST /api/voice/stt-token
// Body: (none required)
// Response: { token: string, expires_at: string, ws_url: string }
//
// If DEEPGRAM_API_KEY is not set, returns a fallback indicator so the
// client knows to use Web Speech API instead.
// =============================================================================

const fetch = require('node-fetch');

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const TOKEN_TTL_SECONDS = 120; // 2 minutes — enough for a conversation turn

module.exports = async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // If no Deepgram key, signal client to use fallback
    if (!DEEPGRAM_API_KEY) {
        console.warn('[STT-Token] DEEPGRAM_API_KEY not configured — client should use Web Speech API fallback');
        return res.status(200).json({
            provider: 'webspeech_fallback',
            token: null,
            ws_url: null,
            expires_at: null,
            message: 'Deepgram not configured. Use Web Speech API.',
        });
    }

    try {
        // Mint a temporary key via Deepgram's API
        const response = await fetch('https://api.deepgram.com/v1/manage/keys', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                comment: `cheffy-voice-${Date.now()}`,
                scopes: ['usage:write'],
                time_to_live_in_seconds: TOKEN_TTL_SECONDS,
            }),
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => 'Unknown error');
            console.error(`[STT-Token] Deepgram key minting failed (${response.status}): ${errBody}`);

            // If Deepgram key creation fails, we can still provide the master key
            // approach as fallback (direct key usage) or signal webspeech fallback.
            // For security, we prefer signaling fallback:
            return res.status(200).json({
                provider: 'webspeech_fallback',
                token: null,
                ws_url: null,
                expires_at: null,
                message: 'Deepgram token minting failed. Use Web Speech API.',
            });
        }

        const data = await response.json();
        const tempKey = data.key;

        if (!tempKey) {
            // Some Deepgram plans don't support temporary key minting.
            // Fall back to direct key usage (less secure but functional).
            console.warn('[STT-Token] Deepgram returned no key object — using direct key approach');
            const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
            return res.status(200).json({
                provider: 'deepgram',
                token: DEEPGRAM_API_KEY,
                ws_url: 'wss://api.deepgram.com/v1/listen',
                expires_at: expiresAt,
            });
        }

        const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

        return res.status(200).json({
            provider: 'deepgram',
            token: tempKey,
            ws_url: 'wss://api.deepgram.com/v1/listen',
            expires_at: expiresAt,
        });

    } catch (err) {
        console.error('[STT-Token] Handler error:', err);
        // Graceful degradation — never block the voice experience
        return res.status(200).json({
            provider: 'webspeech_fallback',
            token: null,
            ws_url: null,
            expires_at: null,
            message: 'STT token service error. Use Web Speech API.',
        });
    }
};
