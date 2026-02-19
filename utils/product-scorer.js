/**
 * utils/product-scorer.js
 * ========================
 * Enhanced product scoring for the Market Run checklist.
 * 
 * Replaces the binary pass/fail (1.0 / 0) scoring in runSmarterChecklist with
 * a graduated scoring system that differentiates between:
 *   - Exact matches ("Woolworths Bananas" for "banana") → high score
 *   - Acceptable matches ("Cavendish Bananas 1kg" for "banana") → medium score
 *   - Derivative/flavored products ("Banana Yoghurt Pouch" for "banana") → REJECTED
 * 
 * This module is designed to be a DROP-IN enhancement for both day.js and
 * generate-full-plan.js. The existing runSmarterChecklist structure is preserved
 * but the scoring logic is upgraded.
 *
 * Version: 1.0.0
 */

const { PRODUCE_DERIVATIVE_MARKERS } = require('./ingredient-preprocessor');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Global banned keywords — products containing these are non-food items.
 * This is the single source of truth; import this into day.js / generate-full-plan.js
 * instead of maintaining duplicate lists.
 */
const BANNED_KEYWORDS = [
  'cigarette', 'capsule', 'deodorant', 'pet', 'cat food', 'dog food', 'bird',
  'toy', 'non-food', 'supplement', 'vitamin', 'tobacco', 'vape', 'roll-on',
  'binder', 'folder', 'stationery', 'lighter', 'shampoo', 'conditioner',
  'soap', 'lotion', 'cleaner', 'spray', 'polish', 'air freshener',
  'mouthwash', 'toothpaste', 'floss', 'gum', 'nappy', 'nappies',
  'dishwashing', 'laundry', 'bleach', 'detergent', 'insect',
];

/**
 * Derivative product markers — words that indicate a FLAVORED/PROCESSED product
 * rather than the base ingredient itself.
 * E.g., for "banana": "yoghurt" indicates banana-flavored yogurt, not actual bananas.
 */
const DERIVATIVE_MARKERS = [
  'flavoured', 'flavored', 'flavour', 'flavor', 'infused',
  'pouch', 'squeeze', 'sachet', 'lolly', 'lollies', 'candy',
  'cereal', 'bar', 'snack', 'biscuit', 'cookie',
  'baby', 'infant', 'toddler', 'kids',
];

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const WEIGHTS = {
  REQUIRED_WORDS_PRESENT: 0.40,   // All required words found in product name
  NEGATIVE_KEYWORDS_CLEAN: 0.15,  // No negative keywords found
  CATEGORY_MATCH: 0.10,           // Product category matches allowed categories
  TOKEN_OVERLAP: 0.15,            // How many ingredient tokens appear in product name
  NAME_SIMPLICITY: 0.10,          // Shorter/simpler product names preferred (less noise)
  DERIVATIVE_PENALTY: 0.10,       // Penalty for derivative product markers
};

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Enhanced product scoring with graduated scores instead of binary pass/fail.
 * 
 * @param {object} product - Product from the store API
 *   Required fields: product_name, product_category, product_size, url, price
 * @param {object} ingredientData - Ingredient query data from LLM
 *   Required fields: originalIngredient, requiredWords, negativeKeywords,
 *                    targetSize, allowedCategories
 * @param {function} log - Logger function
 * @param {object} [options] - Optional configuration
 *   - preprocessed: Preprocessed data from ingredient-preprocessor.js
 *   - bannedKeywords: Override the default BANNED_KEYWORDS list
 *   - pantryCategories: Override pantry category list
 * @returns {object} { pass: boolean, score: number (0-1), reason: string }
 */
