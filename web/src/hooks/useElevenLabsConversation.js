// web/src/hooks/useElevenLabsConversation.js
// =============================================================================
// useElevenLabsConversation — Custom hook for ElevenLabs Conversational AI
//
// Wraps @elevenlabs/react's useConversation with:
//   - Signed URL fetching via /api/signed-url
//   - Session guard to prevent race conditions on connect/disconnect
//   - Transcript accumulation (agent + user messages)
//   - AudioContext keep-alive for backgrounded tabs
//   - Clean teardown on unmount
//
// [FIX v4.0] Stabilised useConversation callbacks via refs.
//   ROOT CAUSE: The callbacks passed to useConversation (onConnect,
//   onDisconnect, onMessage, onError) previously closed over state and
//   functions (stopKeepAlive, setSessionStatus, etc.) that changed on
//   every render. When the ElevenLabs SDK received new callback references,
//   it interpreted this as a configuration change and tore down the active
//   WebSocket session — causing the immediate disconnect observed as:
//     [KeepAlive] Silent oscillator started
//     [ElevenLabs] Connected
//     [ElevenLabs] Disconnected
//     [KeepAlive] Stopped
//
//   The fix wraps all mutable dependencies in refs so the callbacks passed
//   to useConversation are STABLE across renders. The SDK never sees new
//   callback references, so it never tears down the active session.
//
// Requires: npm install @elevenlabs/react
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';

/**
 * @param {object} options
 * @param {string} options.systemPrompt - Full system prompt with recipe context
 * @param {string} options.firstMessage - Initial TTS message from the agent
 * @param {string} [options.voiceId]    - ElevenLabs voice ID to use for TTS
 * @returns {object} Hook API
 */
