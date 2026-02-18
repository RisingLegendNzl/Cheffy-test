// web/src/hooks/useNaturalVoice.js
// =============================================================================
// Natural Voice Mode Hook — Cheffy Voice Cooking v3.3
//
// v3.3 — SECONDARY VOICE ELIMINATION + TTS CONTINUITY
//
// Root causes of choppy/overlapping audio:
//
//   A. SECONDARY VOICE: The legacy ttsClient singleton (ttsClient.js) uses
//      HTMLAudioElement for playback. This hook uses TTSStreamer (Web Audio API)
//      or TTSQueue (separate HTMLAudioElement). Both systems could play audio
//      simultaneously because they share no state. Even though RecipeModal only
//      renders NaturalVoiceButton, the ttsClient singleton is instantiated on
//      import and could be triggered by any code path.
//
//      FIX: On startSession(), we call ttsClient.claimExclusiveAudio() which
//      stops any current ttsClient playback and makes all its methods no-ops.
//      On stopSession(), we call ttsClient.releaseExclusiveAudio().
//
//   B. PER-SENTENCE onPlaybackStart/End: The TTS classes fired callbacks per
//      sentence, causing the state machine to toggle SPEAKING→LISTENING between
//      sentences. Each toggle restarted STT, which created AudioContext
//      contention that suspended the TTS AudioContext mid-playback.
//
//      FIX: TTSStreamer/TTSQueue now use turn-level _turnPlaying flag.
//      Callbacks fire once per turn. This hook adds a 150ms debounce before
//      restarting STT after TTS ends (defense-in-depth).
//
// State machine (unchanged):
//   IDLE → GREETING → WAITING_FOR_READY → LISTENING → PROCESSING → SPEAKING → LISTENING
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
// ── FIX v3.3: Import legacy ttsClient to claim/release exclusive audio ──
import { ttsClient } from '../utils/ttsClient';

// =============================================================================
// STATES & ACTIONS
// =============================================================================

export const VOICE_STATE = {
    IDLE: 'IDLE',
    GREETING: 'GREETING',
    WAITING_FOR_READY: 'WAITING_FOR_READY',
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
    GREETING_DONE: 'GREETING_DONE',
    USER_READY: 'USER_READY',
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
// AFFIRMATIVE DETECTION
// =============================================================================

const AFFIRMATIVE_PATTERNS = [
    /\byes\b/i, /\byeah\b/i, /\byep\b/i, /\byup\b/i,
    /\bsure\b/i, /\bgo\b/i, /\bstart\b/i, /\blet'?s\b/i,
    /\bready\b/i, /\bok\b/i, /\bokay\b/i, /\bbegin\b/i,
    /\bdo it\b/i, /\bhit it\b/i, /\bplease\b/i,
    /\bsí\b/i, /\boui\b/i, /\bja\b/i, /\bhai\b/i,
];

function isAffirmative(text) {
    const trimmed = (text || '').trim().toLowerCase();
    if (!trimmed) return false;
    return AFFIRMATIVE_PATTERNS.some(p => p.test(trimmed));
}

// =============================================================================
// NOISE FILTERING
// =============================================================================

const NOISE_WORDS = new Set([
    'uh', 'um', 'hmm', 'hm', 'ah', 'oh', 'eh', 'er', 'mm',
    'mhm', 'uh-huh', 'huh', 'uhh', 'umm',
    '.', '..', '...', ',', '-',
]);

function isSubstantiveTranscript(text) {
    const trimmed = (text || '').trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) return false;
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);
    return words.filter(w => !NOISE_WORDS.has(w)).length > 0;
}

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
    language: 'en',
    activeTimers: [],
    wakeWordState: 'idle',
    ttsMode: 'stream',
};

