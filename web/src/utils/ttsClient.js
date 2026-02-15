// web/src/utils/ttsClient.js
// =============================================================================
// Voice Cooking — TTS Client
//
// Fetches audio from /api/voice/tts and manages playback via HTMLAudioElement.
// Supports: play, pause, resume, stop, interrupt (play new while current plays).
//
// Uses HTMLAudioElement + Blob URLs for simplicity and broad compatibility.
// Pre-fetches next step audio for seamless transitions.
// =============================================================================

const TTS_ENDPOINT = '/api/voice/tts';
const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;

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

            // Cache it
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
            // Autoplay blocked — common on mobile
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
     * Stop playback and release resources.
     */
    stop() {
        this._stopAudio();
        this._isPlaying = false;
    }

    /**
     * Interrupt current playback with new text.
     * Used for conversational responses ("No problem, I'll wait.").
     *
     * @param {string} text
     * @param {object} [options]
     * @returns {Promise<void>}
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
     * Clean up all resources. Call on unmount.
     */
    destroy() {
        this._stopAudio();

        // Revoke all cached blob URLs
        for (const url of this._cache.values()) {
            URL.revokeObjectURL(url);
        }
        this._cache.clear();
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
            // Don't revoke — it's in the cache for reuse
            this._currentBlobUrl = null;
        }
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