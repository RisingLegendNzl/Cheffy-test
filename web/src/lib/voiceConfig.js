// web/src/lib/voiceConfig.js
// =============================================================================
// Predefined ElevenLabs voices for the Voice Cooking feature.
// All voices are from ElevenLabs' premade library — warm, clear, and
// well-paced for spoken cooking instructions.
// =============================================================================

export const COOKING_VOICES = [
  {
    name: 'Chef Rachel',
    voice_id: '21m00Tcm4TlvDq8ikWAM',
    description: 'Warm & approachable',
  },
  {
    name: 'Chef Josh',
    voice_id: 'TxGEqnHWrfWFTfGW9XjX',
    description: 'Deep & steady',
  },
  {
    name: 'Chef Bella',
    voice_id: 'EXAVITQu4vr4xnSDxMaL',
    description: 'Friendly & clear',
  },
  {
    name: 'Chef Antoni',
    voice_id: 'ErXwobaYiN019PkySvjV',
    description: 'Confident & crisp',
  },
  {
    name: 'Chef Elli',
    voice_id: 'MF3mGyEYCl7XYWbV9V6O',
    description: 'Bright & energetic',
  },
];

// Default voice — Rachel is used by the existing system so this preserves
// the current behaviour when no voice is explicitly selected.
export const DEFAULT_VOICE_ID = COOKING_VOICES[0].voice_id;
