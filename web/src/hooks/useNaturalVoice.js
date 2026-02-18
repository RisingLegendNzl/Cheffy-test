// web/src/hooks/useNaturalVoice.js
// =============================================================================
// Natural Voice Mode Hook — Cheffy Voice Cooking v3.0 (Phase 6)
//
// Phase 6 additions:
//   - Byte-level TTS streaming via TTSStreamer (Web Audio API)
//   - Wake word detection ("Hey Cheffy") via WakeWordDetector
//   - Multi-language STT support (30+ languages)
//   - Proactive cooking assistant (timer extraction & scheduled prompts)
//   - Falls back to TTSQueue if Web Audio API is unavailable
//
// State machine unchanged from v2.0:
//   IDLE → LISTENING → PROCESSING → SPEAKING → LISTENING (loop)
//   SPEAKING → INTERRUPTED → PROCESSING
//   Any → PAUSED → LISTENING / Any → IDLE
// =============================================================================

import { useReducer, useRef, useCallback, useEffect, useMemo } from 'react';
import { StreamingSTT } from '../utils/streamingSTT';
import { LLMStream } from '../utils/llmStream';
import { TTSStreamer, isTTSStreamingSupported } from '../utils/ttsStreamer';
import { TTSQueue } from '../utils/ttsQueue';
import { ConversationManager } from '../utils/conversationManager';
import { WakeWordDetector } from '../utils/wakeWordDetector';
import { ProactiveAssistant } from '../utils/proactiveAssistant';

// =============================================================================
// STATES & ACTIONS
// =============================================================================

export const VOICE_STATE = {
    IDLE: 'IDLE',
    LISTENING: 'LISTENING',
    PROCESSING: 'PROCESSING',
    SPEAKING: 'SPEAKING',
    INTERRUPTED: 'INTERRUPTED',
    PAUSED: 'PAUSED',
    ERROR: 'ERROR',
};

const ACTION = {
    START_SESSION: 'START_SESSION',
    SESSION_READY: 'SESSION_READY',
    START_LISTENING: 'START_LISTENING',
    TRANSCRIPT_PARTIAL: 'TRANSCRIPT_PARTIAL',
    TRANSCRIPT_FINAL: 'TRANSCRIPT_FINAL',
    LLM_TOKEN: 'LLM_TOKEN',
    LLM_DONE: 'LLM_DONE',
    TTS_PLAYBACK_START: 'TTS_PLAYBACK_START',
    TTS_PLAYBACK_END: 'TTS_PLAYBACK_END',
    INTERRUPT: 'INTERRUPT',
    STEP_CHANGE: 'STEP_CHANGE',
    PAUSE: 'PAUSE',
    RESUME: 'RESUME',
    STOP: 'STOP',
    ERROR: 'ERROR',
    CLEAR_ERROR: 'CLEAR_ERROR',
    SET_MIC_PERMISSION: 'SET_MIC_PERMISSION',
    SET_LANGUAGE: 'SET_LANGUAGE',
    UPDATE_TIMERS: 'UPDATE_TIMERS',
    SET_WAKE_WORD_STATE: 'SET_WAKE_WORD_STATE',
};

// =============================================================================
// REDUCER
// =============================================================================

const initialState = {
    voiceState: VOICE_STATE.IDLE,
    currentStep: 0,
    transcript: '',
    lastFinalTranscript: '',
    assistantText: '',
    conversationLog: [],
    error: null,
    micPermission: 'prompt',
    turnId: 0,
    isLLMStreaming: false,
    isTTSPlaying: false,
    sttProvider: null,
    // Phase 6
    language: 'en',
    activeTimers: [],
    wakeWordState: 'idle', // idle | listening | detected
    ttsMode: 'stream',     // 'stream' (byte-level) | 'queue' (sentence-level fallback)
};

