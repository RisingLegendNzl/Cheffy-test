// web/src/utils/llmStream.js
// =============================================================================
// Natural Voice Mode — LLM Streaming Client v5.0
//
// v5.0 — Sentence fragment coalescing (FIX #4)
//
//   Problem: Short fragments like "Great!" or "Sure." were emitted as
//   independent TTS requests. Very short utterances (< 0.5s audio) finish
//   before the next sentence's synthesis completes, creating audible gaps.
//
//   Fix:
//     - MIN_SENTENCE_LENGTH raised from 12 → 40 characters (~1 spoken clause)
//     - Short fragments that match a sentence boundary but are below the
//       threshold stay in the buffer and get concatenated with the next
//       sentence, producing longer, smoother TTS requests
//     - MAX_BUFFER_LENGTH raised from 120 → 160 to accommodate the longer
//       buffering window before force-flush
//     - Force-flush split point raised to avoid mid-word breaks on longer
//       buffered text
//
// Connects to /api/voice/chat via SSE (fetch + ReadableStream).
// Buffers incoming tokens into sentences and flushes to a callback.
// Parses [ACTION:...] tags from the stream.
//
// Usage:
//   const stream = new LLMStream({
//     onSentence:  (text) => ...,            // Flushed sentence (send to TTS)
//     onToken:     (token, fullText) => ..., // Every token (for live display)
//     onAction:    (action) => ...,          // Parsed action: { type, payload }
//     onDone:      (fullText) => ...,        // Stream complete
//     onError:     (err) => ...,             // Error
//   });
//
//   stream.send(messages, recipeContext);    // Start streaming
//   stream.abort();                          // Cancel in-flight request
//   stream.destroy();                        // Full cleanup
// =============================================================================

const CHAT_ENDPOINT = '/api/voice/chat';

// Sentence boundary regex: split after . ! ? followed by space or end, or newlines
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

// FIX #4: Raised thresholds for smoother TTS output
const MAX_BUFFER_LENGTH = 160; // Force-flush at this char count (was 120)
const MIN_SENTENCE_LENGTH = 40; // Don't split too-short fragments (was 12)

// Action tag pattern: [ACTION:TYPE] or [ACTION:TYPE:PAYLOAD]
const ACTION_PATTERN = /\[ACTION:([A-Z_]+)(?::(\d+))?\]/g;

export class LLMStream {
    constructor(callbacks = {}) {
        this._onSentence = callbacks.onSentence || (() => {});
        this._onToken = callbacks.onToken || (() => {});
        this._onAction = callbacks.onAction || (() => {});
        this._onDone = callbacks.onDone || (() => {});
        this._onError = callbacks.onError || (() => {});

        this._abortController = null;
        this._buffer = '';
        this._fullText = '';
        this._destroyed = false;
        this._isStreaming = false;
    }

    get isStreaming() { return this._isStreaming; }

