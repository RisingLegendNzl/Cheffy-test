// api/voice/chat.js
// =============================================================================
// Cheffy Natural Voice Mode — Streaming LLM Chat Endpoint
//
// Accepts conversation history + recipe context.
// Returns Server-Sent Events (SSE) stream of LLM tokens.
//
// POST /api/voice/chat
// Body: {
//   messages: [{ role, content }],
//   recipeContext: { mealName, steps[], ingredients[], currentStep }
// }
// Response: text/event-stream
//   data: {"token":"..."}
//   data: {"token":"","done":true}
//   data: {"error":"..."}
// =============================================================================

const fetch = require('node-fetch');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const VOICE_MODEL = process.env.VOICE_CHAT_MODEL || 'gpt-4o-mini';
const MAX_TOKENS = 300; // Keep responses concise for voice
const TEMPERATURE = 0.7;
const MAX_MESSAGES = 24; // Sliding window: system + last ~10 turns

// --- System prompt builder ---
function buildSystemPrompt(recipeContext) {
    const { mealName, steps, ingredients, currentStep } = recipeContext || {};
    const totalSteps = (steps || []).length;
    const stepList = (steps || []).map((s, i) => `  ${i + 1}. ${s}`).join('\n');

    const ingredientList = (ingredients || []).map(item => {
        const name = item.key || item.name || item.ingredient || '';
        const qty = item.qty ?? item.qty_value ?? item.quantity ?? '';
        const unit = item.unit ?? item.qty_unit ?? '';
        return `  - ${qty} ${unit} ${name}`.trim();
    }).join('\n');

    return `You are Cheffy, a warm, friendly, and concise cooking assistant guiding a user through a recipe using voice.

RECIPE: ${mealName || 'Unknown'}
TOTAL STEPS: ${totalSteps}
CURRENT STEP: ${(currentStep ?? 0) + 1}

INGREDIENTS:
${ingredientList || '  (none provided)'}

STEPS:
${stepList || '  (none provided)'}

VOICE INTERACTION RULES:
1. Keep responses SHORT — 1-3 sentences max. The user is listening, not reading.
2. Be conversational and encouraging. Use natural speech patterns.
3. Answer cooking questions using the recipe context above.
4. If the user asks about substitutions, timing, or technique, give practical advice.
5. When the user wants to navigate (next step, previous step, go to a specific step, repeat, pause, resume, stop, or list ingredients), include EXACTLY ONE action tag on its own line at the END of your response:
   [ACTION:NEXT]
   [ACTION:PREV]
   [ACTION:GOTO:N]  (where N is the step number, 1-indexed)
   [ACTION:REPEAT]
   [ACTION:PAUSE]
   [ACTION:STOP]
   [ACTION:INGREDIENTS]
6. Only include an action tag when the user explicitly wants navigation. Questions do NOT trigger actions.
7. When narrating a step, say "Step X of Y" then read the step content naturally.
8. Do NOT use markdown, bullet points, or any visual formatting — this is VOICE output.
9. If the user says something unclear, ask a brief clarifying question.
10. Lead your response with a brief acknowledgment (2-5 words) before the main content. This helps reduce perceived latency.`;
}

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
        console.error('[VoiceChat] OPENAI_API_KEY not configured');
        return res.status(500).json({ error: 'Chat service not configured' });
    }

    try {
        const { messages, recipeContext } = req.body || {};

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Missing or invalid "messages" array' });
        }

        // Build the full message array with system prompt
        const systemPrompt = buildSystemPrompt(recipeContext);
        const systemMessage = { role: 'system', content: systemPrompt };

        // Apply sliding window: keep system + most recent messages
        const recentMessages = messages.slice(-MAX_MESSAGES);

        const fullMessages = [systemMessage, ...recentMessages];

        // --- SSE Headers ---
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

        // --- Stream from OpenAI ---
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: VOICE_MODEL,
                messages: fullMessages,
                max_tokens: MAX_TOKENS,
                temperature: TEMPERATURE,
                stream: true,
            }),
        });

        if (!openaiResponse.ok) {
            const errBody = await openaiResponse.text().catch(() => 'Unknown error');
            console.error(`[VoiceChat] OpenAI error (${openaiResponse.status}): ${errBody}`);
            res.write(`data: ${JSON.stringify({ error: 'LLM request failed', status: openaiResponse.status })}\n\n`);
            res.end();
            return;
        }

        // Pipe the SSE stream, parsing OpenAI's format and re-emitting our format
        const body = openaiResponse.body;

        let buffer = '';

        body.on('data', (chunk) => {
            buffer += chunk.toString();

            // Process complete SSE lines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
                const trimmed = line.trim();

                if (!trimmed || trimmed.startsWith(':')) continue; // Skip empty lines and comments

                if (trimmed === 'data: [DONE]') {
                    res.write(`data: ${JSON.stringify({ token: '', done: true })}\n\n`);
                    continue;
                }

                if (trimmed.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const content = json.choices?.[0]?.delta?.content;

                        if (content) {
                            res.write(`data: ${JSON.stringify({ token: content })}\n\n`);
                        }
                    } catch (parseErr) {
                        // Malformed JSON line — skip
                        console.warn('[VoiceChat] Failed to parse SSE chunk:', trimmed.slice(0, 100));
                    }
                }
            }
        });

        body.on('end', () => {
            // Process any remaining buffer
            if (buffer.trim()) {
                const trimmed = buffer.trim();
                if (trimmed === 'data: [DONE]') {
                    res.write(`data: ${JSON.stringify({ token: '', done: true })}\n\n`);
                } else if (trimmed.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const content = json.choices?.[0]?.delta?.content;
                        if (content) {
                            res.write(`data: ${JSON.stringify({ token: content })}\n\n`);
                        }
                    } catch (_) {}
                }
            }

            // Ensure we always send a done signal
            res.write(`data: ${JSON.stringify({ token: '', done: true })}\n\n`);
            res.end();
        });

        body.on('error', (err) => {
            console.error('[VoiceChat] Stream error:', err);
            res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
            res.end();
        });

        // Handle client disconnect
        req.on('close', () => {
            body.destroy();
        });

    } catch (err) {
        console.error('[VoiceChat] Handler error:', err);
        // If headers haven't been sent yet
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
        res.end();
    }
};