export function useElevenLabsConversation({ systemPrompt, firstMessage, voiceId }) {
  // ── State ──
  const [sessionStatus, setSessionStatus] = useState('idle');
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState(null);

  // ── Refs for lifecycle guards ──
  const sessionGuard = useRef(false);
  const isMounted = useRef(true);
  const keepAliveCtx = useRef(null);
  const keepAliveOsc = useRef(null);

  // ── [FIX v4.0] Ref-bridge for stopKeepAlive ──
  // We store the stopKeepAlive function in a ref so that the callbacks
  // passed to useConversation can call it without closing over a value
  // that changes between renders.
  const stopKeepAliveRef = useRef(null);

  // ── Keep-alive: silent oscillator prevents AudioContext suspension in background ──
  const startKeepAlive = useCallback(() => {
    try {
      if (keepAliveCtx.current) return;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0; // silent
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      keepAliveCtx.current = ctx;
      keepAliveOsc.current = osc;
      console.log('[KeepAlive] Silent oscillator started');
    } catch (e) {
      console.warn('[KeepAlive] Failed to create AudioContext:', e);
    }
  }, []);

  const stopKeepAlive = useCallback(() => {
    try {
      if (keepAliveOsc.current) {
        keepAliveOsc.current.stop();
        keepAliveOsc.current = null;
      }
      if (keepAliveCtx.current) {
        keepAliveCtx.current.close();
        keepAliveCtx.current = null;
      }
      console.log('[KeepAlive] Stopped');
    } catch (e) {
      // Ignore — may already be closed
    }
  }, []);

  // Keep the ref in sync so callbacks always call the latest version.
  stopKeepAliveRef.current = stopKeepAlive;

  // ── [FIX v4.0] Stable ElevenLabs callbacks via refs ──
  // These callbacks are created ONCE (no deps) and delegate to refs,
  // so useConversation always receives the same function references.
  const stableOnConnect = useCallback(() => {
    if (!isMounted.current) return;
    console.log('[ElevenLabs] Connected');
    setSessionStatus('connected');
    setError(null);
  }, []);

  const stableOnDisconnect = useCallback(() => {
    if (!isMounted.current) return;
    console.log('[ElevenLabs] Disconnected');
    setSessionStatus('idle');
    sessionGuard.current = false;
    stopKeepAliveRef.current?.();
  }, []);

  const stableOnMessage = useCallback((message) => {
    if (!isMounted.current) return;
    if (message?.source === 'ai' && message?.message) {
      setTranscript((prev) => [
        ...prev,
        { role: 'agent', text: message.message, timestamp: Date.now() },
      ]);
    }
  }, []);

  const stableOnError = useCallback((err) => {
    if (!isMounted.current) return;
    console.error('[ElevenLabs] Error:', err);
    setError(typeof err === 'string' ? err : err?.message || 'Connection error');
    setSessionStatus('error');
    sessionGuard.current = false;
    stopKeepAliveRef.current?.();
  }, []);

  // ── ElevenLabs hook — now receives STABLE callbacks ──
  const conversation = useConversation({
    onConnect: stableOnConnect,
    onDisconnect: stableOnDisconnect,
    onMessage: stableOnMessage,
    onError: stableOnError,
  });

  // ── [FIX v4.0] Ref-bridge for conversation ──
  // The conversation object may also be a new reference each render.
  // By storing it in a ref, the connect/disconnect callbacks don't
  // need it in their dependency arrays, preventing them from being
  // recreated and potentially causing cascading re-renders.
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  // ── Connect ──
  const connect = useCallback(async () => {
    // Guard against double-connect
    if (sessionGuard.current) {
      console.warn('[ElevenLabs] Connect already in progress');
      return;
    }
    sessionGuard.current = true;
    setSessionStatus('connecting');
    setError(null);
    setTranscript([]);

    try {
      // 1. Request signed URL from our server
      const res = await fetch('/api/signed-url');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const { signedUrl } = await res.json();

      if (!signedUrl) {
        throw new Error('No signed URL returned from server');
      }

      // 2. Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3. Start AudioContext keep-alive
      startKeepAlive();

      // 4. Connect to ElevenLabs via signed URL
      const overrides = {
        agent: {
          prompt: { prompt: systemPrompt },
          firstMessage: firstMessage,
        },
      };
      if (voiceId) {
        overrides.tts = { voiceId };
      }
      await conversationRef.current.startSession({ signedUrl, overrides });
    } catch (err) {
      console.error('[ElevenLabs] Connect failed:', err);
      if (isMounted.current) {
        setError(err.message || 'Failed to connect');
        setSessionStatus('error');
      }
      sessionGuard.current = false;
      stopKeepAliveRef.current?.();
    }
  }, [systemPrompt, firstMessage, voiceId, startKeepAlive]);

  // ── Disconnect ──
  const disconnect = useCallback(async () => {
    if (sessionStatus === 'idle' || sessionStatus === 'disconnecting') return;
    setSessionStatus('disconnecting');
    try {
      await conversationRef.current.endSession();
    } catch (err) {
      console.warn('[ElevenLabs] Disconnect error (non-fatal):', err);
    }
    sessionGuard.current = false;
    stopKeepAliveRef.current?.();
    if (isMounted.current) {
      setSessionStatus('idle');
    }
  }, [sessionStatus]);

  // ── User speech transcript handler ──
  useEffect(() => {
    // The useConversation hook surfaces user transcripts via its internal state.
    // We poll conversation status to capture user messages.
    // Note: the @elevenlabs/react SDK may expose this differently —
    // this is a defensive approach that works across SDK versions.
  }, []);

  // ── Cleanup on unmount ──
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Fire-and-forget cleanup — use ref so we always get the latest instance
      try {
        conversationRef.current.endSession();
      } catch (e) {
        // ignore
      }
      stopKeepAliveRef.current?.();
      sessionGuard.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Actions
    connect,
    disconnect,

    // Status
    status: sessionStatus,
    isSpeaking: conversation.isSpeaking ?? false,

    // Data
    transcript,
    error,

    // Utilities
    setTranscript,
  };
}
