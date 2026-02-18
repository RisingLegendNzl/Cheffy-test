// web/src/utils/streamingSTT.js
// =============================================================================
// Natural Voice Mode — Streaming Speech-to-Text Client
// [Phase 6] v2.0 — Multi-language support (30+ languages)
//
// Primary:  Deepgram real-time WebSocket (low-latency, VAD, streaming partials)
// Fallback: Web Speech API (browser-native)
//
// Phase 6 additions:
//   - Configurable language parameter for both Deepgram and Web Speech
//   - Runtime language switching via setLanguage()
//   - STT_LANGUAGES export for UI language pickers
// =============================================================================

const STT_TOKEN_ENDPOINT = '/api/voice/stt-token';

const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

export const STT_LANGUAGES = {
    en:      { deepgram: 'en',    webspeech: 'en-US',  label: 'English' },
    'en-US': { deepgram: 'en-US', webspeech: 'en-US',  label: 'English (US)' },
    'en-GB': { deepgram: 'en-GB', webspeech: 'en-GB',  label: 'English (UK)' },
    'en-AU': { deepgram: 'en-AU', webspeech: 'en-AU',  label: 'English (AU)' },
    es:      { deepgram: 'es',    webspeech: 'es-ES',  label: 'Spanish' },
    'es-419':{ deepgram: 'es-419',webspeech: 'es-MX',  label: 'Spanish (LATAM)' },
    fr:      { deepgram: 'fr',    webspeech: 'fr-FR',  label: 'French' },
    de:      { deepgram: 'de',    webspeech: 'de-DE',  label: 'German' },
    it:      { deepgram: 'it',    webspeech: 'it-IT',  label: 'Italian' },
    pt:      { deepgram: 'pt',    webspeech: 'pt-PT',  label: 'Portuguese' },
    'pt-BR': { deepgram: 'pt-BR', webspeech: 'pt-BR',  label: 'Portuguese (BR)' },
    nl:      { deepgram: 'nl',    webspeech: 'nl-NL',  label: 'Dutch' },
    ja:      { deepgram: 'ja',    webspeech: 'ja-JP',  label: 'Japanese' },
    ko:      { deepgram: 'ko',    webspeech: 'ko-KR',  label: 'Korean' },
    zh:      { deepgram: 'zh',    webspeech: 'zh-CN',  label: 'Chinese (Mandarin)' },
    'zh-TW': { deepgram: 'zh-TW', webspeech: 'zh-TW',  label: 'Chinese (Traditional)' },
    hi:      { deepgram: 'hi',    webspeech: 'hi-IN',  label: 'Hindi' },
    ru:      { deepgram: 'ru',    webspeech: 'ru-RU',  label: 'Russian' },
    tr:      { deepgram: 'tr',    webspeech: 'tr-TR',  label: 'Turkish' },
    pl:      { deepgram: 'pl',    webspeech: 'pl-PL',  label: 'Polish' },
    uk:      { deepgram: 'uk',    webspeech: 'uk-UA',  label: 'Ukrainian' },
    sv:      { deepgram: 'sv',    webspeech: 'sv-SE',  label: 'Swedish' },
    da:      { deepgram: 'da',    webspeech: 'da-DK',  label: 'Danish' },
    no:      { deepgram: 'no',    webspeech: 'nb-NO',  label: 'Norwegian' },
    fi:      { deepgram: 'fi',    webspeech: 'fi-FI',  label: 'Finnish' },
    id:      { deepgram: 'id',    webspeech: 'id-ID',  label: 'Indonesian' },
    th:      { deepgram: 'th',    webspeech: 'th-TH',  label: 'Thai' },
    vi:      { deepgram: 'vi',    webspeech: 'vi-VN',  label: 'Vietnamese' },
    ar:      { deepgram: 'ar',    webspeech: 'ar-SA',  label: 'Arabic' },
    el:      { deepgram: 'el',    webspeech: 'el-GR',  label: 'Greek' },
    cs:      { deepgram: 'cs',    webspeech: 'cs-CZ',  label: 'Czech' },
    ro:      { deepgram: 'ro',    webspeech: 'ro-RO',  label: 'Romanian' },
    hu:      { deepgram: 'hu',    webspeech: 'hu-HU',  label: 'Hungarian' },
    ta:      { deepgram: 'ta',    webspeech: 'ta-IN',  label: 'Tamil' },
};

export const STT_STATE = {
    IDLE: 'idle', CONNECTING: 'connecting', LISTENING: 'listening',
    CLOSED: 'closed', ERROR: 'error',
};

export class StreamingSTT {
    constructor(callbacks = {}) {
        this._onPartial = callbacks.onPartial || (() => {});
        this._onFinal = callbacks.onFinal || (() => {});
        this._onVADStart = callbacks.onVADStart || (() => {});
        this._onVADEnd = callbacks.onVADEnd || (() => {});
        this._onError = callbacks.onError || (() => {});
        this._onStateChange = callbacks.onStateChange || (() => {});

        this._state = STT_STATE.IDLE;
        this._provider = null;
        this._destroyed = false;
        this._language = callbacks.language || 'en';

        this._ws = null;
        this._mediaStream = null;
        this._audioContext = null;
        this._scriptProcessor = null;
        this._sourceNode = null;
        this._recognition = null;
        this._restartTimer = null;
        this._partialBuffer = '';
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 3;
        this._reconnectTimer = null;
        this._sessionId = 0;
    }

