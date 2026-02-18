// web/src/utils/ttsClient.js
// =============================================================================
// Voice Cooking — TTS Client (Legacy) v1.3
//
// v1.3: Added ttsMute global gate (debug toggle from Settings).
//   - synthesize(), play(), prefetch() all check ttsMute.isMuted
//   - play() fires onEnd immediately when muted (prevents state machine hangs)
//
// v1.2 (preserved): Exclusive audio lock for Natural Voice sessions
// =============================================================================

import { ttsMute } from './ttsMute';

const TTS_ENDPOINT = '/api/voice/tts';
const DEFAULT_VOICE = 'nova';
const DEFAULT_SPEED = 1.0;
const MAX_CACHE_SIZE = 30;

class TTSClient {
    constructor() {
        this._audio = null;
        this._currentBlobUrl = null;
        this._cache = new Map();
        this._fetchController = null;
        this._onEndCallback = null;
        this._onErrorCallback = null;
        this._isPlaying = false;
        this._isDestroyed = false;
        this._exclusiveLocked = false;
    }

    // =========================================================================
    // EXCLUSIVE AUDIO LOCK — called by Natural Voice system
    // =========================================================================

    claimExclusiveAudio() {
        console.debug('[TTSClient] Exclusive audio claimed by Natural Voice');
        this._exclusiveLocked = true;
        this._stopAudio();
        this._isPlaying = false;
        if (this._fetchController) {
            this._fetchController.abort();
            this._fetchController = null;
        }
    }

    releaseExclusiveAudio() {
        console.debug('[TTSClient] Exclusive audio released');
        this._exclusiveLocked = false;
    }

    get isLocked() { return this._exclusiveLocked; }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    async synthesize(text, options = {}) {
        // ── v1.3 MUTE GATE ──
        if (ttsMute.isMuted) {
            console.debug('[TTSClient] Muted — blocking synthesis');
            throw new Error('TTS muted via debug toggle');
        }
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

    prefetch(text, options = {}) {
        if (this._isDestroyed || this._exclusiveLocked || ttsMute.isMuted) return;
        this.synthesize(text, options).catch(() => {});
    }

    async play(textOrBlobUrl, options = {}) {
        // ── v1.3 MUTE GATE ──
        if (ttsMute.isMuted) {
            console.debug('[TTSClient] Muted — blocking play');
            if (options.onEnd) setTimeout(options.onEnd, 0);
            return;
        }
        if (this._exclusiveLocked) {
            console.debug('[TTSClient] Blocked play — exclusive audio locked');
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
        if (this._exclusiveLocked || ttsMute.isMuted) return;
        if (this._audio && !this._isPlaying) {
            this._audio.play().then(() => { this._isPlaying = true; }).catch(() => {});
        }
    }

    stop() {
        this._stopAudio();
        this._isPlaying = false;
    }

    async interrupt(text, options = {}) {
        if (this._exclusiveLocked || ttsMute.isMuted) return;
        return this.play(text, options);
    }

    get isPlaying() { return this._isPlaying; }

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

export const ttsClient = new TTSClient();
export default ttsClient;
