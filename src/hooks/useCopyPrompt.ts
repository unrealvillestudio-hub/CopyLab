// ============================================================
// UNRLVL CopyLab — useCopyPrompt.ts
// Hook React para el SMPC
// Consume buildCopyPrompt → /api/claude (proxy Vercel) → copy generado
// Fase 5b · 2026-03-26
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { buildCopyPrompt } from '../lib/buildCopyPrompt'
import type { CopyPromptInput, CopyPromptResult } from '../lib/db/types'

export type CopyStatus = 'idle' | 'loading_context' | 'generating' | 'done' | 'error'

export interface CopyOutput {
  text: string
  prompt: string
  result: CopyPromptResult
  generatedAt: Date
}

export interface UseCopyPromptReturn {
  status: CopyStatus
  output: CopyOutput | null
  error: string | null
  isLoading: boolean
  generate: (input: CopyPromptInput) => Promise<void>
  regenerate: () => Promise<void>
  reset: () => void
  lastPrompt: string | null
  buildPromptOnly: (input: CopyPromptInput) => Promise<CopyPromptResult | null>
}

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 2048
const CLAUDE_PROXY_URL = '/api/claude'

export function useCopyPrompt(): UseCopyPromptReturn {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const [output, setOutput] = useState<CopyOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)
  const lastInputRef = useRef<CopyPromptInput | null>(null)

  const generate = useCallback(async (input: CopyPromptInput) => {
    lastInputRef.current = input
    setError(null)
    setOutput(null)

    try {
      setStatus('loading_context')
      const promptResult = await buildCopyPrompt(input)
      setLastPrompt(promptResult.prompt)

      setStatus('generating')
      const copyText = await callClaudeProxy(promptResult)

      setOutput({
        text: copyText,
        prompt: promptResult.prompt,
        result: promptResult,
        generatedAt: new Date(),
      })
      setStatus('done')

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      console.error('[useCopyPrompt]', msg)
    }
  }, [])

  const regenerate = useCallback(async () => {
    if (!lastInputRef.current) return
    await generate(lastInputRef.current)
  }, [generate])

  const reset = useCallback(() => {
    setStatus('idle')
    setOutput(null)
    setError(null)
    setLastPrompt(null)
    lastInputRef.current = null
  }, [])

  const buildPromptOnly = useCallback(async (input: CopyPromptInput): Promise<CopyPromptResult | null> => {
    try {
      setStatus('loading_context')
      const result = await buildCopyPrompt(input)
      setLastPrompt(result.prompt)
      setStatus('idle')
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
      return null
    }
  }, [])

  return {
    status,
    output,
    error,
    isLoading: status === 'loading_context' || status === 'generating',
    generate,
    regenerate,
    reset,
    lastPrompt,
    buildPromptOnly,
  }
}

async function callClaudeProxy(promptResult: CopyPromptResult): Promise<string> {
  const res = await fetch(CLAUDE_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: promptResult.temperature,
      system: buildSystemPrompt(promptResult),
      messages: [{ role: 'user', content: promptResult.prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[Claude Proxy] ${res.status}: ${body}`)
  }

  const data = await res.json()
  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
  if (!textBlock?.text) throw new Error('[Claude Proxy] Respuesta sin bloque de texto')
  return textBlock.text as string
}

function buildSystemPrompt(result: CopyPromptResult): string {
  const lines = [
    `Eres el motor de copy de ${result.brandName} — generás copy auténtico, estratégico y listo para publicar.`,
    ``,
    `REGLAS ABSOLUTAS:`,
    `- Entregá SOLO el copy solicitado. Sin explicaciones, sin comentarios meta.`,
    `- Seguí la estructura del template al pie de la letra.`,
    `- Aplicá HUMANIZE F2.5 y COMPLIANCE sin excepción.`,
    `- Nunca uses: "innovador", "revolucionario", "transformador", "es importante destacar".`,
  ]
  if (result.wordCountMin && result.wordCountMax) {
    lines.push(`- Extensión: entre ${result.wordCountMin} y ${result.wordCountMax} palabras.`)
  } else if (result.wordCountMin) {
    lines.push(`- Extensión mínima: ${result.wordCountMin} palabras.`)
  } else if (result.wordCountMax) {
    lines.push(`- Extensión máxima: ${result.wordCountMax} palabras.`)
  }
  return lines.join('\n')
}
