// api/voice/tts-stream.js
// =============================================================================
// Cheffy Phase 6 — Byte-Level TTS Streaming Endpoint
//
// Instead of synthesizing the entire sentence before returning audio,
// this endpoint accepts an SSE-style connection from the client and
// streams audio chunks as soon as they're available from OpenAI TTS.
//
// Architecture:
//   Client sends text chunks via POST → server synthesizes each chunk
//   via OpenAI TTS and streams the raw audio bytes back as SSE binary
//   (base64-encoded) frames so the client can decode + play via
//   Web Audio API in real-time.
//
// POST /api/voice/tts-stream
// Body: { text: string, voice?: string, speed?: number, format?: 'pcm'|'mp3' }
// Response: text/event-stream
//   data: {"audio":"<base64>","index":0,"final":false}
//   data: {"audio":"<base64>","index":0,"final":true}
//   data: {"done":true}
//
// Why base64-over-SSE instead of raw WebSocket binary:
//   - Works through Vercel serverless (no persistent WS connections)
//   - Same CORS model as the existing /api/voice/chat endpoint
//   - Client decodes base64 → ArrayBuffer → feeds to Web Audio API
//
// The key latency win: OpenAI TTS returns audio/mpeg as a stream.
// We forward those chunks as they arrive instead of buffering the full file.
// =============================================================================

const fetch = require('node-fetch');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const TTS_MODEL = process.env.TTS_STREAM_MODEL || 'tts-1'; // tts-1 for low latency
const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;
const MAX_TEXT_LENGTH = 4096;
const CHUNK_SIZE = 4096; // bytes per SSE frame

module.exports = async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!OPENAI_API_KEY) {
        console.error('[TTS-Stream] OPENAI_API_KEY not configured');
        return res.status(500).json({ error: 'TTS streaming service not configured' });
    }

    try {
        const { text, voice, speed, format } = req.body || {};

        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: 'Missing or empty "text" field' });
        }
        if (text.length > MAX_TEXT_LENGTH) {
            return res.status(400).json({ error: `Text exceeds ${MAX_TEXT_LENGTH} char limit` });
        }

        const selectedVoice = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
            .includes(voice) ? voice : DEFAULT_VOICE;
        const selectedSpeed = (typeof speed === 'number' && speed >= 0.25 && speed <= 4.0)
            ? speed : DEFAULT_SPEED;

        // pcm = raw 24kHz 16-bit mono LE (lowest latency, smallest frames)
        // mp3 = compressed (larger frames but works with HTMLAudioElement)
        const responseFormat = format === 'pcm' ? 'pcm' : 'mp3';

        // --- SSE Headers ---
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // --- Call OpenAI TTS with streaming response ---
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
                response_format: responseFormat,
            }),
        });

        if (!ttsResponse.ok) {
            const errBody = await ttsResponse.text().catch(() => 'Unknown');
            console.error(`[TTS-Stream] OpenAI error (${ttsResponse.status}): ${errBody}`);
            res.write(`data: ${JSON.stringify({ error: 'TTS generation failed', status: ttsResponse.status })}\n\n`);
            res.end();
            return;
        }

        // Stream audio chunks as base64-encoded SSE events
        const body = ttsResponse.body;
        let chunkIndex = 0;
        let buffer = Buffer.alloc(0);

        body.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            // Emit fixed-size frames for consistent client buffering
            while (buffer.length >= CHUNK_SIZE) {
                const frame = buffer.slice(0, CHUNK_SIZE);
                buffer = buffer.slice(CHUNK_SIZE);

                const b64 = frame.toString('base64');
                res.write(`data: ${JSON.stringify({
                    audio: b64,
                    index: chunkIndex++,
                    final: false,
                    format: responseFormat,
                })}\n\n`);
            }
        });

        body.on('end', () => {
            // Flush remaining buffer
            if (buffer.length > 0) {
                const b64 = buffer.toString('base64');
                res.write(`data: ${JSON.stringify({
                    audio: b64,
                    index: chunkIndex++,
                    final: true,
                    format: responseFormat,
                })}\n\n`);
            }

            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        });

        body.on('error', (err) => {
            console.error('[TTS-Stream] Stream error:', err);
            res.write(`data: ${JSON.stringify({ error: 'Audio stream interrupted' })}\n\n`);
            res.end();
        });

        req.on('close', () => {
            body.destroy();
        });

    } catch (err) {
        console.error('[TTS-Stream] Handler error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    }
};
