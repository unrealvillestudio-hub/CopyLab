// ============================================================
// UNRLVL CopyLab — api/claude.ts
// Proxy serverless Vercel → Anthropic API (prompt + system ARBITRARIOS)
// Retry en 429, 503, 529 antes de devolver error al cliente
//
// ⚠️ NO ES UN CAMINO DE COPY DE MARCA. Este proxy pasa prompt/system tal cual al modelo,
// sin contexto de marca, sin voice genome, sin compliance, sin registro. Su ÚNICO uso
// legítimo son las herramientas genéricas de CopyToolsModule (analizar copy pegado,
// generar CTAs desde un objetivo libre, adaptar texto a un canal) — transformaciones de
// texto arbitrario, no generación con identidad de marca.
//
// NADA con brand_id debe pasar por acá. El copy de marca va por /api/execute (motor único:
// registro + voice genome + compatibilidad + compliance). Si aparece la tentación de mandar
// brand_id o armar un system con contexto de marca acá, es la señal de que ese caso pertenece
// a /api/execute — así nació el motor paralelo que este refactor está retirando. (Verificado
// 2026-08-04: las 3 sub-tools de CopyToolsModule son genéricas; ninguna usa el motor de marca.)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1500

async function callAnthropic(apiKey: string, body: unknown, attempt = 0): Promise<Response> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  })

  // Retry on overload/rate-limit errors
  if ((res.status === 429 || res.status === 503 || res.status === 529) && attempt < MAX_RETRIES) {
    const delay = BASE_DELAY_MS * Math.pow(1.5, attempt)
    console.log(`[api/claude] Status ${res.status} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`)
    await new Promise(resolve => setTimeout(resolve, delay))
    return callAnthropic(apiKey, body, attempt + 1)
  }

  return res
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[api/claude] ANTHROPIC_API_KEY no definida')
    return res.status(500).json({ error: 'API key no configurada' })
  }

  try {
    const upstream = await callAnthropic(apiKey, req.body)
    const data = await upstream.json()

    if (!upstream.ok) {
      console.error(`[api/claude] Anthropic error ${upstream.status}:`, data)
      return res.status(upstream.status).json(data)
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('[api/claude] Error interno:', err)
    return res.status(500).json({ error: 'Error interno del proxy' })
  }
}
