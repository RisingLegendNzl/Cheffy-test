// web/src/helpers/humanize.js
// =============================================================================
// Utility to convert snake_case or other machine-format strings into
// human-readable display text.
//
// Examples:
//   humanize('chicken_breast')   → 'Chicken Breast'
//   humanize('olive_oil')        → 'Olive Oil'
//   humanize('brown_rice')       → 'Brown Rice'
//   humanize('Chicken Breast')   → 'Chicken Breast'  (already clean)
//   humanize('')                 → ''
//   humanize(null)               → ''
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

export default humanize;