function voiceReducer(state, action) {
    switch (action.type) {
        case ACTION.START_SESSION:
            return { ...state, voiceState: VOICE_STATE.LISTENING, currentStep: 0, transcript: '', lastFinalTranscript: '', assistantText: '', conversationLog: [], error: null, turnId: state.turnId + 1 };
        case ACTION.SESSION_READY:
            return { ...state, sttProvider: action.provider || null, ttsMode: action.ttsMode || state.ttsMode };
        case ACTION.START_LISTENING:
            return { ...state, voiceState: VOICE_STATE.LISTENING, transcript: '', assistantText: '' };
        case ACTION.TRANSCRIPT_PARTIAL:
            return { ...state, transcript: action.text };
        case ACTION.TRANSCRIPT_FINAL:
            return { ...state, voiceState: VOICE_STATE.PROCESSING, transcript: '', lastFinalTranscript: action.text, assistantText: '', turnId: state.turnId + 1, isLLMStreaming: true, conversationLog: [...state.conversationLog, { role: 'user', content: action.text, timestamp: Date.now() }] };
        case ACTION.LLM_TOKEN:
            return { ...state, assistantText: action.fullText };
        case ACTION.LLM_DONE: {
            const clean = action.fullText?.replace(/\[ACTION:[A-Z_]+(?::\d+)?\]/g, '').trim();
            return { ...state, isLLMStreaming: false, conversationLog: clean ? [...state.conversationLog, { role: 'assistant', content: clean, timestamp: Date.now() }] : state.conversationLog };
        }
        case ACTION.TTS_PLAYBACK_START:
            return { ...state, voiceState: VOICE_STATE.SPEAKING, isTTSPlaying: true };
        case ACTION.TTS_PLAYBACK_END:
            return { ...state, isTTSPlaying: false, voiceState: state.voiceState === VOICE_STATE.SPEAKING ? VOICE_STATE.LISTENING : state.voiceState };
        case ACTION.INTERRUPT:
            return { ...state, voiceState: VOICE_STATE.INTERRUPTED, turnId: state.turnId + 1 };
        case ACTION.STEP_CHANGE:
            return { ...state, currentStep: action.step };
        case ACTION.PAUSE:
            return { ...state, voiceState: VOICE_STATE.PAUSED };
        case ACTION.RESUME:
            return { ...state, voiceState: VOICE_STATE.LISTENING, turnId: state.turnId + 1 };
        case ACTION.STOP:
            return { ...initialState, micPermission: state.micPermission, language: state.language, turnId: state.turnId + 1 };
        case ACTION.ERROR:
            return { ...state, voiceState: VOICE_STATE.ERROR, error: action.error };
        case ACTION.CLEAR_ERROR:
            return { ...state, error: null, voiceState: VOICE_STATE.LISTENING };
        case ACTION.SET_MIC_PERMISSION:
            return { ...state, micPermission: action.permission };
        case ACTION.SET_LANGUAGE:
            return { ...state, language: action.language };
        case ACTION.UPDATE_TIMERS:
            return { ...state, activeTimers: action.timers };
        case ACTION.SET_WAKE_WORD_STATE:
            return { ...state, wakeWordState: action.wakeState };
        default:
            return state;
    }
}

// =============================================================================
// HOOK
// =============================================================================

