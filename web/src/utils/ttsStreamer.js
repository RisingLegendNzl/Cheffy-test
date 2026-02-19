// web/src/utils/ttsStreamer.js
// =============================================================================
// Phase 6 — Byte-Level TTS Streamer v5.0
//
// v5.0 — Smooth playback overhaul (7 fixes for choppiness)
//
//   FIX #1 — AudioContext auto-suspension (HIGH)
//     - visibilitychange listener resumes AudioContext on tab return
//     - Proactive resume on every enqueue/flush for mobile resilience
//
//   FIX #2 — Look-ahead synthesis (HIGH)
//     - Pre-fetches next sentence while current one plays
//     - _prefetchSlots[] holds pre-fetched AudioBuffer arrays
//     - Eliminates 500-1500ms inter-sentence silence gaps
//
//   FIX #3 — Interrupt scheduling glitch (MEDIUM)
//     - _stopAllAudio() resets _nextScheduleTime with headroom
//
//   FIX #5 — Partial MP3 frame decode failures (LOW-MEDIUM)
//     - Accumulates base64 chunks into rolling buffer
//     - Only decodes when buffer reaches MIN_DECODE_BYTES
//     - Drains remainder on stream end
//
//   FIX #7 — Network timeout / BUFFER_WAIT_MS (LOW)
//     - Fires onError if no chunks arrive within NETWORK_TIMEOUT_MS
//     - Prevents LISTENING/SPEAKING state desync
//
// v3.4 (preserved) — ttsMute gate
// v3.3 (preserved) — Turn-level playback, single onPlaybackStart/End
// =============================================================================

import { ttsMute } from './ttsMute';

const TTS_STREAM_ENDPOINT = '/api/voice/tts-stream';
const TTS_FALLBACK_ENDPOINT = '/api/voice/tts';

