// web/src/utils/streamingSTT.js
// =============================================================================
// Natural Voice Mode — Streaming Speech-to-Text Client
//
// Primary:  Deepgram real-time WebSocket (low-latency, VAD, streaming partials)
// Fallback: Web Speech API (browser-native, no API key needed)
//
// Exports a single class: StreamingSTT
//
// Usage:
//   const stt = new StreamingSTT({
//     onPartial:      (text) => ...,  // Interim transcription
//     onFinal:        (text) => ...,  // Final transcription (end of utterance)
//     onVADStart:     () => ...,      // Voice activity started
//     onVADEnd:       () => ...,      // Voice activity ended
//     onError:        (err) => ...,   // Error (non-fatal unless specified)
//     onStateChange:  (state) => ..., // 'connecting' | 'listening' | 'closed' | 'error'
//   });
//
//   await stt.start();  // Requests mic, connects to Deepgram (or starts Web Speech)
//   stt.stop();         // Tears down everything
//   stt.destroy();      // Full cleanup
// =============================================================================

const STT_TOKEN_ENDPOINT = '/api/voice/stt-token';

// --- Web Speech API detection ---
const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

/**
 * Streaming STT states
 */
export const STT_STATE = {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    LISTENING: 'listening',
    CLOSED: 'closed',
    ERROR: 'error',
};

export class StreamingSTT {
    constructor(callbacks = {}) {
        this._onPartial = callbacks.onPartial || (() => {});
        this._onFinal = callbacks.onFinal || (() => {});
        this._onVADStart = callbacks.onVADStart || (() => {});
        this._onVADEnd = callbacks.onVADEnd || (() => {});
        this._onError = callbacks.onError || (() => {});
        this._onStateChange = callbacks.onStateChange || (() => {});

        // Internal state
        this._state = STT_STATE.IDLE;
        this._provider = null;       // 'deepgram' | 'webspeech'
        this._destroyed = false;

        // Deepgram resources
        this._ws = null;
        this._mediaStream = null;
        this._mediaRecorder = null;
        this._audioContext = null;
        this._scriptProcessor = null;
        this._sourceNode = null;

        // Web Speech resources
        this._recognition = null;
        this._restartTimer = null;
        this._partialBuffer = '';

        // Reconnection state
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 3;
        this._reconnectTimer = null;

        // Session ID for stale callback detection
        this._sessionId = 0;
    }

    get state() { return this._state; }
    get provider() { return this._provider; }
    get isListening() { return this._state === STT_STATE.LISTENING; }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Start listening. Attempts Deepgram first, falls back to Web Speech API.
     */
    async start() {
        if (this._destroyed) return;
        if (this._state === STT_STATE.LISTENING || this._state === STT_STATE.CONNECTING) return;

        this._sessionId++;
        this._reconnectAttempts = 0;
        this._setState(STT_STATE.CONNECTING);

        // Try Deepgram first
        try {
            const tokenData = await this._fetchSTTToken();

            if (tokenData.provider === 'deepgram' && tokenData.token) {
                await this._startDeepgram(tokenData);
                return;
            }
        } catch (err) {
            console.warn('[StreamingSTT] Deepgram init failed, trying Web Speech API:', err.message);
        }

        // Fallback to Web Speech API
        try {
            await this._startWebSpeech();
        } catch (err) {
            this._setState(STT_STATE.ERROR);
            this._onError({ type: 'init_failed', message: err.message, fatal: true });
        }
    }

    /**
     * Stop listening. Tears down active connections but allows restart.
     */
    stop() {
        this._sessionId++;
        this._clearReconnectTimer();
        this._clearRestartTimer();
        this._teardownDeepgram();
        this._teardownWebSpeech();
        this._setState(STT_STATE.CLOSED);
    }

    /**
     * Full cleanup. Call on unmount. Cannot be restarted.
     */
    destroy() {
        this._destroyed = true;
        this.stop();
        this._onPartial = null;
        this._onFinal = null;
        this._onVADStart = null;
        this._onVADEnd = null;
        this._onError = null;
        this._onStateChange = null;
    }

    // =========================================================================
    // DEEPGRAM PROVIDER
    // =========================================================================

