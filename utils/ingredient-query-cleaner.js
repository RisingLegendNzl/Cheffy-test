/**
 * utils/ingredient-query-cleaner.js
 * ===================================
 * Deterministic preprocessing for ingredient names BEFORE the Grocery Optimizer LLM.
 *
 * Solves two problems:
 * 1. Meal planner outputs snake_case taxonomy keys (e.g. "egg_whole_chicken",
 *    "milk_regular_cow") that the LLM passes through as bad search queries.
 * 2. Simple single-ingredient items (banana, garlic, cheddar) match prepared
 *    multi-ingredient products (garlic prawns, chicken burgers with cheddar).
 *
 * This module:
 * - Converts taxonomy keys into clean human-readable ingredient names
 * - Classifies ingredient intent (whole-food vs compound)
 * - Generates prepared-product penalty words automatically
 * - Runs in <1ms, zero API calls
 *
 * Version: 1.0.0
 */

'use strict';

// ============================================================================
// 1. TAXONOMY → HUMAN NAME MAPPING
// ============================================================================

/**
 * Known taxonomy patterns from the meal planner.
 * Maps snake_case keys to clean, human-readable grocery search names.
 *
 * Format: regex → replacement string
 * Ordered longest-first so more specific patterns match before generic ones.
 */
const TAXONOMY_RULES = [
  // === EGGS ===
  [/^egg_whole_chicken$/,         'eggs'],
  [/^egg_whole$/,                 'eggs'],
  [/^egg_white$/,                 'egg whites'],
  [/^egg_yolk$/,                  'egg yolks'],
  [/^eggs?$/,                     'eggs'],

  // === MILK ===
  [/^milk_regular_cow$/,          'full cream milk'],
  [/^milk_whole_cow$/,            'full cream milk'],
  [/^milk_skim_cow$/,             'skim milk'],
  [/^milk_low_fat_cow$/,          'low fat milk'],
  [/^milk_reduced_fat$/,          'reduced fat milk'],
  [/^milk_full_cream$/,           'full cream milk'],
  [/^milk_almond$/,               'almond milk'],
  [/^milk_oat$/,                  'oat milk'],
  [/^milk_soy$/,                  'soy milk'],
  [/^milk_coconut$/,              'coconut milk'],
  [/^milk$/,                      'full cream milk'],

  // === YOGURT ===
  [/^yogurt_greek_plain$/,        'greek yogurt'],
  [/^yogurt_greek$/,              'greek yogurt'],
  [/^yogurt_natural$/,            'natural yogurt'],
  [/^yogurt_plain$/,              'plain yogurt'],
  [/^yogurt$/,                    'yogurt'],

  // === CHEESE ===
  [/^cheese_cheddar$/,            'cheddar cheese'],
  [/^cheese_mozzarella$/,         'mozzarella cheese'],
  [/^cheese_parmesan$/,           'parmesan cheese'],
  [/^cheese_cream$/,              'cream cheese'],
  [/^cheese_cottage$/,            'cottage cheese'],
  [/^cheese_ricotta$/,            'ricotta cheese'],
  [/^cheese_feta$/,               'feta cheese'],
  [/^cheddar$/,                   'cheddar cheese'],
  [/^mozzarella$/,                'mozzarella'],
  [/^parmesan$/,                  'parmesan cheese'],
  [/^feta$/,                      'feta cheese'],

  // === MEAT ===
  [/^chicken_breast_skinless$/,   'chicken breast'],
  [/^chicken_breast$/,            'chicken breast'],
  [/^chicken_thigh$/,             'chicken thigh'],
  [/^chicken_mince$/,             'chicken mince'],
  [/^beef_mince_lean$/,           'lean beef mince'],
  [/^beef_mince$/,                'beef mince'],
  [/^beef_steak$/,                'beef steak'],
  [/^lamb_mince$/,                'lamb mince'],
  [/^lamb_leg$/,                  'lamb leg'],
  [/^pork_mince$/,                'pork mince'],
  [/^pork_loin$/,                 'pork loin'],
  [/^turkey_mince$/,              'turkey mince'],
  [/^turkey_breast$/,             'turkey breast'],

  // === SEAFOOD ===
  [/^salmon_fillet$/,             'salmon fillets'],
  [/^salmon_atlantic$/,           'atlantic salmon'],
  [/^salmon$/,                    'salmon fillets'],
  [/^tuna_canned$/,               'canned tuna'],
  [/^tuna_tinned$/,               'canned tuna'],
  [/^tuna$/,                      'tuna'],
  [/^prawns_cooked$/,             'cooked prawns'],
  [/^prawns_raw$/,                'raw prawns'],
  [/^prawns$/,                    'prawns'],

  // === GRAINS ===
  [/^rice_white$/,                'white rice'],
  [/^rice_brown$/,                'brown rice'],
  [/^rice_basmati$/,              'basmati rice'],
  [/^rice_jasmine$/,              'jasmine rice'],
  [/^rice$/,                      'white rice'],
  [/^oats_rolled$/,               'rolled oats'],
  [/^rolled_oats$/,               'rolled oats'],
  [/^oats$/,                      'rolled oats'],
  [/^pasta_penne$/,               'penne pasta'],
  [/^pasta_spaghetti$/,           'spaghetti'],
  [/^pasta$/,                     'pasta'],
  [/^bread_wholemeal$/,           'wholemeal bread'],
  [/^bread_white$/,               'white bread'],
  [/^bread_sourdough$/,           'sourdough bread'],
  [/^bread$/,                     'bread'],
  [/^quinoa$/,                    'quinoa'],
  [/^couscous$/,                  'couscous'],

  // === PRODUCE ===
  [/^potato_sweet$/,              'sweet potato'],
  [/^sweet_potato$/,              'sweet potato'],
  [/^potato$/,                    'potato'],
  [/^garlic_fresh$/,              'fresh garlic'],
  [/^garlic_clove$/,              'fresh garlic'],
  [/^garlic$/,                    'fresh garlic'],
  [/^ginger_fresh$/,              'fresh ginger'],
  [/^ginger$/,                    'fresh ginger'],
  [/^onion_brown$/,               'brown onion'],
  [/^onion_red$/,                 'red onion'],
  [/^onion$/,                     'brown onion'],
  [/^tomato_fresh$/,              'tomatoes'],
  [/^tomato$/,                    'tomatoes'],
  [/^spinach_baby$/,              'baby spinach'],
  [/^spinach$/,                   'spinach'],
  [/^broccoli$/,                  'broccoli'],
  [/^capsicum$/,                  'capsicum'],
  [/^zucchini$/,                  'zucchini'],
  [/^carrot$/,                    'carrots'],
  [/^mushroom$/,                  'mushrooms'],
  [/^avocado$/,                   'avocado'],
  [/^banana$/,                    'bananas'],
  [/^apple$/,                     'apples'],
  [/^lemon$/,                     'lemon'],
  [/^lime$/,                      'lime'],

  // === PANTRY ===
  [/^oil_olive$/,                 'olive oil'],
  [/^olive_oil$/,                 'olive oil'],
  [/^oil_coconut$/,               'coconut oil'],
  [/^coconut_oil$/,               'coconut oil'],
  [/^oil_sesame$/,                'sesame oil'],
  [/^butter_unsalted$/,           'unsalted butter'],
  [/^butter$/,                    'butter'],
  [/^peanut_butter$/,             'peanut butter'],
  [/^almond_butter$/,             'almond butter'],
  [/^honey$/,                     'honey'],
  [/^maple_syrup$/,               'maple syrup'],
  [/^soy_sauce$/,                 'soy sauce'],
  [/^tomato_paste$/,              'tomato paste'],
  [/^coconut_cream$/,             'coconut cream'],
  [/^coconut_milk$/,              'coconut milk'],
  [/^lime_juice$/,                'lime juice'],
  [/^lemon_juice$/,               'lemon juice'],

  // === LEGUMES ===
  [/^chickpeas_canned$/,          'canned chickpeas'],
  [/^chickpeas$/,                 'chickpeas'],
  [/^lentils_red$/,               'red lentils'],
  [/^lentils_brown$/,             'brown lentils'],
  [/^lentils$/,                   'lentils'],
  [/^beans_black$/,               'black beans'],
  [/^beans_kidney$/,              'kidney beans'],
  [/^black_beans$/,               'black beans'],
  [/^kidney_beans$/,              'kidney beans'],
];

