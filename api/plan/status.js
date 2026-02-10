// api/plan/status.js
// ---------------------------------------------------------------------------
// Plan Status Polling Endpoint
// ---------------------------------------------------------------------------
// Allows the frontend to recover a completed plan if the SSE stream was
// interrupted. Reads from Vercel KV where generate-full-plan.js persists
// run status.
//
// v2 CHANGES:
// - Returns `lastPhase` field when status is 'running' so the frontend can
//   show meaningful progress during recovery polling.
// - Returns `startedAt` when available for client-side staleness checks.
// ---------------------------------------------------------------------------

const { createClient } = require('@vercel/kv');

const kv = createClient({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

let kvReady = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Method not allowed',
            message: 'Only GET requests are supported'
        });
    }

    const runId = req.query.runId;

    if (!runId || typeof runId !== 'string' || runId.length < 10) {
        return res.status(400).json({
            error: 'Invalid runId',
            message: 'A valid runId query parameter is required'
        });
    }

    if (!kvReady) {
        return res.status(503).json({
            error: 'Storage unavailable',
            message: 'KV store is not configured',
            status: 'unknown'
        });
    }

    try {
        const key = `cheffy:run:${runId}`;
        const raw = await kv.get(key);

        if (!raw) {
            return res.status(200).json({
                status: 'unknown',
                message: 'No record found for this run ID. It may have expired or never existed.'
            });
        }

        const record = typeof raw === 'string' ? JSON.parse(raw) : raw;

        switch (record.status) {
            case 'complete':
                return res.status(200).json({
                    status: 'complete',
                    payload: record.payload,
                    updatedAt: record.updatedAt
                });

            case 'failed':
                return res.status(200).json({
                    status: 'failed',
                    payload: record.payload,
                    updatedAt: record.updatedAt
                });

            case 'running':
                return res.status(200).json({
                    status: 'running',
                    updatedAt: record.updatedAt,
                    // v2: Surface the last phase name so the frontend can show
                    // progress during recovery polling (e.g. "Market run in
                    // progress…"). Falls back gracefully if not set.
                    lastPhase: record.lastPhase || null,
                    startedAt: record.startedAt || null
                });

            default:
                return res.status(200).json({
                    status: record.status || 'unknown',
                    updatedAt: record.updatedAt
                });
        }
    } catch (error) {
        console.error('[PLAN_STATUS] Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message || 'Failed to retrieve plan status'
        });
    }
};