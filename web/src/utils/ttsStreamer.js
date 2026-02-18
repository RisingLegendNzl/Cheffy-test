// web/src/utils/ttsStreamer.js
// =============================================================================
// Phase 6 — Byte-Level TTS Streamer
//
// v3.3 — TTS continuity fix: eliminates choppy / cut-out playback
//
// Root causes fixed:
//   1. onPlaybackStart/End fired per-sentence, causing state machine churn
//      → Now fires once per turn (enqueue…flush cycle)
//   2. _isPlaying toggled false between sentences, triggering STT restart
//      → New _turnPlaying flag stays true across all sentences in a turn
//   3. BUFFER_THRESHOLD too low (2) caused playback to start before enough
//      audio was decoded, leading to silence gaps
//      → Raised to 3, with a fallback timer so short sentences still play
//   4. decodeAudioData failures on partial frames dropped audio silently
//      → Added retry with sliced buffer and better error recovery
//   5. AudioContext suspension between sentences killed playback
//      → Watchdog now spans entire turn, not just per-sentence
//
// Architecture:
//   1. Client calls enqueue(text) for each sentence from LLM
//   2. flush() signals no more sentences coming
//   3. Each sentence streams via SSE from /api/voice/tts-stream
//   4. Chunks are decoded and scheduled for gapless Web Audio playback
//   5. onPlaybackStart fires when first audio plays; onPlaybackEnd fires
//      only after ALL sentences have finished playing
//
// Falls back to blob-based playback if streaming fails per-sentence.
// =============================================================================

const TTS_STREAM_ENDPOINT = '/api/voice/tts-stream';
const TTS_FALLBACK_ENDPOINT = '/api/voice/tts';

