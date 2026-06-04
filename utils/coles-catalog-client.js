// --- Cheffy: api/coles-catalog-client.js ---
// Coles Australia Full Catalog & Pricing Intelligence API — HTTPS client.
//
// SCOPE OF THIS FILE (deliberate, per current build step):
//   This is the axios client for the new catalog API PLUS a drop-in,
//   `fetchPriceData`-compatible wrapper (`fetchColesCatalogData`). The wrapper's
//   adapter emits the **existing old-API field names** (product_name, product_brand,
//   current_price, product_size, url, barcode, product_category) so that the live
//   orchestrator's market loop — including its `if (!rawProduct.product_name) continue;`
//   guard and its `runEnhancedChecklist(...)` call — keeps working WITHOUT EDITS.
//
//   It does NOT implement the GrocerySource seam / NormalizedProduct shape. That is a
//   later step. Keeping this commit additive (new file, new env var, new cache prefix)
//   minimises blast radius.
//
// RESILIENCE: mirrors api/price-search.js *in spirit* (that file is NOT edited):
//   - network/5xx retry with backoff + single dedicated 429 retry
//   - in-memory token bucket (per-instance; RapidAPI has its own 429 handling)
//   - SWR KV cache via @vercel/kv with a circuit breaker + fast-fail timeout
//   - fire-and-forget cache SET (never blocks the hot path)
//   - DISTINCT cache prefix `coles_cat` (never collides with price-search `search:`)
//
// SECURITY: COLES_CATALOG_API_KEY is read from env only. It is never logged, echoed,
//   or interpolated into any log line or error message.

'use strict';

const axios = require('axios');
const { createClient } = require('@vercel/kv');

// ============================================================
// CONFIG
// ============================================================

const CATALOG_HOST =
  'coles-australia-full-catalog-pricing-intelligence-api.p.rapidapi.com';
const CATALOG_API_KEY = process.env.COLES_CATALOG_API_KEY;

// Convention required by the API.
const CONTEXT_MODE = 'delivery';

const REQUEST_TIMEOUT_MS = 6000;
const MAX_RETRIES = 3;            // network/5xx attempts
const BACKOFF_BASE_MS = 1200;
const ONE_429_RETRY_DELAY_MS = 700;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// --- KV cache config ---
const kv = createClient({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Distinct prefix so this never shares keys with price-search.js ("search:").
const CACHE_PREFIX = 'coles_cat';

// Per-endpoint TTL / stale windows.
const TTL = {
  search:     { ttl: 1000 * 60 * 60 * 3,  swr: 1000 * 60 * 60 * 1  }, // 3h / 1h
  category:   { ttl: 1000 * 60 * 60 * 3,  swr: 1000 * 60 * 60 * 1  }, // 3h / 1h
  specials:   { ttl: 1000 * 60 * 30,      swr: 1000 * 60 * 10      }, // 30m / 10m
  categories: { ttl: 1000 * 60 * 60 * 24, swr: 1000 * 60 * 60 * 12 }, // 24h / 12h (rarely changes)
};

// --- KV circuit breaker / fast-fail (mirrors price-search.js) ---
const KV_TIMEOUT_MS = 800;
const CB_THRESHOLD = 3;
const CB_COOLDOWN_MS = 60000;

let cb = { failures: 0, lastFailure: 0, isOpen: false };

function isKvAvailable() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return false;
  if (!cb.isOpen) return true;
  if (Date.now() - cb.lastFailure > CB_COOLDOWN_MS) {
    cb.isOpen = false;
    cb.failures = 0;
    return true; // allow a probe
  }
  return false;
}
function recordKvSuccess() { cb.failures = 0; cb.isOpen = false; }
function recordKvFailure(log, op) {
  cb.failures++;
  cb.lastFailure = Date.now();
  if (cb.failures >= CB_THRESHOLD && !cb.isOpen) {
    cb.isOpen = true;
    log(`Catalog KV circuit breaker OPEN after ${cb.failures} failures (op=${op}). Bypassing KV ${CB_COOLDOWN_MS / 1000}s.`, 'WARN', 'COLES_CAT_CB');
  }
}

async function kvGetSafe(key, log) {
  if (!isKvAvailable()) return null;
  try {
    const result = await Promise.race([
      kv.get(key),
      new Promise((_, rej) => setTimeout(() => rej(new Error('KV_TIMEOUT')), KV_TIMEOUT_MS)),
    ]);
    recordKvSuccess();
    return result;
  } catch (err) {
    recordKvFailure(log, 'GET');
    const level = cb.isOpen ? 'DEBUG' : 'WARN';
    log(`Catalog KV GET failed for ${key}: ${err.message}`, level, 'COLES_CAT_KV', { timeout_ms: KV_TIMEOUT_MS });
    return null;
  }
}

function kvSetAsync(key, value, options, log) {
  if (!isKvAvailable()) return;
  kv.set(key, value, options)
    .then(() => recordKvSuccess())
    .catch(() => recordKvFailure(log, 'SET'));
}

// --- In-memory token bucket (per-instance) ---
const BUCKET_CAPACITY = 12;
const BUCKET_REFILL_PER_SEC = 12;
const inMemoryBuckets = {};

function acquireToken(bucketKey) {
  const now = Date.now();
  if (!inMemoryBuckets[bucketKey]) {
    inMemoryBuckets[bucketKey] = { tokens: BUCKET_CAPACITY - 1, lastRefill: now };
    return true;
  }
  const b = inMemoryBuckets[bucketKey];
  const elapsed = now - b.lastRefill;
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + elapsed * (BUCKET_REFILL_PER_SEC / 1000));
  b.lastRefill = now;
  if (b.tokens >= 1) { b.tokens -= 1; return true; }
  return false;
}

