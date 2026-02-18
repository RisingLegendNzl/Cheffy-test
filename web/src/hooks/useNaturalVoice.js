// web/src/hooks/useNaturalVoice.js
// =============================================================================
// Natural Voice Mode Hook — Cheffy Voice Cooking v3.1
//
// v3.1 fix: Greeting-gated startup
//   OLD: overlay opens → TTS reads intro+step1 → STT starts at 500ms → loop active
//   NEW: overlay opens → TTS speaks greeting prompt → STT starts AFTER greeting ends
//        → user says "yes" / affirmative → THEN loop activates with step 1
//
// State machine (updated):
//   IDLE → GREETING → WAITING_FOR_READY → LISTENING → PROCESSING → SPEAKING → LISTENING
//   SPEAKING → INTERRUPTED → PROCESSING
//   Any → PAUSED → LISTENING / Any → IDLE
//
// GREETING:          Cheffy speaks greeting. STT is OFF. No listening.
// WAITING_FOR_READY: Greeting TTS done. STT is ON. Waiting for affirmative.
// LISTENING:         Normal voice loop. STT is ON. User utterances go to LLM.
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
    GREETING: 'GREETING',               // NEW: TTS playing greeting, STT off
    WAITING_FOR_READY: 'WAITING_FOR_READY', // NEW: Greeting done, STT on, waiting for "yes"
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
    GREETING_DONE: 'GREETING_DONE',       // NEW: greeting TTS finished
    USER_READY: 'USER_READY',             // NEW: user said "yes" / affirmative
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
    /\bsí\b/i, /\boui\b/i, /\bja\b/i, /\bhai\b/i, // multi-language
];

function isAffirmative(text) {
    const trimmed = (text || '').trim().toLowerCase();
    if (!trimmed) return false;
    return AFFIRMATIVE_PATTERNS.some(p => p.test(trimmed));
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
    // Phase 6
    language: 'en',
    activeTimers: [],
    wakeWordState: 'idle',
    ttsMode: 'stream',
};

