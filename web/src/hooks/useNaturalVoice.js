// =============================================================================
// PATCH: useNaturalVoice.js v3.3 → v3.4 (ttsMute integration)
//
// Apply these 3 changes to your existing useNaturalVoice.js (v3.3):
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 1: Add import at top (after the ttsClient import)
// ─────────────────────────────────────────────────────────────────────────────
// FIND this line:
//   import { ttsClient } from '../utils/ttsClient';
//
// ADD after it:
//   import { ttsMute } from '../utils/ttsMute';


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 2: Add ttsMute subscription effect
// ─────────────────────────────────────────────────────────────────────────────
// FIND this comment block (in the EFFECTS section):
//   // Auto-recover from errors
//
// ADD this entire effect BEFORE it:

    // ── v3.4: Subscribe to global ttsMute toggle ──
    // When the user flips "Disable Cheffy TTS" in Settings mid-session,
    // immediately interrupt any active TTS playback. STT and LLM continue
    // running so you can hear if a secondary voice is still playing.
    useEffect(() => {
        const unsub = ttsMute.subscribe((muted) => {
            if (muted && ttsRef.current) {
                console.debug('[NaturalVoice] ttsMute activated — interrupting TTS');
                ttsRef.current.interrupt();
                // Manually fire TTS_PLAYBACK_END so state machine transitions to LISTENING
                dispatch({ type: ACTION.TTS_PLAYBACK_END });
            }
        });
        return unsub;
    }, []);


// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 3: Add mute-aware logging to the TTS initialization
// ─────────────────────────────────────────────────────────────────────────────
// FIND this in getTTS():
//   ttsRef.current = new Ctor({
//       onPlaybackStart: () => {
//           if (isActiveRef.current) dispatch({ type: ACTION.TTS_PLAYBACK_START });
//
// CHANGE the onPlaybackStart to:
//       onPlaybackStart: () => {
//           if (isActiveRef.current && !ttsMute.isMuted) dispatch({ type: ACTION.TTS_PLAYBACK_START });

// This prevents the state machine from entering SPEAKING when muted.
// The TTSStreamer/TTSQueue already gate their own enqueue/play,
// but this is defense-in-depth for any edge case timing.
