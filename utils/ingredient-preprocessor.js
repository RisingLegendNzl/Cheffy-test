/**
 * utils/ingredient-preprocessor.js
 * ===================================
 * Deterministic ingredient string preprocessing BEFORE the Grocery Optimizer LLM call.
 * 
 * Purpose: Clean raw ingredient names from the meal planner so the LLM receives
 * normalized, searchable ingredient names instead of noisy strings like
 * "Greek yogurt, plain, low fat" or "peanut_butter, smooth, no added sugar".
 *
 * This runs ONCE per plan generation, costs zero API calls, and dramatically
 * improves downstream matching accuracy.
 * 
 * Version: 1.0.0
 */

// ============================================================================
// DESCRIPTOR STRIP LISTS
// ============================================================================

/**
 * Descriptors that should be REMOVED from ingredient names before search.
 * These are qualifiers that stores rarely include in product titles,
 * or that make search queries too narrow.
 */
const STRIP_DESCRIPTORS = [
  // Fat/diet modifiers
  'low fat', 'lowfat', 'low-fat', 'reduced fat', 'reduced-fat',
  'full fat', 'full-fat', 'non fat', 'nonfat', 'non-fat', 'fat free', 'fat-free',
  'lite', 'light', 'diet',
  // Sugar modifiers
  'no added sugar', 'no-added-sugar', 'no sugar added', 'sugar free', 'sugar-free',
  'unsweetened', 'sweetened', 'no added sweetener',
  // Texture/form modifiers (non-essential for search)
  'smooth', 'crunchy', 'creamy', 'chunky', 'extra smooth', 'extra crunchy',
  'fine', 'coarse', 'thick', 'thin', 'sliced', 'diced', 'chopped', 'minced',
  'shredded', 'grated', 'crushed', 'ground', 'whole', 'halved',
  // Preparation state
  'raw', 'cooked', 'roasted', 'toasted', 'blanched', 'steamed',
  'smoked', 'cured', 'dried', 'dehydrated', 'frozen', 'thawed',
  'tinned', 'canned', 'jarred', 'bottled',
  // Quality/origin (not useful for search)
  'plain', 'natural', 'pure', 'real', 'genuine', 'authentic',
  'homemade', 'home-made', 'homestyle', 'home-style',
  'organic', 'free range', 'free-range', 'grass fed', 'grass-fed',
  'cage free', 'cage-free', 'wild caught', 'wild-caught',
  'premium', 'gourmet', 'artisan', 'traditional', 'classic',
  'australian', 'local', 'imported', 'fresh',
  // Size modifiers
  'small', 'medium', 'large', 'extra large', 'jumbo', 'mini',
];

/**
 * Sort descriptors longest-first so "no added sugar" is matched before "sugar"
 */
const SORTED_STRIP_DESCRIPTORS = [...STRIP_DESCRIPTORS].sort((a, b) => b.length - a.length);

// ============================================================================
// PRODUCE DERIVATIVE DETECTION
// ============================================================================

/**
 * Maps base produce items to words that indicate a DERIVATIVE product.
 * If the ingredient is just "banana", products containing these words should be penalized.
 * If the ingredient IS "banana yoghurt", these words are expected.
 * 
 * This is used to generate smart negativeKeywords for the LLM.
 */
const PRODUCE_DERIVATIVE_MARKERS = {
  banana: ['yoghurt', 'yogurt', 'smoothie', 'chip', 'bread', 'cake', 'muffin', 'pouch', 'custard', 'pudding', 'ice cream', 'flavour', 'flavor', 'lolly', 'lollies', 'cereal', 'bar'],
  apple: ['juice', 'cider', 'sauce', 'pie', 'crumble', 'chip', 'vinegar', 'flavour', 'flavor', 'pouch'],
  strawberry: ['yoghurt', 'yogurt', 'jam', 'sauce', 'ice cream', 'flavour', 'flavor', 'pouch', 'lolly', 'lollies', 'smoothie', 'cereal', 'bar'],
  blueberry: ['yoghurt', 'yogurt', 'jam', 'muffin', 'sauce', 'flavour', 'flavor', 'pouch', 'cereal', 'bar'],
  mango: ['yoghurt', 'yogurt', 'chutney', 'smoothie', 'ice cream', 'flavour', 'flavor', 'pouch', 'lolly', 'lollies'],
  orange: ['juice', 'marmalade', 'cordial', 'flavour', 'flavor', 'pouch'],
  lemon: ['juice', 'curd', 'cordial', 'flavour', 'flavor', 'slice'],
  lime: ['juice', 'cordial', 'flavour', 'flavor', 'pickle'],
  raspberry: ['yoghurt', 'yogurt', 'jam', 'sauce', 'flavour', 'flavor', 'pouch', 'lolly', 'lollies'],
  peach: ['yoghurt', 'yogurt', 'nectar', 'flavour', 'flavor', 'pouch'],
  pear: ['juice', 'nectar', 'pouch', 'flavour', 'flavor'],
  grape: ['juice', 'jam', 'jelly', 'wine', 'vinegar', 'flavour', 'flavor'],
  coconut: ['yoghurt', 'yogurt', 'cream', 'milk', 'oil', 'flour', 'sugar', 'water', 'flavour', 'flavor'],
  avocado: ['dip', 'spread', 'oil', 'flavour', 'flavor'],
  tomato: ['sauce', 'paste', 'puree', 'soup', 'ketchup', 'relish', 'chutney', 'flavour', 'flavor', 'juice'],
  potato: ['chip', 'crisp', 'wedge', 'gem', 'hash', 'mash', 'flavour', 'flavor'],
  carrot: ['juice', 'cake', 'chip', 'flavour', 'flavor'],
  pumpkin: ['soup', 'pie', 'seed', 'flavour', 'flavor'],
};

