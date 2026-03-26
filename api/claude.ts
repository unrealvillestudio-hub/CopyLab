// ============================================================
// UNRLVL CopyLab — api/claude.ts
// Proxy serverless Vercel → Anthropic API
// La API key NUNCA sale al cliente — solo vive en env vars Vercel
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[api/claude] ANTHROPIC_API_KEY no definida en env vars')
    return res.status(500).json({ error: 'API key no configurada' })
  }

  try {
    const upstream = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(req.body),
    })

    const data = await upstream.json()

    if (!upstream.ok) {
      console.error('[api/claude] Anthropic error:', upstream.status, data)
      return res.status(upstream.status).json(data)
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('[api/claude] Error interno:', err)
    return res.status(500).json({ error: 'Error interno del proxy' })
  }
}