    async _fetchSTTToken() {
        const response = await fetch(STT_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Token endpoint returned ${response.status}`);
        }

        return await response.json();
    }

    async _startDeepgram(tokenData) {
        const capturedSession = this._sessionId;

        // Request microphone
        this._mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1,
                sampleRate: 16000,
            },
        });

        if (capturedSession !== this._sessionId || this._destroyed) {
            this._releaseMediaStream();
            return;
        }

        // Build WebSocket URL with params
        const params = new URLSearchParams({
            model: 'nova-2',
            language: 'en',
            smart_format: 'true',
            interim_results: 'true',
            endpointing: '1500',      // 1.5s silence = end of utterance
            vad_events: 'true',
            utterance_end_ms: '2000',
            encoding: 'linear16',
            sample_rate: '16000',
            channels: '1',
        });

        const wsUrl = `${tokenData.ws_url}?${params.toString()}`;

        this._ws = new WebSocket(wsUrl, ['token', tokenData.token]);

        this._ws.onopen = () => {
            if (capturedSession !== this._sessionId) return;
            this._provider = 'deepgram';
            this._reconnectAttempts = 0;
            this._setState(STT_STATE.LISTENING);
            this._startAudioCapture();
            console.debug('[StreamingSTT] Deepgram WebSocket connected');
        };

        this._ws.onmessage = (event) => {
            if (capturedSession !== this._sessionId) return;
            this._handleDeepgramMessage(event);
        };

        this._ws.onerror = (event) => {
            if (capturedSession !== this._sessionId) return;
            console.warn('[StreamingSTT] Deepgram WebSocket error:', event);
        };

        this._ws.onclose = (event) => {
            if (capturedSession !== this._sessionId) return;
            console.debug(`[StreamingSTT] Deepgram WebSocket closed: ${event.code} ${event.reason}`);

            if (this._state === STT_STATE.LISTENING) {
                this._attemptReconnect(tokenData);
            }
        };
    }

    _handleDeepgramMessage(event) {
        try {
            const data = JSON.parse(event.data);

            // VAD events
            if (data.type === 'SpeechStarted') {
                this._onVADStart?.();
                return;
            }

            // Transcript results
            if (data.type === 'Results') {
                const transcript = data.channel?.alternatives?.[0]?.transcript || '';

                if (!transcript) return;

                if (data.is_final) {
                    // Accumulate finals within an utterance
                    this._partialBuffer += (this._partialBuffer ? ' ' : '') + transcript;

                    if (data.speech_final) {
                        // True end of utterance — send accumulated text
                        const fullText = this._partialBuffer.trim();
                        this._partialBuffer = '';
                        if (fullText) {
                            this._onFinal?.(fullText);
                        }
                        this._onVADEnd?.();
                    }
                } else {
                    // Interim result — show current partial + accumulated
                    const display = this._partialBuffer
                        ? `${this._partialBuffer} ${transcript}`
                        : transcript;
                    this._onPartial?.(display);
                }
            }

            // UtteranceEnd — safety net if speech_final wasn't received
            if (data.type === 'UtteranceEnd') {
                if (this._partialBuffer.trim()) {
                    this._onFinal?.(this._partialBuffer.trim());
                    this._partialBuffer = '';
                    this._onVADEnd?.();
                }
            }

        } catch (err) {
            console.warn('[StreamingSTT] Failed to parse Deepgram message:', err);
        }
    }

    _startAudioCapture() {
        if (!this._mediaStream) return;

        try {
            // Use AudioWorklet-compatible approach: MediaRecorder with timeslice
            // This sends regular audio chunks to the WebSocket
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000,
            });

            this._sourceNode = this._audioContext.createMediaStreamSource(this._mediaStream);

            // Use ScriptProcessor for broad compatibility (AudioWorklet is better but
            // requires a separate file and has iOS issues)
            const bufferSize = 4096;
            this._scriptProcessor = this._audioContext.createScriptProcessor(bufferSize, 1, 1);

            this._scriptProcessor.onaudioprocess = (event) => {
                if (this._ws?.readyState !== WebSocket.OPEN) return;

                const inputData = event.inputBuffer.getChannelData(0);

                // Convert Float32 to Int16 PCM
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                this._ws.send(pcm16.buffer);
            };

            this._sourceNode.connect(this._scriptProcessor);
            this._scriptProcessor.connect(this._audioContext.destination);

        } catch (err) {
            console.error('[StreamingSTT] Audio capture setup failed:', err);
            this._onError?.({ type: 'audio_capture', message: err.message, fatal: false });
        }
    }

    _attemptReconnect(tokenData) {
        if (this._destroyed || this._reconnectAttempts >= this._maxReconnectAttempts) {
            console.warn('[StreamingSTT] Max reconnect attempts reached, falling back to Web Speech');
            this._teardownDeepgram();
            this._startWebSpeech().catch(() => {
                this._setState(STT_STATE.ERROR);
                this._onError?.({ type: 'all_providers_failed', message: 'Both STT providers failed', fatal: true });
            });
            return;
        }

        this._reconnectAttempts++;
        const delay = Math.min(100 * Math.pow(2, this._reconnectAttempts), 5000);

        console.debug(`[StreamingSTT] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);

        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (!this._destroyed && this._state !== STT_STATE.CLOSED) {
                this._startDeepgram(tokenData).catch(() => {
                    this._attemptReconnect(tokenData);
                });
            }
        }, delay);
    }

    _teardownDeepgram() {
        // Disconnect audio processing
        if (this._scriptProcessor) {
            try {
                this._scriptProcessor.disconnect();
                this._scriptProcessor.onaudioprocess = null;
            } catch (_) {}
            this._scriptProcessor = null;
        }

        if (this._sourceNode) {
            try { this._sourceNode.disconnect(); } catch (_) {}
            this._sourceNode = null;
        }

        if (this._audioContext) {
            try { this._audioContext.close(); } catch (_) {}
            this._audioContext = null;
        }

        // Close WebSocket
        if (this._ws) {
            try {
                this._ws.onopen = null;
                this._ws.onmessage = null;
                this._ws.onerror = null;
                this._ws.onclose = null;
                if (this._ws.readyState === WebSocket.OPEN ||
                    this._ws.readyState === WebSocket.CONNECTING) {
                    this._ws.close();
                }
            } catch (_) {}
            this._ws = null;
        }

        this._releaseMediaStream();
        this._partialBuffer = '';
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

    async _startWebSpeech() {
        if (!SpeechRecognition) {
            throw new Error('Web Speech API not supported in this browser');
        }

        const capturedSession = this._sessionId;

        // Request mic permission (Web Speech does this itself, but explicit
        // request gives us better error handling)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
        } catch (err) {
            throw new Error(`Microphone access denied: ${err.message}`);
        }

        if (capturedSession !== this._sessionId || this._destroyed) return;

        this._provider = 'webspeech';
        this._createWebSpeechRecognition(capturedSession);
    }

    _createWebSpeechRecognition(capturedSession) {
        if (this._destroyed || capturedSession !== this._sessionId) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        let interimBuffer = '';

        recognition.onresult = (event) => {
            if (capturedSession !== this._sessionId) return;

            let finalText = '';
            let interimText = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0]?.transcript || '';

                if (result.isFinal) {
                    finalText += transcript;
                } else {
                    interimText += transcript;
                }
            }

            if (interimText) {
                this._onPartial?.(interimText);
            }

            if (finalText.trim()) {
                this._onFinal?.(finalText.trim());
            }
        };

        recognition.onerror = (event) => {
            if (capturedSession !== this._sessionId) return;

            if (event.error === 'no-speech' || event.error === 'aborted') {
                // Non-fatal — auto-restart
                return;
            }

            if (event.error === 'not-allowed') {
                this._setState(STT_STATE.ERROR);
                this._onError?.({ type: 'permission_denied', message: 'Microphone access denied', fatal: true });
                return;
            }

            console.warn('[StreamingSTT] Web Speech error:', event.error);
            this._onError?.({ type: 'webspeech_error', message: event.error, fatal: false });
        };

        recognition.onend = () => {
            if (capturedSession !== this._sessionId || this._destroyed) return;

            // Auto-restart if still supposed to be listening
            if (this._state === STT_STATE.LISTENING) {
                this._clearRestartTimer();
                this._restartTimer = setTimeout(() => {
                    this._restartTimer = null;
                    if (capturedSession === this._sessionId && !this._destroyed) {
                        this._createWebSpeechRecognition(capturedSession);
                    }
                }, 200);
            }
        };

        recognition.onstart = () => {
            if (capturedSession !== this._sessionId) return;
            this._setState(STT_STATE.LISTENING);
        };

        // speech start/end events for VAD simulation
        recognition.onspeechstart = () => {
            if (capturedSession !== this._sessionId) return;
            this._onVADStart?.();
        };

        recognition.onspeechend = () => {
            if (capturedSession !== this._sessionId) return;
            this._onVADEnd?.();
        };

        this._recognition = recognition;

        try {
            recognition.start();
        } catch (err) {
            console.warn('[StreamingSTT] Web Speech start failed:', err);
            // Retry once after short delay
            this._clearRestartTimer();
            this._restartTimer = setTimeout(() => {
                this._restartTimer = null;
                if (capturedSession === this._sessionId && !this._destroyed) {
                    try { recognition.start(); } catch (_) {}
                }
            }, 500);
        }
    }

    _teardownWebSpeech() {
        this._clearRestartTimer();

        if (this._recognition) {
            try {
                this._recognition.onresult = null;
                this._recognition.onerror = null;
                this._recognition.onend = null;
                this._recognition.onstart = null;
                this._recognition.onspeechstart = null;
                this._recognition.onspeechend = null;
                this._recognition.abort();
            } catch (_) {}
            this._recognition = null;
        }
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

    _clearReconnectTimer() {
        if (this._reconnectTimer !== null) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    _clearRestartTimer() {
        if (this._restartTimer !== null) {
            clearTimeout(this._restartTimer);
            this._restartTimer = null;
        }
    }
}

/**
 * Check if any STT provider is available.
 */
export function isSTTSupported() {
    return !!SpeechRecognition || typeof navigator?.mediaDevices?.getUserMedia === 'function';
}

export default StreamingSTT;