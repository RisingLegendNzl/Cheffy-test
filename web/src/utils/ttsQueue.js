// web/src/utils/ttsQueue.js
// =============================================================================
// Natural Voice Mode — Sentence-Level TTS Queue
//
// v3.3 — TTS continuity fix: eliminates choppy / cut-out playback
//
// Root causes fixed:
//   1. onPlaybackStart/End fired per-sentence when gaps occurred between
//      sentence playback, causing state machine to toggle SPEAKING→LISTENING
//      → Now uses _turnPlaying flag that stays true across all sentences
//   2. _isPlaying went false between sentences during synthesis waits,
//      which triggered STT restart mid-Cheffy-speech
//      → _isPlaying stays true from first sentence start to final sentence end
//   3. Interrupted turns could fire onPlaybackEnd, confusing the state machine
//      → interrupt() no longer fires onPlaybackEnd
//
// Pipeline:
//   1. Sentences arrive via enqueue(), synthesis fires in parallel (up to 3)
//   2. Playback is sequential: Sentence 1 plays while Sentence 2 synthesizes
//   3. When Sentence 1 ends, Sentence 2 starts immediately (zero gap)
//   4. onPlaybackStart fires once at turn start, onPlaybackEnd once at turn end
//   5. Supports interruption: abort all pending synthesis + playback
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
        this._playIndex = 0;
        this._synthIndex = 0;
        this._flushed = false;
        this._destroyed = false;
        this._sessionId = 0;

        // ── FIX: Separate per-sentence and per-turn playing flags ──
        this._isPlaying = false;       // True while an Audio element is actively playing
        this._turnPlaying = false;     // True from first sentence start to last sentence end

        // Audio
        this._audio = null;

        // Blob URL cache
        this._cache = new Map();

        // Voice settings
        this._voice = DEFAULT_VOICE;
        this._speed = DEFAULT_SPEED;
    }

    // ── FIX: Expose turn-level flag so hook sees consistent "playing" state ──
    get isPlaying() { return this._turnPlaying; }
    get queueLength() { return this._queue.length; }

    configure({ voice, speed } = {}) {
        if (voice) this._voice = voice;
        if (speed) this._speed = speed;
    }

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

    flush() {
        this._flushed = true;
        if (this._queue.length === 0 || this._playIndex >= this._queue.length) {
            if (this._isPlaying) {
                // Wait for current playback to finish — _signalPlaybackEnd will fire
            } else {
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
        // ── FIX: Reset turn flag but do NOT fire onPlaybackEnd ──
        // The hook handles interrupts via ACTION.INTERRUPT, not TTS_PLAYBACK_END
        this._turnPlaying = false;
    }

    destroy() {
        this._destroyed = true;
        this.interrupt();

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

            if (capturedSession !== this._sessionId) return;

            if (!response.ok) {
                throw new Error(`TTS request failed: ${response.status}`);
            }

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

            console.warn(`[TTSQueue] Synthesis failed for: "${item.text.slice(0, 40)}..."`, err.message);
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

            // Still pending/synthesizing — wait for synthesis callback
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

        item.status = 'playing';
        this._isPlaying = true;

        // ── FIX: Fire onPlaybackStart ONCE per turn, not per sentence ──
        if (!this._turnPlaying) {
            this._turnPlaying = true;
            this._onPlaybackStart?.();
        }

        this._onSentenceStart?.(index);

        // Stop any current audio (shouldn't happen, but defensive)
        this._stopAudio();

        this._audio = new Audio(item.blobUrl);

        this._audio.addEventListener('ended', () => {
            if (capturedSession !== this._sessionId) return;

            item.status = 'done';
            this._isPlaying = false;
            this._playIndex++;

            // ── FIX: Do NOT set _turnPlaying = false here ──
            // Let _advancePlayback either play the next sentence or call _signalPlaybackEnd
            this._advancePlayback();
        });

        this._audio.addEventListener('error', (e) => {
            if (capturedSession !== this._sessionId) return;

            console.warn(`[TTSQueue] Playback error for sentence ${index}:`, e);
            item.status = 'error';
            this._isPlaying = false;
            this._playIndex++;

            this._onError?.({ type: 'playback_failed', message: 'Audio playback error', index });

            // Continue to next sentence
            this._advancePlayback();
        });

        this._audio.play().catch((err) => {
            if (capturedSession !== this._sessionId) return;

            console.warn(`[TTSQueue] Play() rejected for sentence ${index}:`, err.message);
            item.status = 'error';
            this._isPlaying = false;
            this._playIndex++;

            this._onError?.({ type: 'play_rejected', message: err.message, index });

            this._advancePlayback();
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

    // ── FIX: Only fires once per turn, and only if we actually played something ──
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