export function useNaturalVoice({ mealName = '', steps = [], ingredients = [] }) {
    const [state, dispatch] = useReducer(voiceReducer, initialState);

    const stateRef = useRef(state);
    const turnIdRef = useRef(0);
    const isActiveRef = useRef(false);

    const sttRef = useRef(null);
    const llmRef = useRef(null);
    const ttsRef = useRef(null);      // TTSStreamer or TTSQueue
    const conversationRef = useRef(null);
    const wakeWordRef = useRef(null);
    const proactiveRef = useRef(null);

    useEffect(() => { stateRef.current = state; turnIdRef.current = state.turnId; }, [state]);

    const stepsRef = useRef(steps);
    useEffect(() => { stepsRef.current = steps; }, [steps]);

    // ===========================================================================
    // SERVICE INITIALIZATION
    // ===========================================================================

    const getConversation = useCallback(() => {
        if (!conversationRef.current) {
            conversationRef.current = new ConversationManager({ mealName, steps, ingredients });
        }
        return conversationRef.current;
    }, []);

    const getTTS = useCallback(() => {
        if (!ttsRef.current) {
            // Phase 6: Use byte-level streamer if supported, else fall back to queue
            const useStreamer = isTTSStreamingSupported();
            const Ctor = useStreamer ? TTSStreamer : TTSQueue;

            ttsRef.current = new Ctor({
                onPlaybackStart: () => { if (isActiveRef.current) dispatch({ type: ACTION.TTS_PLAYBACK_START }); },
                onPlaybackEnd: () => { if (isActiveRef.current) dispatch({ type: ACTION.TTS_PLAYBACK_END }); },
                onError: (err) => { console.warn('[NaturalVoice] TTS error:', err); },
            });

            dispatch({ type: ACTION.SESSION_READY, ttsMode: useStreamer ? 'stream' : 'queue' });
        }
        return ttsRef.current;
    }, []);

    const getLLM = useCallback(() => {
        if (!llmRef.current) {
            llmRef.current = new LLMStream({
                onSentence: (text) => { if (isActiveRef.current) getTTS().enqueue(text); },
                onToken: (token, fullText) => { if (isActiveRef.current) dispatch({ type: ACTION.LLM_TOKEN, fullText }); },
                onAction: (action) => { if (isActiveRef.current) handleAction(action); },
                onDone: (fullText) => {
                    if (!isActiveRef.current) return;
                    dispatch({ type: ACTION.LLM_DONE, fullText });
                    getConversation().addAssistantMessage(fullText);
                    getTTS().flush();
                },
                onError: (err) => {
                    if (!isActiveRef.current) return;
                    console.warn('[NaturalVoice] LLM error:', err);
                    dispatch({ type: ACTION.LLM_DONE, fullText: '' });
                    getTTS().enqueue("Sorry, I had trouble with that. Could you say that again?");
                    getTTS().flush();
                },
            });
        }
        return llmRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getSTT = useCallback(() => {
        if (!sttRef.current) {
            sttRef.current = new StreamingSTT({
                language: stateRef.current.language,
                onPartial: (text) => { if (isActiveRef.current) dispatch({ type: ACTION.TRANSCRIPT_PARTIAL, text }); },
                onFinal: (text) => {
                    if (!isActiveRef.current || !text?.trim()) return;
                    // Record activity for proactive assistant
                    proactiveRef.current?.recordActivity();
                    const cs = stateRef.current.voiceState;
                    if (cs === VOICE_STATE.SPEAKING || cs === VOICE_STATE.PROCESSING) {
                        handleInterruption(text);
                    } else if (cs === VOICE_STATE.LISTENING) {
                        processUtterance(text);
                    }
                },
                onVADStart: () => {},
                onVADEnd: () => {},
                onError: (err) => {
                    if (!isActiveRef.current) return;
                    if (err.fatal) dispatch({ type: ACTION.ERROR, error: err.message });
                },
                onStateChange: (sttState) => {
                    if (!isActiveRef.current) return;
                    if (sttState === 'listening') {
                        dispatch({ type: ACTION.SESSION_READY, provider: sttRef.current?.provider });
                    }
                },
            });
        }
        return sttRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getProactive = useCallback(() => {
        if (!proactiveRef.current) {
            proactiveRef.current = new ProactiveAssistant({
                onProactiveMessage: (msg) => {
                    if (!isActiveRef.current) return;
                    // Inject proactive message into conversation and speak it
                    getConversation().addAssistantMessage(msg);
                    dispatch({ type: ACTION.LLM_DONE, fullText: msg });
                    getTTS().enqueue(msg);
                    getTTS().flush();
                },
                onTimerStart: (timer) => {
                    console.debug('[NaturalVoice] Timer started:', timer.label);
                },
                onTimerComplete: (timer) => {
                    console.debug('[NaturalVoice] Timer complete:', timer);
                },
                onTimerTick: (timers) => {
                    dispatch({ type: ACTION.UPDATE_TIMERS, timers });
                },
            });
        }
        return proactiveRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ===========================================================================
    // CORE VOICE LOOP
    // ===========================================================================

    const processUtterance = useCallback((text) => {
        dispatch({ type: ACTION.TRANSCRIPT_FINAL, text });
        const conversation = getConversation();
        conversation.addUserMessage(text);
        const { messages, recipeContext } = conversation.getPayload();
        // Pass language to recipeContext so server can adapt
        recipeContext.language = stateRef.current.language;
        getLLM().send(messages, recipeContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleInterruption = useCallback((text) => {
        dispatch({ type: ACTION.INTERRUPT });
        getLLM().abort();
        getTTS().interrupt();
        const partial = stateRef.current.assistantText;
        if (partial?.trim()) getConversation().addPartialAssistantMessage(partial);
        setTimeout(() => { if (isActiveRef.current) processUtterance(text); }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processUtterance]);

    const handleAction = useCallback((action) => {
        const conv = getConversation();
        switch (action.type) {
            case 'NEXT': {
                const n = Math.min(conv.currentStep + 1, stepsRef.current.length - 1);
                conv.setCurrentStep(n); dispatch({ type: ACTION.STEP_CHANGE, step: n });
                // Process step for proactive timers
                getProactive().processStep(n, stepsRef.current[n]);
                break;
            }
            case 'PREV': {
                const p = Math.max(conv.currentStep - 1, 0);
                conv.setCurrentStep(p); dispatch({ type: ACTION.STEP_CHANGE, step: p });
                break;
            }
            case 'GOTO': {
                if (action.payload !== null) {
                    const t = Math.max(0, Math.min(action.payload - 1, stepsRef.current.length - 1));
                    conv.setCurrentStep(t); dispatch({ type: ACTION.STEP_CHANGE, step: t });
                    getProactive().processStep(t, stepsRef.current[t]);
                }
                break;
            }
            case 'REPEAT': break;
            case 'PAUSE': pauseSession(); break;
            case 'STOP': setTimeout(() => stopSession(), 2000); break;
            case 'INGREDIENTS': break;
            default: break;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ===========================================================================
    // SESSION MANAGEMENT
    // ===========================================================================

    const startSession = useCallback(async () => {
        if (isActiveRef.current) return;
        if (steps.length === 0) { dispatch({ type: ACTION.ERROR, error: 'No recipe steps available.' }); return; }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            dispatch({ type: ACTION.SET_MIC_PERMISSION, permission: 'granted' });
        } catch (err) {
            dispatch({ type: ACTION.SET_MIC_PERMISSION, permission: 'denied' });
            dispatch({ type: ACTION.ERROR, error: 'Microphone access required.' });
            return;
        }

        isActiveRef.current = true;
        const conversation = getConversation();
        conversation.updateRecipe({ mealName, steps, ingredients });
        conversation.clear();
        conversation.setCurrentStep(0);

        dispatch({ type: ACTION.START_SESSION });

        // Pause wake word while session is active
        wakeWordRef.current?.pause();

        const tts = getTTS();
        const intro = `Let's cook ${mealName}! I'll guide you through ${steps.length} steps. Talk to me naturally — ask questions, say next, or just chat. Let's start!`;
        const stepText = `Step 1 of ${steps.length}. ${steps[0]}`;
        conversation.addAssistantMessage(`${intro} ${stepText}`);
        tts.enqueue(intro);
        tts.enqueue(stepText);
        tts.flush();

        // Start proactive assistant
        const proactive = getProactive();
        proactive.clear();
        proactive.processStep(0, steps[0]);
        proactive.startTicking();
        proactive.startIdleMonitor();

        // Start STT
        setTimeout(() => {
            if (isActiveRef.current) {
                getSTT().start().catch((err) => {
                    dispatch({ type: ACTION.ERROR, error: 'Failed to start speech recognition.' });
                });
            }
        }, 500);
    }, [mealName, steps, ingredients, getConversation, getTTS, getSTT, getProactive]);

    const stopSession = useCallback(() => {
        isActiveRef.current = false;
        sttRef.current?.stop();
        llmRef.current?.abort();
        ttsRef.current?.interrupt();
        proactiveRef.current?.clear();
        dispatch({ type: ACTION.STOP });

        // Resume wake word after session ends
        setTimeout(() => { wakeWordRef.current?.resume(); }, 1000);
    }, []);

    const pauseSession = useCallback(() => {
        if (!isActiveRef.current) return;
        sttRef.current?.stop();
        llmRef.current?.abort();
        ttsRef.current?.interrupt();
        proactiveRef.current?.pause();
        dispatch({ type: ACTION.PAUSE });
    }, []);

    const resumeSession = useCallback(() => {
        if (stateRef.current.voiceState !== VOICE_STATE.PAUSED) return;
        isActiveRef.current = true;
        proactiveRef.current?.resume();
        dispatch({ type: ACTION.RESUME });
        getSTT().start().catch(() => {});
    }, [getSTT]);

    // ===========================================================================
    // MANUAL NAVIGATION
    // ===========================================================================

    const goToStep = useCallback((stepIndex) => {
        if (!isActiveRef.current) return;
        const clamped = Math.max(0, Math.min(stepIndex, stepsRef.current.length - 1));
        const conv = getConversation();
        conv.setCurrentStep(clamped);
        dispatch({ type: ACTION.STEP_CHANGE, step: clamped });
        getLLM().abort();
        getTTS().interrupt();
        const stepText = `Step ${clamped + 1} of ${stepsRef.current.length}. ${stepsRef.current[clamped]}`;
        conv.addAssistantMessage(stepText);
        getTTS().enqueue(stepText);
        getTTS().flush();
        getProactive().processStep(clamped, stepsRef.current[clamped]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const nextStep = useCallback(() => goToStep((stateRef.current.currentStep || 0) + 1), [goToStep]);
    const prevStep = useCallback(() => goToStep((stateRef.current.currentStep || 0) - 1), [goToStep]);

    // ===========================================================================
    // PHASE 6: LANGUAGE SWITCHING
    // ===========================================================================

    const setLanguage = useCallback(async (langCode) => {
        dispatch({ type: ACTION.SET_LANGUAGE, language: langCode });
        if (sttRef.current) {
            await sttRef.current.setLanguage(langCode);
        }
    }, []);

    // ===========================================================================
    // PHASE 6: WAKE WORD
    // ===========================================================================

    const startWakeWord = useCallback(async (options = {}) => {
        if (wakeWordRef.current) return;

        wakeWordRef.current = new WakeWordDetector({
            sensitivity: options.sensitivity ?? 0.6,
            accessKey: options.porcupineAccessKey || '',
            keywordPath: options.keywordPath || null,
            onWakeWord: () => {
                dispatch({ type: ACTION.SET_WAKE_WORD_STATE, wakeState: 'detected' });
                // Auto-start voice session if not already active
                if (!isActiveRef.current) {
                    startSession();
                }
            },
            onStateChange: (wakeState) => {
                dispatch({ type: ACTION.SET_WAKE_WORD_STATE, wakeState });
            },
            onError: (err) => {
                console.warn('[NaturalVoice] Wake word error:', err);
            },
        });

        await wakeWordRef.current.start();
    }, [startSession]);

    const stopWakeWord = useCallback(() => {
        wakeWordRef.current?.destroy();
        wakeWordRef.current = null;
        dispatch({ type: ACTION.SET_WAKE_WORD_STATE, wakeState: 'idle' });
    }, []);

    const setWakeWordSensitivity = useCallback((value) => {
        if (wakeWordRef.current) wakeWordRef.current.sensitivity = value;
    }, []);

    // ===========================================================================
    // EFFECTS
    // ===========================================================================

    // Auto-listen after TTS ends
    useEffect(() => {
        if (state.voiceState === VOICE_STATE.LISTENING && isActiveRef.current) {
            const stt = sttRef.current;
            if (stt && !stt.isListening) {
                stt.start().catch(() => {});
            }
        }
        if (state.voiceState === VOICE_STATE.PAUSED || state.voiceState === VOICE_STATE.IDLE) {
            sttRef.current?.stop();
        }
    }, [state.voiceState]);

    // Auto-recover from errors
    useEffect(() => {
        if (state.voiceState === VOICE_STATE.ERROR && isActiveRef.current) {
            const t = setTimeout(() => {
                if (isActiveRef.current && stateRef.current.voiceState === VOICE_STATE.ERROR) {
                    dispatch({ type: ACTION.CLEAR_ERROR });
                }
            }, 3000);
            return () => clearTimeout(t);
        }
    }, [state.voiceState]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isActiveRef.current = false;
            sttRef.current?.destroy();
            llmRef.current?.destroy();
            ttsRef.current?.destroy();
            conversationRef.current?.destroy();
            wakeWordRef.current?.destroy();
            proactiveRef.current?.destroy();
            sttRef.current = null; llmRef.current = null; ttsRef.current = null;
            conversationRef.current = null; wakeWordRef.current = null; proactiveRef.current = null;
        };
    }, []);

    // ===========================================================================
    // PUBLIC API
    // ===========================================================================

    return useMemo(() => ({
        // State
        voiceState: state.voiceState,
        isActive: state.voiceState !== VOICE_STATE.IDLE,
        isListening: state.voiceState === VOICE_STATE.LISTENING,
        isProcessing: state.voiceState === VOICE_STATE.PROCESSING,
        isSpeaking: state.voiceState === VOICE_STATE.SPEAKING,
        isPaused: state.voiceState === VOICE_STATE.PAUSED,
        isError: state.voiceState === VOICE_STATE.ERROR,
        currentStep: state.currentStep,
        totalSteps: steps.length,
        transcript: state.transcript,
        lastFinalTranscript: state.lastFinalTranscript,
        assistantText: state.assistantText,
        conversationLog: state.conversationLog,
        error: state.error,
        micPermission: state.micPermission,
        sttProvider: state.sttProvider,
        isLLMStreaming: state.isLLMStreaming,
        isTTSPlaying: state.isTTSPlaying,
        // Phase 6
        language: state.language,
        activeTimers: state.activeTimers,
        wakeWordState: state.wakeWordState,
        ttsMode: state.ttsMode,

        // Actions
        start: startSession,
        stop: stopSession,
        pause: pauseSession,
        resume: resumeSession,
        nextStep,
        prevStep,
        goToStep,
        // Phase 6
        setLanguage,
        startWakeWord,
        stopWakeWord,
        setWakeWordSensitivity,

        VOICE_STATE,
    }), [state, steps.length, startSession, stopSession, pauseSession, resumeSession, nextStep, prevStep, goToStep, setLanguage, startWakeWord, stopWakeWord, setWakeWordSensitivity]);
}

export function isNaturalVoiceSupported() {
    const hasSR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    const hasAudio = typeof Audio !== 'undefined';
    const hasMD = typeof navigator?.mediaDevices?.getUserMedia === 'function';
    return (!!hasSR || hasMD) && hasAudio;
}

export default useNaturalVoice;
