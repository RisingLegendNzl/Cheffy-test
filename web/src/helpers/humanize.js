// web/src/helpers/humanize.js
// =============================================================================
// Utility to convert snake_case or other machine-format strings into
// human-readable display text.
//
// Examples:
//   humanize('chicken_breast')        → 'Chicken Breast'
//   humanize('olive_oil')             → 'Olive Oil'
//   humanize('kumara_sweet_potato')   → 'Kumara Sweet Potato'
//   humanize('skim_milk_powder')      → 'Skim Milk Powder'
//   humanize('brown_rice')            → 'Brown Rice'
//   humanize('Chicken Breast')        → 'Chicken Breast'  (already clean)
//   humanize('')                      → ''
//   humanize(null)                    → ''
// =============================================================================

/**
 * Converts a snake_case, kebab-case, or otherwise machine-formatted
 * ingredient key into a Title Cased, space-separated display string.
 *
 * @param {string|null|undefined} str - The raw ingredient key
 * @returns {string} Human-readable display string
 */
export function humanize(str) {
  if (!str || typeof str !== 'string') return '';

  return str
    // Replace underscores and hyphens with spaces
    .replace(/[_-]+/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
    // Title case each word
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Same as humanize but preserves lowercase for common prepositions /
 * articles when they are NOT the first word.
 *
 * Examples:
 *   humanizeNatural('cream_of_mushroom') → 'Cream of Mushroom'
 *   humanizeNatural('salt_and_pepper')   → 'Salt and Pepper'
 */
const LOWERCASE_WORDS = new Set(['of', 'and', 'with', 'in', 'for', 'the', 'a', 'an', 'or']);

export function humanizeNatural(str) {
  if (!str || typeof str !== 'string') return '';

  const words = str
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ');

  return words
    .map((word, i) =>
      i === 0 || !LOWERCASE_WORDS.has(word)
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word
    )
    .join(' ');
}

/**
 * Format an ingredient for display — the primary function to use in UI.
 * Handles all edge cases: null, undefined, empty string, snake_case, 
 * kebab-case, already-formatted strings.
 * 
 * @param {string|null|undefined} str - The raw ingredient key
 * @returns {string} Human-readable ingredient name
 */
export function formatIngredientName(str) {
  return humanizeNatural(str);
}

/**
 * Returns an emoji icon for a given food category or ingredient hint.
 * Used to add visual flair to ingredient lists in the recipe UI.
 * 
 * @param {string} name - Ingredient name (humanized or raw)
 * @returns {string} Emoji representing the ingredient category
 */
export function getIngredientEmoji(name) {
  if (!name) return '🥄';
  const lower = name.toLowerCase().replace(/[_-]/g, ' ');

  // Proteins
  if (/chicken|poultry|turkey|duck/.test(lower)) return '🍗';
  if (/beef|steak|mince|veal/.test(lower)) return '🥩';
  if (/pork|bacon|ham|sausage/.test(lower)) return '🥓';
  if (/fish|salmon|tuna|cod|snapper|barramundi/.test(lower)) return '🐟';
  if (/prawn|shrimp|seafood|crab|lobster|mussel/.test(lower)) return '🦐';
  if (/egg/.test(lower)) return '🥚';
  if (/tofu|tempeh/.test(lower)) return '🧈';

  // Dairy
  if (/milk|cream/.test(lower)) return '🥛';
  if (/cheese|parmesan|mozzarella|cheddar|feta/.test(lower)) return '🧀';
  if (/yoghurt|yogurt/.test(lower)) return '🥛';
  if (/butter/.test(lower)) return '🧈';

  // Grains & Carbs
  if (/rice/.test(lower)) return '🍚';
  if (/pasta|spaghetti|penne|fusilli|noodle/.test(lower)) return '🍝';
  if (/bread|toast|bun|roll|wrap|tortilla|pita/.test(lower)) return '🍞';
  if (/oat|cereal|granola/.test(lower)) return '🥣';
  if (/flour/.test(lower)) return '🌾';
  if (/potato|kumara|sweet potato/.test(lower)) return '🥔';

  // Vegetables
  if (/broccoli/.test(lower)) return '🥦';
  if (/carrot/.test(lower)) return '🥕';
  if (/tomato/.test(lower)) return '🍅';
  if (/onion|shallot|leek/.test(lower)) return '🧅';
  if (/garlic/.test(lower)) return '🧄';
  if (/pepper|capsicum|chili|chilli/.test(lower)) return '🌶️';
  if (/corn/.test(lower)) return '🌽';
  if (/mushroom/.test(lower)) return '🍄';
  if (/lettuce|spinach|kale|greens|rocket|arugula/.test(lower)) return '🥬';
  if (/avocado/.test(lower)) return '🥑';
  if (/cucumber|zucchini|courgette/.test(lower)) return '🥒';
  if (/pumpkin|squash/.test(lower)) return '🎃';
  if (/bean|lentil|chickpea/.test(lower)) return '🫘';
  if (/pea/.test(lower)) return '🟢';

  // Fruits
  if (/apple/.test(lower)) return '🍎';
  if (/banana/.test(lower)) return '🍌';
  if (/lemon|lime|citrus/.test(lower)) return '🍋';
  if (/orange|mandarin/.test(lower)) return '🍊';
  if (/berry|blueberry|strawberry|raspberry/.test(lower)) return '🫐';

  // Oils & Fats
  if (/oil|olive/.test(lower)) return '🫒';

  // Spices & Seasonings
  if (/salt/.test(lower)) return '🧂';
  if (/pepper(?!.*capsicum)/.test(lower)) return '🫙';
  if (/spice|cumin|paprika|turmeric|cinnamon|oregano|thyme|basil|herb|rosemary|parsley|coriander|cilantro|dill|mint/.test(lower)) return '🌿';
  if (/ginger/.test(lower)) return '🫚';

  // Sauces & Condiments
  if (/sauce|soy|worcestershire|ketchup|mustard|mayo|vinegar/.test(lower)) return '🥫';
  if (/honey/.test(lower)) return '🍯';
  if (/sugar/.test(lower)) return '🍬';

  // Nuts & Seeds
  if (/nut|almond|walnut|cashew|peanut|pistachio/.test(lower)) return '🥜';
  if (/seed|sesame|chia|flax|sunflower/.test(lower)) return '🌻';

  // Beverages
  if (/water|stock|broth/.test(lower)) return '💧';
  if (/wine|beer/.test(lower)) return '🍷';
  if (/coconut/.test(lower)) return '🥥';

  // Default
  return '🥄';
}

export default humanize;
