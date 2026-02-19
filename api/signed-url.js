// api/signed-url.js
// =============================================================================
// Vercel Serverless Function — ElevenLabs Signed URL
//
// Requests a short-lived signed WebSocket URL from ElevenLabs for the
// Conversational AI agent (Eleven v3 model).
//
// Env vars required:
//   ELEVENLABS_API_KEY            (server-only)
//   NEXT_PUBLIC_ELEVENLABS_AGENT_ID  (client + server)
// =============================================================================

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

  if (!apiKey) {
    console.error('[signed-url] ELEVENLABS_API_KEY is not set');
    return res.status(500).json({ error: 'Server misconfigured: missing API key' });
  }

  if (!agentId) {
    console.error('[signed-url] NEXT_PUBLIC_ELEVENLABS_AGENT_ID is not set');
    return res.status(500).json({ error: 'Server misconfigured: missing agent ID' });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[signed-url] ElevenLabs API error (${response.status}):`, errorBody);
      return res.status(response.status).json({
        error: 'Failed to get signed URL from ElevenLabs',
        detail: errorBody,
      });
    }

    const data = await response.json();

    // ElevenLabs returns { signed_url: "wss://..." }
    return res.status(200).json({ signedUrl: data.signed_url });
  } catch (err) {
    console.error('[signed-url] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
