// --- api/plan/helpers/market-helpers.js ---
// Extracted from generate-full-plan.js (refactor-only, no logic changes)
// Contains: calculateUnitPrice, parseSize, passRequiredWords, mean,
//           normalizeStateHintForItem, synthTight, synthWide, passSimplePantryChecklist

const { PANTRY_CATEGORIES, FAIL_FAST_CATEGORIES } = require('./config');

const calculateUnitPrice = (price, size) => {
    if (!price || price <= 0 || typeof size !== 'string' || size.length === 0) return price;
    const sizeLower = size.toLowerCase().replace(/\s/g, '');
    let numericSize = 0;
    const match = sizeLower.match(/(\d+\.?\d*)(g|kg|ml|l)/);
    if (match) {
        numericSize = parseFloat(match[1]);
        const unit = match[2];
        if (numericSize > 0) {
            let totalUnits = (unit === 'kg' || unit === 'l') ? numericSize * 1000 : numericSize;
            if (totalUnits >= 100) return (price / totalUnits) * 100;
        }
    }
    return price; // Fallback
};

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
        return { value: valueInBaseUnits, unit: unit };
    }
    return null;
}

// --- passRequiredWords ---
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

const mean = (arr) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

// --- passSimplePantryChecklist ---
function passSimplePantryChecklist(product, ingredient, log) {
    // Simple pantry check: if ingredient is in a pantry category, the product should also be
    const cat = (ingredient.category || '').toLowerCase();
    const isPantryIngredient = PANTRY_CATEGORIES.some(pc => cat.includes(pc));
    if (!isPantryIngredient) return true; // Not a pantry item, pass

    const productTitle = (product.name || '').toLowerCase();
    // Fail if the product title contains fail-fast category keywords (produce, meat, dairy, etc.)
    const isMislabeled = FAIL_FAST_CATEGORIES.some(fc => productTitle.includes(fc));
    if (isMislabeled) {
        log(`[pantry_check] "${product.name}" flagged: pantry ingredient "${ingredient.originalIngredient}" matched ${isPantryIngredient ? 'pantry' : 'perishable'})`, 'DEBUG', 'CHECKLIST');
        return false;
    }
    return true; // Passes basic check. Note: This is NOT the enhanced checker.
}

// --- State Hint Normalizer (New function for step 4) ---
function normalizeStateHintForItem(item, log) {
  const key = (item.key || '').toLowerCase();
  let hint = (item.stateHint || '').toLowerCase().trim();

  // If hint is invalid, drop it to force defaulting
  const validHints = ['dry', 'raw', 'cooked', 'as_pack'];
  if (!validHints.includes(hint)) {
    if (hint) {
      log(`Invalid stateHint '${hint}' for '${item.key}'. Clearing hint to force default/fallback.`, 'WARN', 'STATE_HINT');
    }
    hint = '';
  }

  // If the hint is still empty, apply defaults based on key:
  if (!hint) {
    // Grain / pasta default: DRY
    const isGrain =
      key.includes('oat') ||
      key.includes('rice') ||
      key.includes('pasta') ||
      key.includes('noodle') ||
      key.includes('quinoa') ||
      key.includes('couscous') ||
      key.includes('barley') ||
      key.includes('bulgur') ||
      key.includes('polenta') ||
      key.includes('buckwheat') ||
      key.includes('millet');

    if (isGrain) {
      hint = 'dry';
    }

    // Meat / fish default: RAW
    const isMeatOrFish =
      key.includes('chicken') ||
      key.includes('beef') ||
      key.includes('pork') ||
      key.includes('lamb') ||
      key.includes('fish') ||
      key.includes('salmon') ||
      key.includes('tuna') ||
      key.includes('mince');

    if (!hint && isMeatOrFish) {
      hint = 'raw';
    }

    // Dairy / bread / packaged default: AS_PACK
    const isPackaged =
      key.includes('milk') ||
      key.includes('yogurt') ||
      key.includes('yoghurt') ||
      key.includes('bread') ||
      key.includes('cheese') ||
      key.includes('wrap') ||
      key.includes('tortilla');

    if (!hint && isPackaged) {
      hint = 'as_pack';
    }

    // Final fallback: leave empty, transforms will still handle it
    if (!hint && log) {
      log(`No stateHint for '${item.key}', leaving undefined (will use transforms fallback).`, 'WARN', 'STATE_HINT');
    }
  }

  // Mutate item in place so downstream code uses normalized stateHint
  item.stateHint = hint;

  return item;
}

function synthTight(ing, store) {
  if (!ing || !store) return null;
  const size = ing.targetSize?.value && ing.targetSize?.unit ? ` ${ing.targetSize.value}${ing.targetSize.unit}` : "";
  const original = typeof ing.originalIngredient === 'string' ? ing.originalIngredient : '';
  return `${store} ${original}${size}`.toLowerCase().trim();
}

function synthWide(ing, store) {
  if (!ing || !store) return null;
  const noun = (Array.isArray(ing.requiredWords) && ing.requiredWords.length > 0 && typeof ing.requiredWords[0] === 'string')
    ? ing.requiredWords[0]
    : (typeof ing.originalIngredient === 'string' ? ing.originalIngredient.split(" ")[0] : '');
  if (!noun) return null;
  return `${store} ${noun}`.toLowerCase().trim();
}

module.exports = {
    calculateUnitPrice,
    parseSize,
    passRequiredWords,
    mean,
    passSimplePantryChecklist,
    normalizeStateHintForItem,
    synthTight,
    synthWide,
};
