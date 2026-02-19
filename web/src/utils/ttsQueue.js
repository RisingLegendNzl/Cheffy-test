// web/src/utils/ttsQueue.js
// =============================================================================
// Natural Voice Mode — Sentence-Level TTS Queue v5.0
//
// v5.0 — Smooth playback overhaul
//
//   FIX #6 — Cleanup race prevention
//     - _playItem() uses _safeCreateAudio() with a microtask yield between
//       _stopAudio() and new Audio() to let the browser event loop complete
//       cleanup of the previous element, preventing rare pop/click artifacts
//
//   FIX #1 port — visibilitychange resilience
//     - Paused playback auto-resumes when tab returns to foreground
//     - Mobile browsers that suspend <audio> on tab-switch are handled
//
// v3.4 (preserved) — ttsMute gate
// v3.3 (preserved) — Turn-level playback, single onPlaybackStart/End
// =============================================================================

import { ttsMute } from './ttsMute';

const TTS_ENDPOINT = '/api/voice/tts';
const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;
const MAX_CONCURRENT_SYNTH = 3;
const MAX_CACHE_SIZE = 40;

export class TTSQueue {
    constructor(callbacks = {}) {
        this._onPlaybackStart = callbacks.onPlaybackStart || (() => {});
        this._onPlaybackEnd = callbacks.onPlaybackEnd || (() => {});
        this._onSentenceStart = callbacks.onSentenceStart || (() => {});
        this._onError = callbacks.onError || (() => {});

        this._queue = [];
        this._playIndex = 0;
        this._synthIndex = 0;
        this._flushed = false;
        this._destroyed = false;
        this._sessionId = 0;

        this._isPlaying = false;
        this._turnPlaying = false;

        this._audio = null;
        this._cache = new Map();

        this._voice = DEFAULT_VOICE;
        this._speed = DEFAULT_SPEED;

        // FIX #1 port: Visibility change handler for <audio> resilience
        this._boundVisibilityHandler = this._onVisibilityChange.bind(this);
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this._boundVisibilityHandler);
        }
    }

    get isPlaying() { return this._turnPlaying; }
    get queueLength() { return this._queue.length; }

    configure({ voice, speed } = {}) {
        if (voice) this._voice = voice;
        if (speed) this._speed = speed;
    }

    enqueue(text) {
        if (this._destroyed || !text?.trim()) return;
        // ── v3.4 MUTE GATE ──
        if (ttsMute.isMuted) {
            console.debug('[TTSQueue] Muted — dropping enqueue:', text.substring(0, 40));
            return;
        }

        this._queue.push({
            text: text.trim(),
            blobUrl: null,
            status: 'pending',
            fetchPromise: null,
            abortCtrl: null,
        });

        this._advanceSynthesis();
        this._advancePlayback();
    }

    flush() {
        this._flushed = true;
        // ── v3.4 MUTE GATE: signal done immediately ──
        if (ttsMute.isMuted) {
            this._signalPlaybackEnd();
            return;
        }
        if (this._queue.length === 0 || this._playIndex >= this._queue.length) {
            if (!this._isPlaying) {
                this._signalPlaybackEnd();
            }
        }
    }

    interrupt() {
        this._sessionId++;
        this._stopAudio();

        for (const item of this._queue) {
            if (item.abortCtrl) item.abortCtrl.abort();
            if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
        }

        this._queue = [];
        this._playIndex = 0;
        this._synthIndex = 0;
        this._flushed = false;
        this._isPlaying = false;
        this._turnPlaying = false;
    }

    destroy() {
        this._destroyed = true;
        this.interrupt();
        // FIX #1 port: Remove visibility listener
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
        }
        for (const url of this._cache.values()) URL.revokeObjectURL(url);
        this._cache.clear();
        this._onPlaybackStart = null;
        this._onPlaybackEnd = null;
        this._onSentenceStart = null;
        this._onError = null;
    }

    // =========================================================================
    // FIX #1 port: VISIBILITY CHANGE
    // =========================================================================

    _onVisibilityChange() {
        if (this._destroyed) return;
        if (document.visibilityState === 'visible' && this._audio && this._isPlaying) {
            // Tab returned — if audio was paused by the browser, resume it
            if (this._audio.paused && this._audio.currentTime > 0) {
                console.debug('[TTSQueue] Tab visible — resuming paused audio');
                this._audio.play().catch(() => {});
            }
        }
    }

    // =========================================================================
    // SYNTHESIS PIPELINE
    // =========================================================================

    _advanceSynthesis() {
        if (this._destroyed) return;
        // ── v3.4: Don't synthesize when muted ──
        if (ttsMute.isMuted) return;

        const inFlight = this._queue.filter(i => i.status === 'synthesizing').length;
        const available = MAX_CONCURRENT_SYNTH - inFlight;
        for (let i = 0; i < available; i++) {
            const nextIdx = this._queue.findIndex(item => item.status === 'pending');
            if (nextIdx === -1) break;
            this._synthesize(nextIdx);
        }
    }

    async _synthesize(index) {
        const item = this._queue[index];
        if (!item || item.status !== 'pending') return;
        const capturedSession = this._sessionId;

        const cached = this._cache.get(item.text);
        if (cached) {
            item.blobUrl = cached;
            item.status = 'ready';
            this._advancePlayback();
            return;
        }

        item.status = 'synthesizing';
        item.abortCtrl = new AbortController();

        try {
            const response = await fetch(TTS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: item.text, voice: this._voice, speed: this._speed }),
                signal: item.abortCtrl.signal,
            });
            if (capturedSession !== this._sessionId) return;
            if (!response.ok) throw new Error(`TTS request failed: ${response.status}`);

            const blob = await response.blob();
            if (capturedSession !== this._sessionId) return;

            const blobUrl = URL.createObjectURL(blob);
            this._addToCache(item.text, blobUrl);
            item.blobUrl = blobUrl;
            item.status = 'ready';
            item.abortCtrl = null;
            this._advanceSynthesis();
            this._advancePlayback();

        } catch (err) {
            if (err.name === 'AbortError' || capturedSession !== this._sessionId) return;
            console.warn('[TTSQueue] Synthesis failed:', err.message);
            item.status = 'error';
            item.abortCtrl = null;
            this._onError?.({ type: 'synthesis_failed', message: err.message, text: item.text });
            this._advanceSynthesis();
            this._advancePlayback();
        }
    }

    _addToCache(key, blobUrl) {
        if (this._cache.size >= MAX_CACHE_SIZE) {
            const oldest = this._cache.keys().next().value;
            const oldUrl = this._cache.get(oldest);
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            this._cache.delete(oldest);
        }
        this._cache.set(key, blobUrl);
    }

    // =========================================================================
    // PLAYBACK PIPELINE
    // =========================================================================

    _advancePlayback() {
        if (this._destroyed || this._isPlaying) return;

        while (this._playIndex < this._queue.length) {
            const item = this._queue[this._playIndex];
            if (item.status === 'ready') {
                this._playItem(this._playIndex);
                return;
            }
            if (item.status === 'error') {
                this._playIndex++;
                continue;
            }
            return;
        }

        if (this._flushed && this._playIndex >= this._queue.length) {
            this._signalPlaybackEnd();
        }
    }

    // FIX #6: Refactored _playItem with safe audio element creation
    _playItem(index) {
        const item = this._queue[index];
        if (!item?.blobUrl) return;
        const capturedSession = this._sessionId;

        // ── v3.4 MUTE GATE: skip playback ──
        if (ttsMute.isMuted) {
            item.status = 'done';
            this._playIndex++;
            this._advancePlayback();
            return;
        }

        item.status = 'playing';
        this._isPlaying = true;

        if (!this._turnPlaying) {
            this._turnPlaying = true;
            this._onPlaybackStart?.();
        }

        this._onSentenceStart?.(index);

        // FIX #6: Stop previous audio, then yield a microtask before creating new Audio.
        // This gives the browser event loop time to fully release the previous
        // HTMLAudioElement's system audio resources, preventing click/pop artifacts
        // that occur when two elements briefly overlap at the OS mixer level.
        this._stopAudio();

        // Use Promise.resolve().then() for a microtask yield — faster than setTimeout
        // but still enough for the browser to process the pause/unload above.
        Promise.resolve().then(() => {
            if (capturedSession !== this._sessionId || this._destroyed) return;

            this._audio = new Audio(item.blobUrl);

            this._audio.addEventListener('ended', () => {
                if (capturedSession !== this._sessionId) return;
                item.status = 'done';
                this._isPlaying = false;
                this._playIndex++;
                this._advancePlayback();
            });

            this._audio.addEventListener('error', (e) => {
                if (capturedSession !== this._sessionId) return;
                console.warn(`[TTSQueue] Playback error for sentence ${index}:`, e);
                item.status = 'error';
                this._isPlaying = false;
                this._playIndex++;
                this._onError?.({ type: 'playback_failed', index });
                this._advancePlayback();
            });

            this._audio.play().catch((err) => {
                if (capturedSession !== this._sessionId) return;
                item.status = 'error';
                this._isPlaying = false;
                this._playIndex++;
                this._onError?.({ type: 'play_rejected', message: err.message, index });
                this._advancePlayback();
            });
        });
    }

    _stopAudio() {
        if (this._audio) {
            try {
                this._audio.pause();
                this._audio.removeAttribute('src');
                this._audio.load();
            } catch (_) {}
            this._audio = null;
        }
    }

    _signalPlaybackEnd() {
        this._isPlaying = false;
        this._flushed = false;
        if (this._turnPlaying) {
            this._turnPlaying = false;
            this._onPlaybackEnd?.();
        }
    }
}

export default TTSQueue;
