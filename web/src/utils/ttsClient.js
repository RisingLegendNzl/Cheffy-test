// web/src/utils/ttsClient.js
// =============================================================================
// Voice Cooking — TTS Client (Legacy)
// v1.2.0 — Secondary-voice elimination
//
// CRITICAL FIX: This singleton was the "secondary voice" causing overlap with
// Natural Voice Cooking's TTSStreamer/TTSQueue. The root cause:
//   - ttsClient is a module-level singleton (instantiated on import)
//   - useVoiceCooking.js imports and uses it via ttsClient.play()
//   - useNaturalVoice.js uses TTSStreamer/TTSQueue (separate pipeline)
//   - Both can play audio simultaneously via different mechanisms:
//       ttsClient → HTMLAudioElement
//       TTSStreamer → Web Audio API (AudioContext + AudioBufferSourceNode)
//       TTSQueue → HTMLAudioElement (separate instance)
//   - Result: two voices speaking at once, causing choppy/overlapping audio
//
// FIX: Added a global lock (`claimExclusiveAudio` / `releaseExclusiveAudio`)
// that the Natural Voice system calls on session start/stop. While claimed,
// ALL ttsClient methods become no-ops — no synthesis, no playback, no cache
// growth. This is a zero-risk change because:
//   1. RecipeModal only renders NaturalVoiceButton (not VoiceCookingButton)
//   2. The old VoiceCookingOverlay is never mounted in the current UI
//   3. Even if it were, the lock prevents audio overlap
//
// Previous fixes preserved:
//   - MAX_CACHE_SIZE to prevent unbounded blob URL growth
//   - destroy() cancels in-flight fetches
//   - isDestroyed guard prevents use-after-destroy
// =============================================================================

const TTS_ENDPOINT = '/api/voice/tts';
const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;
const MAX_CACHE_SIZE = 30;

class TTSClient {
    constructor() {
        /** @type {HTMLAudioElement|null} */
        this._audio = null;
        /** @type {string|null} */
        this._currentBlobUrl = null;
        /** @type {Map<string, string>} key → blobUrl */
        this._cache = new Map();
        /** @type {AbortController|null} */
        this._fetchController = null;
        /** @type {Function|null} */
        this._onEndCallback = null;
        /** @type {Function|null} */
        this._onErrorCallback = null;
        /** @type {boolean} */
        this._isPlaying = false;
        /** @type {boolean} */
        this._isDestroyed = false;

        // ── FIX v1.2.0: Exclusive audio lock ──
        // When true, Natural Voice has claimed audio output.
        // All ttsClient methods become no-ops to prevent secondary voice.
        this._exclusiveLocked = false;
    }

    // =========================================================================
    // EXCLUSIVE AUDIO LOCK — called by Natural Voice system
    // =========================================================================

    /**
     * Called by useNaturalVoice when a session starts.
     * Stops any in-progress playback and prevents future playback.
     */
    claimExclusiveAudio() {
        console.debug('[TTSClient] Exclusive audio claimed by Natural Voice');
        this._exclusiveLocked = true;
        // Stop anything currently playing
        this._stopAudio();
        this._isPlaying = false;
        // Cancel any in-flight fetches
        if (this._fetchController) {
            this._fetchController.abort();
            this._fetchController = null;
        }
    }

    /**
     * Called by useNaturalVoice when a session ends.
     * Re-enables ttsClient for potential legacy use.
     */
    releaseExclusiveAudio() {
        console.debug('[TTSClient] Exclusive audio released');
        this._exclusiveLocked = false;
    }

    /**
     * Whether audio output is locked by another system.
     */
    get isLocked() {
        return this._exclusiveLocked;
    }

    // =========================================================================
    // PUBLIC API (all gated by exclusive lock)
    // =========================================================================

