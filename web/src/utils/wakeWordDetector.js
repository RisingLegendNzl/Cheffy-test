// web/src/utils/wakeWordDetector.js
// =============================================================================
// Phase 6 — Wake Word Detector ("Hey Cheffy")
//
// Client-side wake word detection using Picovoice Porcupine.
// Runs entirely in the browser — no server round-trip for detection.
//
// Architecture:
//   1. Loads Porcupine WASM model + custom "Hey Cheffy" keyword
//   2. Opens a persistent mic stream via getUserMedia
//   3. Feeds audio frames to Porcupine at the required sample rate
//   4. On detection, fires the onWakeWord callback
//   5. Supports sensitivity adjustment (0.0 - 1.0)
//
// Requirements:
//   - Porcupine access key (REACT_APP_PORCUPINE_ACCESS_KEY env var)
//   - Custom "Hey Cheffy" .ppn keyword file (trained at console.picovoice.ai)
//   - OR falls back to a simple energy-based "hey cheffy" speech recognition
//     detector when Porcupine is not configured.
//
// The fallback approach uses Web Speech API in continuous mode and listens
// for the phrase "hey cheffy" / "hey chef" in the transcript. Less accurate
// but requires zero third-party dependencies.
//
// Usage:
//   const detector = new WakeWordDetector({
//     onWakeWord:    () => startVoiceLoop(),
//     onError:       (err) => console.warn(err),
//     sensitivity:   0.6,   // 0.0 (fewest false positives) to 1.0 (most sensitive)
//   });
//
//   await detector.start();   // Begin listening for "Hey Cheffy"
//   detector.stop();           // Pause detection
//   detector.destroy();        // Full cleanup
// =============================================================================

// --- Porcupine CDN imports (loaded dynamically) ---
const PORCUPINE_WEB_URL = 'https://unpkg.com/@picovoice/porcupine-web@3.0.0/dist/iife/index.js';

// --- Web Speech API fallback ---
const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

const WAKE_PHRASES = [
    'hey cheffy', 'hey chef', 'hey cheffie', 'hey sheffi',
    'a cheffy', 'hey jeffrey', 'hey jessie', 'hey chessy',
];

export const WAKE_STATE = {
    IDLE: 'idle',
    LOADING: 'loading',
    LISTENING: 'listening',
    DETECTED: 'detected',
    ERROR: 'error',
};

export class WakeWordDetector {
    constructor(callbacks = {}) {
        this._onWakeWord = callbacks.onWakeWord || (() => {});
        this._onStateChange = callbacks.onStateChange || (() => {});
        this._onError = callbacks.onError || (() => {});

        this._sensitivity = callbacks.sensitivity ?? 0.6;
        this._cooldownMs = callbacks.cooldownMs ?? 2000; // Ignore re-triggers for 2s

        this._state = WAKE_STATE.IDLE;
        this._provider = null; // 'porcupine' | 'webspeech'
        this._destroyed = false;
        this._sessionId = 0;

        // Porcupine resources
        this._porcupine = null;
        this._mediaStream = null;
        this._audioContext = null;
        this._processor = null;
        this._sourceNode = null;

        // Web Speech fallback
        this._recognition = null;
        this._restartTimer = null;

        // Cooldown
        this._lastDetection = 0;

        // Custom keyword file path (configurable)
        this._keywordPath = callbacks.keywordPath || null;
        this._accessKey = callbacks.accessKey ||
            (typeof process !== 'undefined' ? process.env?.REACT_APP_PORCUPINE_ACCESS_KEY : null) ||
            (typeof window !== 'undefined' ? window.__PORCUPINE_ACCESS_KEY : null) ||
            '';
    }

    get state() { return this._state; }
    get provider() { return this._provider; }
    get isListening() { return this._state === WAKE_STATE.LISTENING; }