function scoreProduct(product, ingredientData, log, options = {}) {
  const productNameLower = (product.product_name || product.name || '').toLowerCase();
  if (!productNameLower) {
    return { pass: false, score: 0, reason: 'empty_product_name' };
  }

  if (!ingredientData || !ingredientData.originalIngredient) {
    log(`ProductScorer: Invalid ingredientData`, 'ERROR', 'SCORER');
    return { pass: false, score: 0, reason: 'invalid_ingredient_data' };
  }

  const {
    originalIngredient,
    requiredWords = [],
    negativeKeywords = [],
    targetSize,
    allowedCategories = [],
  } = ingredientData;

  const bannedKws = options.bannedKeywords || BANNED_KEYWORDS;
  const preprocessed = options.preprocessed || null;
  const checkLogPrefix = `Scorer [${originalIngredient}] for "${product.product_name || product.name}"`;

  // ─────────────────────────────────────────────
  // HARD FAIL CHECKS (score = 0, no partial credit)
  // ─────────────────────────────────────────────

  // 1. Global Banned Keywords
  const bannedWordFound = bannedKws.find(kw => productNameLower.includes(kw));
  if (bannedWordFound) {
    log(`${checkLogPrefix}: FAIL (Banned: '${bannedWordFound}')`, 'DEBUG', 'SCORER');
    return { pass: false, score: 0, reason: `banned:${bannedWordFound}` };
  }

  // 2. Negative Keywords (hard fail)
  if (negativeKeywords.length > 0) {
    const negativeFound = negativeKeywords.find(kw => kw && productNameLower.includes(kw.toLowerCase()));
    if (negativeFound) {
      log(`${checkLogPrefix}: FAIL (Negative: '${negativeFound}')`, 'DEBUG', 'SCORER');
      return { pass: false, score: 0, reason: `negative:${negativeFound}` };
    }
  }

  // 3. Required Words (hard fail if NONE present)
  const requiredResults = checkRequiredWords(productNameLower, requiredWords);
  if (!requiredResults.allPresent) {
    log(`${checkLogPrefix}: FAIL (Required missing: [${requiredResults.missing.join(', ')}])`, 'DEBUG', 'SCORER');
    return { pass: false, score: 0, reason: `required_missing:${requiredResults.missing.join(',')}` };
  }

  // 4. Category Check
  if (!passCategory(product, allowedCategories)) {
    log(`${checkLogPrefix}: FAIL (Category: "${product.product_category}" not in [${allowedCategories.join(', ')}])`, 'DEBUG', 'SCORER');
    return { pass: false, score: 0, reason: 'category_mismatch' };
  }

  // 5. Produce Derivative Detection (CRITICAL for banana problem)
  //    If ingredient is simple produce (e.g., "banana"), reject derivative products
  const derivativeCheck = checkDerivativeProduct(productNameLower, ingredientData, preprocessed);
  if (derivativeCheck.isDerivative) {
    log(`${checkLogPrefix}: FAIL (Derivative: '${derivativeCheck.marker}' found — looking for base produce)`, 'DEBUG', 'SCORER');
    return { pass: false, score: 0, reason: `derivative:${derivativeCheck.marker}` };
  }

  // 6. Size Check (skip for produce/fruit/veg)
  const isProduceOrFruit = allowedCategories.some(c => ['fruit', 'produce', 'veg'].includes(c));
  if (!isProduceOrFruit) {
    const sizeResult = checkSize(product, targetSize, allowedCategories, log, checkLogPrefix);
    if (!sizeResult.pass) {
      return { pass: false, score: 0, reason: 'size_mismatch' };
    }
  }

  // ─────────────────────────────────────────────
  // GRADUATED SCORING (all hard checks passed)
  // ─────────────────────────────────────────────

  let score = 0;

  // S1: Required words present (already passed, full credit)
  score += WEIGHTS.REQUIRED_WORDS_PRESENT;

  // S2: No negative keywords (already passed, full credit)
  score += WEIGHTS.NEGATIVE_KEYWORDS_CLEAN;

  // S3: Category match (already passed, full credit)
  score += WEIGHTS.CATEGORY_MATCH;

  // S4: Token overlap — how well does the product name match the ingredient?
  const overlapScore = calculateTokenOverlap(productNameLower, ingredientData, preprocessed);
  score += WEIGHTS.TOKEN_OVERLAP * overlapScore;

  // S5: Name simplicity — prefer shorter, cleaner product names
  const simplicityScore = calculateSimplicity(productNameLower, ingredientData);
  score += WEIGHTS.NAME_SIMPLICITY * simplicityScore;

  // S6: Derivative penalty — penalize products with generic derivative markers
  //     (even if they passed the hard derivative check)
  const softDerivativePenalty = calculateSoftDerivativePenalty(productNameLower, ingredientData);
  score += WEIGHTS.DERIVATIVE_PENALTY * (1 - softDerivativePenalty);

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  log(`${checkLogPrefix}: PASS (score=${score.toFixed(3)})`, 'DEBUG', 'SCORER');
  return { pass: true, score, reason: 'pass' };
}


