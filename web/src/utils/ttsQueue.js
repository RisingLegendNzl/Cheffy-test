// web/src/utils/ttsQueue.js
// =============================================================================
// Natural Voice Mode — Sentence-Level TTS Queue
//
// Replaces single-blob TTS with pipelined sentence playback:
//   1. As sentences arrive from the LLM, each is queued for synthesis.
//   2. Synthesis requests fire in parallel (up to a concurrency limit).
//   3. Playback is sequential: Sentence 1 plays while Sentence 2 synthesizes.
//   4. When Sentence 1 ends, Sentence 2 starts immediately (zero gap).
//   5. Supports interruption: abort all pending synthesis + playback.
//
// Usage:
//   const queue = new TTSQueue({
//     onPlaybackStart:  () => ...,     // First sentence begins playing
//     onPlaybackEnd:    () => ...,     // All sentences finished
//     onSentenceStart:  (idx) => ...,  // A specific sentence started
//     onError:          (err) => ...,  // Non-fatal error
//   });
//
//   queue.enqueue("Sure, for step 3...");    // Add sentence
//   queue.enqueue("You'll need 3 cloves.");  // Add another
//   queue.flush();                            // Signal no more sentences coming
//   queue.interrupt();                        // Abort everything
//   queue.destroy();                          // Full cleanup
// =============================================================================

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

        // Queue state
        this._queue = [];            // [{ text, blobUrl, status, fetchPromise, abortCtrl }]
        this._playIndex = 0;         // Next sentence to play
        this._synthIndex = 0;        // Next sentence to synthesize
        this._flushed = false;       // No more sentences coming
        this._isPlaying = false;     // Currently playing any audio
        this._destroyed = false;
        this._sessionId = 0;

        // Audio
        this._audio = null;

        // Blob URL cache (persists across turns for repeated content)
        this._cache = new Map();

        // Voice settings
        this._voice = DEFAULT_VOICE;
        this._speed = DEFAULT_SPEED;
    }

    get isPlaying() { return this._isPlaying; }
    get queueLength() { return this._queue.length; }

    /**
     * Set voice and speed for subsequent synthesis.
     */
    configure({ voice, speed } = {}) {
        if (voice) this._voice = voice;
        if (speed) this._speed = speed;
    }

    /**
     * Add a sentence to the queue. Synthesis begins immediately.
     */
    enqueue(text) {
        if (this._destroyed || !text?.trim()) return;

        const item = {
            text: text.trim(),
            blobUrl: null,
            status: 'pending',  // pending → synthesizing → ready → playing → done
            fetchPromise: null,
            abortCtrl: null,
        };

        this._queue.push(item);
        this._advanceSynthesis();
        this._advancePlayback();
    }

    /**
     * Signal that no more sentences will be enqueued for this turn.
     * Playback will end after the last queued sentence finishes.
     */
    flush() {
        this._flushed = true;
        // If queue is empty and flushed, signal end immediately
        if (this._queue.length === 0 || this._playIndex >= this._queue.length) {
            if (this._isPlaying) {
                // Wait for current playback to finish
            } else {
                this._signalPlaybackEnd();
            }
        }
    }

    /**
     * Interrupt all activity. Stops playback, cancels pending synthesis,
     * revokes blob URLs, and resets the queue.
     */
    interrupt() {
        this._sessionId++;
        this._stopAudio();

        // Cancel all pending/in-progress synthesis
        for (const item of this._queue) {
            if (item.abortCtrl) {
                item.abortCtrl.abort();
            }
            if (item.blobUrl) {
                URL.revokeObjectURL(item.blobUrl);
            }
        }

        this._queue = [];
        this._playIndex = 0;
        this._synthIndex = 0;
        this._flushed = false;
        this._isPlaying = false;
    }

    /**
     * Full cleanup. Releases all resources.
     */
    destroy() {
        this._destroyed = true;
        this.interrupt();

        // Revoke all cached blob URLs
        for (const url of this._cache.values()) {
            URL.revokeObjectURL(url);
        }
        this._cache.clear();

        this._onPlaybackStart = null;
        this._onPlaybackEnd = null;
        this._onSentenceStart = null;
        this._onError = null;
    }

    // =========================================================================
    // SYNTHESIS PIPELINE
    // =========================================================================

    _advanceSynthesis() {
        if (this._destroyed) return;

        // Count how many are currently synthesizing
        const inFlight = this._queue.filter(i => i.status === 'synthesizing').length;
        const available = MAX_CONCURRENT_SYNTH - inFlight;

        for (let i = 0; i < available; i++) {
            const nextIdx = this._findNextPending();
            if (nextIdx === -1) break;
            this._synthesize(nextIdx);
        }
    }

    _findNextPending() {
        return this._queue.findIndex(i => i.status === 'pending');
    }

    async _synthesize(index) {
        const item = this._queue[index];
        if (!item || item.status !== 'pending') return;

        const capturedSession = this._sessionId;

        // Check cache
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
                body: JSON.stringify({
                    text: item.text,
                    voice: this._voice,
                    speed: this._speed,
                }),
                signal: item.abortCtrl.signal,
            });

            if (capturedSession !== this._sessionId) return; // Stale

            if (!response.ok) {
                throw new Error(`TTS request failed: ${response.status}`);
            }

            const blob = await response.blob();
            if (capturedSession !== this._sessionId) return; // Stale

            const blobUrl = URL.createObjectURL(blob);

            // Cache the blob URL
            this._addToCache(item.text, blobUrl);

            item.blobUrl = blobUrl;
            item.status = 'ready';
            item.abortCtrl = null;

            // Advance both pipelines
            this._advanceSynthesis();
            this._advancePlayback();

        } catch (err) {
            if (err.name === 'AbortError' || capturedSession !== this._sessionId) return;

            console.warn(`[TTSQueue] Synthesis failed for: "${item.text.slice(0, 40)}..."`, err.message);
            item.status = 'error';
            item.abortCtrl = null;

            this._onError?.({ type: 'synthesis_failed', message: err.message, text: item.text });

            // Skip this sentence and continue
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

        // Find next item to play
        while (this._playIndex < this._queue.length) {
            const item = this._queue[this._playIndex];

            if (item.status === 'ready') {
                this._playItem(this._playIndex);
                return;
            }

            if (item.status === 'error') {
                // Skip errored sentences
                this._playIndex++;
                continue;
            }

            // Still pending/synthesizing — wait
            return;
        }

        // All items played or queue empty
        if (this._flushed && this._playIndex >= this._queue.length) {
            this._signalPlaybackEnd();
        }
    }

    _playItem(index) {
        const item = this._queue[index];
        if (!item?.blobUrl) return;

        const capturedSession = this._sessionId;
        const wasPlaying = this._isPlaying;

        item.status = 'playing';
        this._isPlaying = true;

        if (!wasPlaying) {
            this._onPlaybackStart?.();
        }

        this._onSentenceStart?.(index);

        // Stop any current audio
        this._stopAudio();

        // Create and play
        this._audio = new Audio(item.blobUrl);

        this._audio.addEventListener('ended', () => {
            if (capturedSession !== this._sessionId) return;

            item.status = 'done';
            this._isPlaying = false;
            this._playIndex++;

            // Advance to next sentence
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

            console.warn('[TTSQueue] Audio play() rejected:', err);
            item.status = 'error';
            this._isPlaying = false;
            this._playIndex++;

            this._onError?.({ type: 'play_rejected', message: err.message });
            this._advancePlayback();
        });
    }

    _stopAudio() {
        if (this._audio) {
            try {
                // ── FIX Bug D: Remove listeners BEFORE pausing ──
                // Without this, the load() call below fires an error event on the
                // old audio element, which triggers item.status = 'error' → skip.
                this._audio.onended = null;
                this._audio.onerror = null;
                this._audio.pause();
                this._audio.removeAttribute('src');
                // Removed: this._audio.load() — fires error events on dead elements
            } catch (_) {}
            this._audio = null;
        }
    }

    _signalPlaybackEnd() {
        this._isPlaying = false;
        this._onPlaybackEnd?.();
    }
}

export default TTSQueue;
