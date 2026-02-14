/**
 * utils/product-checker.js
 * =========================
 * Enhanced product validation for Market Run.
 *
 * Drop-in replacement for the inline runSmarterChecklist() in day.js and
 * generate-full-plan.js. Same signature, same { pass, score } return shape.
 *
 * Key additions over the original:
 * 1. Prepared-product detection — "Garlic Prawns Marinade" fails for ingredient "garlic"
 * 2. Graduated scoring (0–1) instead of binary 1.0/0
 * 3. Token-overlap scoring so "Woolworths Cheddar Cheese Block" beats
 *    "Chicken Burgers Zucchini & Cheddar Cheese"
 *
 * Version: 1.0.0
 */

'use strict';

const { isPreparedProduct, isWholeFood } = require('./ingredient-query-cleaner');

// ============================================================================
// SCORING
// ============================================================================

/**
 * Enhanced product checklist with graduated scoring.
 * Signature and return type are identical to the existing runSmarterChecklist.
 *
 * @param {object} product - Store API product { product_name, product_category, product_size, ... }
 * @param {object} ingredientData - LLM output { originalIngredient, requiredWords, negativeKeywords, targetSize, allowedCategories, _cleanName?, _isWholeFood? }
 * @param {function} log - Logger
 * @param {object} [ctx] - Extra context: { bannedKeywords, pantryCategories }
 * @returns {{ pass: boolean, score: number }}
 */
function runEnhancedChecklist(product, ingredientData, log, ctx = {}) {
  const productNameLower = (product.product_name || '').toLowerCase();
  if (!productNameLower) return { pass: false, score: 0 };

  if (!ingredientData || !ingredientData.originalIngredient) {
    log(`Checklist: Invalid ingredientData for "${product.product_name}"`, 'ERROR', 'CHECKLIST');
    return { pass: false, score: 0 };
  }

  const {
    originalIngredient,
    requiredWords = [],
    negativeKeywords = [],
    targetSize,
    allowedCategories = [],
    _cleanName,
    _isWholeFood,
  } = ingredientData;

  const prefix = `Checklist [${originalIngredient}] → "${product.product_name}"`;
  const bannedKeywords = ctx.bannedKeywords || DEFAULT_BANNED;

  // ── HARD FAILS (score = 0) ──────────────────────────────────────

  // 1. Global banned
  const banned = bannedKeywords.find(kw => productNameLower.includes(kw));
  if (banned) {
    log(`${prefix}: FAIL (Banned: '${banned}')`, 'DEBUG', 'CHECKLIST');
    return { pass: false, score: 0 };
  }

  // 2. Negative keywords
  if (negativeKeywords.length > 0) {
    const neg = negativeKeywords.find(kw => kw && productNameLower.includes(kw.toLowerCase()));
    if (neg) {
      log(`${prefix}: FAIL (Negative: '${neg}')`, 'DEBUG', 'CHECKLIST');
      return { pass: false, score: 0 };
    }
  }

  // 3. Required words
  if (!passRequiredWords(productNameLower, requiredWords)) {
    log(`${prefix}: FAIL (Required missing: [${requiredWords.join(', ')}])`, 'DEBUG', 'CHECKLIST');
    return { pass: false, score: 0 };
  }

  // 4. Category
  if (!passCategory(product, allowedCategories)) {
    log(`${prefix}: FAIL (Category: "${product.product_category}" not in [${allowedCategories.join(', ')}])`, 'DEBUG', 'CHECKLIST');
    return { pass: false, score: 0 };
  }

  // 5. ★ NEW — Prepared-product check for whole-food ingredients
  const ingredientIsWholeFood = _isWholeFood ?? isWholeFood(_cleanName || originalIngredient);
  if (ingredientIsWholeFood && isPreparedProduct(productNameLower)) {
    log(`${prefix}: FAIL (Prepared product for whole-food ingredient)`, 'DEBUG', 'CHECKLIST');
    return { pass: false, score: 0 };
  }

  // 6. Size check (skip for produce/fruit/veg)
  const isProduceOrFruit = allowedCategories.some(c => ['fruit', 'produce', 'veg'].includes(c));
  if (!isProduceOrFruit) {
    const productSizeParsed = parseSize(product.product_size);
    if (!sizeOk(productSizeParsed, targetSize, allowedCategories)) {
      log(`${prefix}: FAIL (Size mismatch)`, 'DEBUG', 'CHECKLIST');
      return { pass: false, score: 0 };
    }
  }

  // ── GRADUATED SCORING (all hard checks passed) ─────────────────

  let score = 0.65; // Base pass score

  // Bonus: token overlap — how many ingredient words appear in product name?
  const cleanName = (_cleanName || originalIngredient || '').toLowerCase().replace(/_/g, ' ');
  const ingredientTokens = cleanName.split(/\s+/).filter(w => w.length > 2);
  const productTokens = productNameLower.split(/\s+/);

  if (ingredientTokens.length > 0) {
    let tokenHits = 0;
    for (const tok of ingredientTokens) {
      if (productTokens.some(pt => pt === tok || pt === tok + 's' || tok === pt + 's')) {
        tokenHits++;
      }
    }
    score += 0.15 * (tokenHits / ingredientTokens.length);
  }

  // Bonus: simpler product name = more likely the base product
  const idealWordCount = ingredientTokens.length + 2; // +brand +variant
  const extraWords = Math.max(0, productTokens.length - idealWordCount);
  score += 0.10 * Math.max(0, 1 - extraWords * 0.12);

  // Bonus: product name starts with store name + ingredient (exact prefix match)
  const storePrefixed = productNameLower.startsWith(cleanName) ||
    productNameLower.replace(/^(woolworths|coles)\s+/, '').startsWith(cleanName);
  if (storePrefixed) score += 0.10;

  score = Math.min(1.0, Math.max(0, score));

  log(`${prefix}: PASS (score=${score.toFixed(3)})`, 'DEBUG', 'CHECKLIST');
  return { pass: true, score };
}