// ============================================================================
// COMPONENT SCORING FUNCTIONS
// ============================================================================

/**
 * Checks if required words are present in the product name.
 * Supports singular/plural matching (e.g., "banana" matches "bananas").
 */
function checkRequiredWords(productName, requiredWords = []) {
  if (!requiredWords || requiredWords.length === 0) {
    return { allPresent: true, missing: [], found: [] };
  }

  const missing = [];
  const found = [];

  for (const word of requiredWords) {
    if (!word) continue;
    const base = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match word boundary, allow optional trailing 's' for plurals
    const rx = new RegExp(`\\b${base}s?\\b`, 'i');
    if (rx.test(productName)) {
      found.push(word);
    } else {
      missing.push(word);
    }
  }

  return {
    allPresent: missing.length === 0,
    missing,
    found,
  };
}

/**
 * Detects if a product is a DERIVATIVE of the base ingredient.
 * 
 * E.g., "banana" ingredient → "Banana Yoghurt Pouch" is a derivative.
 * But "banana yoghurt" ingredient → "Banana Yoghurt Pouch" is NOT a derivative.
 * 
 * This is the core fix for the banana→yogurt mismatch problem.
 */
function checkDerivativeProduct(productNameLower, ingredientData, preprocessed) {
  const originalLower = (ingredientData.originalIngredient || '').toLowerCase().replace(/_/g, ' ');
  const cleanName = preprocessed?.cleanName || originalLower;
  const ingredientWords = cleanName.split(/\s+/).filter(Boolean);

  // Only apply derivative detection for simple produce items (1-2 words)
  if (ingredientWords.length > 2) {
    return { isDerivative: false, marker: null };
  }

  // Check if the base ingredient word has known derivative markers
  const baseWord = ingredientWords[0];
  const knownMarkers = PRODUCE_DERIVATIVE_MARKERS[baseWord];
  
  if (!knownMarkers) {
    // No known derivative markers for this ingredient; check generic ones
    // Only check generic markers for single-word ingredients
    if (ingredientWords.length === 1) {
      for (const marker of DERIVATIVE_MARKERS) {
        if (productNameLower.includes(marker)) {
          // But only fail if the marker word is NOT part of the original ingredient
          if (!originalLower.includes(marker)) {
            return { isDerivative: true, marker };
          }
        }
      }
    }
    return { isDerivative: false, marker: null };
  }

  // Check each known derivative marker
  for (const marker of knownMarkers) {
    if (productNameLower.includes(marker.toLowerCase())) {
      // Only flag as derivative if the marker is NOT part of the original ingredient name
      // E.g., "banana yoghurt" ingredient → "yoghurt" is expected, not derivative
      if (!originalLower.includes(marker.toLowerCase())) {
        return { isDerivative: true, marker };
      }
    }
  }

  return { isDerivative: false, marker: null };
}

/**
 * Category pass check — same logic as existing passCategory.
 */
function passCategory(product = {}, allowed = []) {
  if (!allowed || allowed.length === 0 || !product.product_category) return true;
  const pc = (product.product_category || '').toLowerCase();
  return allowed.some(a => pc.includes(a.toLowerCase()));
}

/**
 * Size check — same logic as existing sizeOk.
 */
function checkSize(product, targetSize, allowedCategories = [], log, checkLogPrefix) {
  const productSizeParsed = parseSize(product.product_size || product.size);
  if (!productSizeParsed || !targetSize || !targetSize.value || !targetSize.unit) {
    return { pass: true };
  }
  if (productSizeParsed.unit !== targetSize.unit) {
    log(`${checkLogPrefix}: WARN (Size Unit Mismatch)`, 'DEBUG', 'SCORER');
    return { pass: false };
  }
  
  const pantryCategories = ['pantry', 'grains', 'canned', 'spreads', 'condiments', 'drinks'];
  const isPantry = pantryCategories.some(c => allowedCategories.some(ac => ac.toLowerCase() === c));
  const maxMultiplier = isPantry ? 3.0 : 2.0;
  const minMultiplier = 0.5;
  
  const lowerBound = targetSize.value * minMultiplier;
  const upperBound = targetSize.value * maxMultiplier;
  
  if (productSizeParsed.value >= lowerBound && productSizeParsed.value <= upperBound) {
    return { pass: true };
  }
  
  log(`${checkLogPrefix}: FAIL (Size out of range)`, 'DEBUG', 'SCORER');
  return { pass: false };
}

