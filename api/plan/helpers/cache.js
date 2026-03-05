// --- api/plan/helpers/cache.js ---
// Extracted from generate-full-plan.js (refactor-only, no logic changes)
// Contains: cacheGet, cacheSet, hashString, setRunStatus, getRunStatus

const crypto = require('crypto');
const { kv, isKvReady } = require('./config');

// --- Cache Helpers ---
async function cacheGet(key, log) {
  if (!isKvReady()) return null;
  try {
    const hit = await kv.get(key);
    if (hit) log(`Cache HIT for key: ${key.split(':').pop()}`, 'DEBUG', 'CACHE');
    return hit;
  } catch (e) {
    log(`Cache GET Error: ${e.message}`, 'ERROR', 'CACHE');
    return null;
  }
}

async function cacheSet(key, val, ttl, log) {
  if (!isKvReady()) return;
  try {
    await kv.set(key, val, { px: ttl });
    log(`Cache SET for key: ${key.split(':').pop()}`, 'DEBUG', 'CACHE');
  } catch (e) {
    log(`Cache SET Error: ${e.message}`, 'ERROR', 'CACHE');
  }
}

function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

// CHANGE 4: Persist `lastPhase` to KV for polling progress
async function setRunStatus(runId, status, payload, log, lastPhase = null) {
    if (!isKvReady()) return;
    const key = `cheffy:run:${runId}`;
    const ttl = 1000 * 60 * 60; // 1 hour
    try {
        const record = {
            status,
            payload,
            updatedAt: new Date().toISOString(),
        };
        // Include lastPhase and startedAt for running status
        if (lastPhase) record.lastPhase = lastPhase;
        if (status === 'running') record.startedAt = record.startedAt || new Date().toISOString();

        await kv.set(key, JSON.stringify(record), { px: ttl });
        log(`Run status SET: ${key} → ${status}${lastPhase ? ` (phase: ${lastPhase})` : ''}`, 'DEBUG', 'RUN_STATUS');
    } catch (e) {
        log(`Run status SET Error: ${e.message}`, 'ERROR', 'RUN_STATUS');
    }
}

async function getRunStatus(runId, log) {
    if (!isKvReady()) return null;
    const key = `cheffy:run:${runId}`;
    try {
        const raw = await kv.get(key);
        if (!raw) return null;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        if (log) log(`Run status GET Error: ${e.message}`, 'ERROR', 'RUN_STATUS');
        return null;
    }
}
// --- End Cache Helpers ---

module.exports = {
    cacheGet,
    cacheSet,
    hashString,
    setRunStatus,
    getRunStatus,
};