// ============================================================================
// HELPERS (carried over from existing code, kept in sync)
// ============================================================================

function passRequiredWords(title = '', required = []) {
  if (!required || required.length === 0) return true;
  const t = title.toLowerCase();
  return required.every(w => {
    if (!w) return true;
    const base = w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`\\b${base}s?\\b`, 'i');
    return rx.test(t);
  });
}

function passCategory(product = {}, allowed = []) {
  if (!allowed || allowed.length === 0 || !product.product_category) return true;
  const pc = (product.product_category || '').toLowerCase();
  return allowed.some(a => pc.includes(a.toLowerCase()));
}

function parseSize(sizeString) {
  if (typeof sizeString !== 'string') return null;
  const match = sizeString.toLowerCase().replace(/\s/g, '').match(/(\d+\.?\d*)\s*(g|kg|ml|l)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  let unit = match[2];
  let v = value;
  if (unit === 'kg') { v *= 1000; unit = 'g'; }
  else if (unit === 'l') { v *= 1000; unit = 'ml'; }
  return { value: v, unit };
}

const PANTRY_CATS = ['pantry', 'grains', 'canned', 'spreads', 'condiments', 'drinks'];

function sizeOk(productSizeParsed, targetSize, allowedCategories = []) {
  if (!productSizeParsed || !targetSize || !targetSize.value || !targetSize.unit) return true;
  if (productSizeParsed.unit !== targetSize.unit) return false;
  const isPantry = PANTRY_CATS.some(c => allowedCategories.some(ac => ac.toLowerCase() === c));
  const maxMul = isPantry ? 3.0 : 2.0;
  const lo = targetSize.value * 0.5;
  const hi = targetSize.value * maxMul;
  return productSizeParsed.value >= lo && productSizeParsed.value <= hi;
}

const DEFAULT_BANNED = [
  'cigarette', 'capsule', 'deodorant', 'pet', 'cat food', 'dog food', 'bird',
  'toy', 'non-food', 'supplement', 'vitamin', 'tobacco', 'vape', 'roll-on',
  'binder', 'folder', 'stationery', 'lighter', 'shampoo', 'conditioner',
  'soap', 'lotion', 'cleaner', 'spray', 'polish', 'air freshener',
  'mouthwash', 'toothpaste', 'floss', 'gum', 'nappy', 'nappies',
  'dishwashing', 'laundry', 'bleach', 'detergent', 'insect',
];

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  runEnhancedChecklist,
  passRequiredWords,
  passCategory,
  parseSize,
  sizeOk,
  DEFAULT_BANNED,
};