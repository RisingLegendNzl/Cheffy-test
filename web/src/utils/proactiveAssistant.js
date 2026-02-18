// web/src/utils/proactiveAssistant.js
// =============================================================================
// Phase 6 — Proactive Cooking Assistant
//
// Monitors recipe steps for time-based cues and proactively prompts the user
// when timers elapse. Integrates into the natural voice loop by injecting
// assistant-initiated messages.
//
// Capabilities:
//   1. Timer extraction: Scans step text for durations (e.g., "cook for 10 minutes")
//   2. Timer scheduling: Sets timeouts that fire proactive voice prompts
//   3. Step-aware context: Knows which step the user is on
//   4. Queue integration: Speaks proactive messages via the TTS pipeline
//   5. Supports pause/resume of all active timers
//
// Timer extraction patterns:
//   "for 10 minutes"          → 600s
//   "about 5-7 mins"          → 360s (uses midpoint)
//   "30 seconds"              → 30s
//   "1 hour"                  → 3600s
//   "let rest for 15 min"     → 900s
//   "bake at 350°F for 25 minutes" → 1500s
//
// Usage:
//   const assistant = new ProactiveAssistant({
//     onProactiveMessage: (msg) => speakAndProcess(msg),
//     onTimerStart:       (timer) => updateUI(timer),
//     onTimerComplete:    (timer) => updateUI(timer),
//   });
//
//   assistant.processStep(2, "Bake for 25 minutes at 350°F");
//   assistant.pause();   // Pauses all timers
//   assistant.resume();  // Resumes all timers
//   assistant.destroy(); // Cleanup
// =============================================================================

// --- Time extraction patterns ---
const TIME_PATTERNS = [
    // "for X minutes", "for X mins", "for X min"
    /(?:for|about|approximately|roughly|around)\s+(\d+)\s*(?:-\s*(\d+)\s*)?(?:minutes?|mins?)/i,
    // "X minutes", standalone
    /(\d+)\s*(?:-\s*(\d+)\s*)?(?:minutes?|mins?)/i,
    // "for X hours"
    /(?:for|about|approximately|roughly|around)\s+(\d+)\s*(?:-\s*(\d+)\s*)?(?:hours?|hrs?)/i,
    // "X hours"
    /(\d+)\s*(?:-\s*(\d+)\s*)?(?:hours?|hrs?)/i,
    // "for X seconds"
    /(?:for|about|approximately|roughly|around)\s+(\d+)\s*(?:-\s*(\d+)\s*)?(?:seconds?|secs?)/i,
    // "X seconds"
    /(\d+)\s*(?:-\s*(\d+)\s*)?(?:seconds?|secs?)/i,
    // "X to Y minutes"
    /(\d+)\s+to\s+(\d+)\s*(?:minutes?|mins?)/i,
];

// Unit multipliers (to seconds)
const UNIT_MAP = {
    minutes: 60, minute: 60, mins: 60, min: 60,
    hours: 3600, hour: 3600, hrs: 3600, hr: 3600,
    seconds: 1, second: 1, secs: 1, sec: 1,
};

// Proactive message templates
const PROACTIVE_MESSAGES = {
    timerComplete: [
        "Hey! Your timer for step {step} is up. {action}",
        "Time's up for step {step}! {action}",
        "Just a heads up — it's been {duration} since step {step}. {action}",
    ],
    timerWarning: [
        "About a minute left on your step {step} timer.",
        "Almost there — your step {step} timer has about a minute remaining.",
    ],
    idle: [
        "How's everything going? Need any help?",
        "Just checking in — everything going smoothly?",
    ],
};

function randomTemplate(key) {
    const arr = PROACTIVE_MESSAGES[key];
    return arr[Math.floor(Math.random() * arr.length)];
}

function formatDuration(seconds) {
    if (seconds >= 3600) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return m > 0 ? `${h} hour${h > 1 ? 's' : ''} and ${m} minute${m > 1 ? 's' : ''}` : `${h} hour${h > 1 ? 's' : ''}`;
    }
    if (seconds >= 60) {
        const m = Math.floor(seconds / 60);
        return `${m} minute${m > 1 ? 's' : ''}`;
    }
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

export class ProactiveAssistant {
    constructor(callbacks = {}) {
        this._onProactiveMessage = callbacks.onProactiveMessage || (() => {});
        this._onTimerStart = callbacks.onTimerStart || (() => {});
        this._onTimerComplete = callbacks.onTimerComplete || (() => {});
        this._onTimerWarning = callbacks.onTimerWarning || (() => {});
        this._onTimerTick = callbacks.onTimerTick || (() => {});

        // Active timers: Map<timerId, TimerState>
        this._timers = new Map();
        this._nextTimerId = 1;
        this._destroyed = false;
        this._paused = false;

        // Idle detection
        this._lastActivityTime = Date.now();
        this._idleCheckInterval = null;
        this._idleThresholdMs = 5 * 60 * 1000; // 5 minutes idle → prompt

        // Tick interval for UI countdown updates
        this._tickInterval = null;
    }

