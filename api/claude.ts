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
// NADA con brand_id debe pasar por aquí. El copy de marca va por /api/execute (motor único:
// registro + voice genome + compatibilidad + compliance). Si aparece la tentación de mandar
// brand_id o armar un system con contexto de marca aquí, es la señal de que ese caso pertenece
// a /api/execute — así nació el motor paralelo que este refactor está retirando. (Verificado
// 2026-08-04: las 3 sub-tools de CopyToolsModule son genéricas; ninguna usa el motor de marca.)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1500

// ── Guard de costo (2026-11-04) ─────────────────────────────────────────────
// RAÍZ: este proxy reenviaba el cuerpo del cliente TAL CUAL a Anthropic — incluido el
// `model` y `max_tokens` elegidos por quien llama (aceptaba claude-opus-5-5), sin auth,
// con la key ANTHROPIC_API_KEY. Un proxy LLM público con passthrough total es una puerta
// abierta de gasto (pico de ~$29/día en Opus 5.5 el 2026-11-04 en esta key).
// BARRERA (permanente, en el server): se sanea el cuerpo antes de reenviarlo —
//   1. model: allowlist como DATO — los `model_id` ACTIVOS de ops_lab_models, vía la EF
//      pública `modelos-permitidos` (cacheada 5 min). Modelo nuevo = UPDATE en la DB, sin
//      deploy; lo que no está activo no pasa (Opus por ausencia). Si la EF no se lee → PISO
//      seguro (fail-closed), nunca "cualquiera".
//   2. max_tokens: tope duro.
//   3. Secreto opcional: si PROXY_SHARED_SECRET está definido, se exige en el header.
// El cliente legítimo (copyEngine) manda claude-sonnet-5: no se rompe.
const ALLOWED_MODELS_URL =
  process.env.ALLOWED_MODELS_URL ||
  'https://amlvyycfepwhiindxgzw.supabase.co/functions/v1/modelos-permitidos'
// Piso seguro: un modelo activo y barato. Único literal de modelo que queda (fail-closed).
const MODELO_PISO = 'claude-sonnet-5'
const TOPE_MAX_TOKENS = 4096

let _cacheModelos: { set: Set<string> | null; exp: number } = { set: null, exp: 0 }

async function modelosPermitidos(): Promise<Set<string>> {
  const now = Date.now()
  if (_cacheModelos.set && now < _cacheModelos.exp) return _cacheModelos.set
  try {
    const r = await fetch(ALLOWED_MODELS_URL, { signal: AbortSignal.timeout(2500) })
    const d = await r.json()
    const lista: string[] = Array.isArray(d?.anthropic) ? d.anthropic : []
    if (lista.length) {
      _cacheModelos = { set: new Set(lista), exp: now + 5 * 60 * 1000 }
      return _cacheModelos.set
    }
  } catch {
    // fail-closed abajo
  }
  return _cacheModelos.set ?? new Set([MODELO_PISO])
}

async function modeloSeguro(m: unknown): Promise<string> {
  const permitidos = await modelosPermitidos()
  return typeof m === 'string' && permitidos.has(m) ? m : MODELO_PISO
}
function topeTokens(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : TOPE_MAX_TOKENS
  return Math.max(1, Math.min(v, TOPE_MAX_TOKENS))
}

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

  // Secreto opcional: si está definido, se exige. No rompe despliegues que aún no lo tienen.
  const secreto = process.env.PROXY_SHARED_SECRET
  if (secreto && req.headers['x-proxy-secret'] !== secreto) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[api/claude] ANTHROPIC_API_KEY no definida')
    return res.status(500).json({ error: 'API key no configurada' })
  }

  try {
    // Saneo del cuerpo: el modelo y max_tokens los decide el server, no quien llama.
    const body = { ...((req.body ?? {}) as Record<string, unknown>) }
    const modeloPedido = body.model
    body.model = await modeloSeguro(modeloPedido)
    if (modeloPedido && body.model !== modeloPedido) {
      console.warn(`[api/claude] modelo no permitido "${String(modeloPedido)}" → ${body.model}`)
    }
    body.max_tokens = topeTokens(body.max_tokens)

    const upstream = await callAnthropic(apiKey, body)
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