// ============================================================================
// CORE NOUN EXTRACTION
// ============================================================================

/**
 * Maps common multi-word ingredient phrases to their core searchable form.
 * The LLM sometimes receives oddly formatted names from the meal planner.
 */
const INGREDIENT_CORE_MAP = {
  // Dairy
  'greek yogurt': 'greek yogurt',
  'greek yoghurt': 'greek yogurt',
  'natural yogurt': 'natural yogurt',
  'natural yoghurt': 'natural yogurt',
  'cottage cheese': 'cottage cheese',
  'cream cheese': 'cream cheese',
  'sour cream': 'sour cream',
  'ricotta cheese': 'ricotta',
  'parmesan cheese': 'parmesan',
  'cheddar cheese': 'cheddar cheese',
  'mozzarella cheese': 'mozzarella',
  // Nut butters
  'peanut butter': 'peanut butter',
  'almond butter': 'almond butter',
  'cashew butter': 'cashew butter',
  // Proteins
  'chicken breast': 'chicken breast',
  'chicken thigh': 'chicken thigh',
  'beef mince': 'beef mince',
  'pork mince': 'pork mince',
  'turkey mince': 'turkey mince',
  'lamb mince': 'lamb mince',
  // Grains
  'rolled oats': 'rolled oats',
  'quick oats': 'quick oats',
  'brown rice': 'brown rice',
  'white rice': 'white rice',
  'basmati rice': 'basmati rice',
  'jasmine rice': 'jasmine rice',
  'sweet potato': 'sweet potato',
  // Condiments
  'soy sauce': 'soy sauce',
  'fish sauce': 'fish sauce',
  'oyster sauce': 'oyster sauce',
  'tomato paste': 'tomato paste',
  'tomato sauce': 'tomato sauce',
  'olive oil': 'olive oil',
  'coconut oil': 'coconut oil',
  'sesame oil': 'sesame oil',
  // Juices / liquids
  'lime juice': 'lime juice',
  'lemon juice': 'lemon juice',
  'orange juice': 'orange juice',
  'apple cider vinegar': 'apple cider vinegar',
  // Baking
  'baking powder': 'baking powder',
  'baking soda': 'baking soda',
  'cocoa powder': 'cocoa powder',
  'vanilla extract': 'vanilla extract',
  'maple syrup': 'maple syrup',
};

// Sort by length (longest first) for greedy matching
const SORTED_CORE_MAP_KEYS = Object.keys(INGREDIENT_CORE_MAP).sort((a, b) => b.length - a.length);


// ============================================================================
// MAIN PREPROCESSING FUNCTION
// ============================================================================

/**
 * Preprocesses a raw ingredient string into a clean, searchable form.
 * 
 * Pipeline:
 * 1. Normalize formatting (underscores, commas, extra whitespace)
 * 2. Strip descriptors (low fat, smooth, no added sugar, etc.)
 * 3. Extract core noun phrase (greek yogurt, peanut butter, etc.)
 * 4. Generate smart negative keywords for produce items
 * 
 * @param {string} rawIngredient - The original ingredient name from the meal planner
 * @returns {object} Preprocessed data:
 *   - cleanName: The cleaned ingredient name for the LLM
 *   - coreNoun: The extracted core product noun(s)
 *   - strippedDescriptors: Array of descriptors that were removed
 *   - autoNegativeKeywords: Auto-generated negative keywords for produce
 *   - isProduceItem: Whether this appears to be a raw produce item
 */
