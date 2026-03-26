/**
 * UNRLVL CopyLab — copyEngine.ts
 * Motor de generación de copy.
 * Swap: Gemini → Claude (/api/claude proxy)
 * buildCopyPrompt: hardcoded → Supabase (fetchBrandContext)
 * Fase 5b · 2026-03-26
 */

import {
  buildCopyPrompt as buildCopyPromptFromSupabase,
} from '../lib/buildCopyPrompt'

import type { CopyPromptInput } from '../lib/db/types'

// Re-exportamos CopyPromptInput como el nuevo contrato de entrada
export type { CopyPromptInput }

// ─── Config ──────────────────────────────────────────────────
const CLAUDE_PROXY_URL = '/api/claude'
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 2048

// ─── Retry helper ────────────────────────────────────────────
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn()
  } catch (error: any) {
    const status = error?.status || error?.response?.status
    if ((status === 429 || status === 503) && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
      return withRetry(fn, retries - 1, delay * 2)
    }
    throw error
  }
}

// ─── buildCopyPrompt ─────────────────────────────────────────
/**
 * Construye el prompt completo a partir de Supabase.
 * Reemplaza la versión hardcoded anterior.
 * Retorna el prompt string + metadata (temperatura, word count, etc.)
 */
export { buildCopyPromptFromSupabase as buildCopyPrompt }

// ─── generateCopy ────────────────────────────────────────────
/**
 * Envía el prompt a Claude vía proxy Vercel.
 * Mantiene la misma firma que la versión Gemini para compatibilidad
 * con los módulos existentes.
 */
export async function generateCopy(params: {
  prompt: string
  temperature?: number
  systemPrompt?: string
  signal?: AbortSignal
}): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(CLAUDE_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: params.temperature ?? 1.0,
        ...(params.systemPrompt
          ? { system: params.systemPrompt }
          : {}),
        messages: [
          { role: 'user', content: params.prompt },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      const error: any = new Error(`[Claude Proxy] ${res.status}: ${body}`)
      error.status = res.status
      throw error
    }

    const data = await res.json()
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
    if (!textBlock?.text) throw new Error('[Claude Proxy] Respuesta sin bloque de texto')
    return textBlock.text as string
  })
}

// ─── generateCopyFromInput ───────────────────────────────────
/**
 * Helper de alto nivel: recibe CopyPromptInput, carga Supabase,
 * construye el prompt y genera el copy en un solo call.
 * Para usar directamente desde módulos sin el hook.
 */
export async function generateCopyFromInput(
  input: CopyPromptInput,
  signal?: AbortSignal
): Promise<{ text: string; temperature: number; metadata: Record<string, unknown> }> {
  const promptResult = await buildCopyPromptFromSupabase(input)

  const systemPrompt = [
    `Eres el motor de copy de ${promptResult.brandName} — generás copy auténtico, estratégico y listo para publicar.`,
    ``,
    `REGLAS ABSOLUTAS:`,
    `- Entregá SOLO el copy solicitado. Sin explicaciones, sin comentarios meta.`,
    `- Seguí la estructura del template al pie de la letra.`,
    `- Aplicá HUMANIZE F2.5 y COMPLIANCE sin excepción.`,
    `- Nunca uses: "innovador", "revolucionario", "transformador", "es importante destacar".`,
  ].join('\n')

  const text = await generateCopy({
    prompt: promptResult.prompt,
    temperature: promptResult.temperature,
    systemPrompt,
    signal,
  })

  return {
    text,
    temperature: promptResult.temperature,
    metadata: promptResult.metadata as Record<string, unknown>,
  }
}

// ─── validateCompliance ──────────────────────────────────────
/**
 * Validación client-side de compliance.
 * Lista base de palabras prohibidas — se complementa con las reglas
 * de Supabase (compliance_rules) que ya se inyectan en el prompt.
 */
export function validateCompliance(
  text: string,
  extraForbiddenWords: string[] = []
): { passed: boolean; warnings: string[] } {
  const baseProhibited = [
    'cura', 'elimina', 'garantizado', '100%', 'médico', 'trata',
    'revolucionario', 'innovador', 'transformador',
  ]

  const allProhibited = [...baseProhibited, ...extraForbiddenWords]
  const warnings: string[] = []
  const lowerText = text.toLowerCase()

  allProhibited.forEach(word => {
    if (lowerText.includes(word.toLowerCase())) {
      warnings.push(`Palabra prohibida: "${word}"`)
    }
  })

  return { passed: warnings.length === 0, warnings }
}