const inflightRefreshes = new Set();

// Local key normaliser (kept local, like price-search.js; not the scripts/normalize one).
const normCacheToken = (s) => (s || '').toString().toLowerCase().trim().replace(/\s+/g, '_');

// ============================================================
// FIELD MAPPING — single source of truth
// ============================================================

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : (v == null ? null : (Number.isNaN(parseFloat(v)) ? null : parseFloat(v))));

/**
 * mapColesProduct — the ONE place catalog field names are read.
 *
 * Returns an OLD-API-SHAPED product. The load-bearing keys for the unedited
 * orchestrator market loop are:
 *   - product_name      (loop guard: `if (!rawProduct.product_name) continue;`)
 *   - product_brand, current_price, product_size, url, barcode
 *   - product_category  (read by runEnhancedChecklist)
 *
 * current_price is set to the EFFECTIVE price (discount_price ?? price) so that the
 * loop's `calculateUnitPrice(current_price, product_size)` reproduces the already-
 * discounted per-100 value with zero specials-awareness in the loop.
 *
 * Additive fields (regular_price, discount_price, effective_price, price_per_100,
 * breadcrumbs, image, in_stock, promotion_*) are passthrough extras for later
 * steps/UI; they do not alter the existing contract.
 *
 * @param {object} raw - a catalog `results[]` row (search or specials)
 * @returns {object} old-API-shaped product, or null if unusable
 */
function mapColesProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name ?? null;
  if (!name) return null; // without a name the loop would skip it anyway

  const regular = num(raw.price);
  const discount = ('discount_price' in raw) ? num(raw.discount_price) : null; // absent != null
  // Specials feed exposes effective_price directly; prefer it when present & lower.
  let effective = discount != null ? discount : regular;
  if (typeof raw.effective_price === 'number') {
    effective = (effective == null) ? raw.effective_price : Math.min(effective, raw.effective_price);
  }

  // Structured per-100: trust only when basis is g/ml per 100 (already discount-derived).
  let pricePer100 = null;
  if ((raw.price_per_unit_unit === 'g' || raw.price_per_unit_unit === 'ml')
      && raw.price_per_unit_quantity === 100
      && typeof raw.price_per_unit_price === 'number') {
    pricePer100 = raw.price_per_unit_price;
  }
  // else: leave null — the orchestrator's calculateUnitPrice(current_price, size) covers it,
  // and that is exactly the fallback for count/volume-pack items (e.g. unit "l"/qty 1, or "ea").

  const inStock = (raw.in_stock ?? raw.is_available);
  const image = raw.image ?? (Array.isArray(raw.images) && raw.images[0]) ?? null;

  return {
    // ── OLD-API CONTRACT (names are load-bearing; do not rename) ──
    product_name: name,
    product_brand: raw.brand ?? null,
    product_category: raw.category ?? '',
    product_size: raw.size ?? null,
    current_price: effective,          // effective drives the loop's unit-price calc
    url: raw.source_url ?? null,
    barcode: null,                     // confirmed: no barcode field exists upstream

    // ── ADDITIVE EXTRAS (safe passthrough for later steps / UI) ──
    id: raw.id ?? null,                // specials<->search join key
    regular_price: regular,            // the "was" price
    discount_price: discount,          // null when not on special
    effective_price: effective,
    price_per_100: pricePer100,        // pre-validated per-100g/ml or null
    breadcrumbs: Array.isArray(raw.breadcrumbs) ? raw.breadcrumbs : [],
    image,
    in_stock: inStock === undefined ? true : inStock,
    currency: raw.currency ?? 'AUD',
    promotion_type: raw.promotion_type ?? null,
    promotion_label: raw.promotion_label ?? null,
    catalogue_id: raw.catalogue_id ?? null,
  };
}

// ============================================================
// LOW-LEVEL FETCH (single attempt) + RESILIENT WRAPPER
// ============================================================

function buildUrl(path) {
  return `https://${CATALOG_HOST}${path}`;
}

function headers() {
  return { 'x-rapidapi-host': CATALOG_HOST, 'x-rapidapi-key': CATALOG_API_KEY };
}

/**
 * One axios GET with retry (network/5xx) + one dedicated 429 retry.
 * Returns the raw response body object, or throws on definitive failure.
 * The API key is NEVER included in any thrown message or log.
 */
