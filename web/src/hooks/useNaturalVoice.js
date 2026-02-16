// web/src/hooks/useNaturalVoice.js
// =============================================================================
// Natural Voice Mode Hook — Cheffy Voice Cooking v2.0
//
// Full conversational voice loop:
//   listen → transcribe (streaming) → generate (streaming) → speak (streaming)
//   → automatically continue listening → allow interruption
//
// Architecture:
//   - useReducer-based state machine for atomic transitions
//   - Turn ID gating to prevent stale async callbacks
//   - AbortController per turn for clean cancellation
//   - StreamingSTT (Deepgram + Web Speech fallback)
//   - LLMStream (SSE with sentence buffering + action tags)
//   - TTSQueue (sentence-level pipelined playback)
//   - ConversationManager (sliding window context)
//
// State machine:
//   IDLE → LISTENING → PROCESSING → SPEAKING → LISTENING (loop)
//   SPEAKING → INTERRUPTED → PROCESSING (interruption)
//   Any → PAUSED → LISTENING (resume)
//   Any → IDLE (stop)
//   Any → ERROR → LISTENING (auto-recover)
// =============================================================================

import { useReducer, useRef, useCallback, useEffect, useMemo } from 'react';
import { StreamingSTT } from '../utils/streamingSTT';
import { LLMStream } from '../utils/llmStream';
import { TTSQueue } from '../utils/ttsQueue';
import { ConversationManager } from '../utils/conversationManager';

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
};

// =============================================================================
// REDUCER
// =============================================================================

const initialState = {
    voiceState: VOICE_STATE.IDLE,
    currentStep: 0,
    transcript: '',           // Live partial transcript
    lastFinalTranscript: '',  // Last completed utterance
    assistantText: '',        // Currently streaming LLM response
    conversationLog: [],      // [{ role, content, timestamp }] for UI display
    error: null,
    micPermission: 'prompt',  // 'prompt' | 'granted' | 'denied'
    turnId: 0,
    isLLMStreaming: false,
    isTTSPlaying: false,
    sttProvider: null,        // 'deepgram' | 'webspeech' | null
};