    get state() { return this._state; }
    get provider() { return this._provider; }
    get isListening() { return this._state === STT_STATE.LISTENING; }
    get language() { return this._language; }

    async setLanguage(langCode) {
        const wasListening = this._state === STT_STATE.LISTENING;
        this._language = langCode;
        if (wasListening) { this.stop(); await this.start(); }
    }

    async start() {
        if (this._destroyed) return;
        if (this._state === STT_STATE.LISTENING || this._state === STT_STATE.CONNECTING) return;
        this._sessionId++;
        this._reconnectAttempts = 0;
        this._setState(STT_STATE.CONNECTING);

        try {
            const tokenData = await this._fetchSTTToken();
            if (tokenData.provider === 'deepgram' && tokenData.token) {
                await this._startDeepgram(tokenData); return;
            }
        } catch (err) {
            console.warn('[StreamingSTT] Deepgram init failed:', err.message);
        }
        try { await this._startWebSpeech(); }
        catch (err) { this._setState(STT_STATE.ERROR); this._onError({ type: 'init_failed', message: err.message, fatal: true }); }
    }

    stop() {
        this._sessionId++;
        this._clearReconnectTimer(); this._clearRestartTimer();
        this._teardownDeepgram(); this._teardownWebSpeech();
        this._setState(STT_STATE.CLOSED);
    }

    destroy() {
        this._destroyed = true; this.stop();
        this._onPartial = null; this._onFinal = null; this._onVADStart = null;
        this._onVADEnd = null; this._onError = null; this._onStateChange = null;
    }

    // === DEEPGRAM ===

    async _fetchSTTToken() {
        const r = await fetch(STT_TOKEN_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!r.ok) throw new Error(`Token ${r.status}`);
        return await r.json();
    }

