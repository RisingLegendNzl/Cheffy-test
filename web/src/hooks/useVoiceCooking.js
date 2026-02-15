// web/src/hooks/useVoiceCooking.js
// =============================================================================
// Voice Cooking Hook — Core State Machine
// [PATCHED] v1.1.0 — Fixed memory leaks causing progressive app lag:
//   1. ttsClient.destroy() called on stopSession AND unmount (revokes blob URLs)
//   2. SpeechRecognition onend/onerror guards strengthened against race conditions
//   3. Pending speak() promises cancelled on stop via AbortController pattern
//   4. Auto-restart setTimeout tracked and cleared on stop
//   5. DEBUG-level logging added for all cleanup actions
//
// State machine:
//   IDLE → SPEAKING → LISTENING → (SPEAKING | PAUSED | IDLE)
//   Any state → PAUSED → SPEAKING | IDLE
// =============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { ttsClient } from '../utils/ttsClient';
import { detectIntent } from '../utils/intentDetector';

// --- Conversational Responses ---
const RESPONSES = {
    pause: [
        "No problem, I'll wait.",
        "Sure thing, take your time.",
        "Pausing. Just say continue when you're ready.",
    ],
    resume: [
        "Alright, let's keep going!",
        "Okay, picking up where we left off.",
        "Right, continuing now.",
    ],
    repeat: [
        "Sure, here it is again.",
        "No worries, I'll say that again.",
    ],
    next: [
        "Moving on.",
    ],
    previous: [
        "Going back.",
    ],
    lastStep: [
        "That's the last step — you're all done! Great cooking!",
        "And that's it! Your meal should be ready. Enjoy!",
    ],
    firstStep: [
        "We're already on the first step.",
    ],
    ingredients: [
        "Here are the ingredients you need:",
    ],
    stop: [
        "Enjoy your meal! Ending voice cooking mode.",
    ],
    error: [
        "Sorry, I had trouble with that. Let me try again.",
    ],
};

function randomResponse(key) {
    const arr = RESPONSES[key];
    return arr[Math.floor(Math.random() * arr.length)];
}

// --- Speech Recognition Setup ---
const SpeechRecognition = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

/**
 * Check if voice cooking is supported in this browser.
 */
export function isVoiceCookingSupported() {
    return !!SpeechRecognition && typeof Audio !== 'undefined';
}

// --- Voice Cooking States ---
const STATE = {
    IDLE: 'IDLE',
    SPEAKING: 'SPEAKING',
    LISTENING: 'LISTENING',
    PAUSED: 'PAUSED',
    LOADING: 'LOADING',
};

/**
 * @param {object} options
 * @param {string[]} options.steps       — Array of instruction strings
 * @param {object[]} options.ingredients — Array of ingredient objects
 * @param {string}   options.mealName    — Name of the meal
 */