function preprocessIngredient(rawIngredient) {
  if (!rawIngredient || typeof rawIngredient !== 'string') {
    return {
      cleanName: rawIngredient || '',
      coreNoun: rawIngredient || '',
      strippedDescriptors: [],
      autoNegativeKeywords: [],
      isProduceItem: false,
    };
  }

  // Step 1: Basic formatting normalization
  let cleaned = rawIngredient
    .toLowerCase()
    .trim()
    .replace(/_/g, ' ')              // underscores → spaces
    .replace(/,\s*/g, ' ')           // commas → spaces
    .replace(/\s*\([^)]*\)/g, '')    // remove parenthetical notes e.g. "(optional)"
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();

  // Step 2: Strip descriptors (longest-first to handle "no added sugar" before "sugar")
  const strippedDescriptors = [];
  for (const descriptor of SORTED_STRIP_DESCRIPTORS) {
    // Use word boundary-aware matching to avoid partial word strips
    const pattern = new RegExp(`\\b${escapeRegex(descriptor)}\\b`, 'gi');
    if (pattern.test(cleaned)) {
      strippedDescriptors.push(descriptor);
      cleaned = cleaned.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // Step 3: Extract core noun phrase
  let coreNoun = cleaned;
  for (const phrase of SORTED_CORE_MAP_KEYS) {
    if (cleaned.includes(phrase)) {
      coreNoun = INGREDIENT_CORE_MAP[phrase];
      break;
    }
  }
  // If no known phrase matched, use the cleaned name as-is
  if (coreNoun === cleaned) {
    // Final cleanup: remove any remaining single-character words, trailing 's'
    coreNoun = cleaned.replace(/\b\w\b/g, '').replace(/\s+/g, ' ').trim() || cleaned;
  }

  // Step 4: Auto-generate negative keywords for produce items
  const autoNegativeKeywords = [];
  let isProduceItem = false;

  // Check if this is a simple produce item (not a compound like "banana yoghurt")
  const coreWords = coreNoun.split(' ').filter(Boolean);
  const firstWord = coreWords[0];
  
  if (PRODUCE_DERIVATIVE_MARKERS[firstWord] && coreWords.length === 1) {
    // This is a single-word produce item like "banana", "apple", etc.
    isProduceItem = true;
    autoNegativeKeywords.push(...PRODUCE_DERIVATIVE_MARKERS[firstWord]);
  }

  return {
    cleanName: cleaned,
    coreNoun,
    strippedDescriptors,
    autoNegativeKeywords,
    isProduceItem,
  };
}

/**
 * Batch preprocessor for the aggregated ingredient list.
 * Call this BEFORE sending ingredients to the Grocery Optimizer LLM.
 * 
 * @param {Array} ingredients - Array of { originalIngredient, requested_total_g, ... }
 * @returns {Array} Same array with added preprocessing fields
 */
function preprocessIngredientBatch(ingredients) {
  if (!Array.isArray(ingredients)) return ingredients;
  
  return ingredients.map(item => {
    const preprocessed = preprocessIngredient(item.originalIngredient);
    return {
      ...item,
      _preprocessed: preprocessed,
      // The cleanName becomes what the LLM sees as the ingredient to generate queries for
      _cleanIngredientForLLM: preprocessed.cleanName,
    };
  });
}


// ============================================================================
// QUERY SIMPLIFICATION FOR PROGRESSIVE FALLBACK
// ============================================================================

/**
 * Generates progressively simpler search queries from an ingredient.
 * Used when the initial tight/normal/wide queries all fail.
 * 
 * @param {string} ingredientName - The original ingredient name
 * @param {string} store - Store name for prefixing
 * @returns {Array<string>} Array of increasingly simple queries to try
 */
function generateFallbackQueries(ingredientName, store) {
  const preprocessed = preprocessIngredient(ingredientName);
  const queries = [];
  const prefix = store ? `${store} ` : '';

  // Level 1: Core noun only (e.g., "Woolworths peanut butter")
  if (preprocessed.coreNoun && preprocessed.coreNoun !== preprocessed.cleanName) {
    queries.push(`${prefix}${preprocessed.coreNoun}`.trim());
  }

  // Level 2: First two words only
  const words = preprocessed.cleanName.split(' ').filter(Boolean);
  if (words.length > 2) {
    queries.push(`${prefix}${words.slice(0, 2).join(' ')}`.trim());
  }

  // Level 3: First word only (most generic)
  if (words.length > 1) {
    queries.push(`${prefix}${words[0]}`.trim());
  }

  // Deduplicate
  return [...new Set(queries)];
}


// ============================================================================
// HELPERS
// ============================================================================

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  preprocessIngredient,
  preprocessIngredientBatch,
  generateFallbackQueries,
  PRODUCE_DERIVATIVE_MARKERS,
  STRIP_DESCRIPTORS,
  INGREDIENT_CORE_MAP,
};