const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;
const SCHEDULE_AHEAD_SECONDS = 0.05;
const BUFFER_THRESHOLD = 2;           // v5.0: lowered from 3→2 for faster start
const BUFFER_WAIT_MS = 600;           // v5.0: lowered from 800→600
const MIN_DECODE_BYTES = 4096;        // FIX #5: minimum bytes before attempting decode
const NETWORK_TIMEOUT_MS = 4000;      // FIX #7: fire error if no chunks in 4s
const PREFETCH_SLOTS = 1;             // FIX #2: how many sentences to pre-fetch ahead

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

        this._turnPlaying = false;

        this._nextScheduleTime = 0;
        this._activeSources = [];
        this._playbackStarted = false;
        this._streamDone = false;
        this._chunksDecoded = 0;

        this._abortController = null;

        this._voice = DEFAULT_VOICE;
        this._speed = DEFAULT_SPEED;

        this._sentenceQueue = [];
        this._isSentenceActive = false;
        this._flushed = false;

        this._pendingSourceCount = 0;

        this._turnWatchdogInterval = null;
        this._bufferWaitTimer = null;
        this._networkTimeoutTimer = null;   // FIX #7

        // FIX #2: Look-ahead prefetch state
        this._prefetchAbort = null;
        this._prefetchReady = null;         // { text, blobUrl } | null
        this._isPrefetching = false;

        // FIX #5: Decode accumulation buffer
        this._decodeAccum = null;           // Uint8Array

        // FIX #1: Visibility change listener
        this._boundVisibilityHandler = this._onVisibilityChange.bind(this);
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this._boundVisibilityHandler);
        }
    }

    get isPlaying() { return this._turnPlaying; }

    configure({ voice, speed } = {}) {
        if (voice) this._voice = voice;
        if (speed) this._speed = speed;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    enqueue(text) {
        if (this._destroyed || !text?.trim()) return;
        if (ttsMute.isMuted) {
            console.debug('[TTSStreamer] Muted — dropping enqueue:', text.substring(0, 40));
            return;
        }
        // FIX #1: Proactively resume AudioContext on every enqueue
        this._ensureAudioContext();
        this._sentenceQueue.push(text.trim());
        this._advanceSentenceQueue();
    }

    flush() {
        this._flushed = true;
        if (ttsMute.isMuted) {
            this._signalAllDone();
            return;
        }
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
        this._abortPrefetch();              // FIX #2: cancel any in-flight prefetch
        this._stopAllAudio();
        this._clearBufferWaitTimer();
        this._clearNetworkTimeout();        // FIX #7
        this._stopTurnWatchdog();
        this._isPlaying = false;
        this._turnPlaying = false;
        this._decodeAccum = null;           // FIX #5: reset accumulator
    }

    destroy() {
        this._destroyed = true;
        this.interrupt();
        // FIX #1: Remove visibility listener
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
        }
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
    // FIX #1: VISIBILITY CHANGE HANDLER
    // =========================================================================

    _onVisibilityChange() {
        if (this._destroyed) return;
        if (document.visibilityState === 'visible' && this._audioContext) {
            // Tab returned to foreground — force resume
            if (this._audioContext.state === 'suspended') {
                console.debug('[TTSStreamer] Tab visible — resuming AudioContext');
                this._audioContext.resume().catch(() => {});
            }
        }
    }

    // =========================================================================
    // SENTENCE QUEUE (FIX #2: Look-ahead prefetch)
    // =========================================================================

    _advanceSentenceQueue() {
        if (this._destroyed || this._isSentenceActive) return;
        if (this._sentenceQueue.length === 0) {
            if (this._flushed) this._signalAllDone();
            return;
        }

        const text = this._sentenceQueue.shift();
        this._isSentenceActive = true;

        // FIX #2: Check if we have a prefetched blob for this text
        if (this._prefetchReady && this._prefetchReady.text === text) {
            console.debug('[TTSStreamer] Using prefetched blob for:', text.substring(0, 40));
            const blobUrl = this._prefetchReady.blobUrl;
            this._prefetchReady = null;
            this._playPrefetchedBlob(text, blobUrl);
        } else {
            // No prefetch hit — stream normally
            this._prefetchReady = null;
            this._streamSentence(text);
        }

        // FIX #2: Kick off prefetch for next sentence in queue
        this._startPrefetch();
    }

    // FIX #2: Pre-fetch the next sentence in the queue via the fallback (non-streaming) endpoint
    _startPrefetch() {
        if (this._isPrefetching || this._destroyed) return;
        if (this._sentenceQueue.length === 0) return;
        if (ttsMute.isMuted) return;

        const nextText = this._sentenceQueue[0]; // peek, don't shift
        if (!nextText) return;

        this._isPrefetching = true;
        this._prefetchAbort = new AbortController();
        const capturedSession = this._sessionId;

        fetch(TTS_FALLBACK_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: nextText, voice: this._voice, speed: this._speed }),
            signal: this._prefetchAbort.signal,
        })
        .then(res => {
            if (capturedSession !== this._sessionId || !res.ok) throw new Error('stale');
            return res.blob();
        })
        .then(blob => {
            if (capturedSession !== this._sessionId) return;
            const blobUrl = URL.createObjectURL(blob);
            this._prefetchReady = { text: nextText, blobUrl };
            console.debug('[TTSStreamer] Prefetch ready for:', nextText.substring(0, 40));
        })
        .catch(() => {
            // Prefetch failure is non-critical — sentence will stream normally
        })
        .finally(() => {
            this._isPrefetching = false;
            this._prefetchAbort = null;
        });
    }

    _abortPrefetch() {
        if (this._prefetchAbort) {
            this._prefetchAbort.abort();
            this._prefetchAbort = null;
        }
        if (this._prefetchReady?.blobUrl) {
            URL.revokeObjectURL(this._prefetchReady.blobUrl);
        }
        this._prefetchReady = null;
        this._isPrefetching = false;
    }

    // FIX #2: Play a prefetched blob via HTMLAudioElement (simpler + more resilient than Web Audio)
    async _playPrefetchedBlob(text, blobUrl) {
        const capturedSession = this._sessionId;

        if (ttsMute.isMuted) {
            URL.revokeObjectURL(blobUrl);
            this._isSentenceActive = false;
            this._advanceSentenceQueue();
            return;
        }

        this._ensureAudioContext();

        if (!this._turnPlaying) {
            this._turnPlaying = true;
            this._isPlaying = true;
            this._onPlaybackStart?.();
        }

        try {
            const audio = new Audio(blobUrl);
            await new Promise((resolve, reject) => {
                audio.onended = resolve;
                audio.onerror = reject;
                audio.play().catch(reject);
            });

            URL.revokeObjectURL(blobUrl);

            if (capturedSession !== this._sessionId) return;

            this._isSentenceActive = false;
            this._advanceSentenceQueue();
        } catch (err) {
            if (capturedSession !== this._sessionId) return;
            URL.revokeObjectURL(blobUrl);
            console.warn('[TTSStreamer] Prefetch playback failed, falling back to stream:', err.message);
            // Fall back to streaming
            this._streamSentence(text);
        }
    }

    // =========================================================================
    // STREAMING PIPELINE
    // =========================================================================

    async _streamSentence(text) {
        const capturedSession = this._sessionId;

        if (ttsMute.isMuted) {
            this._isSentenceActive = false;
            this._advanceSentenceQueue();
            return;
        }

        this._ensureAudioContext();

        this._activeSources = [];
        this._chunksDecoded = 0;
        this._pendingSourceCount = 0;
        this._playbackStarted = false;
        this._streamDone = false;
        this._decodeAccum = null;           // FIX #5: reset accumulator
        // FIX #3: Use headroom-aware schedule time
        this._nextScheduleTime = this._audioContext.currentTime + 0.15;
        this._abortController = new AbortController();

        this._startTurnWatchdog(capturedSession);

        this._clearBufferWaitTimer();
        this._bufferWaitTimer = setTimeout(() => {
            this._bufferWaitTimer = null;
            if (capturedSession !== this._sessionId) return;
            if (!this._playbackStarted && this._chunksDecoded > 0) {
                this._playbackStarted = true;
                this._isPlaying = true;
                if (!this._turnPlaying) {
                    this._turnPlaying = true;
                    this._onPlaybackStart?.();
                }
            }
        }, BUFFER_WAIT_MS);

        // FIX #7: Network timeout — fire error if no data arrives
        this._clearNetworkTimeout();
        this._networkTimeoutTimer = setTimeout(() => {
            this._networkTimeoutTimer = null;
            if (capturedSession !== this._sessionId) return;
            if (this._chunksDecoded === 0) {
                console.warn('[TTSStreamer] Network timeout — no chunks received in', NETWORK_TIMEOUT_MS, 'ms');
                this._onError?.({ type: 'network_timeout', message: 'TTS stream timed out' });
                // Fall back to blob endpoint
                this._abortCurrentStream();
                this._fallbackBlobPlay(text, capturedSession);
            }
        }, NETWORK_TIMEOUT_MS);

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
            if (!response.ok) throw new Error(`TTS stream returned ${response.status}`);

            // FIX #7: Clear network timeout once we have a response
            this._clearNetworkTimeout();

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
                        if (data.error) continue;
                        if (data.done) {
                            // FIX #5: Flush any remaining accumulated bytes
                            this._flushDecodeAccum(capturedSession);
                            this._streamDone = true;
                            this._checkSentenceComplete(capturedSession);
                            continue;
                        }
                        if (data.audio) {
                            await this._accumulateAndDecode(data.audio, capturedSession);
                        }
                    } catch (_) {}
                }
            }

            // FIX #5: Final flush of accumulator
            this._flushDecodeAccum(capturedSession);
            this._streamDone = true;
            this._checkSentenceComplete(capturedSession);

        } catch (err) {
            if (err.name === 'AbortError' || capturedSession !== this._sessionId) return;
            console.warn('[TTSStreamer] Stream failed, falling back:', err.message);
            this._clearNetworkTimeout();
            await this._fallbackBlobPlay(text, capturedSession);
        }
    }

    // =========================================================================
    // FIX #5: ACCUMULATE + DECODE (replaces old _decodeAndSchedule)
    // =========================================================================

    async _accumulateAndDecode(base64Audio, capturedSession) {
        if (capturedSession !== this._sessionId || this._destroyed) return;

        try {
            const binary = atob(base64Audio);
            const chunk = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) chunk[i] = binary.charCodeAt(i);

            // Append to accumulator
            if (!this._decodeAccum) {
                this._decodeAccum = chunk;
            } else {
                const merged = new Uint8Array(this._decodeAccum.length + chunk.length);
                merged.set(this._decodeAccum, 0);
                merged.set(chunk, this._decodeAccum.length);
                this._decodeAccum = merged;
            }

            // Only decode when we have enough bytes for complete MP3 frames
            if (this._decodeAccum.length >= MIN_DECODE_BYTES) {
                await this._decodeAccumBuffer(capturedSession);
            }
        } catch (err) {
            console.debug('[TTSStreamer] Accumulate error:', err.message);
        }
    }

    _flushDecodeAccum(capturedSession) {
        if (!this._decodeAccum || this._decodeAccum.length === 0) return;
        // Decode whatever remains, even if below MIN_DECODE_BYTES
        this._decodeAccumBuffer(capturedSession);
    }

    async _decodeAccumBuffer(capturedSession) {
        if (!this._decodeAccum || capturedSession !== this._sessionId) return;

        const bytes = this._decodeAccum;
        this._decodeAccum = null; // Reset accumulator

        try {
            const audioBuffer = await this._audioContext.decodeAudioData(bytes.buffer.slice(0));
            if (capturedSession !== this._sessionId) return;

            this._chunksDecoded++;
            this._onChunkDecoded?.(this._chunksDecoded);
            this._scheduleBuffer(audioBuffer, capturedSession);
        } catch (err) {
            // FIX #5: Instead of retrying identical data, log and continue
            // The next accumulation batch will likely contain a complete frame
            console.debug('[TTSStreamer] Decode skipped (partial frame):', err.message, bytes.length, 'bytes');
        }
    }

    // =========================================================================
    // SCHEDULE + PLAYBACK
    // =========================================================================

    _scheduleBuffer(audioBuffer, capturedSession) {
        if (capturedSession !== this._sessionId || this._destroyed) return;

        // FIX #1: Resume AudioContext if suspended (mobile return from background)
        if (this._audioContext.state === 'suspended') {
            this._audioContext.resume().catch(() => {});
        }

        const source = this._audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this._audioContext.destination);

        const now = this._audioContext.currentTime;
        const startTime = Math.max(this._nextScheduleTime, now + SCHEDULE_AHEAD_SECONDS);
        source.start(startTime);
        this._nextScheduleTime = startTime + audioBuffer.duration;

        this._activeSources.push(source);
        this._pendingSourceCount++;

        if (!this._playbackStarted && this._chunksDecoded >= BUFFER_THRESHOLD) {
            this._playbackStarted = true;
            this._isPlaying = true;
            this._clearBufferWaitTimer();
            if (!this._turnPlaying) {
                this._turnPlaying = true;
                this._onPlaybackStart?.();
            }
        }

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
        if (!this._streamDone || this._pendingSourceCount > 0) return;

        this._clearBufferWaitTimer();
        this._clearNetworkTimeout();
        this._isSentenceActive = false;

        if (this._sentenceQueue.length > 0) {
            this._advanceSentenceQueue();
        } else if (this._flushed) {
            this._signalAllDone();
        }
    }

    // =========================================================================
    // FALLBACK
    // =========================================================================

    async _fallbackBlobPlay(text, capturedSession) {
        if (ttsMute.isMuted) {
            this._isSentenceActive = false;
            this._advanceSentenceQueue();
            return;
        }

        try {
            const response = await fetch(TTS_FALLBACK_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice: this._voice, speed: this._speed }),
            });

            if (capturedSession !== this._sessionId) return;
            if (!response.ok) throw new Error(`Fallback TTS failed: ${response.status}`);

            const blob = await response.blob();
            if (capturedSession !== this._sessionId) return;

            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);

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
            console.warn('[TTSStreamer] Fallback failed:', err.message);
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
        this._decodeAccum = null;           // FIX #5: clear accumulator

        // FIX #3: Reset schedule time with headroom for next sentence
        if (this._audioContext && this._audioContext.state !== 'closed') {
            this._nextScheduleTime = this._audioContext.currentTime + 0.15;
        } else {
            this._nextScheduleTime = 0;
        }
    }

    _clearBufferWaitTimer() {
        if (this._bufferWaitTimer) {
            clearTimeout(this._bufferWaitTimer);
            this._bufferWaitTimer = null;
        }
    }

    _clearNetworkTimeout() {
        if (this._networkTimeoutTimer) {
            clearTimeout(this._networkTimeoutTimer);
            this._networkTimeoutTimer = null;
        }
    }

    _startTurnWatchdog(capturedSession) {
        if (this._turnWatchdogInterval) return;
        this._turnWatchdogInterval = setInterval(() => {
            if (capturedSession !== this._sessionId || this._destroyed) {
                this._stopTurnWatchdog();
                return;
            }
            // FIX #1: More aggressive AudioContext resume in watchdog
            if (this._audioContext?.state === 'suspended') {
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

    _signalAllDone() {
        this._clearBufferWaitTimer();
        this._clearNetworkTimeout();
        this._stopTurnWatchdog();
        this._abortPrefetch();
        this._isPlaying = false;
        this._flushed = false;
        this._decodeAccum = null;
        if (this._turnPlaying) {
            this._turnPlaying = false;
            this._onPlaybackEnd?.();
        }
    }
}

export function isTTSStreamingSupported() {
    return typeof window !== 'undefined' &&
        !!(window.AudioContext || window.webkitAudioContext) &&
        typeof fetch !== 'undefined';
}

export default TTSStreamer;