    set sensitivity(value) {
        this._sensitivity = Math.max(0, Math.min(1, value));
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    async start() {
        if (this._destroyed || this._state === WAKE_STATE.LISTENING) return;
        this._sessionId++;
        this._setState(WAKE_STATE.LOADING);

        // Try Porcupine first
        if (this._accessKey && typeof window !== 'undefined') {
            try {
                await this._startPorcupine();
                return;
            } catch (err) {
                console.warn('[WakeWord] Porcupine init failed, using speech fallback:', err.message);
            }
        }

        // Fallback to Web Speech API
        try {
            await this._startSpeechFallback();
        } catch (err) {
            this._setState(WAKE_STATE.ERROR);
            this._onError?.({ type: 'init_failed', message: err.message, fatal: true });
        }
    }

    stop() {
        this._sessionId++;
        this._teardownPorcupine();
        this._teardownSpeechFallback();
        this._setState(WAKE_STATE.IDLE);
    }

    /**
     * Temporarily pause detection (e.g., while voice loop is active).
     * Call resume() to restart.
     */
    pause() {
        this.stop();
    }

    /**
     * Resume after pause.
     */
    async resume() {
        if (this._destroyed) return;
        await this.start();
    }

    destroy() {
        this._destroyed = true;
        this.stop();
        this._onWakeWord = null;
        this._onStateChange = null;
        this._onError = null;
    }

    // =========================================================================
    // PORCUPINE PROVIDER
    // =========================================================================

    async _startPorcupine() {
        const capturedSession = this._sessionId;

        // Dynamically load Porcupine if not already loaded
        if (!window.PorcupineWeb) {
            await this._loadPorcupineScript();
        }

        if (capturedSession !== this._sessionId || this._destroyed) return;

        const PorcupineWorker = window.PorcupineWeb?.PorcupineWorker;
        if (!PorcupineWorker) {
            throw new Error('Porcupine WASM module not available');
        }

        // Build keyword configuration
        // If a custom .ppn file is provided, use it.
        // Otherwise, use built-in "hey google" as closest approximation
        // (users should train "Hey Cheffy" at console.picovoice.ai)
        const keywordConfig = this._keywordPath
            ? { customKeywordPath: this._keywordPath, sensitivity: this._sensitivity }
            : { builtin: 'hey google', sensitivity: this._sensitivity };

        try {
            this._porcupine = await PorcupineWorker.create(
                this._accessKey,
                this._keywordPath
                    ? [{ custom: this._keywordPath, sensitivity: this._sensitivity }]
                    : [{ builtin: 'Hey Google', sensitivity: this._sensitivity }],
                (detection) => {
                    if (capturedSession !== this._sessionId) return;
                    this._handleDetection();
                }
            );
        } catch (err) {
            // If Porcupine worker creation fails, throw to trigger fallback
            throw new Error(`Porcupine worker creation failed: ${err.message}`);
        }

        if (capturedSession !== this._sessionId || this._destroyed) {
            this._porcupine?.release();
            this._porcupine = null;
            return;
        }

        // Request mic
        this._mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true },
        });

        if (capturedSession !== this._sessionId || this._destroyed) {
            this._releaseMediaStream();
            return;
        }

        // Start audio processing
        await this._porcupine.start();

        this._provider = 'porcupine';
        this._setState(WAKE_STATE.LISTENING);
        console.debug('[WakeWord] Porcupine listening for wake word');
    }

    async _loadPorcupineScript() {
        return new Promise((resolve, reject) => {
            if (window.PorcupineWeb) { resolve(); return; }

            const script = document.createElement('script');
            script.src = PORCUPINE_WEB_URL;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Porcupine WASM'));
            document.head.appendChild(script);
        });
    }

    _teardownPorcupine() {
        if (this._porcupine) {
            try { this._porcupine.stop(); this._porcupine.release(); } catch (_) {}
            this._porcupine = null;
        }
        this._releaseMediaStream();

        if (this._processor) {
            try { this._processor.disconnect(); } catch (_) {}
            this._processor = null;
        }
        if (this._sourceNode) {
            try { this._sourceNode.disconnect(); } catch (_) {}
            this._sourceNode = null;
        }
        if (this._audioContext) {
            try { this._audioContext.close(); } catch (_) {}
            this._audioContext = null;
        }
    }

    _releaseMediaStream() {
        if (this._mediaStream) {
            this._mediaStream.getTracks().forEach(t => t.stop());
            this._mediaStream = null;
        }
    }

    // =========================================================================
    // WEB SPEECH API FALLBACK
    // =========================================================================

    async _startSpeechFallback() {
        if (!SpeechRecognition) {
            throw new Error('Neither Porcupine nor Web Speech API available');
        }

        const capturedSession = this._sessionId;

        // Request mic permission
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
        } catch (err) {
            throw new Error(`Mic access denied: ${err.message}`);
        }

        if (capturedSession !== this._sessionId || this._destroyed) return;

        this._provider = 'webspeech';
        this._createSpeechRecognition(capturedSession);
    }

    _createSpeechRecognition(capturedSession) {
        if (this._destroyed || capturedSession !== this._sessionId) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 3;

        recognition.onresult = (event) => {
            if (capturedSession !== this._sessionId) return;

            for (let i = event.resultIndex; i < event.results.length; i++) {
                // Check all alternatives for wake phrase
                for (let j = 0; j < event.results[i].length; j++) {
                    const transcript = (event.results[i][j].transcript || '').toLowerCase().trim();

                    for (const phrase of WAKE_PHRASES) {
                        if (transcript.includes(phrase)) {
                            this._handleDetection();
                            return;
                        }
                    }
                }
            }
        };

        recognition.onerror = (event) => {
            if (capturedSession !== this._sessionId) return;
            if (event.error === 'no-speech' || event.error === 'aborted') return;

            if (event.error === 'not-allowed') {
                this._setState(WAKE_STATE.ERROR);
                this._onError?.({ type: 'permission_denied', message: 'Mic denied', fatal: true });
                return;
            }

            console.warn('[WakeWord] Speech recognition error:', event.error);
        };

        recognition.onend = () => {
            if (capturedSession !== this._sessionId || this._destroyed) return;
            if (this._state === WAKE_STATE.LISTENING) {
                this._clearRestartTimer();
                this._restartTimer = setTimeout(() => {
                    this._restartTimer = null;
                    if (capturedSession === this._sessionId && !this._destroyed) {
                        this._createSpeechRecognition(capturedSession);
                    }
                }, 300);
            }
        };

        this._recognition = recognition;

        try {
            recognition.start();
            this._setState(WAKE_STATE.LISTENING);
        } catch (err) {
            this._clearRestartTimer();
            this._restartTimer = setTimeout(() => {
                this._restartTimer = null;
                if (capturedSession === this._sessionId && !this._destroyed) {
                    this._createSpeechRecognition(capturedSession);
                }
            }, 500);
        }
    }

    _teardownSpeechFallback() {
        this._clearRestartTimer();
        if (this._recognition) {
            try {
                this._recognition.onresult = null;
                this._recognition.onerror = null;
                this._recognition.onend = null;
                this._recognition.abort();
            } catch (_) {}
            this._recognition = null;
        }
    }

    // =========================================================================
    // DETECTION HANDLER
    // =========================================================================

    _handleDetection() {
        const now = Date.now();
        if (now - this._lastDetection < this._cooldownMs) {
            console.debug('[WakeWord] Detection ignored (cooldown)');
            return;
        }
        this._lastDetection = now;

        this._setState(WAKE_STATE.DETECTED);
        this._onWakeWord?.();

        // Return to listening after brief pause
        setTimeout(() => {
            if (!this._destroyed && this._state === WAKE_STATE.DETECTED) {
                this._setState(WAKE_STATE.LISTENING);
            }
        }, 500);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    _setState(newState) {
        if (this._state !== newState) {
            this._state = newState;
            this._onStateChange?.(newState);
        }
    }

    _clearRestartTimer() {
        if (this._restartTimer !== null) {
            clearTimeout(this._restartTimer);
            this._restartTimer = null;
        }
    }
}

export function isWakeWordSupported() {
    return !!SpeechRecognition || typeof navigator?.mediaDevices?.getUserMedia === 'function';
}

export default WakeWordDetector;