// ============================================================================
// 2. SIMPLE INGREDIENT DETECTION (whole food vs compound)
// ============================================================================

/**
 * Single-word (or known two-word) ingredients that are WHOLE FOODS.
 * When these are searched, results like "garlic prawns" or "cheddar burgers"
 * are clearly wrong — the user wants the raw ingredient.
 */
const WHOLE_FOOD_SINGLES = new Set([
  // Produce
  'garlic', 'ginger', 'onion', 'onions', 'potato', 'potatoes', 'tomato', 'tomatoes',
  'carrot', 'carrots', 'broccoli', 'spinach', 'capsicum', 'zucchini', 'celery',
  'cucumber', 'lettuce', 'corn', 'peas', 'beans', 'cabbage', 'cauliflower',
  'eggplant', 'beetroot', 'mushroom', 'mushrooms', 'pumpkin', 'asparagus',
  'kale', 'leek', 'parsnip', 'turnip', 'radish', 'chilli', 'chili',
  // Fruit
  'banana', 'bananas', 'apple', 'apples', 'orange', 'oranges', 'lemon', 'lemons',
  'lime', 'limes', 'strawberry', 'strawberries', 'blueberry', 'blueberries',
  'raspberry', 'raspberries', 'mango', 'mangoes', 'pear', 'pears', 'peach',
  'peaches', 'grape', 'grapes', 'watermelon', 'pineapple', 'kiwi', 'avocado',
  // Dairy base
  'milk', 'butter', 'cream', 'eggs', 'egg',
  // Cheese (single names)
  'cheddar', 'mozzarella', 'parmesan', 'feta', 'ricotta', 'brie', 'halloumi',
  // Grains
  'rice', 'pasta', 'oats', 'quinoa', 'couscous', 'flour', 'bread',
  // Protein
  'chicken', 'beef', 'pork', 'lamb', 'salmon', 'tuna', 'prawns', 'tofu',
]);

