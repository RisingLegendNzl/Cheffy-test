// web/src/utils/intentDetector.js
// =============================================================================
// Voice Cooking — Intent Detector
//
// Maps raw speech transcripts to structured cooking intents.
// Uses fast keyword matching — no LLM call needed.
//
// Supports natural phrasing:
//   "pause" / "hold on" / "wait a moment" → PAUSE
//   "continue" / "go on" / "keep going"   → RESUME
//   "next step" / "what's next"           → NEXT
//   "go back" / "previous step"           → PREVIOUS
//   "repeat that" / "say that again"      → REPEAT
//   "stop" / "exit" / "turn off"          → STOP
//   "ingredients" / "what do I need"      → INGREDIENTS
//   "how long" / "what temperature"       → QUESTION (future)
// =============================================================================

const INTENT_PATTERNS = [
    // --- Navigation ---
    {
        intent: 'NEXT',
        patterns: [
            /\bnext\s*(step)?\b/i,
            /\bwhat('?s| is)\s*next\b/i,
            /\bmove\s*(on|forward)\b/i,
            /\bgo\s*(to\s*)?next\b/i,
            /\bcontinue\s*to\s*next\b/i,
            /\bskip\b/i,
        ],
        priority: 10,
    },
    {
        intent: 'PREVIOUS',
        patterns: [
            /\bprevious\s*(step)?\b/i,
            /\bgo\s*back\b/i,
            /\blast\s*step\b/i,
            /\bbefore\s*that\b/i,
            /\bback\s*(up|one)?\b/i,
        ],
        priority: 10,
    },
    {
        intent: 'REPEAT',
        patterns: [
            /\brepeat\b/i,
            /\bsay\s*(that|it)\s*again\b/i,
            /\bagain\b/i,
            /\bone\s*more\s*time\b/i,
            /\bwhat\s*(was|did)\s*(that|you\s*say)\b/i,
            /\bsorry\b.*\b(what|hear)\b/i,
            /\bpardon\b/i,
        ],
        priority: 8,
    },

    // --- Playback Control ---
    {
        intent: 'PAUSE',
        patterns: [
            /\bpause\b/i,
            /\bhold\s*on\b/i,
            /\bwait\b/i,
            /\bjust\s*a\s*(sec|second|moment|minute)\b/i,
            /\bhang\s*on\b/i,
            /\bone\s*(sec|second|moment|minute)\b/i,
            /\bstop\s*reading\b/i,
        ],
        priority: 9,
    },
    {
        intent: 'RESUME',
        patterns: [
            /\bcontinue\b/i,
            /\bresume\b/i,
            /\bgo\s*(on|ahead)\b/i,
            /\bkeep\s*going\b/i,
            /\bcarry\s*on\b/i,
            /\bi('?m| am)\s*(ready|back|good)\b/i,
            /\bok(ay)?\s*(go|ready|continue)?\b/i,
            /\bstart\s*again\b/i,
        ],
        priority: 9,
    },

    // --- Session Control ---
    {
        intent: 'STOP',
        patterns: [
            /\bstop\b(?!\s*reading)/i,  // "stop" but not "stop reading" (which is PAUSE)
            /\bexit\b/i,
            /\bquit\b/i,
            /\bturn\s*(it\s*)?off\b/i,
            /\bend\s*(voice|cooking|session)?\b/i,
            /\bclose\b/i,
            /\bi('?m| am)\s*done\b/i,
            /\bfinished\b/i,
        ],
        priority: 7,
    },

    // --- Info Requests ---
    {
        intent: 'INGREDIENTS',
        patterns: [
            /\bingredients?\b/i,
            /\bwhat\s*(do\s*)?i\s*need\b/i,
            /\bshopping\s*list\b/i,
            /\bwhat('?s| is)\s*in\s*(this|it)\b/i,
        ],
        priority: 6,
    },
    {
        intent: 'STEP_NUMBER',
        // "go to step 3", "jump to step five"
        patterns: [
            /\b(?:go\s*to|jump\s*to|step)\s*(?:number\s*)?(\d+)\b/i,
        ],
        priority: 10,
        extract: (match) => ({ stepNumber: parseInt(match[1], 10) }),
    },
];

/**
 * Detect intent from a speech transcript.
 *
 * @param {string} transcript - Raw text from speech recognition
 * @returns {{ intent: string, confidence: number, data?: object } | null}
 */
export function detectIntent(transcript) {
    if (!transcript || typeof transcript !== 'string') return null;

    const cleaned = transcript.trim().toLowerCase();
    if (cleaned.length === 0) return null;

    let bestMatch = null;

    for (const rule of INTENT_PATTERNS) {
        for (const pattern of rule.patterns) {
            const match = cleaned.match(pattern);
            if (match) {
                const confidence = _computeConfidence(cleaned, match[0]);
                if (!bestMatch || rule.priority > bestMatch.priority ||
                    (rule.priority === bestMatch.priority && confidence > bestMatch.confidence)) {
                    bestMatch = {
                        intent: rule.intent,
                        confidence,
                        priority: rule.priority,
                        data: rule.extract ? rule.extract(match) : undefined,
                    };
                }
            }
        }
    }

    if (!bestMatch) return null;

    return {
        intent: bestMatch.intent,
        confidence: bestMatch.confidence,
        ...(bestMatch.data && { data: bestMatch.data }),
    };
}

/**
 * Compute confidence based on how much of the transcript the match covers.
 * Short, direct commands get higher confidence than buried keywords.
 */
function _computeConfidence(transcript, matchedText) {
    const ratio = matchedText.length / transcript.length;
    // Direct commands ("next step") get 0.95+
    // Embedded commands ("um, can you go to the next step please") get ~0.5
    return Math.min(0.99, 0.4 + ratio * 0.6);
}

/**
 * Pre-check if a transcript is likely a command vs. ambient noise.
 * Useful for filtering before running full intent detection.
 */
export function isLikelyCommand(transcript) {
    if (!transcript || transcript.trim().length < 2) return false;
    if (transcript.trim().length > 100) return false; // Too long = probably not a command
    return detectIntent(transcript) !== null;
}