    get activeTimers() {
        const result = [];
        for (const [id, timer] of this._timers) {
            result.push({
                id,
                stepIndex: timer.stepIndex,
                label: timer.label,
                totalSeconds: timer.totalSeconds,
                remainingSeconds: timer.paused
                    ? timer.remainingAtPause
                    : Math.max(0, Math.round((timer.endTime - Date.now()) / 1000)),
                isPaused: timer.paused,
            });
        }
        return result;
    }

    get hasActiveTimers() {
        return this._timers.size > 0;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Process a step's text to extract and start any timers.
     * Call this when the user arrives at a new step.
     *
     * @param {number} stepIndex - Zero-based step index
     * @param {string} stepText  - The step instruction text
     * @returns {Object|null} Timer info if created, null if no timer found
     */
    processStep(stepIndex, stepText) {
        if (this._destroyed || !stepText) return null;

        const extracted = this._extractTime(stepText);
        if (!extracted) return null;

        return this._createTimer(stepIndex, extracted.seconds, extracted.action, stepText);
    }

    /**
     * Record user activity (resets idle timer).
     */
    recordActivity() {
        this._lastActivityTime = Date.now();
    }

    /**
     * Start the idle check interval.
     */
    startIdleMonitor() {
        if (this._idleCheckInterval) return;
        this._lastActivityTime = Date.now();

        this._idleCheckInterval = setInterval(() => {
            if (this._destroyed || this._paused) return;

            const idleMs = Date.now() - this._lastActivityTime;
            if (idleMs >= this._idleThresholdMs) {
                this._lastActivityTime = Date.now(); // Reset to avoid spam
                const msg = randomTemplate('idle');
                this._onProactiveMessage?.(msg);
            }
        }, 60000); // Check every minute
    }

    /**
     * Stop the idle monitor.
     */
    stopIdleMonitor() {
        if (this._idleCheckInterval) {
            clearInterval(this._idleCheckInterval);
            this._idleCheckInterval = null;
        }
    }

    /**
     * Start ticking (1-second interval for UI countdown updates).
     */
    startTicking() {
        if (this._tickInterval) return;
        this._tickInterval = setInterval(() => {
            if (this._destroyed || this._paused) return;
            if (this._timers.size > 0) {
                this._onTimerTick?.(this.activeTimers);
            }
        }, 1000);
    }

    /**
     * Stop the tick interval.
     */
    stopTicking() {
        if (this._tickInterval) {
            clearInterval(this._tickInterval);
            this._tickInterval = null;
        }
    }

    /**
     * Cancel a specific timer.
     */
    cancelTimer(timerId) {
        const timer = this._timers.get(timerId);
        if (!timer) return;

        clearTimeout(timer.mainTimeout);
        if (timer.warningTimeout) clearTimeout(timer.warningTimeout);
        this._timers.delete(timerId);
    }

    /**
     * Pause all active timers (e.g., when voice session is paused).
     */
    pause() {
        this._paused = true;
        const now = Date.now();

        for (const [id, timer] of this._timers) {
            if (!timer.paused) {
                timer.paused = true;
                timer.remainingAtPause = Math.max(0, Math.round((timer.endTime - now) / 1000));
                clearTimeout(timer.mainTimeout);
                if (timer.warningTimeout) clearTimeout(timer.warningTimeout);
            }
        }
    }

    /**
     * Resume all paused timers.
     */
    resume() {
        this._paused = false;
        const now = Date.now();

        for (const [id, timer] of this._timers) {
            if (timer.paused && timer.remainingAtPause > 0) {
                timer.paused = false;
                timer.endTime = now + timer.remainingAtPause * 1000;
                timer.remainingAtPause = 0;

                // Re-schedule completion
                const remaining = timer.endTime - now;
                timer.mainTimeout = setTimeout(() => this._fireTimer(id), remaining);

                // Re-schedule warning if >90s remaining
                if (remaining > 90000) {
                    timer.warningTimeout = setTimeout(
                        () => this._fireWarning(id),
                        remaining - 60000,
                    );
                }
            }
        }
    }

    /**
     * Clear all timers and intervals.
     */
    clear() {
        for (const [id, timer] of this._timers) {
            clearTimeout(timer.mainTimeout);
            if (timer.warningTimeout) clearTimeout(timer.warningTimeout);
        }
        this._timers.clear();
        this.stopIdleMonitor();
        this.stopTicking();
    }

    /**
     * Full cleanup.
     */
    destroy() {
        this._destroyed = true;
        this.clear();
        this._onProactiveMessage = null;
        this._onTimerStart = null;
        this._onTimerComplete = null;
        this._onTimerWarning = null;
        this._onTimerTick = null;
    }

    // =========================================================================
    // INTERNAL — Timer creation & firing
    // =========================================================================

    _createTimer(stepIndex, durationSeconds, action, rawText) {
        const timerId = this._nextTimerId++;
        const now = Date.now();
        const endTime = now + durationSeconds * 1000;

        // Determine the action hint for the completion message
        const actionHint = action || this._inferAction(rawText);

        const timerState = {
            stepIndex,
            totalSeconds: durationSeconds,
            startTime: now,
            endTime,
            label: `Step ${stepIndex + 1}: ${formatDuration(durationSeconds)}`,
            action: actionHint,
            paused: false,
            remainingAtPause: 0,
            mainTimeout: null,
            warningTimeout: null,
        };

        // Schedule completion
        timerState.mainTimeout = setTimeout(
            () => this._fireTimer(timerId),
            durationSeconds * 1000,
        );

        // Schedule 1-minute warning for timers > 90 seconds
        if (durationSeconds > 90) {
            timerState.warningTimeout = setTimeout(
                () => this._fireWarning(timerId),
                (durationSeconds - 60) * 1000,
            );
        }

        this._timers.set(timerId, timerState);

        const timerInfo = {
            id: timerId,
            stepIndex,
            totalSeconds: durationSeconds,
            label: timerState.label,
        };

        this._onTimerStart?.(timerInfo);
        return timerInfo;
    }

    _fireTimer(timerId) {
        const timer = this._timers.get(timerId);
        if (!timer) return;

        this._timers.delete(timerId);

        const msg = randomTemplate('timerComplete')
            .replace('{step}', String(timer.stepIndex + 1))
            .replace('{duration}', formatDuration(timer.totalSeconds))
            .replace('{action}', timer.action || 'Want to move on to the next step?');

        this._onTimerComplete?.({ id: timerId, stepIndex: timer.stepIndex });
        this._onProactiveMessage?.(msg);
    }

    _fireWarning(timerId) {
        const timer = this._timers.get(timerId);
        if (!timer) return;

        const msg = randomTemplate('timerWarning')
            .replace('{step}', String(timer.stepIndex + 1));

        this._onTimerWarning?.({ id: timerId, stepIndex: timer.stepIndex });
        this._onProactiveMessage?.(msg);
    }

    // =========================================================================
    // INTERNAL — Time extraction
    // =========================================================================

    _extractTime(text) {
        for (const pattern of TIME_PATTERNS) {
            const match = text.match(pattern);
            if (match) {
                const unit = this._detectUnit(match[0]);
                const multiplier = UNIT_MAP[unit] || 60;

                const low = parseInt(match[1], 10);
                const high = match[2] ? parseInt(match[2], 10) : null;

                // Use midpoint for ranges
                const value = high ? Math.round((low + high) / 2) : low;
                const seconds = value * multiplier;

                // Sanity check: ignore unreasonable durations (< 5s or > 24h)
                if (seconds < 5 || seconds > 86400) continue;

                // Try to extract what should happen after the timer
                const action = this._extractAction(text, match.index + match[0].length);

                return { seconds, action };
            }
        }
        return null;
    }

    _detectUnit(matchText) {
        const lower = matchText.toLowerCase();
        if (/hours?|hrs?/.test(lower)) return 'hours';
        if (/seconds?|secs?/.test(lower)) return 'seconds';
        return 'minutes'; // default
    }

    _extractAction(text, afterIndex) {
        // Look for phrases after the time that describe what to do next
        const remainder = text.slice(afterIndex).trim();

        const actionPatterns = [
            /(?:until|or until)\s+(.{10,60})/i,
            /(?:then|and then|after that)\s+(.{10,60})/i,
        ];

        for (const p of actionPatterns) {
            const m = remainder.match(p);
            if (m) return m[1].replace(/[.!,;]+$/, '').trim();
        }

        return null;
    }

    _inferAction(rawText) {
        const lower = rawText.toLowerCase();
        if (lower.includes('boil')) return "Check if it's boiling nicely.";
        if (lower.includes('bake') || lower.includes('oven')) return "Check if it's done — a toothpick should come out clean.";
        if (lower.includes('simmer')) return "Give it a stir and check the consistency.";
        if (lower.includes('marinate') || lower.includes('rest')) return "It should be ready to continue now.";
        if (lower.includes('cool') || lower.includes('chill')) return "It should be cool enough to handle now.";
        if (lower.includes('fry') || lower.includes('sauté') || lower.includes('saute')) return "Check if it's golden and cooked through.";
        return "Want to check on it and move to the next step?";
    }
}

export default ProactiveAssistant;
