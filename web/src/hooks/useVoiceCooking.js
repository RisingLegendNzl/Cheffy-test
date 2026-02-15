// web/src/hooks/useVoiceCooking.js
// =============================================================================
// Voice Cooking Hook — Core State Machine
//
// Orchestrates:
// - Speech recognition (Web Speech API)
// - Text-to-speech (OpenAI via ttsClient)
// - Intent detection (keyword matching)
// - Step navigation
// - Conversational responses
// - Graceful degradation
//
// State machine:
//   IDLE → SPEAKING → LISTENING → (SPEAKING | PAUSED | IDLE)
//   Any state → PAUSED → SPEAKING | IDLE
//
// Usage:
//   const vc = useVoiceCooking({ steps, ingredients, mealName });
//   vc.start()    — Begin voice cooking from step 1
//   vc.stop()     — End session
//   vc.isActive   — Whether a session is running
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
    const [micPermission, setMicPermission] = useState('prompt'); // 'prompt' | 'granted' | 'denied'

    const recognitionRef = useRef(null);
    const isActiveRef = useRef(false);
    const stateRef = useRef(STATE.IDLE);
    const currentStepRef = useRef(0);
    const stepsRef = useRef(steps);

    // Keep refs in sync
    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);
    useEffect(() => { stepsRef.current = steps; }, [steps]);

    // --- Speech Recognition Management ---
    const startListening = useCallback(() => {
        if (!SpeechRecognition || !isActiveRef.current) return;

        // Don't start if already listening
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const text = event.results[0]?.[0]?.transcript || '';
            setTranscript(text);
            handleVoiceCommand(text);
        };

        recognition.onerror = (event) => {
            // 'no-speech' and 'aborted' are normal — just restart listening
            if (event.error === 'no-speech' || event.error === 'aborted') {
                if (isActiveRef.current && stateRef.current === STATE.LISTENING) {
                    setTimeout(() => startListening(), 300);
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
            // Auto-restart listening if we're still in listening state
            if (isActiveRef.current && stateRef.current === STATE.LISTENING) {
                setTimeout(() => startListening(), 200);
            }
        };

        recognitionRef.current = recognition;

        try {
            recognition.start();
            setState(STATE.LISTENING);
        } catch (err) {
            console.warn('[VoiceCooking] Failed to start recognition:', err);
            // Retry once after a short delay
            setTimeout(() => {
                if (isActiveRef.current) {
                    try { recognition.start(); } catch (_) {}
                }
            }, 500);
        }
    }, []);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
            recognitionRef.current = null;
        }
    }, []);

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
                    // Fall back to listening even if TTS fails
                    if (isActiveRef.current) {
                        startListening();
                    }
                },
            });
        } catch (err) {
            console.error('[VoiceCooking] TTS error:', err);
            // If TTS fails entirely, still transition to listening
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
            // Unrecognized — go back to listening
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
                // Speak the pause response, then go silent
                await speak(randomResponse('pause'));
                ttsClient.pause(); // Ensure we're paused after the response
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
            stream.getTracks().forEach(t => t.stop()); // Release immediately
            setMicPermission('granted');
        } catch (err) {
            setMicPermission('denied');
            setError('Microphone access is required for voice cooking. Please allow mic access and try again.');
            setState(STATE.IDLE);
            return;
        }

        // Initialize
        isActiveRef.current = true;
        setCurrentStep(0);
        setError(null);
        setTranscript('');

        // Intro message
        const intro = `Let's cook ${mealName}! I'll guide you through ${steps.length} steps. You can say next, repeat, pause, or stop at any time. Let's start!`;
        await speak(intro);
        await speakStep(0);
    }, [steps, mealName, speak, speakStep]);

    const stopSession = useCallback(() => {
        isActiveRef.current = false;
        stopListening();
        ttsClient.stop();
        setState(STATE.IDLE);
        setCurrentStep(0);
        setTranscript('');
    }, [stopListening]);

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

    // --- Cleanup on unmount ---
    useEffect(() => {
        return () => {
            isActiveRef.current = false;
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (_) {}
            }
            ttsClient.stop();
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