    async _startDeepgram(tokenData) {
        const cs = this._sessionId;
        this._mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, sampleRate: 16000 },
        });
        if (cs !== this._sessionId || this._destroyed) { this._releaseMediaStream(); return; }

        const lc = STT_LANGUAGES[this._language] || STT_LANGUAGES['en'];
        const params = new URLSearchParams({
            model: 'nova-2', language: lc.deepgram, smart_format: 'true',
            interim_results: 'true', endpointing: '1500', vad_events: 'true',
            utterance_end_ms: '2000', encoding: 'linear16', sample_rate: '16000', channels: '1',
        });
        this._ws = new WebSocket(`${tokenData.ws_url}?${params}`, ['token', tokenData.token]);

        this._ws.onopen = () => {
            if (cs !== this._sessionId) return;
            this._provider = 'deepgram'; this._reconnectAttempts = 0;
            this._setState(STT_STATE.LISTENING); this._startAudioCapture();
            console.debug(`[StreamingSTT] Deepgram connected (lang: ${lc.deepgram})`);
        };
        this._ws.onmessage = (e) => { if (cs === this._sessionId) this._handleDeepgramMessage(e); };
        this._ws.onerror = () => {};
        this._ws.onclose = (e) => {
            if (cs !== this._sessionId) return;
            if (this._state === STT_STATE.LISTENING) this._attemptReconnect(tokenData);
        };
    }

    _handleDeepgramMessage(event) {
        try {
            const d = JSON.parse(event.data);
            if (d.type === 'SpeechStarted') { this._onVADStart?.(); return; }
            if (d.type === 'Results') {
                const t = d.channel?.alternatives?.[0]?.transcript || '';
                if (!t) return;
                if (d.is_final) {
                    this._partialBuffer += (this._partialBuffer ? ' ' : '') + t;
                    if (d.speech_final) {
                        const full = this._partialBuffer.trim(); this._partialBuffer = '';
                        if (full) this._onFinal?.(full); this._onVADEnd?.();
                    }
                } else {
                    this._onPartial?.(this._partialBuffer ? `${this._partialBuffer} ${t}` : t);
                }
            }
            if (d.type === 'UtteranceEnd' && this._partialBuffer.trim()) {
                this._onFinal?.(this._partialBuffer.trim()); this._partialBuffer = ''; this._onVADEnd?.();
            }
        } catch (_) {}
    }

    _startAudioCapture() {
        if (!this._mediaStream) return;
        try {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            this._sourceNode = this._audioContext.createMediaStreamSource(this._mediaStream);
            this._scriptProcessor = this._audioContext.createScriptProcessor(4096, 1, 1);
            this._scriptProcessor.onaudioprocess = (e) => {
                if (this._ws?.readyState !== WebSocket.OPEN) return;
                const inp = e.inputBuffer.getChannelData(0);
                const pcm = new Int16Array(inp.length);
                for (let i = 0; i < inp.length; i++) { const s = Math.max(-1, Math.min(1, inp[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; }
                this._ws.send(pcm.buffer);
            };
            this._sourceNode.connect(this._scriptProcessor);
            this._scriptProcessor.connect(this._audioContext.destination);
        } catch (err) { this._onError?.({ type: 'audio_capture', message: err.message, fatal: false }); }
    }

    _attemptReconnect(td) {
        if (this._destroyed || this._reconnectAttempts >= this._maxReconnectAttempts) {
            this._teardownDeepgram();
            this._startWebSpeech().catch(() => { this._setState(STT_STATE.ERROR); this._onError?.({ type: 'all_failed', message: 'Both STT failed', fatal: true }); });
            return;
        }
        this._reconnectAttempts++;
        const d = Math.min(100 * Math.pow(2, this._reconnectAttempts), 5000);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (!this._destroyed && this._state !== STT_STATE.CLOSED) this._startDeepgram(td).catch(() => this._attemptReconnect(td));
        }, d);
    }

    _teardownDeepgram() {
        if (this._scriptProcessor) { try { this._scriptProcessor.disconnect(); this._scriptProcessor.onaudioprocess = null; } catch (_) {} this._scriptProcessor = null; }
        if (this._sourceNode) { try { this._sourceNode.disconnect(); } catch (_) {} this._sourceNode = null; }
        if (this._audioContext) { try { this._audioContext.close(); } catch (_) {} this._audioContext = null; }
        if (this._ws) { try { this._ws.onopen = this._ws.onmessage = this._ws.onerror = this._ws.onclose = null; if (this._ws.readyState < 2) this._ws.close(); } catch (_) {} this._ws = null; }
        this._releaseMediaStream(); this._partialBuffer = '';
    }

    _releaseMediaStream() { if (this._mediaStream) { this._mediaStream.getTracks().forEach(t => t.stop()); this._mediaStream = null; } }

    // === WEB SPEECH FALLBACK ===

    async _startWebSpeech() {
        if (!SpeechRecognition) throw new Error('Web Speech API not supported');
        const cs = this._sessionId;
        try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch (e) { throw new Error(`Mic denied: ${e.message}`); }
        if (cs !== this._sessionId || this._destroyed) return;
        this._provider = 'webspeech'; this._createWSR(cs);
    }

    _createWSR(cs) {
        if (this._destroyed || cs !== this._sessionId) return;
        const r = new SpeechRecognition();
        r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
        const lc = STT_LANGUAGES[this._language] || STT_LANGUAGES['en'];
        r.lang = lc.webspeech;

        r.onresult = (e) => {
            if (cs !== this._sessionId) return;
            let fin = '', int = '';
            for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0]?.transcript || ''; if (e.results[i].isFinal) fin += t; else int += t; }
            if (int) this._onPartial?.(int);
            if (fin.trim()) this._onFinal?.(fin.trim());
        };
        r.onerror = (e) => {
            if (cs !== this._sessionId) return;
            if (e.error === 'no-speech' || e.error === 'aborted') return;
            if (e.error === 'not-allowed') { this._setState(STT_STATE.ERROR); this._onError?.({ type: 'permission_denied', message: 'Mic denied', fatal: true }); }
        };
        r.onend = () => {
            if (cs !== this._sessionId || this._destroyed) return;
            if (this._state === STT_STATE.LISTENING) {
                this._clearRestartTimer();
                this._restartTimer = setTimeout(() => { this._restartTimer = null; if (cs === this._sessionId && !this._destroyed) this._createWSR(cs); }, 200);
            }
        };
        r.onstart = () => { if (cs === this._sessionId) this._setState(STT_STATE.LISTENING); };
        r.onspeechstart = () => { if (cs === this._sessionId) this._onVADStart?.(); };
        r.onspeechend = () => { if (cs === this._sessionId) this._onVADEnd?.(); };

        this._recognition = r;
        try { r.start(); } catch (_) {
            this._clearRestartTimer();
            this._restartTimer = setTimeout(() => { this._restartTimer = null; if (cs === this._sessionId && !this._destroyed) { try { r.start(); } catch (_) {} } }, 500);
        }
    }

    _teardownWebSpeech() {
        this._clearRestartTimer();
        if (this._recognition) { try { this._recognition.onresult = this._recognition.onerror = this._recognition.onend = this._recognition.onstart = this._recognition.onspeechstart = this._recognition.onspeechend = null; this._recognition.abort(); } catch (_) {} this._recognition = null; }
    }

    _setState(s) { if (this._state !== s) { this._state = s; this._onStateChange?.(s); } }
    _clearReconnectTimer() { if (this._reconnectTimer !== null) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; } }
    _clearRestartTimer() { if (this._restartTimer !== null) { clearTimeout(this._restartTimer); this._restartTimer = null; } }
}

export function isSTTSupported() { return !!SpeechRecognition || typeof navigator?.mediaDevices?.getUserMedia === 'function'; }
export default StreamingSTT;
