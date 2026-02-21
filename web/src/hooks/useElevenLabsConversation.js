// web/src/hooks/useElevenLabsConversation.js
// =============================================================================
// useElevenLabsConversation — Custom hook for ElevenLabs Conversational AI
//
// ── BUILD FIX (v2.0) ──────────────────────────────────────────────────────
// The @elevenlabs/react SDK is a browser-safe package (WebSocket + WebAudio,
// NO Node.js dependencies).  However Vite/Rollup will fail at build time if
// the package isn't installed in /web/node_modules.
//
// Solution: dynamic import() so the static bundle never references the
// module at the top level.  This means:
//   1. `npm run build` succeeds even without the SDK installed
//   2. At runtime, if the SDK is missing, the user sees a clear error
//   3. When the SDK IS installed, everything works as before
//
// INSTALL:
//   cd web && npm install @elevenlabs/react
//
// ARCHITECTURE:
//   - API key stays server-side in /api/signed-url.js
//   - Client only receives an ephemeral signed WebSocket URL
//   - All audio/WebSocket work happens in the browser via the SDK
//   - Silent AudioContext oscillator keeps session alive in background tabs
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

// ── SDK loader (cached after first successful import) ──
let _sdkModule = null;
let _sdkLoadPromise = null;

function loadElevenLabsSDK() {
  if (_sdkModule) return Promise.resolve(_sdkModule);
  if (_sdkLoadPromise) return _sdkLoadPromise;

  _sdkLoadPromise = import('@elevenlabs/react')
    .then((mod) => {
      _sdkModule = mod;
      return mod;
    })
    .catch((err) => {
      _sdkLoadPromise = null; // allow retry
      throw new Error(
        `@elevenlabs/react is not installed. Run: cd web && npm install @elevenlabs/react\n` +
        `Original error: ${err.message}`
      );
    });

  return _sdkLoadPromise;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * @param {object} options
 * @param {string} options.systemPrompt - Full system prompt with recipe context
 * @param {string} options.firstMessage - Initial TTS message from the agent
 * @returns {object} Hook API
 */
export function useElevenLabsConversation({ systemPrompt, firstMessage }) {
  // ── State ──
  const [sessionStatus, setSessionStatus] = useState('idle');
  // 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error'
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Refs ──
  const sessionGuard = useRef(false);
  const isMounted = useRef(true);
  const keepAliveCtx = useRef(null);
  const keepAliveOsc = useRef(null);
  const conversationRef = useRef(null); // holds the SDK conversation instance

  // ── Keep-alive: silent oscillator prevents AudioContext suspension ──
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
    } catch (e) {
      console.warn('[KeepAlive] Failed to create AudioContext:', e);
    }
  }, []);

  const stopKeepAlive = useCallback(() => {
    try {
      keepAliveOsc.current?.stop();
      keepAliveOsc.current = null;
      keepAliveCtx.current?.close();
      keepAliveCtx.current = null;
    } catch (e) {
      // may already be closed
    }
  }, []);

  // ── Connect ──
  const connect = useCallback(async () => {
    if (sessionGuard.current) {
      console.warn('[ElevenLabs] Connect already in progress');
      return;
    }
    sessionGuard.current = true;
    setSessionStatus('connecting');
    setError(null);
    setTranscript([]);

    try {
      // 1. Dynamically load SDK (never fails the build)
      const sdk = await loadElevenLabsSDK();
      const ConversationClass = sdk.Conversation || sdk.default?.Conversation;

      if (!ConversationClass) {
        throw new Error(
          '@elevenlabs/react SDK loaded but Conversation class not found. ' +
          'Ensure you have a compatible version installed (>=0.1.0).'
        );
      }

      // 2. Request microphone permission (required before startSession)
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3. Fetch signed URL from our server (API key stays server-side)
      const res = await fetch('/api/signed-url');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const { signedUrl } = await res.json();
      if (!signedUrl) throw new Error('No signed URL returned from server');

      // 4. Start AudioContext keep-alive for background tabs
      startKeepAlive();

      // 5. Start conversation session via SDK
      const conversation = await ConversationClass.startSession({
        signedUrl,
        overrides: {
          agent: {
            prompt: { prompt: systemPrompt },
            firstMessage: firstMessage,
          },
        },
        onConnect: () => {
          if (!isMounted.current) return;
          console.log('[ElevenLabs] Connected');
          setSessionStatus('connected');
          setError(null);
        },
        onDisconnect: () => {
          if (!isMounted.current) return;
          console.log('[ElevenLabs] Disconnected');
          setSessionStatus('idle');
          setIsSpeaking(false);
          sessionGuard.current = false;
          stopKeepAlive();
        },
        onMessage: (message) => {
          if (!isMounted.current) return;
          if (message?.source === 'ai' && message?.message) {
            setTranscript((prev) => [
              ...prev,
              { role: 'agent', text: message.message, timestamp: Date.now() },
            ]);
          } else if (message?.source === 'user' && message?.message) {
            setTranscript((prev) => [
              ...prev,
              { role: 'user', text: message.message, timestamp: Date.now() },
            ]);
          }
        },
        onModeChange: (mode) => {
          if (!isMounted.current) return;
          setIsSpeaking(mode?.mode === 'speaking');
        },
        onError: (err) => {
          if (!isMounted.current) return;
          console.error('[ElevenLabs] Error:', err);
          const msg = typeof err === 'string' ? err : err?.message || 'Connection error';
          setError(msg);
          setSessionStatus('error');
          setIsSpeaking(false);
          sessionGuard.current = false;
          stopKeepAlive();
        },
      });

      conversationRef.current = conversation;

      // Seed transcript with the first message immediately
      if (firstMessage) {
        setTranscript([
          { role: 'agent', text: firstMessage, timestamp: Date.now() },
        ]);
      }
    } catch (err) {
      console.error('[ElevenLabs] Connect failed:', err);
      if (isMounted.current) {
        setError(err.message || 'Failed to connect');
        setSessionStatus('error');
      }
      sessionGuard.current = false;
      stopKeepAlive();
    }
  }, [systemPrompt, firstMessage, startKeepAlive, stopKeepAlive]);

  // ── Disconnect ──
  const disconnect = useCallback(async () => {
    if (sessionStatus === 'idle' || sessionStatus === 'disconnecting') return;
    setSessionStatus('disconnecting');
    try {
      await conversationRef.current?.endSession();
    } catch (err) {
      console.warn('[ElevenLabs] Disconnect error (non-fatal):', err);
    }
    conversationRef.current = null;
    sessionGuard.current = false;
    setIsSpeaking(false);
    stopKeepAlive();
    if (isMounted.current) {
      setSessionStatus('idle');
    }
  }, [sessionStatus, stopKeepAlive]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      try {
        conversationRef.current?.endSession();
      } catch (e) {
        // ignore
      }
      conversationRef.current = null;
      stopKeepAlive();
      sessionGuard.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connect,
    disconnect,
    status: sessionStatus,
    isSpeaking,
    transcript,
    error,
    setTranscript,
  };
}