/**
 * Words found in product names that indicate a PREPARED/MULTI-INGREDIENT product.
 * When the user wants a simple whole food, these should disqualify a product match.
 */
const PREPARED_PRODUCT_MARKERS = [
  // Ready meals & semi-prepared
  'burger', 'burgers', 'sausage', 'sausages', 'nugget', 'nuggets',
  'schnitzel', 'schnitzels', 'kiev', 'kievs', 'tender', 'tenders',
  'stir fry', 'stir-fry', 'stir fry kit', 'meal kit',
  'pie', 'pies', 'pasty', 'pasties', 'quiche',
  'pizza', 'lasagne', 'lasagna', 'risotto',
  'casserole', 'curry', 'soup', 'stew',
  // Marinaded / seasoned
  'marinade', 'marinated', 'seasoned', 'crumbed', 'battered',
  'stuffed', 'glazed', 'smothered', 'coated',
  // Snack / processed
  'chip', 'chips', 'crisp', 'crisps', 'popcorn',
  'bar', 'bars', 'biscuit', 'biscuits', 'cookie', 'cookies',
  'cake', 'muffin', 'muffins', 'donut', 'donuts',
  'lolly', 'lollies', 'candy', 'chocolate',
  // Drinks / flavoured
  'smoothie', 'shake', 'cordial', 'juice',
  'flavoured', 'flavored', 'infused',
  // Baby / kids
  'pouch', 'baby', 'infant', 'toddler',
];


// ============================================================================
// 3. MAIN FUNCTIONS
// ============================================================================

/**
 * Cleans a raw ingredient key/name into a human-readable grocery search term.
 *
 * @param {string} raw - The raw ingredient (may be snake_case, camelCase, or natural)
 * @returns {string} A clean, human-readable name for grocery search
 */
function cleanIngredientName(raw) {
  if (!raw || typeof raw !== 'string') return raw || '';

  let name = raw.trim();

  // Step 1: Check taxonomy rules first (handles known patterns like egg_whole_chicken)
  const snaked = name.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  for (const [pattern, replacement] of TAXONOMY_RULES) {
    if (pattern.test(snaked)) {
      return replacement;
    }
  }

  // Step 2: Generic snake_case → space conversion
  name = name
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  // Step 3: Remove common taxonomy noise words
  const NOISE_WORDS = [
    'regular', 'standard', 'plain', 'common', 'basic', 'normal',
    'cow', 'chicken', 'animal',  // taxonomy qualifiers like "milk_regular_cow"
    'whole', 'raw', 'fresh',     // these get re-added contextually by the LLM prompt
  ];

  const words = name.split(' ');
  // Only strip noise if we'd have at least 1 word left
  const cleaned = words.filter(w => !NOISE_WORDS.includes(w));
  if (cleaned.length > 0) {
    name = cleaned.join(' ');
  }

  return name;
}