/**
 * Calculates token overlap between ingredient name and product name.
 * Higher overlap = better match.
 */
function calculateTokenOverlap(productNameLower, ingredientData, preprocessed) {
  const cleanName = preprocessed?.coreNoun || 
    (ingredientData.originalIngredient || '').toLowerCase().replace(/_/g, ' ');
  
  const ingredientTokens = cleanName
    .split(/\s+/)
    .filter(w => w.length > 2) // Skip tiny words
    .map(w => w.toLowerCase());
  
  if (ingredientTokens.length === 0) return 0.5; // neutral score
  
  const productTokens = productNameLower.split(/\s+/).map(w => w.toLowerCase());
  
  let matches = 0;
  for (const token of ingredientTokens) {
    // Check for exact or plural match in product tokens
    const found = productTokens.some(pt => {
      return pt === token || pt === token + 's' || token === pt + 's';
    });
    if (found) matches++;
  }
  
  return matches / ingredientTokens.length;
}

/**
 * Scores product name simplicity.
 * Shorter names with fewer extra words are preferred because they're more likely
 * to be the base product rather than a flavored/variant product.
 * 
 * E.g., "Woolworths Bananas" scores higher than "Woolworths Banana Yoghurt Pouch Banana"
 */
function calculateSimplicity(productNameLower, ingredientData) {
  const productWords = productNameLower.split(/\s+/).filter(Boolean);
  const ingredientWords = (ingredientData.originalIngredient || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  
  // Ideal product name length is ingredient words + 1-2 (for store brand prefix)
  const idealLength = ingredientWords.length + 2;
  const actualLength = productWords.length;
  
  if (actualLength <= idealLength) return 1.0;
  
  // Penalize each extra word beyond ideal
  const extraWords = actualLength - idealLength;
  return Math.max(0, 1.0 - (extraWords * 0.15));
}

/**
 * Soft penalty for generic derivative markers in product name.
 * Unlike the hard derivative check, this applies a partial penalty
 * rather than outright rejection.
 * 
 * Returns 0-1 where 0 = no derivative markers, 1 = heavily derivative.
 */
function calculateSoftDerivativePenalty(productNameLower, ingredientData) {
  const originalLower = (ingredientData.originalIngredient || '').toLowerCase().replace(/_/g, ' ');
  let penaltyCount = 0;
  
  for (const marker of DERIVATIVE_MARKERS) {
    if (productNameLower.includes(marker) && !originalLower.includes(marker)) {
      penaltyCount++;
    }
  }
  
  // Cap at 1.0
  return Math.min(1.0, penaltyCount * 0.5);
}


// ============================================================================
// HELPERS
// ============================================================================

function parseSize(sizeString) {
  if (typeof sizeString !== 'string') return null;
  const sizeLower = sizeString.toLowerCase().replace(/\s/g, '');
  const match = sizeLower.match(/(\d+\.?\d*)\s*(g|kg|ml|l)/);
  if (match) {
    const value = parseFloat(match[1]);
    let unit = match[2];
    let valueInBaseUnits = value;
    if (unit === 'kg') { valueInBaseUnits *= 1000; unit = 'g'; }
    else if (unit === 'l') { valueInBaseUnits *= 1000; unit = 'ml'; }
    return { value: valueInBaseUnits, unit };
  }
  return null;
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  scoreProduct,
  checkRequiredWords,
  checkDerivativeProduct,
  passCategory,
  checkSize,
  calculateTokenOverlap,
  calculateSimplicity,
  BANNED_KEYWORDS,
  DERIVATIVE_MARKERS,
  WEIGHTS,
};