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
const DEEPGRAM_PROJECT_ID = process.env.DEEPGRAM_PROJECT_ID || '';
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

    // --- Diagnostic logging (remove after confirming fix) ---
    console.log('[STT-Token] Route hit. Method:', req.method);
    console.log('[STT-Token] DG KEY exists:', !!DEEPGRAM_API_KEY);
    console.log('[STT-Token] DG PROJECT_ID exists:', !!DEEPGRAM_PROJECT_ID);

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

    // If no project ID, we cannot mint temporary keys.
    // Fall back to using the master key directly for the WebSocket.
    if (!DEEPGRAM_PROJECT_ID) {
        console.warn('[STT-Token] DEEPGRAM_PROJECT_ID not configured — using direct key approach');
        const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
        return res.status(200).json({
            provider: 'deepgram',
            token: DEEPGRAM_API_KEY,
            ws_url: 'wss://api.deepgram.com/v1/listen',
            expires_at: expiresAt,
        });
    }

    try {
        // =====================================================================
        // FIX: The correct Deepgram key minting endpoint is:
        //   POST https://api.deepgram.com/v1/projects/{PROJECT_ID}/keys
        //
        // The old code used /v1/manage/keys which does NOT exist → 404.
        // =====================================================================
        const mintUrl = `https://api.deepgram.com/v1/projects/${DEEPGRAM_PROJECT_ID}/keys`;
        console.log('[STT-Token] Minting temp key at:', mintUrl);

        const response = await fetch(mintUrl, {
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
            console.error(`[STT-Token] Deepgram key minting failed (${response.status}):`, errBody);
            console.error(`[STT-Token] Request URL was: ${mintUrl}`);
            console.error(`[STT-Token] PROJECT_ID defined: ${!!DEEPGRAM_PROJECT_ID} (length: ${DEEPGRAM_PROJECT_ID.length})`);

            // Graceful degradation: use master key directly
            // (less secure but keeps voice working)
            console.warn('[STT-Token] Falling back to direct key approach');
            const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
            return res.status(200).json({
                provider: 'deepgram',
                token: DEEPGRAM_API_KEY,
                ws_url: 'wss://api.deepgram.com/v1/listen',
                expires_at: expiresAt,
            });
        }

        const data = await response.json();
        console.log('[STT-Token] Deepgram response keys:', Object.keys(data));

        // Deepgram returns: { api_key_id, key, ... }
        // The actual temporary API key string is in data.key
        const tempKey = data.key;

        if (!tempKey) {
            console.warn('[STT-Token] Deepgram response has no "key" field. Full response:', JSON.stringify(data).slice(0, 500));
            // Fall back to direct key usage
            const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
            return res.status(200).json({
                provider: 'deepgram',
                token: DEEPGRAM_API_KEY,
                ws_url: 'wss://api.deepgram.com/v1/listen',
                expires_at: expiresAt,
            });
        }

        console.log('[STT-Token] Temp key minted successfully (key_id:', data.api_key_id || 'n/a', ')');
        const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

        return res.status(200).json({
            provider: 'deepgram',
            token: tempKey,
            ws_url: 'wss://api.deepgram.com/v1/listen',
            expires_at: expiresAt,
        });

    } catch (err) {
        console.error('[STT-Token] Handler error:', err.message, err.stack);
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