function voiceReducer(state, action) {
    switch (action.type) {

        // ── Session starts in GREETING state (not LISTENING) ──
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

        // ── Greeting TTS finished → transition to WAITING_FOR_READY ──
        case ACTION.GREETING_DONE:
            return {
                ...state,
                voiceState: VOICE_STATE.WAITING_FOR_READY,
                turnId: state.turnId + 1,
            };

        // ── User said "yes" → transition to LISTENING (full voice loop active) ──
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
            return {
                ...state,
                isLLMStreaming: false,
                conversationLog: clean
                    ? [...state.conversationLog, { role: 'assistant', content: clean, timestamp: Date.now() }]
                    : state.conversationLog,
            };
        }

        case ACTION.TTS_PLAYBACK_START:
            return { ...state, isTTSPlaying: true,
                // Only move to SPEAKING if we're in the active loop (not greeting)
                voiceState: state.voiceState === VOICE_STATE.GREETING
                    ? VOICE_STATE.GREETING
                    : VOICE_STATE.SPEAKING,
            };

        case ACTION.TTS_PLAYBACK_END:
            return { ...state, isTTSPlaying: false,
                voiceState: state.voiceState === VOICE_STATE.SPEAKING
                    ? VOICE_STATE.LISTENING
                    : state.voiceState,
                // Note: GREETING → GREETING stays; GREETING_DONE is dispatched separately
            };

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

    // Tracks whether the user has confirmed readiness (persists across renders)
    const userReadyRef = useRef(false);

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

                    // ── KEY FIX: If we just finished the greeting TTS,
                    // dispatch GREETING_DONE to move to WAITING_FOR_READY ──
                    if (stateRef.current.voiceState === VOICE_STATE.GREETING) {
                        dispatch({ type: ACTION.GREETING_DONE });
                    }
                },
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
                onPartial: (text) => {
                    if (isActiveRef.current) dispatch({ type: ACTION.TRANSCRIPT_PARTIAL, text });
                },
                onFinal: (text) => {
                    if (!isActiveRef.current || !text?.trim()) return;

                    proactiveRef.current?.recordActivity();
                    const cs = stateRef.current.voiceState;

                    // ── WAITING_FOR_READY: check for affirmative ──
                    if (cs === VOICE_STATE.WAITING_FOR_READY) {
                        handleReadyCheck(text);
                        return;
                    }

                    // Normal interruption handling
                    if (cs === VOICE_STATE.SPEAKING || cs === VOICE_STATE.PROCESSING) {
                        handleInterruption(text);
                        return;
                    }

                    // Normal voice loop
                    if (cs === VOICE_STATE.LISTENING) {
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
    // eslint-disable-next-line react-hooks-exhaustive-deps
    }, []);

    // ===========================================================================
    // READY CHECK — handles user's affirmative response to greeting
    // ===========================================================================

    const handleReadyCheck = useCallback((text) => {
        if (isAffirmative(text)) {
            console.debug('[NaturalVoice] User confirmed ready:', text);
            userReadyRef.current = true;

            // Stop STT briefly while we speak step 1
            sttRef.current?.stop();

            dispatch({ type: ACTION.USER_READY });

            // Now speak step 1 and activate the full loop
            const conversation = getConversation();
            const tts = getTTS();

            const readyResponse = `Great, let's go!`;
            const stepText = `Step 1 of ${stepsRef.current.length}. ${stepsRef.current[0]}`;

            conversation.addUserMessage(text);
            conversation.addAssistantMessage(`${readyResponse} ${stepText}`);

            tts.enqueue(readyResponse);
            tts.enqueue(stepText);
            tts.flush();

            // Start proactive assistant for step 1
            const proactive = getProactive();
            proactive.processStep(0, stepsRef.current[0]);
            proactive.startTicking();
            proactive.startIdleMonitor();
        } else {
            // Not affirmative — Cheffy gives a gentle nudge
            console.debug('[NaturalVoice] Non-affirmative during greeting wait:', text);

            const conversation = getConversation();
            conversation.addUserMessage(text);

            const nudge = "No rush! Just say yes, start, or let's go when you're ready to begin.";
            conversation.addAssistantMessage(nudge);

            dispatch({
                type: ACTION.LLM_DONE,
                fullText: nudge,
            });

            getTTS().enqueue(nudge);
            getTTS().flush();

            // After nudge finishes, we'll return to WAITING_FOR_READY via the
            // TTS_PLAYBACK_END → stays in WAITING_FOR_READY (not LISTENING)
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

        // Request mic permission
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
        userReadyRef.current = false;

        const conversation = getConversation();
        conversation.updateRecipe({ mealName, steps, ingredients });
        conversation.clear();
        conversation.setCurrentStep(0);

        // ── Dispatch START_SESSION → enters GREETING state (not LISTENING) ──
        dispatch({ type: ACTION.START_SESSION });

        // Pause wake word while session is active
        wakeWordRef.current?.pause();

        // ── Speak ONLY the greeting. Do NOT speak step 1 yet. ──
        const tts = getTTS();
        const greeting = `Hi! I'm Cheffy, and today we're making ${mealName}. ` +
                         `It's ${steps.length} steps. Just say yes when you're ready to start cooking!`;

        conversation.addAssistantMessage(greeting);
        tts.enqueue(greeting);
        tts.flush();

        // ── STT is NOT started here. It starts when greeting TTS finishes ──
        // (see the WAITING_FOR_READY effect below)

    }, [mealName, steps, ingredients, getConversation, getTTS]);

    const stopSession = useCallback(() => {
        isActiveRef.current = false;
        userReadyRef.current = false;
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

        // If user hasn't confirmed ready yet, activate the loop now
        // (they pressed a nav button, so they're clearly ready)
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

    // ── Start STT when greeting finishes (WAITING_FOR_READY) ──
    useEffect(() => {
        if (state.voiceState === VOICE_STATE.WAITING_FOR_READY && isActiveRef.current) {
            const stt = getSTT();
            if (!stt.isListening) {
                stt.start().catch((err) => {
                    console.warn('[NaturalVoice] STT start after greeting failed:', err);
                });
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.voiceState]);

    // ── Auto-listen after TTS ends (normal loop only) ──
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
        // GREETING state: STT stays OFF (no action needed)
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
        isGreeting: state.voiceState === VOICE_STATE.GREETING,
        isWaitingForReady: state.voiceState === VOICE_STATE.WAITING_FOR_READY,
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