function voiceReducer(state, action) {
    switch (action.type) {

        case ACTION.START_SESSION:
            return {
                ...state,
                voiceState: VOICE_STATE.LISTENING,
                currentStep: 0,
                transcript: '',
                lastFinalTranscript: '',
                assistantText: '',
                conversationLog: [],
                error: null,
                turnId: state.turnId + 1,
            };

        case ACTION.SESSION_READY:
            return {
                ...state,
                sttProvider: action.provider || null,
            };

        case ACTION.START_LISTENING:
            return {
                ...state,
                voiceState: VOICE_STATE.LISTENING,
                transcript: '',
                assistantText: '',
            };

        case ACTION.TRANSCRIPT_PARTIAL:
            return {
                ...state,
                transcript: action.text,
            };

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
            return {
                ...state,
                assistantText: action.fullText,
            };

        case ACTION.LLM_DONE:
            return {
                ...state,
                isLLMStreaming: false,
                conversationLog: action.fullText?.trim() ? [
                    ...state.conversationLog,
                    {
                        role: 'assistant',
                        content: action.fullText.replace(/\[ACTION:[A-Z_]+(?::\d+)?\]/g, '').trim(),
                        timestamp: Date.now(),
                    },
                ] : state.conversationLog,
            };

        case ACTION.TTS_PLAYBACK_START:
            return {
                ...state,
                voiceState: VOICE_STATE.SPEAKING,
                isTTSPlaying: true,
            };

        case ACTION.TTS_PLAYBACK_END:
            return {
                ...state,
                isTTSPlaying: false,
                // Transition to LISTENING unless paused or stopped
                voiceState: state.voiceState === VOICE_STATE.SPEAKING
                    ? VOICE_STATE.LISTENING
                    : state.voiceState,
            };

        case ACTION.INTERRUPT:
            return {
                ...state,
                voiceState: VOICE_STATE.INTERRUPTED,
                turnId: state.turnId + 1,
            };

        case ACTION.STEP_CHANGE:
            return {
                ...state,
                currentStep: action.step,
            };

        case ACTION.PAUSE:
            return {
                ...state,
                voiceState: VOICE_STATE.PAUSED,
            };

        case ACTION.RESUME:
            return {
                ...state,
                voiceState: VOICE_STATE.LISTENING,
                turnId: state.turnId + 1,
            };

        case ACTION.STOP:
            return {
                ...initialState,
                micPermission: state.micPermission,
                turnId: state.turnId + 1,
            };

        case ACTION.ERROR:
            return {
                ...state,
                voiceState: VOICE_STATE.ERROR,
                error: action.error,
            };

        case ACTION.CLEAR_ERROR:
            return {
                ...state,
                error: null,
                voiceState: VOICE_STATE.LISTENING,
            };

        case ACTION.SET_MIC_PERMISSION:
            return {
                ...state,
                micPermission: action.permission,
            };

        default:
            return state;
    }
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * @param {Object} options
 * @param {string}   options.mealName    - Name of the recipe
 * @param {string[]} options.steps       - Array of instruction strings
 * @param {Object[]} options.ingredients - Array of ingredient objects
 */
export function useNaturalVoice({ mealName = '', steps = [], ingredients = [] }) {
    const [state, dispatch] = useReducer(voiceReducer, initialState);

    // Refs for accessing state in async callbacks without stale closures
    const stateRef = useRef(state);
    const turnIdRef = useRef(0);
    const isActiveRef = useRef(false);

    // Service instances (created once, reused across turns)
    const sttRef = useRef(null);
    const llmRef = useRef(null);
    const ttsRef = useRef(null);
    const conversationRef = useRef(null);

    // Keep refs in sync
    useEffect(() => {
        stateRef.current = state;
        turnIdRef.current = state.turnId;
    }, [state]);

    // Steps ref for async access
    const stepsRef = useRef(steps);
    useEffect(() => { stepsRef.current = steps; }, [steps]);

    // ===========================================================================
    // SERVICE INITIALIZATION (lazy, once per mount)
    // ===========================================================================

    const getConversation = useCallback(() => {
        if (!conversationRef.current) {
            conversationRef.current = new ConversationManager({
                mealName, steps, ingredients,
            });
        }
        return conversationRef.current;
    }, []); // Intentionally empty — mealName/steps/ingredients updated via ref

    const getTTS = useCallback(() => {
        if (!ttsRef.current) {
            ttsRef.current = new TTSQueue({
                onPlaybackStart: () => {
                    if (!isActiveRef.current) return;
                    dispatch({ type: ACTION.TTS_PLAYBACK_START });
                },
                onPlaybackEnd: () => {
                    if (!isActiveRef.current) return;
                    dispatch({ type: ACTION.TTS_PLAYBACK_END });
                },
                onError: (err) => {
                    console.warn('[NaturalVoice] TTS error:', err);
                },
            });
        }
        return ttsRef.current;
    }, []);

    const getLLM = useCallback(() => {
        if (!llmRef.current) {
            llmRef.current = new LLMStream({
                onSentence: (text) => {
                    if (!isActiveRef.current) return;
                    getTTS().enqueue(text);
                },
                onToken: (token, fullText) => {
                    if (!isActiveRef.current) return;
                    dispatch({ type: ACTION.LLM_TOKEN, fullText });
                },
                onAction: (action) => {
                    if (!isActiveRef.current) return;
                    handleAction(action);
                },
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
                    // Speak error and return to listening
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
                onPartial: (text) => {
                    if (!isActiveRef.current) return;
                    dispatch({ type: ACTION.TRANSCRIPT_PARTIAL, text });
                },
                onFinal: (text) => {
                    if (!isActiveRef.current || !text?.trim()) return;

                    const currentState = stateRef.current.voiceState;

                    // If speaking, this is an interruption
                    if (currentState === VOICE_STATE.SPEAKING ||
                        currentState === VOICE_STATE.PROCESSING) {
                        handleInterruption(text);
                        return;
                    }

                    // Normal: send to LLM
                    if (currentState === VOICE_STATE.LISTENING) {
                        processUtterance(text);
                    }
                },
                onVADStart: () => {
                    if (!isActiveRef.current) return;
                    const currentState = stateRef.current.voiceState;

                    // If we hear voice during speaking, prepare for potential interruption
                    // (actual interruption happens on final transcript)
                },
                onVADEnd: () => {
                    // No-op — we rely on final transcript, not VAD end
                },
                onError: (err) => {
                    if (!isActiveRef.current) return;
                    if (err.fatal) {
                        dispatch({ type: ACTION.ERROR, error: err.message });
                    } else {
                        console.warn('[NaturalVoice] STT error:', err);
                    }
                },
                onStateChange: (sttState) => {
                    if (!isActiveRef.current) return;
                    if (sttState === 'listening') {
                        const provider = sttRef.current?.provider;
                        dispatch({ type: ACTION.SESSION_READY, provider });
                    }
                },
            });
        }
        return sttRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ===========================================================================
    // CORE VOICE LOOP
    // ===========================================================================

    /**
     * Process a final utterance: add to conversation, send to LLM.
     */
    const processUtterance = useCallback((text) => {
        dispatch({ type: ACTION.TRANSCRIPT_FINAL, text });

        const conversation = getConversation();
        conversation.addUserMessage(text);

        const { messages, recipeContext } = conversation.getPayload();
        getLLM().send(messages, recipeContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Handle interruption: user spoke during TTS/LLM.
     */
    const handleInterruption = useCallback((text) => {
        dispatch({ type: ACTION.INTERRUPT });

        // Abort LLM and TTS
        getLLM().abort();
        getTTS().interrupt();

        // Store partial assistant response in context
        const partialResponse = stateRef.current.assistantText;
        if (partialResponse?.trim()) {
            getConversation().addPartialAssistantMessage(partialResponse);
        }

        // Process the interruption as a new utterance
        setTimeout(() => {
            if (isActiveRef.current) {
                processUtterance(text);
            }
        }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processUtterance]);

    /**
     * Handle LLM action tags.
     */
    const handleAction = useCallback((action) => {
        const conversation = getConversation();

        switch (action.type) {
            case 'NEXT': {
                const next = Math.min(conversation.currentStep + 1, stepsRef.current.length - 1);
                conversation.setCurrentStep(next);
                dispatch({ type: ACTION.STEP_CHANGE, step: next });
                break;
            }
            case 'PREV': {
                const prev = Math.max(conversation.currentStep - 1, 0);
                conversation.setCurrentStep(prev);
                dispatch({ type: ACTION.STEP_CHANGE, step: prev });
                break;
            }
            case 'GOTO': {
                if (action.payload !== null) {
                    const target = Math.max(0, Math.min(action.payload - 1, stepsRef.current.length - 1));
                    conversation.setCurrentStep(target);
                    dispatch({ type: ACTION.STEP_CHANGE, step: target });
                }
                break;
            }
            case 'REPEAT': {
                // No step change needed — LLM will re-narrate in its response
                break;
            }
            case 'PAUSE': {
                pauseSession();
                break;
            }
            case 'STOP': {
                // Delay stop so TTS can finish speaking farewell
                setTimeout(() => stopSession(), 2000);
                break;
            }
            case 'INGREDIENTS': {
                // No action needed — LLM will list them in its response
                break;
            }
            default:
                console.debug('[NaturalVoice] Unknown action:', action.type);
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
            dispatch({
                type: ACTION.ERROR,
                error: 'Microphone access is required. Please allow mic access and try again.',
            });
            return;
        }

        // Initialize services
        isActiveRef.current = true;

        const conversation = getConversation();
        conversation.updateRecipe({ mealName, steps, ingredients });
        conversation.clear();
        conversation.setCurrentStep(0);

        dispatch({ type: ACTION.START_SESSION });

        // Speak introduction via TTS
        const tts = getTTS();
        const intro = `Let's cook ${mealName}! I'll guide you through ${steps.length} steps. You can talk to me naturally — ask questions, say next, or just chat. Let's start!`;

        const stepText = `Step 1 of ${steps.length}. ${steps[0]}`;

        // Add intro + first step to conversation context
        conversation.addAssistantMessage(`${intro} ${stepText}`);

        tts.enqueue(intro);
        tts.enqueue(stepText);
        tts.flush();

        // Start STT after a brief delay (let TTS begin first)
        setTimeout(() => {
            if (isActiveRef.current) {
                getSTT().start().catch((err) => {
                    console.error('[NaturalVoice] STT start failed:', err);
                    dispatch({ type: ACTION.ERROR, error: 'Failed to start speech recognition.' });
                });
            }
        }, 500);
    }, [mealName, steps, ingredients, getConversation, getTTS, getSTT]);

    const stopSession = useCallback(() => {
        isActiveRef.current = false;

        // Tear down all services
        sttRef.current?.stop();
        llmRef.current?.abort();
        ttsRef.current?.interrupt();

        dispatch({ type: ACTION.STOP });

        console.debug('[NaturalVoice] Session stopped');
    }, []);

    const pauseSession = useCallback(() => {
        if (!isActiveRef.current) return;

        sttRef.current?.stop();
        llmRef.current?.abort();
        ttsRef.current?.interrupt();

        dispatch({ type: ACTION.PAUSE });
    }, []);

    const resumeSession = useCallback(() => {
        if (stateRef.current.voiceState !== VOICE_STATE.PAUSED) return;

        isActiveRef.current = true;
        dispatch({ type: ACTION.RESUME });

        getSTT().start().catch((err) => {
            console.warn('[NaturalVoice] STT resume failed:', err);
        });
    }, [getSTT]);

    // ===========================================================================
    // MANUAL NAVIGATION (from UI buttons)
    // ===========================================================================

    const goToStep = useCallback((stepIndex) => {
        if (!isActiveRef.current) return;

        const clamped = Math.max(0, Math.min(stepIndex, stepsRef.current.length - 1));
        const conversation = getConversation();
        conversation.setCurrentStep(clamped);
        dispatch({ type: ACTION.STEP_CHANGE, step: clamped });

        // Interrupt current output and speak new step
        getLLM().abort();
        getTTS().interrupt();

        const stepText = `Step ${clamped + 1} of ${stepsRef.current.length}. ${stepsRef.current[clamped]}`;
        conversation.addAssistantMessage(stepText);

        getTTS().enqueue(stepText);
        getTTS().flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const nextStep = useCallback(() => {
        goToStep((stateRef.current.currentStep || 0) + 1);
    }, [goToStep]);

    const prevStep = useCallback(() => {
        goToStep((stateRef.current.currentStep || 0) - 1);
    }, [goToStep]);

    // ===========================================================================
    // AUTO-LISTEN after TTS ends
    // ===========================================================================

    useEffect(() => {
        // When TTS finishes and we transition to LISTENING, ensure STT is running
        if (state.voiceState === VOICE_STATE.LISTENING && isActiveRef.current) {
            const stt = sttRef.current;
            if (stt && !stt.isListening) {
                stt.start().catch((err) => {
                    console.warn('[NaturalVoice] Auto-listen STT start failed:', err);
                });
            }
        }

        // When entering PAUSED or IDLE, ensure STT is stopped
        if (state.voiceState === VOICE_STATE.PAUSED || state.voiceState === VOICE_STATE.IDLE) {
            sttRef.current?.stop();
        }
    }, [state.voiceState]);

    // ===========================================================================
    // AUTO-RECOVER from errors
    // ===========================================================================

    useEffect(() => {
        if (state.voiceState === VOICE_STATE.ERROR && isActiveRef.current) {
            const timer = setTimeout(() => {
                if (isActiveRef.current && stateRef.current.voiceState === VOICE_STATE.ERROR) {
                    dispatch({ type: ACTION.CLEAR_ERROR });
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [state.voiceState]);

    // ===========================================================================
    // CLEANUP ON UNMOUNT
    // ===========================================================================

    useEffect(() => {
        return () => {
            console.debug('[NaturalVoice] Unmount — full cleanup');
            isActiveRef.current = false;

            sttRef.current?.destroy();
            llmRef.current?.destroy();
            ttsRef.current?.destroy();
            conversationRef.current?.destroy();

            sttRef.current = null;
            llmRef.current = null;
            ttsRef.current = null;
            conversationRef.current = null;
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

        // Actions
        start: startSession,
        stop: stopSession,
        pause: pauseSession,
        resume: resumeSession,
        nextStep,
        prevStep,
        goToStep,

        // Constants
        VOICE_STATE,
    }), [
        state,
        steps.length,
        startSession,
        stopSession,
        pauseSession,
        resumeSession,
        nextStep,
        prevStep,
        goToStep,
    ]);
}

/**
 * Check if Natural Voice Mode is supported in this browser.
 */
export function isNaturalVoiceSupported() {
    const hasSpeechRecognition = typeof window !== 'undefined' &&
        (window.SpeechRecognition || window.webkitSpeechRecognition);
    const hasAudio = typeof Audio !== 'undefined';
    const hasMediaDevices = typeof navigator?.mediaDevices?.getUserMedia === 'function';

    return (!!hasSpeechRecognition || hasMediaDevices) && hasAudio;
}

export default useNaturalVoice;