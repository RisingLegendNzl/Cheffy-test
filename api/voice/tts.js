// api/voice/tts.js
// =============================================================================
// Cheffy Voice Cooking — TTS Proxy Endpoint
//
// Proxies text-to-speech requests to OpenAI's TTS API.
// Keeps OPENAI_API_KEY server-side. Returns streaming audio/mpeg.
//
// POST /api/voice/tts
// Body: { text: string, voice?: string, speed?: number }
// Response: audio/mpeg stream
// =============================================================================

const fetch = require('node-fetch');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const TTS_MODEL = 'tts-1';           // Low-latency model (tts-1-hd for quality)
const DEFAULT_VOICE = 'nova';         // Warm, friendly, clear — great for cooking
const DEFAULT_SPEED = 1.0;
const MAX_TEXT_LENGTH = 4096;         // OpenAI TTS limit

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

    if (!OPENAI_API_KEY) {
        console.error('[TTS] OPENAI_API_KEY not configured');
        return res.status(500).json({ error: 'TTS service not configured' });
    }

    try {
        const { text, voice, speed } = req.body || {};

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Missing or empty "text" field' });
        }

        if (text.length > MAX_TEXT_LENGTH) {
            return res.status(400).json({ error: `Text exceeds ${MAX_TEXT_LENGTH} character limit` });
        }

        const selectedVoice = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
            .includes(voice) ? voice : DEFAULT_VOICE;

        const selectedSpeed = typeof speed === 'number' && speed >= 0.25 && speed <= 4.0
            ? speed : DEFAULT_SPEED;

        const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: TTS_MODEL,
                input: text.trim(),
                voice: selectedVoice,
                speed: selectedSpeed,
                response_format: 'mp3',
            }),
        });

        if (!ttsResponse.ok) {
            const errBody = await ttsResponse.text().catch(() => 'Unknown error');
            console.error(`[TTS] OpenAI API error ${ttsResponse.status}: ${errBody}`);
            return res.status(502).json({ error: 'TTS generation failed' });
        }

        // Stream the audio response directly to the client
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Transfer-Encoding', 'chunked');

        ttsResponse.body.pipe(res);

    } catch (err) {
        console.error('[TTS] Handler error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};