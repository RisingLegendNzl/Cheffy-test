// web/src/utils/ttsStreamer.js
// =============================================================================
// Phase 6 — Byte-Level TTS Streamer
//
// Plays audio in real-time by consuming base64-encoded audio chunks from
// the /api/voice/tts-stream SSE endpoint and feeding them into the
// Web Audio API via AudioBufferSourceNode scheduling.
//
// Architecture:
//   1. Client calls streamSpeak(text) → opens SSE to tts-stream endpoint
//   2. Each SSE frame contains a base64 audio chunk (MP3 or PCM)
//   3. Chunks are decoded via AudioContext.decodeAudioData
//   4. Decoded buffers are scheduled for gapless playback
//   5. Playback starts as soon as the first chunk is decoded (~200ms)
//
// Compared to TTSQueue (sentence-level pipelining):
//   - TTSQueue: waits for full sentence synthesis → downloads blob → plays
//   - TTSStreamer: plays audio as bytes arrive from OpenAI's stream
//   - TTSStreamer has ~200-400ms lower perceived latency per sentence
//
// Falls back to TTSQueue if Web Audio API is unavailable.
//
// Usage:
//   const streamer = new TTSStreamer({
//     onPlaybackStart: () => ...,
//     onPlaybackEnd:   () => ...,
//     onError:         (err) => ...,
//   });
//   streamer.streamSpeak("Hello, let's cook!");  // Streams + plays
//   streamer.interrupt();                         // Abort everything
//   streamer.destroy();                           // Full cleanup
// =============================================================================

const TTS_STREAM_ENDPOINT = '/api/voice/tts-stream';
const TTS_FALLBACK_ENDPOINT = '/api/voice/tts';

const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;
const SCHEDULE_AHEAD_SECONDS = 0.05; // Schedule 50ms ahead for gapless playback
const BUFFER_THRESHOLD = 2; // Start playback after this many chunks decoded

export class TTSStreamer {
    constructor(callbacks = {}) {
        this._onPlaybackStart = callbacks.onPlaybackStart || (() => {});
        this._onPlaybackEnd = callbacks.onPlaybackEnd || (() => {});
        this._onChunkDecoded = callbacks.onChunkDecoded || (() => {});
        this._onError = callbacks.onError || (() => {});

        this._audioContext = null;
        this._sessionId = 0;
        this._isPlaying = false;
        this._destroyed = false;

        // Scheduling state
        this._nextScheduleTime = 0;
        this._activeSources = [];
        this._decodedBuffers = [];
        this._playbackStarted = false;
        this._streamDone = false;
        this._chunksDecoded = 0;

        // Abort
        this._abortController = null;

        // Voice config
        this._voice = DEFAULT_VOICE;
        this._speed = DEFAULT_SPEED;

        // Sentence queue for multi-sentence streaming
        this._sentenceQueue = [];
        this._isSentenceActive = false;
        this._flushed = false;
    }

    get isPlaying() { return this._isPlaying; }

    configure({ voice, speed } = {}) {
        if (voice) this._voice = voice;
        if (speed) this._speed = speed;
    }

    // =========================================================================
    // PUBLIC — Queue-compatible API (matches TTSQueue interface)
    // =========================================================================

    /**
     * Enqueue a sentence for byte-level streaming playback.
     */
    enqueue(text) {
        if (this._destroyed || !text?.trim()) return;
        this._sentenceQueue.push(text.trim());
        this._advanceSentenceQueue();
    }

    /**
     * Signal no more sentences coming.
     */
    flush() {
        this._flushed = true;
        if (!this._isSentenceActive && this._sentenceQueue.length === 0) {
            this._signalAllDone();
        }
    }

    /**
     * Interrupt everything — stop playback, cancel in-flight streams, clear queue.
     */
    interrupt() {
        this._sessionId++;
        this._sentenceQueue = [];
        this._isSentenceActive = false;
        this._flushed = false;
        this._abortCurrentStream();
        this._stopAllAudio();
        this._isPlaying = false;
    }

    /**
     * Full resource cleanup.
     */
    destroy() {
        this._destroyed = true;
        this.interrupt();

        if (this._audioContext && this._audioContext.state !== 'closed') {
            try { this._audioContext.close(); } catch (_) {}
        }
        this._audioContext = null;

        this._onPlaybackStart = null;
        this._onPlaybackEnd = null;
        this._onChunkDecoded = null;
        this._onError = null;
    }

    // =========================================================================
    // SENTENCE QUEUE — processes one sentence at a time via streaming
    // =========================================================================

    _advanceSentenceQueue() {
        if (this._destroyed || this._isSentenceActive) return;
        if (this._sentenceQueue.length === 0) {
            if (this._flushed) this._signalAllDone();
            return;
        }

        const text = this._sentenceQueue.shift();
        this._isSentenceActive = true;
        this._streamSentence(text);
    }

