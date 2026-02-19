// web/src/lib/recipe.js
// =============================================================================
// Recipe data helper for Voice Cooking
//
// In production, the meal object from the plan is passed directly.
// This module provides:
//   - A demo recipe for testing without a plan loaded
//   - A formatter that converts any Cheffy meal object into the prompt
//     context string that the ElevenLabs agent needs
// =============================================================================

/**
 * Demo recipe used when no meal is provided (e.g. direct /voice navigation).
 */
export const DEMO_RECIPE = {
  name: 'Lemon Herb Chicken with Roasted Vegetables',
  description:
    'Juicy roasted chicken thighs with a bright lemon-herb marinade, served alongside tender seasonal vegetables.',
  items: [
    { key: 'chicken thighs', qty_value: 600, qty_unit: 'g' },
    { key: 'lemon', qty_value: 2, qty_unit: '' },
    { key: 'garlic cloves', qty_value: 4, qty_unit: '' },
    { key: 'olive oil', qty_value: 30, qty_unit: 'ml' },
    { key: 'dried oregano', qty_value: 1, qty_unit: 'tsp' },
    { key: 'dried thyme', qty_value: 1, qty_unit: 'tsp' },
    { key: 'sweet potato', qty_value: 400, qty_unit: 'g' },
    { key: 'broccoli', qty_value: 250, qty_unit: 'g' },
    { key: 'red capsicum', qty_value: 1, qty_unit: '' },
  ],
  instructions: [
    'Preheat oven to 200°C (390°F). Line a large baking tray with baking paper.',
    'Wash all vegetables thoroughly. Peel and dice the sweet potato into 2cm cubes. Cut broccoli into florets. Deseed and slice the red capsicum.',
    'In a small bowl, combine olive oil, juice of 1 lemon, minced garlic, oregano, thyme, salt, and pepper.',
    'Pat chicken thighs dry. Place in a bowl and coat with half the marinade. Let sit for 5 minutes.',
    'Spread sweet potato and capsicum on the baking tray. Drizzle with remaining marinade and toss.',
    'Nestle chicken thighs among the vegetables. Roast for 25 minutes.',
    'Add broccoli florets to the tray. Roast for another 12–15 minutes until chicken is cooked through (juices run clear) and vegetables are tender.',
    'Squeeze remaining lemon over the top. Serve immediately.',
  ],
  // Nutritional summary (optional — for display only)
  macros: { calories: 520, protein: 42, carbs: 38, fat: 22 },
};

/**
 * Formats a Cheffy meal object into a structured text block that the
 * ElevenLabs agent system prompt can reference.
 *
 * @param {object} meal - A Cheffy meal object (from plan or DEMO_RECIPE)
 * @returns {string} Formatted recipe context for the agent prompt
 */
export function formatRecipeForAgent(meal) {
  if (!meal) return '';

  const lines = [];
  lines.push(`RECIPE: ${meal.name}`);

  if (meal.description) {
    lines.push(`DESCRIPTION: ${meal.description}`);
  }

  // Ingredients
  if (meal.items && meal.items.length > 0) {
    lines.push('');
    lines.push('INGREDIENTS:');
    meal.items.forEach((item, i) => {
      const qty = item.qty_value ?? item.qty ?? '';
      const unit = item.qty_unit ?? item.unit ?? '';
      const name = item.key ?? item.name ?? 'unknown';
      lines.push(`  ${i + 1}. ${qty}${unit ? ' ' + unit : ''} ${name}`);
    });
  }

  // Instructions
  if (meal.instructions && meal.instructions.length > 0) {
    lines.push('');
    lines.push('STEPS:');
    meal.instructions.forEach((step, i) => {
      lines.push(`  Step ${i + 1}: ${step}`);
    });
  }

  return lines.join('\n');
}

/**
 * Builds the system prompt for the ElevenLabs conversational agent.
 *
 * @param {object} meal - A Cheffy meal object
 * @returns {string} System prompt string
 */
export function buildAgentSystemPrompt(meal) {
  const recipeContext = formatRecipeForAgent(meal);

  return `You are Cheffy, a warm, encouraging, and knowledgeable AI cooking assistant.
You are guiding the user through the recipe below step by step using voice.

YOUR PERSONALITY:
- Friendly and patient, like a supportive friend who happens to be a great cook
- Use short, clear sentences since you are speaking aloud
- Be encouraging: "Great job!", "You're doing awesome!", "Almost there!"
- If the user asks a question about technique or substitutions, answer helpfully
- Keep responses concise — ideally 1–3 sentences at a time
- Use natural speech patterns, not robotic or overly formal language

YOUR WORKFLOW:
1. Greet the user warmly and confirm they're ready to start
2. Walk through each step one at a time
3. After each step, ask if they're ready for the next one
4. Offer timing cues: "This will take about X minutes"
5. If the user says "repeat" or "say that again", repeat the current step
6. If the user says "next", move to the next step
7. If the user says "previous" or "go back", go to the previous step
8. At the end, congratulate them on completing the recipe!

SAFETY REMINDERS (include naturally when relevant):
- Remind them to wash hands before cooking
- Note safe internal temperatures for meats
- Mention careful knife handling when chopping

───────────────────────────────
${recipeContext}
───────────────────────────────

Remember: speak naturally, keep it short, and make cooking fun!`;
}

/**
 * Builds the first message the agent sends when the session starts.
 *
 * @param {object} meal - A Cheffy meal object
 * @returns {string} First message string
 */
export function buildFirstMessage(meal) {
  const name = meal?.name || 'this delicious recipe';
  const stepCount = meal?.instructions?.length || 'a few';
  return `Hey there! I'm Cheffy, your cooking assistant. Today we're making ${name} — it's ${stepCount} easy steps and I'll walk you through every single one. Whenever you're ready, just say "let's go" and we'll start with step one!`;
}