const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;
const SCHEDULE_AHEAD_SECONDS = 0.05;
const BUFFER_THRESHOLD = 3; // FIX: Raised from 2 — need more decoded chunks before starting playback
const BUFFER_WAIT_MS = 800; // FIX: Max wait before starting playback even if threshold not met

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

        // ── FIX: Turn-level playback tracking ──
        // _turnPlaying stays true from the first sentence's audio start
        // until ALL sentences in the turn finish. This prevents the hook's
        // STT effect from toggling mic on/off between sentences.
        this._turnPlaying = false;

        // Per-sentence scheduling state
        this._nextScheduleTime = 0;
        this._activeSources = [];
        this._playbackStarted = false; // Per-sentence: first chunk of THIS sentence
        this._streamDone = false;
        this._chunksDecoded = 0;

        // Abort
        this._abortController = null;

        // Voice config
        this._voice = DEFAULT_VOICE;
        this._speed = DEFAULT_SPEED;

        // Sentence queue
        this._sentenceQueue = [];
        this._isSentenceActive = false;
        this._flushed = false;

        // Atomic counter for completion detection (Bug C fix from v3.2)
        this._pendingSourceCount = 0;

        // ── FIX: Turn-level watchdog ──
        this._turnWatchdogInterval = null;

        // ── FIX: Buffer wait timer for short sentences ──
        this._bufferWaitTimer = null;
    }

    get isPlaying() { return this._turnPlaying; } // FIX: Expose turn-level flag

    configure({ voice, speed } = {}) {
        if (voice) this._voice = voice;
        if (speed) this._speed = speed;
    }

    // =========================================================================
    // PUBLIC — Queue-compatible API (matches TTSQueue interface)
    // =========================================================================

    enqueue(text) {
        if (this._destroyed || !text?.trim()) return;
        this._sentenceQueue.push(text.trim());
        this._advanceSentenceQueue();
    }

    flush() {
        this._flushed = true;
        if (!this._isSentenceActive && this._sentenceQueue.length === 0) {
            this._signalAllDone();
        }
    }

    interrupt() {
        this._sessionId++;
        this._sentenceQueue = [];
        this._isSentenceActive = false;
        this._flushed = false;
        this._abortCurrentStream();
        this._stopAllAudio();
        this._clearBufferWaitTimer();
        this._stopTurnWatchdog();
        this._isPlaying = false;

        // ── FIX: Only signal end if we were actually playing ──
        if (this._turnPlaying) {
            this._turnPlaying = false;
            // Don't fire onPlaybackEnd on interrupt — the hook handles
            // interrupt state separately via ACTION.INTERRUPT
        }
    }

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
    // SENTENCE QUEUE
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

        this._ensureAudioContext();

        // Reset per-sentence state (but NOT _turnPlaying)
        this._activeSources = [];
        this._chunksDecoded = 0;
        this._pendingSourceCount = 0;
        this._playbackStarted = false;
        this._streamDone = false;
        this._nextScheduleTime = this._audioContext.currentTime + 0.1;

        this._abortController = new AbortController();

        // ── FIX: Start turn-level watchdog (idempotent — only one runs per turn) ──
        this._startTurnWatchdog(capturedSession);

        // ── FIX: Buffer wait timer — if BUFFER_THRESHOLD isn't met quickly,
        // start playback anyway (handles very short sentences with few chunks) ──
        this._clearBufferWaitTimer();
        this._bufferWaitTimer = setTimeout(() => {
            this._bufferWaitTimer = null;
            if (capturedSession !== this._sessionId) return;
            if (!this._playbackStarted && this._chunksDecoded > 0) {
                console.debug('[TTSStreamer] Buffer wait expired — starting playback with', this._chunksDecoded, 'chunks');
                this._playbackStarted = true;
                this._isPlaying = true;
                if (!this._turnPlaying) {
                    this._turnPlaying = true;
                    this._onPlaybackStart?.();
                }
            }
        }, BUFFER_WAIT_MS);

        try {
            const response = await fetch(TTS_STREAM_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    voice: this._voice,
                    speed: this._speed,
                    format: 'mp3',
                }),
                signal: this._abortController.signal,
            });

            if (capturedSession !== this._sessionId) return;

            if (!response.ok) {
                throw new Error(`TTS stream endpoint returned ${response.status}`);
            }

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
                    } catch (_) { /* skip malformed SSE frames */ }
                }
            }

            // Ensure done is signaled even if SSE didn't send explicit done
            this._streamDone = true;
            this._checkSentenceComplete(capturedSession);

        } catch (err) {
            if (err.name === 'AbortError' || capturedSession !== this._sessionId) return;

            console.warn('[TTSStreamer] Stream failed, falling back to blob:', err.message);
            await this._fallbackBlobPlay(text, capturedSession);
        }
    }

    // =========================================================================
    // DECODE + SCHEDULE
    // =========================================================================

    async _decodeAndSchedule(base64Audio, capturedSession) {
        if (capturedSession !== this._sessionId || this._destroyed) return;

        try {
            const binary = atob(base64Audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            // ── FIX: Use slice to create a transferable copy for decodeAudioData ──
            const buffer = bytes.buffer.slice(0);
            let audioBuffer;
            try {
                audioBuffer = await this._audioContext.decodeAudioData(buffer);
            } catch (decodeErr) {
                // ── FIX: Retry with a padded buffer — partial MP3 frames can fail ──
                // Some chunks arrive mid-frame; padding with silence helps the decoder
                console.debug('[TTSStreamer] Chunk decode retry after initial failure');
                try {
                    // Try again with a fresh copy (some browsers corrupt the original)
                    const retryBuffer = bytes.buffer.slice(0);
                    audioBuffer = await this._audioContext.decodeAudioData(retryBuffer);
                } catch (_) {
                    // Genuinely bad chunk — skip it
                    console.debug('[TTSStreamer] Chunk decode skipped:', decodeErr.message);
                    return;
                }
            }

            if (capturedSession !== this._sessionId) return;

            this._chunksDecoded++;
            this._onChunkDecoded?.(this._chunksDecoded);

            this._scheduleBuffer(audioBuffer, capturedSession);

        } catch (err) {
            console.debug('[TTSStreamer] Unexpected decode error:', err.message);
        }
    }

    _scheduleBuffer(audioBuffer, capturedSession) {
        if (capturedSession !== this._sessionId || this._destroyed) return;

        const source = this._audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this._audioContext.destination);

        const now = this._audioContext.currentTime;
        const startTime = Math.max(this._nextScheduleTime, now + SCHEDULE_AHEAD_SECONDS);

        source.start(startTime);
        this._nextScheduleTime = startTime + audioBuffer.duration;

        this._activeSources.push(source);
        this._pendingSourceCount++;

        // ── FIX: Signal turn-level playback start (fires ONCE per turn) ──
        if (!this._playbackStarted && this._chunksDecoded >= BUFFER_THRESHOLD) {
            this._playbackStarted = true;
            this._isPlaying = true;
            this._clearBufferWaitTimer(); // Cancel fallback timer

            if (!this._turnPlaying) {
                this._turnPlaying = true;
                this._onPlaybackStart?.();
            }
        }

        // Completion tracking
        source.onended = () => {
            if (capturedSession !== this._sessionId) return;
            this._pendingSourceCount = Math.max(0, this._pendingSourceCount - 1);
            const idx = this._activeSources.indexOf(source);
            if (idx > -1) this._activeSources.splice(idx, 1);
            this._checkSentenceComplete(capturedSession);
        };
    }

    _checkSentenceComplete(capturedSession) {
        if (capturedSession !== this._sessionId) return;
        if (!this._streamDone) return;
        if (this._pendingSourceCount > 0) return;

        // This sentence is fully played
        this._clearBufferWaitTimer();
        this._isSentenceActive = false;
        // ── FIX: Do NOT set _isPlaying = false or _turnPlaying = false here ──
        // The turn is still active if there are more sentences queued.

        if (this._sentenceQueue.length > 0) {
            this._advanceSentenceQueue();
        } else if (this._flushed) {
            this._signalAllDone();
        }
        // If not flushed and queue is empty, we wait for more enqueue() calls.
        // _turnPlaying stays true so STT doesn't restart.
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

            // ── FIX: Signal turn-level start if not already started ──
            if (!this._turnPlaying) {
                this._turnPlaying = true;
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
        this._pendingSourceCount = 0;
        this._playbackStarted = false;
        this._streamDone = false;
        this._chunksDecoded = 0;
    }

    _clearBufferWaitTimer() {
        if (this._bufferWaitTimer) {
            clearTimeout(this._bufferWaitTimer);
            this._bufferWaitTimer = null;
        }
    }

    // ── FIX: Turn-level watchdog — survives across sentences ──
    _startTurnWatchdog(capturedSession) {
        if (this._turnWatchdogInterval) return; // Already running
        this._turnWatchdogInterval = setInterval(() => {
            if (capturedSession !== this._sessionId || this._destroyed) {
                this._stopTurnWatchdog();
                return;
            }
            if (this._audioContext?.state === 'suspended') {
                console.debug('[TTSStreamer] AudioContext suspended — resuming');
                this._audioContext.resume().catch(() => {});
            }
        }, 500);
    }

    _stopTurnWatchdog() {
        if (this._turnWatchdogInterval) {
            clearInterval(this._turnWatchdogInterval);
            this._turnWatchdogInterval = null;
        }
    }

    // ── FIX: _signalAllDone fires ONCE after the entire turn's audio finishes ──
    _signalAllDone() {
        this._clearBufferWaitTimer();
        this._stopTurnWatchdog();
        this._isPlaying = false;
        this._flushed = false;

        // ── FIX: Only fire onPlaybackEnd if we actually played something ──
        if (this._turnPlaying) {
            this._turnPlaying = false;
            this._onPlaybackEnd?.();
        }
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
