// web/src/utils/ttsMute.js
// =============================================================================
// Global TTS Mute — Debug Kill Switch for Cheffy's Voice
//
// A tiny singleton module that ALL TTS paths check before producing audio.
// When muted, no TTS synthesis or playback occurs from any source:
//   - TTSStreamer (Web Audio API byte-streaming)
//   - TTSQueue (sentence-level blob playback)
//   - ttsClient (legacy HTMLAudioElement singleton)
//
// This is intentionally framework-agnostic (no React) so it can be imported
// by both utility classes and React hooks without dependency issues.
//
// Persists to localStorage so it survives page refreshes.
//
// Usage:
//   import { ttsMute } from '../utils/ttsMute';
//
//   if (ttsMute.isMuted) return; // Skip TTS
//
//   ttsMute.subscribe(() => { /* react to changes */ });
// =============================================================================

const STORAGE_KEY = 'cheffy_tts_muted';

class TTSMute {
    constructor() {
        this._muted = false;
        this._listeners = new Set();

        // Load persisted state
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'true') this._muted = true;
        } catch (_) {
            // localStorage unavailable (SSR, private mode) — default unmuted
        }
    }

    get isMuted() {
        return this._muted;
    }

    /**
     * Set the mute state. Persists to localStorage and notifies subscribers.
     * @param {boolean} muted
     */
    set(muted) {
        const changed = this._muted !== muted;
        this._muted = muted;

        try {
            localStorage.setItem(STORAGE_KEY, String(muted));
        } catch (_) {}

        if (changed) {
            for (const fn of this._listeners) {
                try { fn(muted); } catch (_) {}
            }
        }
    }

    /**
     * Subscribe to mute state changes. Returns an unsubscribe function.
     * @param {(muted: boolean) => void} fn
     * @returns {() => void} unsubscribe
     */
    subscribe(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }
}

// Singleton
export const ttsMute = new TTSMute();
export default ttsMute;