/**
 * Determines whether an ingredient is a simple whole food.
 * Used to decide whether to apply strict prepared-product filtering.
 *
 * @param {string} cleanName - Already cleaned ingredient name
 * @returns {boolean} True if this is a single whole food ingredient
 */
function isWholeFood(cleanName) {
  if (!cleanName) return false;
  const lower = cleanName.toLowerCase().trim();
  
  // Direct match
  if (WHOLE_FOOD_SINGLES.has(lower)) return true;
  
  // Check first word for multi-word ingredients that are still "simple"
  // e.g., "fresh garlic" → first word after "fresh" is "garlic"
  const words = lower.split(/\s+/);
  const qualifiers = ['fresh', 'raw', 'whole', 'dried', 'ground', 'baby', 'large', 'small'];
  const meaningful = words.filter(w => !qualifiers.includes(w));
  
  if (meaningful.length === 1 && WHOLE_FOOD_SINGLES.has(meaningful[0])) return true;
  
  return false;
}

/**
 * Returns prepared-product marker words that should be used as negative keywords
 * for a given ingredient. Only applies to whole-food ingredients.
 *
 * @param {string} cleanName - Already cleaned ingredient name
 * @returns {string[]} Array of negative keyword strings (empty for compound ingredients)
 */
function getPreparedProductNegatives(cleanName) {
  if (!isWholeFood(cleanName)) return [];
  
  // For whole foods, return a curated subset of the most relevant prepared markers
  // We pick the top ones most likely to appear in confusing search results
  const lower = cleanName.toLowerCase().trim();
  const negatives = [];

  // Universal prepared-product markers for whole foods
  negatives.push('burger', 'sausage', 'nugget', 'schnitzel', 'kiev');
  negatives.push('marinated', 'seasoned', 'crumbed', 'stuffed', 'coated');
  negatives.push('pie', 'pizza', 'lasagne', 'casserole', 'soup');
  negatives.push('flavoured', 'flavored');

  // Category-specific
  if (['garlic', 'ginger', 'onion', 'chilli', 'chili'].some(w => lower.includes(w))) {
    // Aromatics: frequently appear as flavourings in prepared products
    negatives.push('prawns', 'prawn', 'chicken', 'beef', 'pork', 'lamb');
    negatives.push('bread', 'naan', 'sauce', 'paste', 'powder');
    // Keep: "fresh garlic", "garlic bulb" should still match
  }
  
  if (['cheddar', 'mozzarella', 'parmesan', 'feta', 'ricotta'].some(w => lower.includes(w))) {
    // Cheeses: appear as ingredients in many prepared products
    negatives.push('burger', 'chicken', 'wrap', 'toastie', 'cracker');
  }

  // Dedupe
  return [...new Set(negatives)];
}

/**
 * Checks if a product name looks like a prepared/multi-ingredient product.
 *
 * @param {string} productName - The product name from the store API
 * @returns {boolean} True if this appears to be a prepared product
 */
function isPreparedProduct(productName) {
  if (!productName) return false;
  const lower = productName.toLowerCase();
  return PREPARED_PRODUCT_MARKERS.some(marker => {
    // Word boundary check to avoid "chips" matching in "chipset" etc.
    const rx = new RegExp(`\\b${escapeRegex(marker)}\\b`, 'i');
    return rx.test(lower);
  });
}

/**
 * Batch-clean an array of aggregated ingredients.
 * Call BEFORE sending to the Grocery Optimizer LLM.
 *
 * @param {Array} ingredients - Array of { originalIngredient, ... }
 * @returns {Array} Same array with _cleanName, _isWholeFood, _autoNegatives added
 */
function cleanIngredientBatch(ingredients) {
  if (!Array.isArray(ingredients)) return ingredients;

  return ingredients.map(item => {
    const cleanName = cleanIngredientName(item.originalIngredient);
    const wholeFood = isWholeFood(cleanName);
    const autoNeg = getPreparedProductNegatives(cleanName);

    return {
      ...item,
      _cleanName: cleanName,
      _isWholeFood: wholeFood,
      _autoNegatives: autoNeg,
    };
  });
}


// ============================================================================
// HELPERS
// ============================================================================

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  cleanIngredientName,
  cleanIngredientBatch,
  isWholeFood,
  isPreparedProduct,
  getPreparedProductNegatives,
  TAXONOMY_RULES,
  WHOLE_FOOD_SINGLES,
  PREPARED_PRODUCT_MARKERS,
};