function voiceReducer(state, action) {
    switch (action.type) {

        case ACTION.START_SESSION:
            return {
                ...state,
                voiceState: VOICE_STATE.GREETING,
                currentStep: 0,
                transcript: '',
                lastFinalTranscript: '',
                assistantText: '',
                conversationLog: [],
                error: null,
                turnId: state.turnId + 1,
            };

        case ACTION.SESSION_READY:
            return { ...state, sttProvider: action.provider || null, ttsMode: action.ttsMode || state.ttsMode };

        // Guard: only transition if still in GREETING
        case ACTION.GREETING_DONE:
            if (state.voiceState !== VOICE_STATE.GREETING) return state;
            return {
                ...state,
                voiceState: VOICE_STATE.WAITING_FOR_READY,
                turnId: state.turnId + 1,
            };

        case ACTION.USER_READY:
            return {
                ...state,
                voiceState: VOICE_STATE.LISTENING,
                transcript: '',
                turnId: state.turnId + 1,
            };

        case ACTION.START_LISTENING:
            return { ...state, voiceState: VOICE_STATE.LISTENING, transcript: '', assistantText: '' };

        case ACTION.TRANSCRIPT_PARTIAL:
            return { ...state, transcript: action.text };

        case ACTION.TRANSCRIPT_FINAL:
            return {
                ...state,
                voiceState: VOICE_STATE.PROCESSING,
                transcript: '',
                lastFinalTranscript: action.text,
                assistantText: '',
                turnId: state.turnId + 1,
                isLLMStreaming: true,
                conversationLog: [
                    ...state.conversationLog,
                    { role: 'user', content: action.text, timestamp: Date.now() },
                ],
            };

        case ACTION.LLM_TOKEN:
            return { ...state, assistantText: action.fullText };

        case ACTION.LLM_DONE: {
            const clean = action.fullText?.replace(/\[ACTION:[A-Z_]+(?::\d+)?\]/g, '').trim();
            let nextVoiceState = state.voiceState;

            if (state.voiceState === VOICE_STATE.PROCESSING) {
                if (state.isTTSPlaying) {
                    // LLM done but TTS still playing → SPEAKING
                    nextVoiceState = VOICE_STATE.SPEAKING;
                } else {
                    // LLM done AND TTS done → LISTENING
                    nextVoiceState = VOICE_STATE.LISTENING;
                }
            }

            return {
                ...state,
                isLLMStreaming: false,
                voiceState: nextVoiceState,
                conversationLog: clean
                    ? [...state.conversationLog, { role: 'assistant', content: clean, timestamp: Date.now() }]
                    : state.conversationLog,
            };
        }

        case ACTION.TTS_PLAYBACK_START:
            return {
                ...state,
                isTTSPlaying: true,
                // Preserve pre-loop and processing states
                voiceState: (state.voiceState === VOICE_STATE.GREETING ||
                             state.voiceState === VOICE_STATE.WAITING_FOR_READY ||
                             state.voiceState === VOICE_STATE.PROCESSING)
                    ? state.voiceState
                    : VOICE_STATE.SPEAKING,
            };

        case ACTION.TTS_PLAYBACK_END: {
            let nextVoiceState = state.voiceState;
            if (state.voiceState === VOICE_STATE.SPEAKING) {
                nextVoiceState = VOICE_STATE.LISTENING;
            } else if (state.voiceState === VOICE_STATE.PROCESSING && !state.isLLMStreaming) {
                nextVoiceState = VOICE_STATE.LISTENING;
            }
            return { ...state, isTTSPlaying: false, voiceState: nextVoiceState };
        }

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
    const userReadyRef = useRef(false);

    // Debounce refs
    const sttRestartTimerRef = useRef(null);
    const lastProcessTimeRef = useRef(0);
    const PROCESS_COOLDOWN_MS = 600;

    const sttRef = useRef(null);
    const llmRef = useRef(null);
    const ttsRef = useRef(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getTTS = useCallback(() => {
        if (!ttsRef.current) {
            const useStreamer = isTTSStreamingSupported();
            const Ctor = useStreamer ? TTSStreamer : TTSQueue;

            ttsRef.current = new Ctor({
                onPlaybackStart: () => {
                    if (isActiveRef.current) dispatch({ type: ACTION.TTS_PLAYBACK_START });
                },
                onPlaybackEnd: () => {
                    if (!isActiveRef.current) return;
                    dispatch({ type: ACTION.TTS_PLAYBACK_END });

                    // If greeting TTS just finished, transition to WAITING_FOR_READY
                    if (stateRef.current.voiceState === VOICE_STATE.GREETING) {
                        dispatch({ type: ACTION.GREETING_DONE });
                    }
                },
                onError: (err) => { console.warn('[NaturalVoice] TTS error:', err); },
            });

            dispatch({ type: ACTION.SESSION_READY, ttsMode: useStreamer ? 'stream' : 'queue' });
        }
        return ttsRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                onPartial: (text) => {
                    if (!isActiveRef.current) return;
                    dispatch({ type: ACTION.TRANSCRIPT_PARTIAL, text });
                },
                onFinal: (text) => {
                    if (!isActiveRef.current) return;
                    if (!isSubstantiveTranscript(text)) return;

                    const now = Date.now();
                    if (now - lastProcessTimeRef.current < PROCESS_COOLDOWN_MS) return;

                    const cs = stateRef.current.voiceState;

                    if (cs === VOICE_STATE.SPEAKING || cs === VOICE_STATE.PROCESSING) {
                        console.debug('[NaturalVoice] Ignored final during', cs);
                        return;
                    }

                    if (cs === VOICE_STATE.WAITING_FOR_READY) {
                        handleReadyCheck(text);
                        return;
                    }

                    if (cs === VOICE_STATE.LISTENING) {
                        lastProcessTimeRef.current = now;
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

                    // Only inject proactive messages when Cheffy is idle (LISTENING)
                    const vs = stateRef.current.voiceState;
                    if (vs !== VOICE_STATE.LISTENING) {
                        if (!proactiveRef.current._pendingMessages) {
                            proactiveRef.current._pendingMessages = [];
                        }
                        proactiveRef.current._pendingMessages.push(msg);
                        return;
                    }

                    getConversation().addAssistantMessage(msg);
                    dispatch({ type: ACTION.LLM_DONE, fullText: msg });
                    getTTS().enqueue(msg);
                    getTTS().flush();
                },
                onTimerStart: (timer) => { console.debug('[NaturalVoice] Timer started:', timer.label); },
                onTimerComplete: (timer) => { console.debug('[NaturalVoice] Timer complete:', timer); },
                onTimerTick: (timers) => { dispatch({ type: ACTION.UPDATE_TIMERS, timers }); },
            });
        }
        return proactiveRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ===========================================================================
    // READY CHECK
    // ===========================================================================

    const handleReadyCheck = useCallback((text) => {
        if (isAffirmative(text)) {
            userReadyRef.current = true;
            sttRef.current?.stop();
            dispatch({ type: ACTION.USER_READY });

            const conversation = getConversation();
            const tts = getTTS();

            const readyResponse = `Great, let's go!`;
            const stepText = `Step 1 of ${stepsRef.current.length}. ${stepsRef.current[0]}`;

            conversation.addUserMessage(text);
            conversation.addAssistantMessage(`${readyResponse} ${stepText}`);

            tts.enqueue(readyResponse);
            tts.enqueue(stepText);
            tts.flush();

            const proactive = getProactive();
            proactive.processStep(0, stepsRef.current[0]);
            proactive.startTicking();
            proactive.startIdleMonitor();
        } else {
            const conversation = getConversation();
            conversation.addUserMessage(text);
            const nudge = "No rush! Just say yes, start, or let's go when you're ready to begin.";
            conversation.addAssistantMessage(nudge);
            dispatch({ type: ACTION.LLM_DONE, fullText: nudge });
            getTTS().enqueue(nudge);
            getTTS().flush();
        }
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
        if (steps.length === 0) {
            dispatch({ type: ACTION.ERROR, error: 'No recipe steps available.' });
            return;
        }

        // ── FIX v3.3: CLAIM EXCLUSIVE AUDIO ──
        // Stops any legacy ttsClient playback and prevents it from playing
        // anything while Natural Voice is active. This is THE fix for the
        // secondary voice issue.
        ttsClient.claimExclusiveAudio();

        isActiveRef.current = true;
        userReadyRef.current = false;

        const conversation = getConversation();
        conversation.updateRecipe({ mealName, steps, ingredients });
        conversation.clear();
        conversation.setCurrentStep(0);

        dispatch({ type: ACTION.START_SESSION });
        wakeWordRef.current?.pause();

        // Speak greeting via the single TTS queue. No mic required.
        const tts = getTTS();
        const greeting = `Hi! I'm Cheffy, and today we're making ${mealName}. ` +
                         `It's ${steps.length} steps. Just say yes when you're ready to start cooking!`;

        conversation.addAssistantMessage(greeting);
        tts.enqueue(greeting);
        tts.flush();
    }, [mealName, steps, ingredients, getConversation, getTTS]);

    const stopSession = useCallback(() => {
        isActiveRef.current = false;
        userReadyRef.current = false;

        // Clear debounce timer
        if (sttRestartTimerRef.current) {
            clearTimeout(sttRestartTimerRef.current);
            sttRestartTimerRef.current = null;
        }

        sttRef.current?.stop();
        llmRef.current?.abort();
        ttsRef.current?.interrupt();
        proactiveRef.current?.clear();

        // ── FIX v3.3: RELEASE EXCLUSIVE AUDIO ──
        ttsClient.releaseExclusiveAudio();

        dispatch({ type: ACTION.STOP });
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

        if (!userReadyRef.current) {
            userReadyRef.current = true;
            dispatch({ type: ACTION.USER_READY });
        }

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
    // LANGUAGE / WAKE WORD
    // ===========================================================================

    const setLanguage = useCallback(async (langCode) => {
        dispatch({ type: ACTION.SET_LANGUAGE, language: langCode });
        if (sttRef.current) await sttRef.current.setLanguage(langCode);
    }, []);

    const startWakeWord = useCallback(async (options = {}) => {
        if (wakeWordRef.current) return;
        wakeWordRef.current = new WakeWordDetector({
            sensitivity: options.sensitivity ?? 0.6,
            accessKey: options.porcupineAccessKey || '',
            keywordPath: options.keywordPath || null,
            onWakeWord: () => {
                dispatch({ type: ACTION.SET_WAKE_WORD_STATE, wakeState: 'detected' });
                if (!isActiveRef.current) startSession();
            },
            onStateChange: (wakeState) => dispatch({ type: ACTION.SET_WAKE_WORD_STATE, wakeState }),
            onError: (err) => console.warn('[NaturalVoice] Wake word error:', err),
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

    // ── STT lifecycle: controls when mic is on/off ──
    // Rule: STT runs only when (LISTENING or WAITING_FOR_READY) AND TTS is silent.
    // v3.3: 150ms debounce before restarting STT after TTS ends
    useEffect(() => {
        const vs = state.voiceState;
        const ttsPlaying = state.isTTSPlaying;

        const shouldListen = (vs === VOICE_STATE.LISTENING || vs === VOICE_STATE.WAITING_FOR_READY) && !ttsPlaying;

        if (shouldListen && isActiveRef.current) {
            // Flush deferred proactive messages
            if (vs === VOICE_STATE.LISTENING && proactiveRef.current?._pendingMessages?.length > 0) {
                const pending = proactiveRef.current._pendingMessages.splice(0);
                const tts = getTTS();
                for (const msg of pending) {
                    getConversation().addAssistantMessage(msg);
                    dispatch({ type: ACTION.LLM_DONE, fullText: msg });
                    tts.enqueue(msg);
                }
                tts.flush();
                return; // TTS will restart → this effect re-runs
            }

            // Debounced STT restart
            if (sttRestartTimerRef.current) clearTimeout(sttRestartTimerRef.current);

            sttRestartTimerRef.current = setTimeout(() => {
                sttRestartTimerRef.current = null;
                // Re-check: state may have changed during delay
                const currentVS = stateRef.current.voiceState;
                const currentTTS = stateRef.current.isTTSPlaying;
                if (!isActiveRef.current || currentTTS) return;
                if (currentVS !== VOICE_STATE.LISTENING && currentVS !== VOICE_STATE.WAITING_FOR_READY) return;

                const stt = sttRef.current || getSTT();
                if (!stt.isListening) {
                    stt.start().catch((err) => {
                        console.warn('[NaturalVoice] STT start failed:', err);
                        dispatch({ type: ACTION.SET_MIC_PERMISSION, permission: 'denied' });
                    });
                }
            }, 150);

        } else if (ttsPlaying && sttRef.current?.isListening) {
            // TTS started: stop STT immediately
            if (sttRestartTimerRef.current) {
                clearTimeout(sttRestartTimerRef.current);
                sttRestartTimerRef.current = null;
            }
            sttRef.current.stop();
        } else if ((vs === VOICE_STATE.PAUSED || vs === VOICE_STATE.IDLE ||
                    vs === VOICE_STATE.GREETING || vs === VOICE_STATE.PROCESSING ||
                    vs === VOICE_STATE.SPEAKING) && sttRef.current?.isListening) {
            if (sttRestartTimerRef.current) {
                clearTimeout(sttRestartTimerRef.current);
                sttRestartTimerRef.current = null;
            }
            sttRef.current.stop();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.voiceState, state.isTTSPlaying]);

    // Auto-recover from errors
    useEffect(() => {
        if (state.voiceState === VOICE_STATE.ERROR && isActiveRef.current) {
            const timer = setTimeout(() => {
                if (stateRef.current.voiceState === VOICE_STATE.ERROR) {
                    dispatch({ type: ACTION.CLEAR_ERROR });
                }
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [state.voiceState]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isActiveRef.current = false;
            if (sttRestartTimerRef.current) {
                clearTimeout(sttRestartTimerRef.current);
                sttRestartTimerRef.current = null;
            }
            sttRef.current?.destroy?.();
            llmRef.current?.destroy?.();
            ttsRef.current?.destroy?.();
            conversationRef.current?.destroy?.();
            proactiveRef.current?.destroy?.();
            wakeWordRef.current?.destroy?.();
            // Release audio lock on unmount
            ttsClient.releaseExclusiveAudio();
        };
    }, []);

    // ===========================================================================
    // PUBLIC API
    // ===========================================================================

    const isActive = state.voiceState !== VOICE_STATE.IDLE;
    const isGreeting = state.voiceState === VOICE_STATE.GREETING;
    const isWaitingForReady = state.voiceState === VOICE_STATE.WAITING_FOR_READY;

    return useMemo(() => ({
        voiceState: state.voiceState,
        isActive,
        isGreeting,
        isWaitingForReady,
        isListening: state.voiceState === VOICE_STATE.LISTENING,
        isProcessing: state.voiceState === VOICE_STATE.PROCESSING,
        isSpeaking: state.voiceState === VOICE_STATE.SPEAKING,
        isPaused: state.voiceState === VOICE_STATE.PAUSED,
        isError: state.voiceState === VOICE_STATE.ERROR,
        isTTSPlaying: state.isTTSPlaying,
        isLLMStreaming: state.isLLMStreaming,

        transcript: state.transcript,
        lastFinalTranscript: state.lastFinalTranscript,
        assistantText: state.assistantText,
        conversationLog: state.conversationLog,
        currentStep: state.currentStep,
        totalSteps: steps.length,
        error: state.error,
        micPermission: state.micPermission,
        turnId: state.turnId,

        language: state.language,
        activeTimers: state.activeTimers,
        wakeWordState: state.wakeWordState,
        sttProvider: state.sttProvider,
        ttsMode: state.ttsMode,

        start: startSession,
        stop: stopSession,
        pause: pauseSession,
        resume: resumeSession,
        nextStep,
        prevStep,
        goToStep,
        setLanguage,

        startWakeWord,
        stopWakeWord,
        setWakeWordSensitivity,

        VOICE_STATE,
    }), [state, steps.length, startSession, stopSession, pauseSession, resumeSession,
         nextStep, prevStep, goToStep, setLanguage, startWakeWord, stopWakeWord,
         setWakeWordSensitivity, isActive, isGreeting, isWaitingForReady]);
}

export function isNaturalVoiceSupported() {
    return typeof window !== 'undefined' &&
        !!(window.AudioContext || window.webkitAudioContext);
}