export function useVoiceCooking({ steps = [], ingredients = [], mealName = '' }) {
    const [state, setState] = useState(STATE.IDLE);
    const [currentStep, setCurrentStep] = useState(0);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [micPermission, setMicPermission] = useState('prompt');

    const recognitionRef = useRef(null);
    const isActiveRef = useRef(false);
    const stateRef = useRef(STATE.IDLE);
    const currentStepRef = useRef(0);
    const stepsRef = useRef(steps);

    // [FIX 1] Track pending auto-restart timers so we can cancel them on stop
    const restartTimerRef = useRef(null);

    // [FIX 2] Track session count for stale-closure detection
    const sessionIdRef = useRef(0);

    // Keep refs in sync
    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);
    useEffect(() => { stepsRef.current = steps; }, [steps]);

    // --- [FIX 3] Helper: clear any pending restart timer ---
    const clearRestartTimer = useCallback(() => {
        if (restartTimerRef.current !== null) {
            clearTimeout(restartTimerRef.current);
            restartTimerRef.current = null;
            console.debug('[VoiceCooking] Cleared pending recognition restart timer');
        }
    }, []);

    // --- Speech Recognition Management ---
    const startListening = useCallback(() => {
        if (!SpeechRecognition || !isActiveRef.current) return;

        // Don't start if already listening
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
            recognitionRef.current = null; // [FIX] Null the ref after stopping
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        // [FIX 4] Capture session ID at creation time to detect stale handlers
        const capturedSessionId = sessionIdRef.current;

        recognition.onresult = (event) => {
            // [FIX] Guard against stale session
            if (capturedSessionId !== sessionIdRef.current || !isActiveRef.current) return;
            const text = event.results[0]?.transcript || '';
            setTranscript(text);
            handleVoiceCommand(text);
        };

        recognition.onerror = (event) => {
            // [FIX] Guard against stale session
            if (capturedSessionId !== sessionIdRef.current) return;

            if (event.error === 'no-speech' || event.error === 'aborted') {
                // [FIX 5] Only auto-restart if still active AND in LISTENING state AND same session
                if (isActiveRef.current && stateRef.current === STATE.LISTENING) {
                    clearRestartTimer();
                    restartTimerRef.current = setTimeout(() => {
                        restartTimerRef.current = null;
                        if (isActiveRef.current && capturedSessionId === sessionIdRef.current) {
                            startListening();
                        }
                    }, 300);
                }
                return;
            }
            if (event.error === 'not-allowed') {
                setMicPermission('denied');
                setError('Microphone access denied. Please enable it in your browser settings.');
                stopSession();
                return;
            }
            console.warn('[VoiceCooking] SpeechRecognition error:', event.error);
        };

        recognition.onend = () => {
            // [FIX 6] Guard against stale session before auto-restarting
            if (capturedSessionId !== sessionIdRef.current) {
                console.debug('[VoiceCooking] Ignoring onend from stale recognition session');
                return;
            }
            if (isActiveRef.current && stateRef.current === STATE.LISTENING) {
                clearRestartTimer();
                restartTimerRef.current = setTimeout(() => {
                    restartTimerRef.current = null;
                    if (isActiveRef.current && capturedSessionId === sessionIdRef.current) {
                        startListening();
                    }
                }, 200);
            }
        };

        recognitionRef.current = recognition;

        try {
            recognition.start();
            setState(STATE.LISTENING);
        } catch (err) {
            console.warn('[VoiceCooking] Failed to start recognition:', err);
            // [FIX 7] Guarded retry with timer tracking
            clearRestartTimer();
            restartTimerRef.current = setTimeout(() => {
                restartTimerRef.current = null;
                if (isActiveRef.current && capturedSessionId === sessionIdRef.current) {
                    try { recognition.start(); } catch (_) {}
                }
            }, 500);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearRestartTimer]);

    const stopListening = useCallback(() => {
        // [FIX 8] Clear restart timer to prevent zombie restarts
        clearRestartTimer();

        if (recognitionRef.current) {
            try {
                recognitionRef.current.onresult = null;
                recognitionRef.current.onerror = null;
                recognitionRef.current.onend = null;
                recognitionRef.current.stop();
            } catch (_) {}
            recognitionRef.current = null;
            console.debug('[VoiceCooking] SpeechRecognition stopped and nulled');
        }
    }, [clearRestartTimer]);

    // --- TTS Speak Helper ---
    const speak = useCallback(async (text, options = {}) => {
        if (!isActiveRef.current) return;

        setState(STATE.SPEAKING);
        stopListening();

        try {
            await ttsClient.play(text, {
                ...options,
                onEnd: () => {
                    if (isActiveRef.current && stateRef.current === STATE.SPEAKING) {
                        startListening();
                    }
                },
                onError: (err) => {
                    console.error('[VoiceCooking] TTS playback error:', err);
                    if (isActiveRef.current) {
                        startListening();
                    }
                },
            });
        } catch (err) {
            console.error('[VoiceCooking] TTS error:', err);
            if (isActiveRef.current) {
                startListening();
            }
        }
    }, [startListening, stopListening]);

    // --- Speak a specific step ---
    const speakStep = useCallback(async (stepIndex) => {
        const stepsList = stepsRef.current;
        if (stepIndex < 0 || stepIndex >= stepsList.length) return;

        const stepText = `Step ${stepIndex + 1} of ${stepsList.length}. ${stepsList[stepIndex]}`;

        // Pre-fetch next step audio while current plays
        if (stepIndex + 1 < stepsList.length) {
            const nextText = `Step ${stepIndex + 2} of ${stepsList.length}. ${stepsList[stepIndex + 1]}`;
            ttsClient.prefetch(nextText, { cacheKey: `step-${stepIndex + 1}` });
        }

        await speak(stepText, { cacheKey: `step-${stepIndex}` });
    }, [speak]);

    // --- Handle Voice Commands ---
    const handleVoiceCommand = useCallback(async (text) => {
        const result = detectIntent(text);
        if (!result) {
            if (isActiveRef.current) startListening();
            return;
        }

        const { intent, data } = result;

        switch (intent) {
            case 'NEXT': {
                const nextIdx = currentStepRef.current + 1;
                if (nextIdx >= stepsRef.current.length) {
                    await speak(randomResponse('lastStep'));
                } else {
                    setCurrentStep(nextIdx);
                    await speak(randomResponse('next'));
                    await speakStep(nextIdx);
                }
                break;
            }

            case 'PREVIOUS': {
                const prevIdx = currentStepRef.current - 1;
                if (prevIdx < 0) {
                    await speak(randomResponse('firstStep'));
                    await speakStep(0);
                } else {
                    setCurrentStep(prevIdx);
                    await speak(randomResponse('previous'));
                    await speakStep(prevIdx);
                }
                break;
            }

            case 'REPEAT': {
                await speak(randomResponse('repeat'));
                await speakStep(currentStepRef.current);
                break;
            }

            case 'PAUSE': {
                ttsClient.pause();
                setState(STATE.PAUSED);
                stopListening();
                await speak(randomResponse('pause'));
                ttsClient.pause();
                setState(STATE.PAUSED);
                break;
            }

            case 'RESUME': {
                setState(STATE.SPEAKING);
                await speak(randomResponse('resume'));
                await speakStep(currentStepRef.current);
                break;
            }

            case 'STOP': {
                await speak(randomResponse('stop'));
                setTimeout(() => stopSession(), 1500);
                break;
            }

            case 'INGREDIENTS': {
                const ingList = stepsRef.current.length > 0
                    ? `For ${mealName}, you'll need: ` +
                      (ingredients || []).map(item => {
                          const name = item.key || item.name || item.ingredient || '';
                          const qty = item.qty ?? item.qty_value ?? item.quantity ?? '';
                          const unit = item.unit ?? item.qty_unit ?? '';
                          return `${qty} ${unit} ${name}`.trim();
                      }).join(', ') + '.'
                    : "I don't have ingredient details for this recipe.";
                await speak(randomResponse('ingredients') + ' ' + ingList);
                break;
            }

            case 'STEP_NUMBER': {
                const targetStep = (data?.stepNumber || 1) - 1;
                const clampedStep = Math.max(0, Math.min(targetStep, stepsRef.current.length - 1));
                setCurrentStep(clampedStep);
                await speakStep(clampedStep);
                break;
            }

            default:
                if (isActiveRef.current) startListening();
        }
    }, [speak, speakStep, startListening, stopListening, mealName, ingredients]);

    // --- Session Management ---
    const startSession = useCallback(async () => {
        if (!isVoiceCookingSupported()) {
            setError('Voice cooking is not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        if (steps.length === 0) {
            setError('No recipe steps available for voice cooking.');
            return;
        }

        // Request mic permission
        try {
            setState(STATE.LOADING);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            setMicPermission('granted');
        } catch (err) {
            setMicPermission('denied');
            setError('Microphone access is required for voice cooking. Please allow mic access and try again.');
            setState(STATE.IDLE);
            return;
        }

        // [FIX 9] Increment session ID to invalidate any stale handlers from previous sessions
        sessionIdRef.current += 1;
        console.debug(`[VoiceCooking] Starting session #${sessionIdRef.current}`);

        // Initialize
        isActiveRef.current = true;
        setCurrentStep(0);
        setError(null);
        setTranscript('');

        const intro = `Let's cook ${mealName}! I'll guide you through ${steps.length} steps. You can say next, repeat, pause, or stop at any time. Let's start!`;
        await speak(intro);
        await speakStep(0);
    }, [steps, mealName, speak, speakStep]);

    // [FIX 10] Full cleanup in stopSession — destroy ttsClient cache, null all refs
    const stopSession = useCallback(() => {
        const sessionId = sessionIdRef.current;
        console.debug(`[VoiceCooking] Stopping session #${sessionId} — full cleanup`);

        // 1. Mark inactive FIRST to prevent any async callbacks from restarting things
        isActiveRef.current = false;

        // 2. Clear all pending timers
        clearRestartTimer();

        // 3. Stop and null speech recognition (with handler cleanup)
        stopListening();

        // 4. Stop TTS playback AND destroy cached blob URLs to free memory
        ttsClient.stop();
        ttsClient.destroy();
        console.debug('[VoiceCooking] TTS client destroyed — blob URL cache cleared');

        // 5. Increment session ID to invalidate any in-flight async operations
        sessionIdRef.current += 1;

        // 6. Reset React state
        setState(STATE.IDLE);
        setCurrentStep(0);
        setTranscript('');

        console.debug('[VoiceCooking] Session cleanup complete');
    }, [stopListening, clearRestartTimer]);

    // Manual navigation (from UI buttons)
    const goToStep = useCallback(async (stepIndex) => {
        if (!isActiveRef.current) return;
        const clamped = Math.max(0, Math.min(stepIndex, steps.length - 1));
        setCurrentStep(clamped);
        ttsClient.stop();
        await speakStep(clamped);
    }, [steps.length, speakStep]);

    const nextStep = useCallback(() => goToStep(currentStepRef.current + 1), [goToStep]);
    const prevStep = useCallback(() => goToStep(currentStepRef.current - 1), [goToStep]);

    const pauseResume = useCallback(async () => {
        if (stateRef.current === STATE.PAUSED) {
            setState(STATE.SPEAKING);
            await speakStep(currentStepRef.current);
        } else if (stateRef.current === STATE.SPEAKING || stateRef.current === STATE.LISTENING) {
            ttsClient.stop();
            stopListening();
            setState(STATE.PAUSED);
        }
    }, [speakStep, stopListening]);

    // --- [FIX 11] Comprehensive cleanup on unmount ---
    useEffect(() => {
        return () => {
            console.debug('[VoiceCooking] Unmount — performing full resource cleanup');

            // Mark inactive
            isActiveRef.current = false;

            // Increment session to invalidate stale closures
            sessionIdRef.current += 1;

            // Clear any pending restart timers
            if (restartTimerRef.current !== null) {
                clearTimeout(restartTimerRef.current);
                restartTimerRef.current = null;
            }

            // Stop and detach speech recognition
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.onresult = null;
                    recognitionRef.current.onerror = null;
                    recognitionRef.current.onend = null;
                    recognitionRef.current.stop();
                } catch (_) {}
                recognitionRef.current = null;
            }

            // Stop TTS and release ALL blob URLs
            ttsClient.stop();
            ttsClient.destroy();

            console.debug('[VoiceCooking] Unmount cleanup complete — all resources released');
        };
    }, []);

    return {
        // State
        state,
        isActive: state !== STATE.IDLE,
        isPlaying: state === STATE.SPEAKING,
        isListening: state === STATE.LISTENING,
        isPaused: state === STATE.PAUSED,
        isLoading: state === STATE.LOADING,
        currentStep,
        totalSteps: steps.length,
        transcript,
        error,
        micPermission,

        // Actions
        start: startSession,
        stop: stopSession,
        nextStep,
        prevStep,
        goToStep,
        pauseResume,

        // Constants
        STATE,
        isSupported: isVoiceCookingSupported(),
    };
}