async function _getOnce(path, params, log) {
  if (!CATALOG_API_KEY) {
    log('Configuration error: COLES_CATALOG_API_KEY is not set.', 'CRITICAL', 'COLES_CAT_CONFIG');
    const e = new Error('Server configuration error: catalog API key missing.');
    e.statusCode = 500;
    throw e;
  }

  let did429Retry = false;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const started = Date.now();
    try {
      const resp = await axios.get(buildUrl(path), {
        params: { context_mode: CONTEXT_MODE, ...params },
        headers: headers(),
        timeout: REQUEST_TIMEOUT_MS,
      });
      log(`Catalog GET ok ${path}`, 'SUCCESS', 'COLES_CAT_HTTP', {
        count: resp.data?.results?.length ?? 0,
        status: resp.status,
        latency_ms: Date.now() - started,
      });
      return resp.data;
    } catch (err) {
      const status = err.response?.status;
      const is429 = status === 429;
      const is5xx = status >= 500 && status <= 599;
      const isNetwork = err.code === 'ECONNABORTED' || err.code === 'EAI_AGAIN'
        || (err.message || '').includes('timeout');

      log(`Catalog GET failed ${path} (attempt ${attempt + 1}/${MAX_RETRIES})`, 'WARN', 'COLES_CAT_HTTP', {
        status: status || 'network', is429, is5xx, isNetwork, latency_ms: Date.now() - started,
      });

      if (is429 && !did429Retry) {
        did429Retry = true;
        await delay(ONE_429_RETRY_DELAY_MS);
        continue; // single dedicated 429 retry
      }
      if ((is5xx || isNetwork) && attempt < MAX_RETRIES - 1) {
        await delay(BACKOFF_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      // Non-retryable (4xx other than 429) or retries exhausted.
      const e = new Error(`Catalog request to ${path} failed (status ${status || 'network'}).`);
      e.statusCode = status || 504;
      throw e;
    }
  }
  const e = new Error(`Catalog request to ${path} failed after ${MAX_RETRIES} attempts.`);
  e.statusCode = 504;
  throw e;
}

/**
 * Resilient GET with SWR KV cache. Returns the raw response body (post-cache),
 * never throws — on failure returns null and lets callers shape an error envelope.
 */
async function _getCached(path, params, cacheKey, ttlCfg, bucketKey, log) {
  // 1. Cache (fast-fail).
  const cached = await kvGetSafe(cacheKey, log);
  if (cached && typeof cached === 'object' && cached.data && cached.ts) {
    const age = Date.now() - cached.ts;
    if (age < ttlCfg.swr) {
      log(`Catalog cache HIT (fresh) ${cacheKey}`, 'INFO', 'COLES_CAT_CACHE', { age_ms: age });
      return cached.data;
    }
    if (age < ttlCfg.ttl) {
      log(`Catalog cache HIT (stale) ${cacheKey} — serving + refreshing`, 'INFO', 'COLES_CAT_CACHE', { age_ms: age });
      _refreshInBackground(path, params, cacheKey, ttlCfg, bucketKey, log);
      return cached.data;
    }
  }

  // 2. Miss — token-bucket then fetch.
  if (!acquireToken(bucketKey)) {
    await delay(100);
    acquireToken(bucketKey); // proceed regardless; upstream 429 handling covers us
  }
  try {
    const data = await _getOnce(path, params, log);
    if (data && !data.detail) {
      kvSetAsync(cacheKey, { data, ts: Date.now() }, { px: ttlCfg.ttl }, log);
    }
    return data;
  } catch (err) {
    log(`Catalog fetch failed ${path}: ${err.message}`, 'ERROR', 'COLES_CAT_HTTP', { status: err.statusCode });
    return null;
  }
}

function _refreshInBackground(path, params, cacheKey, ttlCfg, bucketKey, log) {
  if (inflightRefreshes.has(cacheKey)) return;
  inflightRefreshes.add(cacheKey);
  (async () => {
    try {
      const fresh = await _getOnce(path, params, log);
      if (fresh && !fresh.detail) {
        kvSetAsync(cacheKey, { data: fresh, ts: Date.now() }, { px: ttlCfg.ttl }, log);
      }
    } catch (e) {
      log(`Catalog bg refresh failed ${cacheKey}: ${e.message}`, 'DEBUG', 'COLES_CAT_SWR');
    } finally {
      inflightRefreshes.delete(cacheKey);
    }
  })();
}

// ============================================================
// PUBLIC: RAW-ISH ENDPOINT FUNCTIONS
// Each returns a normalized envelope { results, total, page, error }.
// `results` are mapped through mapColesProduct (old-API shape + extras).
// ============================================================

async function colesSearch(query, { page = 1, limit = 30 } = {}, log = console.log) {
  if (!query) return { results: [], total: 0, page, error: { message: 'Missing query', status: 400 } };
  const cacheKey = `${CACHE_PREFIX}:search:${normCacheToken(query)}:${page}:${limit}`;
  const data = await _getCached('/coles/search', { query, page, limit }, cacheKey, TTL.search, 'search', log);
  if (!data) return { results: [], total: 0, page, error: { message: 'Catalog search failed', status: 502 } };
  const results = Array.isArray(data.results) ? data.results.map(mapColesProduct).filter(Boolean) : [];
  return { results, total: data.total ?? results.length, page: data.page ?? page, error: null };
}

async function colesCategory({ category_id, slug, url, page = 1, limit = 30 } = {}, log = console.log) {
  if (!category_id && !slug && !url) {
    return { results: [], total: 0, page, error: { message: 'Provide slug, url or category_id', status: 400 } };
  }
  const idToken = normCacheToken(category_id || slug || url);
  const cacheKey = `${CACHE_PREFIX}:category:${idToken}:${page}:${limit}`;
  const params = { page, limit };
  if (category_id) params.category_id = category_id;
  if (slug) params.slug = slug;
  if (url) params.url = url;
  const data = await _getCached('/coles/category', params, cacheKey, TTL.category, 'category', log);
  if (!data) return { results: [], total: 0, page, error: { message: 'Catalog category failed', status: 502 } };
  const results = Array.isArray(data.results) ? data.results.map(mapColesProduct).filter(Boolean) : [];
  return { results, total: data.total ?? results.length, page: data.page ?? page, error: null };
}

async function colesCategories(log = console.log) {
  const cacheKey = `${CACHE_PREFIX}:categories:v1`;
  const data = await _getCached('/coles/categories', { refresh: false }, cacheKey, TTL.categories, 'categories', log);
  if (!data) return { results: [], total: 0, error: { message: 'Catalog categories failed', status: 502 } };
  // Categories are taxonomy rows, NOT products — return as-is (do not map through mapColesProduct).
  const results = Array.isArray(data.results) ? data.results : [];
  return { results, total: data.count ?? results.length, error: null };
}

async function colesSpecials({ special = 'allspecials', page = 1, limit = 30 } = {}, log = console.log) {
  const cacheKey = `${CACHE_PREFIX}:specials:${normCacheToken(special)}:${page}:${limit}`;
  const data = await _getCached('/coles/specials', { special, page, limit }, cacheKey, TTL.specials, 'specials', log);
  if (!data) return { results: [], total: 0, page, error: { message: 'Catalog specials failed', status: 502 } };
  const results = Array.isArray(data.results) ? data.results.map(mapColesProduct).filter(Boolean) : [];
  return { results, total: data.total ?? results.length, page: data.page ?? page, error: null };
}

// ============================================================
// PUBLIC: fetchPriceData-COMPATIBLE WRAPPER
// ============================================================

/**
 * fetchColesCatalogData — drop-in shaped like api/price-search.js `fetchPriceData`.
 *
 * Returns `{ data, waitMs }` where `data` is an OLD-API envelope:
 *   { results: <old-API-shaped products>, total_pages, current_page, error? }
 *
 * This is what the orchestrator's market loop already destructures:
 *   const { data: priceData } = await fetchColesCatalogData('Coles', query, 1, log);
 *   const rawProducts = priceData.results || [];   // each has .product_name etc.
 *
 * `store` is accepted for signature-compatibility with fetchPriceData but is only
 * validated as Coles (this client serves the Coles catalog API exclusively).
 *
 * @param {string} store - expected 'Coles'
 * @param {string} query
 * @param {number} page
 * @param {function} log
 * @returns {Promise<{data: object, waitMs: number}>}
 */
async function fetchColesCatalogData(store, query, page = 1, log = console.log) {
  if (store && store !== 'Coles') {
    log(`fetchColesCatalogData called with non-Coles store "${store}".`, 'WARN', 'COLES_CAT_INPUT');
    return { data: { error: { message: `This client serves Coles only (got "${store}").`, status: 400 }, results: [], total_pages: 0, current_page: page }, waitMs: 0 };
  }
  if (!query) {
    return { data: { error: { message: 'Missing required parameter: query.', status: 400 }, results: [], total_pages: 0, current_page: page }, waitMs: 0 };
  }

  const { results, total, error } = await colesSearch(query, { page, limit: 30 }, log);

  if (error) {
    // Preserve the old-API error envelope shape (loop checks `priceData.error`).
    return { data: { error: { message: error.message, status: error.status }, results: [], total_pages: 0, current_page: page }, waitMs: 0 };
  }

  const totalPages = Math.max(1, Math.ceil((total || results.length) / 30));
  return {
    data: {
      results,                 // old-API-shaped products (product_name, current_price, ...)
      total_pages: totalPages,
      current_page: page,
      // no `error` key on success — matches price-search.js success envelope
    },
    waitMs: 0,
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // fetchPriceData-compatible wrapper (the integration point for the unedited loop):
  fetchColesCatalogData,
  // endpoint helpers (used by later steps — source seam, classifier, specials join):
  colesSearch,
  colesCategory,
  colesCategories,
  colesSpecials,
  // field-name single source of truth (exported for unit tests / later reuse):
  mapColesProduct,
};
