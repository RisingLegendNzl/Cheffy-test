// web/src/utils/ttsStreamer.js
// =============================================================================
// Phase 6 — Byte-Level TTS Streamer v3.4
//
// v3.4: Added global ttsMute gate for debug toggle.
//   - enqueue() drops text when muted (no synthesis, no network calls)
//   - flush() fires onPlaybackEnd immediately when muted (unblocks state machine)
//   - Existing turn-level playback tracking from v3.3 preserved
//
// v3.3 fixes (preserved):
//   1. TURN-LEVEL PLAYBACK FLAG (_turnPlaying)
//   2. SINGLE onPlaybackStart/End PER TURN
//   3. TURN-LEVEL WATCHDOG
//   4. BUFFER WAIT TIMER
//   5. interrupt() NO LONGER FIRES onPlaybackEnd
// =============================================================================

import { ttsMute } from './ttsMute';

const TTS_STREAM_ENDPOINT = '/api/voice/tts-stream';
const TTS_FALLBACK_ENDPOINT = '/api/voice/tts';

const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;
const SCHEDULE_AHEAD_SECONDS = 0.05;
const BUFFER_THRESHOLD = 3;
const BUFFER_WAIT_MS = 800;

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
        // ── v3.4 MUTE GATE: drop silently when muted ──
        if (ttsMute.isMuted) {
            console.debug('[TTSStreamer] Muted — dropping enqueue:', text.substring(0, 40));
            return;
        }
        this._sentenceQueue.push(text.trim());
        this._advanceSentenceQueue();
    }

    flush() {
        this._flushed = true;
        // ── v3.4 MUTE GATE: if muted, signal done immediately ──
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
        this._stopAllAudio();
        this._clearBufferWaitTimer();
        this._stopTurnWatchdog();
        this._isPlaying = false;
        this._turnPlaying = false;
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

        // ── v3.4 MUTE GATE: skip synthesis entirely ──
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
        this._nextScheduleTime = this._audioContext.currentTime + 0.1;
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
                            this._streamDone = true;
                            this._checkSentenceComplete(capturedSession);
                            continue;
                        }
                        if (data.audio) {
                            await this._decodeAndSchedule(data.audio, capturedSession);
                        }
                    } catch (_) {}
                }
            }

            this._streamDone = true;
            this._checkSentenceComplete(capturedSession);

        } catch (err) {
            if (err.name === 'AbortError' || capturedSession !== this._sessionId) return;
            console.warn('[TTSStreamer] Stream failed, falling back:', err.message);
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
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            let audioBuffer;
            try {
                audioBuffer = await this._audioContext.decodeAudioData(bytes.buffer.slice(0));
            } catch (_) {
                try {
                    audioBuffer = await this._audioContext.decodeAudioData(bytes.buffer.slice(0));
                } catch (e2) {
                    console.debug('[TTSStreamer] Chunk decode skipped:', e2.message);
                    return;
                }
            }

            if (capturedSession !== this._sessionId) return;

            this._chunksDecoded++;
            this._onChunkDecoded?.(this._chunksDecoded);
            this._scheduleBuffer(audioBuffer, capturedSession);

        } catch (err) {
            console.debug('[TTSStreamer] Decode error:', err.message);
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
        // ── v3.4 MUTE GATE ──
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
    }

    _clearBufferWaitTimer() {
        if (this._bufferWaitTimer) {
            clearTimeout(this._bufferWaitTimer);
            this._bufferWaitTimer = null;
        }
    }

    _startTurnWatchdog(capturedSession) {
        if (this._turnWatchdogInterval) return;
        this._turnWatchdogInterval = setInterval(() => {
            if (capturedSession !== this._sessionId || this._destroyed) {
                this._stopTurnWatchdog();
                return;
            }
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
        this._stopTurnWatchdog();
        this._isPlaying = false;
        this._flushed = false;
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