    async _streamSentence(text) {
        const capturedSession = this._sessionId;

        // Ensure AudioContext exists
        this._ensureAudioContext();

        // Reset per-sentence state
        this._decodedBuffers = [];
        this._chunksDecoded = 0;
        this._playbackStarted = false;
        this._streamDone = false;
        this._nextScheduleTime = this._audioContext.currentTime + 0.1;

        this._abortController = new AbortController();

        try {
            const response = await fetch(TTS_STREAM_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    voice: this._voice,
                    speed: this._speed,
                    format: 'mp3', // mp3 is broadly decodable by AudioContext
                }),
                signal: this._abortController.signal,
            });

            if (capturedSession !== this._sessionId) return;

            if (!response.ok) {
                throw new Error(`TTS stream endpoint returned ${response.status}`);
            }

            // Read SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (capturedSession !== this._sessionId) return;

                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmed.slice(6));

                        if (data.error) {
                            console.warn('[TTSStreamer] Stream error:', data.error);
                            continue;
                        }

                        if (data.done) {
                            this._streamDone = true;
                            this._checkSentenceComplete(capturedSession);
                            continue;
                        }

                        if (data.audio) {
                            await this._decodeAndSchedule(data.audio, capturedSession);
                        }
                    } catch (_) { /* skip malformed */ }
                }
            }

            // Ensure done is signaled
            this._streamDone = true;
            this._checkSentenceComplete(capturedSession);

        } catch (err) {
            if (err.name === 'AbortError' || capturedSession !== this._sessionId) return;

            console.warn('[TTSStreamer] Stream failed, falling back to blob:', err.message);
            // Fallback: fetch the full blob and play via HTMLAudioElement
            await this._fallbackBlobPlay(text, capturedSession);
        }
    }

    // =========================================================================
    // DECODE + SCHEDULE — core Web Audio API playback pipeline
    // =========================================================================

    async _decodeAndSchedule(base64Audio, capturedSession) {
        if (capturedSession !== this._sessionId || this._destroyed) return;

        try {
            // Decode base64 → ArrayBuffer
            const binary = atob(base64Audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            // Decode audio data
            const audioBuffer = await this._audioContext.decodeAudioData(bytes.buffer.slice(0));
            if (capturedSession !== this._sessionId) return;

            this._chunksDecoded++;
            this._onChunkDecoded?.(this._chunksDecoded);

            // Schedule for playback
            this._scheduleBuffer(audioBuffer, capturedSession);

        } catch (err) {
            // decodeAudioData can fail on partial/corrupt frames — skip
            console.debug('[TTSStreamer] Chunk decode skipped:', err.message);
        }
    }

    _scheduleBuffer(audioBuffer, capturedSession) {
        if (capturedSession !== this._sessionId || this._destroyed) return;

        const source = this._audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this._audioContext.destination);

        // Schedule at the next available time
        const now = this._audioContext.currentTime;
        const startTime = Math.max(this._nextScheduleTime, now + SCHEDULE_AHEAD_SECONDS);

        source.start(startTime);
        this._nextScheduleTime = startTime + audioBuffer.duration;

        this._activeSources.push(source);

        // Signal playback started
        if (!this._playbackStarted && this._chunksDecoded >= BUFFER_THRESHOLD) {
            this._playbackStarted = true;
            this._isPlaying = true;
            this._onPlaybackStart?.();
        }

        // When this source finishes, check if sentence is complete
        source.onended = () => {
            if (capturedSession !== this._sessionId) return;
            const idx = this._activeSources.indexOf(source);
            if (idx > -1) this._activeSources.splice(idx, 1);
            this._checkSentenceComplete(capturedSession);
        };
    }

    _checkSentenceComplete(capturedSession) {
        if (capturedSession !== this._sessionId) return;
        if (!this._streamDone) return;
        if (this._activeSources.length > 0) return;

        // This sentence is fully played
        this._isSentenceActive = false;

        // Advance to next sentence
        if (this._sentenceQueue.length > 0) {
            this._advanceSentenceQueue();
        } else if (this._flushed) {
            this._signalAllDone();
        }
    }

    // =========================================================================
    // FALLBACK — blob-based playback when streaming fails
    // =========================================================================

    async _fallbackBlobPlay(text, capturedSession) {
        try {
            const response = await fetch(TTS_FALLBACK_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    voice: this._voice,
                    speed: this._speed,
                }),
            });

            if (capturedSession !== this._sessionId) return;
            if (!response.ok) throw new Error(`Fallback TTS failed: ${response.status}`);

            const blob = await response.blob();
            if (capturedSession !== this._sessionId) return;

            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);

            if (!this._playbackStarted) {
                this._playbackStarted = true;
                this._isPlaying = true;
                this._onPlaybackStart?.();
            }

            await new Promise((resolve, reject) => {
                audio.onended = resolve;
                audio.onerror = reject;
                audio.play().catch(reject);
            });

            URL.revokeObjectURL(blobUrl);

            this._isSentenceActive = false;
            this._advanceSentenceQueue();

        } catch (err) {
            if (capturedSession !== this._sessionId) return;
            console.warn('[TTSStreamer] Fallback blob play failed:', err.message);
            this._onError?.({ type: 'fallback_failed', message: err.message });
            this._isSentenceActive = false;
            this._advanceSentenceQueue();
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    _ensureAudioContext() {
        if (!this._audioContext || this._audioContext.state === 'closed') {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this._audioContext.state === 'suspended') {
            this._audioContext.resume().catch(() => {});
        }
    }

    _abortCurrentStream() {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
    }

    _stopAllAudio() {
        for (const source of this._activeSources) {
            try { source.stop(); source.disconnect(); } catch (_) {}
        }
        this._activeSources = [];
        this._decodedBuffers = [];
        this._playbackStarted = false;
        this._streamDone = false;
        this._chunksDecoded = 0;
    }

    _signalAllDone() {
        this._isPlaying = false;
        this._flushed = false;
        this._onPlaybackEnd?.();
    }
}

/**
 * Check if byte-level TTS streaming is supported.
 */
export function isTTSStreamingSupported() {
    return typeof window !== 'undefined' &&
        !!(window.AudioContext || window.webkitAudioContext) &&
        typeof fetch !== 'undefined';
}

export default TTSStreamer;