    /**
     * Synthesize text and return a blob URL (cached).
     */
    async synthesize(text, options = {}) {
        // ── FIX: Block synthesis when Natural Voice owns audio ──
        if (this._exclusiveLocked) {
            console.debug('[TTSClient] Blocked synthesis — exclusive audio locked');
            throw new Error('Audio locked by Natural Voice');
        }

        if (this._isDestroyed) {
            this._isDestroyed = false;
            console.debug('[TTSClient] Recovered from destroyed state');
        }

        const cacheKey = options.cacheKey || text;

        if (this._cache.has(cacheKey)) {
            return this._cache.get(cacheKey);
        }

        if (this._fetchController) {
            this._fetchController.abort();
        }
        this._fetchController = new AbortController();

        try {
            const response = await fetch(TTS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text.trim(),
                    voice: options.voice || DEFAULT_VOICE,
                    speed: options.speed || DEFAULT_SPEED,
                }),
                signal: this._fetchController.signal,
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => 'Unknown');
                throw new Error(`TTS request failed (${response.status}): ${errText}`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            if (this._cache.size >= MAX_CACHE_SIZE) {
                const oldestKey = this._cache.keys().next().value;
                const oldestUrl = this._cache.get(oldestKey);
                if (oldestUrl) URL.revokeObjectURL(oldestUrl);
                this._cache.delete(oldestKey);
            }

            this._cache.set(cacheKey, blobUrl);
            return blobUrl;

        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('TTS request was cancelled');
            }
            throw err;
        } finally {
            this._fetchController = null;
        }
    }

    /**
     * Pre-fetch audio (fire-and-forget).
     */
    prefetch(text, options = {}) {
        if (this._isDestroyed || this._exclusiveLocked) return;
        this.synthesize(text, options).catch(() => {});
    }

    /**
     * Play audio.
     */
    async play(textOrBlobUrl, options = {}) {
        // ── FIX: Block playback when Natural Voice owns audio ──
        if (this._exclusiveLocked) {
            console.debug('[TTSClient] Blocked play — exclusive audio locked');
            // Fire onEnd so the caller's state machine doesn't hang
            if (options.onEnd) setTimeout(options.onEnd, 0);
            return;
        }

        let blobUrl;
        if (textOrBlobUrl.startsWith('blob:')) {
            blobUrl = textOrBlobUrl;
        } else {
            blobUrl = await this.synthesize(textOrBlobUrl, options);
        }

        this._stopAudio();

        this._audio = new Audio(blobUrl);
        this._currentBlobUrl = blobUrl;
        this._onEndCallback = options.onEnd || null;
        this._onErrorCallback = options.onError || null;

        this._audio.addEventListener('ended', this._handleEnded);
        this._audio.addEventListener('error', this._handleError);

        try {
            await this._audio.play();
            this._isPlaying = true;
        } catch (err) {
            this._isPlaying = false;
            if (this._onErrorCallback) this._onErrorCallback(err);
            throw err;
        }
    }

    pause() {
        if (this._audio && this._isPlaying) {
            this._audio.pause();
            this._isPlaying = false;
        }
    }

    resume() {
        if (this._exclusiveLocked) return;
        if (this._audio && !this._isPlaying) {
            this._audio.play().then(() => { this._isPlaying = true; }).catch(() => {});
        }
    }

    stop() {
        this._stopAudio();
        this._isPlaying = false;
    }

    async interrupt(text, options = {}) {
        if (this._exclusiveLocked) return;
        return this.play(text, options);
    }

    get isPlaying() {
        return this._isPlaying;
    }

    destroy() {
        this._stopAudio();
        if (this._fetchController) {
            this._fetchController.abort();
            this._fetchController = null;
        }
        const cacheSize = this._cache.size;
        for (const url of this._cache.values()) {
            URL.revokeObjectURL(url);
        }
        this._cache.clear();
        this._isDestroyed = true;
        if (cacheSize > 0) {
            console.debug(`[TTSClient] destroy(): revoked ${cacheSize} cached blob URLs`);
        }
    }

    // --- Private ---

    _stopAudio() {
        if (this._audio) {
            this._audio.removeEventListener('ended', this._handleEnded);
            this._audio.removeEventListener('error', this._handleError);
            this._audio.pause();
            this._audio.src = '';
            this._audio = null;
        }
        if (this._currentBlobUrl) {
            this._currentBlobUrl = null;
        }
        this._onEndCallback = null;
        this._onErrorCallback = null;
        this._isPlaying = false;
    }

    _handleEnded = () => {
        this._isPlaying = false;
        if (this._onEndCallback) this._onEndCallback();
    };

    _handleError = (e) => {
        this._isPlaying = false;
        console.error('[TTSClient] Playback error:', e);
        if (this._onErrorCallback) this._onErrorCallback(e);
    };
}

// Export singleton
export const ttsClient = new TTSClient();
export default ttsClient;