    /**
     * Send a conversation to the LLM and begin streaming the response.
     *
     * @param {Array} messages   - Conversation history [{ role, content }]
     * @param {Object} recipeContext - { mealName, steps, ingredients, currentStep }
     * @returns {Promise<void>}
     */
    async send(messages, recipeContext) {
        if (this._destroyed) return;

        // Abort any in-flight request
        this.abort();

        this._buffer = '';
        this._fullText = '';
        this._isStreaming = true;
        this._abortController = new AbortController();

        try {
            const response = await fetch(CHAT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages, recipeContext }),
                signal: this._abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`Chat endpoint returned ${response.status}`);
            }

            // Read the SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });

                // Process complete SSE lines
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop(); // Keep incomplete line

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmed.slice(6));

                        if (data.error) {
                            this._onError?.({ type: 'llm_error', message: data.error });
                            continue;
                        }

                        if (data.done) {
                            // Flush remaining buffer
                            this._flushBuffer(true);
                            this._isStreaming = false;
                            this._onDone?.(this._fullText);
                            return;
                        }

                        if (data.token) {
                            this._processToken(data.token);
                        }
                    } catch (_) {
                        // Skip malformed JSON
                    }
                }
            }

            // Stream ended without explicit done — flush and complete
            this._flushBuffer(true);
            this._isStreaming = false;
            this._onDone?.(this._fullText);

        } catch (err) {
            this._isStreaming = false;

            if (err.name === 'AbortError') {
                // Expected — client intentionally aborted
                return;
            }

            this._onError?.({ type: 'stream_error', message: err.message });
        }
    }

    /**
     * Abort the current in-flight request.
     */
    abort() {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
        this._isStreaming = false;
    }

    /**
     * Full cleanup.
     */
    destroy() {
        this._destroyed = true;
        this.abort();
        this._onSentence = null;
        this._onToken = null;
        this._onAction = null;
        this._onDone = null;
        this._onError = null;
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    _processToken(token) {
        this._fullText += token;
        this._buffer += token;

        // Emit raw token for live display
        this._onToken?.(token, this._fullText);

        // Try to flush complete sentences
        this._flushBuffer(false);
    }

    /**
     * Flush buffered text as sentences.
     * @param {boolean} force - If true, flush everything (stream ended)
     */
    _flushBuffer(force) {
        if (!this._buffer.trim()) {
            this._buffer = '';
            return;
        }

        if (force) {
            // Stream ended — flush everything regardless of length
            const text = this._buffer.trim();
            this._buffer = '';
            if (text) {
                this._emitSentence(text);
            }
            return;
        }

        // Try to split on sentence boundaries
        while (this._buffer.length > 0) {
            const match = this._buffer.match(SENTENCE_BOUNDARY);

            if (match && match.index !== undefined) {
                const splitPoint = match.index + match[0].length;
                const sentence = this._buffer.slice(0, splitPoint).trim();
                const remainder = this._buffer.slice(splitPoint);

                // FIX #4: Only emit if the sentence is long enough for smooth TTS.
                // Short fragments like "Great!" (6 chars) or "Sure thing." (11 chars)
                // stay in the buffer and get concatenated with the next sentence,
                // producing "Great! Now stir the sauce." as a single TTS request.
                if (sentence.length >= MIN_SENTENCE_LENGTH) {
                    this._buffer = remainder;
                    this._emitSentence(sentence);
                    continue;
                }

                // Sentence exists but is too short — don't split yet.
                // Check if we should force-flush due to buffer overflow instead.
                // If not, just break and wait for more tokens.
                if (this._buffer.length < MAX_BUFFER_LENGTH) {
                    break;
                }
            }

            // Force-flush if buffer is too long (prevents long unpunctuated runs)
            if (this._buffer.length >= MAX_BUFFER_LENGTH) {
                // Find last space to avoid splitting mid-word
                const lastSpace = this._buffer.lastIndexOf(' ', MAX_BUFFER_LENGTH);
                const splitAt = lastSpace > MIN_SENTENCE_LENGTH ? lastSpace : MAX_BUFFER_LENGTH;
                const chunk = this._buffer.slice(0, splitAt).trim();
                this._buffer = this._buffer.slice(splitAt);
                if (chunk) {
                    this._emitSentence(chunk);
                }
                continue;
            }

            // Not enough text to split — wait for more tokens
            break;
        }
    }

    /**
     * Emit a sentence, stripping and parsing action tags.
     */
    _emitSentence(text) {
        // Extract action tags
        const actions = [];
        let cleanText = text.replace(ACTION_PATTERN, (match, type, payload) => {
            actions.push({
                type: type,             // e.g., 'NEXT', 'GOTO', 'STOP'
                payload: payload ? parseInt(payload, 10) : null,
            });
            return ''; // Strip the tag from spoken text
        }).trim();

        // Emit actions
        for (const action of actions) {
            this._onAction?.(action);
        }

        // Emit cleaned sentence for TTS (skip if only action tags)
        if (cleanText) {
            this._onSentence?.(cleanText);
        }
    }
}

export default LLMStream;
