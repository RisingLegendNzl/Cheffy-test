// web/src/utils/conversationManager.js
// =============================================================================
// Natural Voice Mode — Conversation Manager
//
// Manages the conversation history for the LLM, including:
// - Sliding window to keep context within token budget
// - Recipe context tracking (current step, ingredients, etc.)
// - System prompt is NOT stored here — it's built server-side
//
// Usage:
//   const manager = new ConversationManager({
//     mealName: 'Spaghetti Carbonara',
//     steps: ['Boil pasta...', 'Cook bacon...', ...],
//     ingredients: [{ key: 'pasta', qty: 400, unit: 'g' }, ...],
//   });
//
//   manager.addUserMessage("What's next?");
//   manager.addAssistantMessage("Sure! Step 2 is to cook the bacon...");
//   manager.setCurrentStep(1);
//
//   const { messages, recipeContext } = manager.getPayload();
//   // → Pass to LLMStream.send(messages, recipeContext)
//
//   manager.clear();   // Reset conversation
//   manager.destroy(); // Full cleanup
// =============================================================================

const MAX_MESSAGES = 20;       // Keep last ~10 turns (20 messages)
const MAX_MESSAGE_LENGTH = 500; // Truncate very long individual messages

export class ConversationManager {
    constructor({ mealName = '', steps = [], ingredients = [] } = {}) {
        this._mealName = mealName;
        this._steps = steps;
        this._ingredients = ingredients;
        this._currentStep = 0;
        this._messages = [];          // [{ role: 'user'|'assistant', content: string }]
        this._destroyed = false;
    }

    // =========================================================================
    // RECIPE CONTEXT
    // =========================================================================

    get currentStep() { return this._currentStep; }
    get totalSteps() { return this._steps.length; }
    get mealName() { return this._mealName; }

    setCurrentStep(index) {
        this._currentStep = Math.max(0, Math.min(index, this._steps.length - 1));
    }

    /**
     * Update recipe data (e.g., if steps change).
     */
    updateRecipe({ mealName, steps, ingredients } = {}) {
        if (mealName !== undefined) this._mealName = mealName;
        if (steps !== undefined) this._steps = steps;
        if (ingredients !== undefined) this._ingredients = ingredients;
    }

    // =========================================================================
    // MESSAGE MANAGEMENT
    // =========================================================================

    /**
     * Add a user message.
     */
    addUserMessage(content) {
        if (this._destroyed || !content?.trim()) return;
        this._addMessage('user', content.trim());
    }

    /**
     * Add an assistant message (the LLM's full response for this turn).
     * Call this AFTER the LLM stream completes.
     */
    addAssistantMessage(content) {
        if (this._destroyed || !content?.trim()) return;

        // Strip action tags from stored message (they're implementation detail)
        const cleaned = content.replace(/\[ACTION:[A-Z_]+(?::\d+)?\]/g, '').trim();
        if (cleaned) {
            this._addMessage('assistant', cleaned);
        }
    }

    /**
     * Add an assistant message for an interrupted response.
     * Stores the partial response so the LLM knows what it already said.
     */
    addPartialAssistantMessage(content) {
        if (this._destroyed || !content?.trim()) return;
        const cleaned = content.replace(/\[ACTION:[A-Z_]+(?::\d+)?\]/g, '').trim();
        if (cleaned) {
            this._addMessage('assistant', `[interrupted] ${cleaned}`);
        }
    }

    /**
     * Get the current messages array and recipe context for the LLM.
     */
    getPayload() {
        return {
            messages: [...this._messages],
            recipeContext: {
                mealName: this._mealName,
                steps: this._steps,
                ingredients: this._ingredients,
                currentStep: this._currentStep,
            },
        };
    }

    /**
     * Get the full conversation history (for UI display).
     */
    getHistory() {
        return [...this._messages];
    }

    /**
     * Get the last N messages.
     */
    getRecentMessages(n = 4) {
        return this._messages.slice(-n);
    }

    /**
     * Clear all messages. Recipe context is preserved.
     */
    clear() {
        this._messages = [];
    }

    /**
     * Full cleanup.
     */
    destroy() {
        this._destroyed = true;
        this._messages = [];
        this._steps = [];
        this._ingredients = [];
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    _addMessage(role, content) {
        // Truncate extremely long messages
        const truncated = content.length > MAX_MESSAGE_LENGTH
            ? content.slice(0, MAX_MESSAGE_LENGTH) + '...'
            : content;

        this._messages.push({ role, content: truncated });

        // Enforce sliding window
        if (this._messages.length > MAX_MESSAGES) {
            // Remove oldest messages (keep the last MAX_MESSAGES)
            const excess = this._messages.length - MAX_MESSAGES;
            this._messages.splice(0, excess);
        }
    }
}

export default ConversationManager;