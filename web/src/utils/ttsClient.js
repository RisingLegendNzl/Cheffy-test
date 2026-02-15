// web/src/utils/ttsClient.js
// =============================================================================
// Voice Cooking — TTS Client
// [PATCHED] v1.1.0 — Fixed memory leak from unbounded blob URL cache:
//   1. Added MAX_CACHE_SIZE to prevent unbounded growth
//   2. destroy() now also cancels in-flight fetches
//   3. Added isDestroyed guard to prevent use-after-destroy
//   4. DEBUG logging for cache eviction and cleanup
//
// Fetches audio from /api/voice/tts and manages playback via HTMLAudioElement.
// Supports: play, pause, resume, stop, interrupt (play new while current plays).
// Uses HTMLAudioElement + Blob URLs for simplicity and broad compatibility.
// Pre-fetches next step audio for seamless transitions.
// =============================================================================

const TTS_ENDPOINT = '/api/voice/tts';
const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;

// [FIX] Cap cache to prevent unbounded blob URL accumulation across sessions
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
        /** @type {boolean} [FIX] Track destroyed state */
        this._isDestroyed = false;
    }

    /**
     * Synthesize text and return a blob URL (cached).
     * Does NOT play — call play() separately or use speakAndPlay().
     *
     * @param {string} text
     * @param {object} [options]
     * @param {string} [options.voice]
     * @param {number} [options.speed]
     * @param {string} [options.cacheKey] - Custom cache key (default: text itself)
     * @returns {Promise<string>} Blob URL for the audio
     */
    async synthesize(text, options = {}) {
        // [FIX] Auto-recover from destroyed state (new session started)
        if (this._isDestroyed) {
            this._isDestroyed = false;
            console.debug('[TTSClient] Recovered from destroyed state for new session');
        }

        const cacheKey = options.cacheKey || text;

        // Return cached if available
        if (this._cache.has(cacheKey)) {
            return this._cache.get(cacheKey);
        }

        // Cancel any in-flight fetch
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

            // [FIX] Evict oldest entries if cache exceeds limit
            if (this._cache.size >= MAX_CACHE_SIZE) {
                const oldestKey = this._cache.keys().next().value;
                const oldestUrl = this._cache.get(oldestKey);
                if (oldestUrl) {
                    URL.revokeObjectURL(oldestUrl);
                    console.debug(`[TTSClient] Cache eviction: revoked blob for "${oldestKey}" (cache size: ${this._cache.size})`);
                }
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
     * Pre-fetch audio for a given text (fire-and-forget).
     * Useful for pre-loading the next step.
     */
    prefetch(text, options = {}) {
        // [FIX] Don't prefetch if destroyed
        if (this._isDestroyed) return;
        this.synthesize(text, options).catch(() => {
            // Silent failure for prefetch — not critical
        });
    }

    /**
     * Play a blob URL (or synthesize + play in one call).
     *
     * @param {string} textOrBlobUrl - Either raw text or a blob: URL
     * @param {object} [options]
     * @param {Function} [options.onEnd] - Called when audio finishes naturally
     * @param {Function} [options.onError] - Called on playback error
     * @param {string}   [options.voice]
     * @param {number}   [options.speed]
     * @returns {Promise<void>}
     */
    async play(textOrBlobUrl, options = {}) {
        let blobUrl;

        if (textOrBlobUrl.startsWith('blob:')) {
            blobUrl = textOrBlobUrl;
        } else {
            blobUrl = await this.synthesize(textOrBlobUrl, options);
        }

        // Stop any current playback
        this._stopAudio();

        // Create fresh audio element
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
            if (this._onErrorCallback) {
                this._onErrorCallback(err);
            }
            throw err;
        }
    }

    /**
     * Pause current playback.
     */
    pause() {
        if (this._audio && this._isPlaying) {
            this._audio.pause();
            this._isPlaying = false;
        }
    }

    /**
     * Resume paused playback.
     */
    resume() {
        if (this._audio && !this._isPlaying) {
            this._audio.play().then(() => {
                this._isPlaying = true;
            }).catch(() => {
                // Silently handle if resume fails
            });
        }
    }

    /**
     * Stop playback and release the current audio element.
     * Does NOT clear the cache (use destroy() for full cleanup).
     */
    stop() {
        this._stopAudio();
        this._isPlaying = false;
    }

    /**
     * Interrupt current playback with new text.
     */
    async interrupt(text, options = {}) {
        return this.play(text, options);
    }

    /**
     * Whether audio is currently playing.
     */
    get isPlaying() {
        return this._isPlaying;
    }

    /**
     * Clean up ALL resources. Call on session end and unmount.
     * [FIX] Also cancels in-flight fetches and marks as destroyed.
     */
    destroy() {
        // 1. Stop any playing audio
        this._stopAudio();

        // 2. Cancel any in-flight fetch
        if (this._fetchController) {
            this._fetchController.abort();
            this._fetchController = null;
            console.debug('[TTSClient] Cancelled in-flight TTS fetch');
        }

        // 3. Revoke ALL cached blob URLs to free memory
        const cacheSize = this._cache.size;
        for (const url of this._cache.values()) {
            URL.revokeObjectURL(url);
        }
        this._cache.clear();

        // 4. Mark as destroyed
        this._isDestroyed = true;

        if (cacheSize > 0) {
            console.debug(`[TTSClient] destroy(): revoked ${cacheSize} cached blob URLs`);
        }
    }

    // --- Private ---

    _stopAudio() {
        if (this._audio) {
            // [FIX] Remove listeners BEFORE pausing to prevent stale callbacks
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
        if (this._onEndCallback) {
            this._onEndCallback();
        }
    };

    _handleError = (e) => {
        this._isPlaying = false;
        console.error('[TTSClient] Playback error:', e);
        if (this._onErrorCallback) {
            this._onErrorCallback(e);
        }
    };
}

// Export singleton
export const ttsClient = new TTSClient();
export default ttsClient;