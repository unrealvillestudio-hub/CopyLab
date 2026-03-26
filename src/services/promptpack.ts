/**
 * UNRLVL CopyLab — services/promptpack.ts
 * Orquestador de packs: ejecuta cada job en secuencia
 * usando generateCopyFromInput (Supabase + Claude).
 * Reemplaza la versión Gemini anterior.
 * Fase 5b · 2026-03-26
 */

import { generateCopyFromInput, validateCompliance } from './copyEngine'
import type {
  CopyOutput,
  CopyPackSpec,
  CopyTone,
  CopyLanguage,
  CopyOutputFormat,
  BrandProfile,
} from '../core/types'

// ─── Mapeo prompt_type → output_templates.id ────────────────
// Los IDs en packs.ts usan prefijo "prompt_" — los de Supabase no.
const PROMPT_TYPE_MAP: Record<string, string> = {
  prompt_SMPC_full:              'SMPC_full',
  prompt_Ads_FullPro:            'Ads_FullPro',
  prompt_SEO_FullPro:            'SEO_FullPro',
  prompt_SEO_Brand_FullPro:      'SEO_Brand_FullPro',
  prompt_YouTube_Ideas:          'YouTube_Ideas',
  prompt_YouTube_Titles:         'YouTube_Titles',
  prompt_YouTube_ScriptShort:    'YouTube_ScriptShort',
  prompt_YouTube_ScriptLong:     'YouTube_ScriptLong',
  prompt_YouTube_Descriptions:   'YouTube_Descriptions',
  prompt_YouTube_Thumbnails:     'YouTube_Thumbnails',
  prompt_Reels_Script:           'Reels_Script',
  prompt_Stories_Pack:           'Stories_Pack',
  prompt_Email_Campaign:         'Email_Campaign',
  prompt_Landing_Page_Full:      'Landing_Page_Full',
  prompt_Brand_Kit_Copy:         'Brand_Kit_Copy',
  prompt_Product_Description:    'Product_Description',
}

// ─── Mapeo channel (CopyChannel) → canal_blocks.id ──────────
const CHANNEL_MAP: Record<string, string> = {
  META_ADS:           'META_FEED',
  TIKTOK_ADS:         'TIKTOK',
  GOOGLE_SEARCH:      'GOOGLE_SEARCH_RSA',
  GOOGLE_PMAX:        'GOOGLE_PMAX',
  INSTAGRAM_ORGANICO: 'INSTAGRAM_ORGANICO',
  TIKTOK_ORGANICO:    'TIKTOK',
  YOUTUBE:            'YOUTUBE',
  WEB:                'ECOMMERCE',
  LANDING_PAGE:       'LANDING_PAGE',
  BLOG:               'BLOG',
  EMAIL:              'EMAIL',
}

function resolveTemplateId(promptType: string): string {
  return PROMPT_TYPE_MAP[promptType] ?? promptType.replace(/^prompt_/, '')
}

function resolveCanalId(channel: string): string {
  return CHANNEL_MAP[channel] ?? channel
}

// ─── runCopyPack ─────────────────────────────────────────────
export interface RunCopyPackParams {
  brand: BrandProfile
  pack: CopyPackSpec
  language: CopyLanguage
  keywords: string[]
  productContext: string
  tone: CopyTone
  ctaBase?: string
  outputFormat?: CopyOutputFormat
  geo?: string
  signal?: AbortSignal
}

export async function runCopyPack(params: RunCopyPackParams): Promise<CopyOutput[]> {
  const { brand, pack, language, keywords, productContext, tone, geo, signal } = params
  const results: CopyOutput[] = []

  for (const job of pack.jobs) {
    const templateId = resolveTemplateId(job.prompt_type)
    const canalId = resolveCanalId(job.channel)

    try {
      const { text, metadata } = await generateCopyFromInput(
        {
          brandId: brand.id,
          templateId,
          canalId,
          servicio: productContext || 'General',
          objetivo: `Generar ${job.label} — ${job.outputs} variante${job.outputs > 1 ? 's' : ''}`,
          extraContext: keywords.length
            ? `Keywords adicionales: ${keywords.join(', ')}`
            : undefined,
          medium: 'copy',
        },
        signal
      )

      const compliance = validateCompliance(text)

      // Si el job pide múltiples variantes, dividimos por separador ---
      const variants = job.outputs > 1
        ? splitVariants(text, job.outputs)
        : [text]

      variants.forEach((content, i) => {
        results.push({
          id: `${job.id}_${Date.now()}_${i}`,
          label: job.outputs > 1 ? `${job.label} #${i + 1}` : job.label,
          content,
          channel: job.channel,
          prompt_type: job.prompt_type,
          language,
          brand_id: brand.id,
          createdAt: Date.now(),
          metadata: {
            job_id: job.id,
            template_id: templateId,
            canal_id: canalId,
            compliance_passed: compliance.passed,
            compliance_warnings: compliance.warnings,
            keywords_injected: (metadata as any).keywordsInjected ?? 0,
            temperature: (metadata as any).temperature,
          },
        })
      })
    } catch (err) {
      // Si un job falla, continuamos con los demás
      console.error(`[runCopyPack] Job ${job.id} falló:`, err)
      results.push({
        id: `${job.id}_error_${Date.now()}`,
        label: `${job.label} — ERROR`,
        content: err instanceof Error ? err.message : 'Error desconocido',
        channel: job.channel,
        prompt_type: job.prompt_type,
        language,
        brand_id: brand.id,
        createdAt: Date.now(),
        metadata: {
          job_id: job.id,
          compliance_passed: false,
          compliance_warnings: ['Error en generación'],
        },
      })
    }
  }

  return results
}

// ─── splitVariants ───────────────────────────────────────────
/**
 * Si Claude devuelve múltiples variantes numeradas o separadas por ---,
 * las divide en un array. Si no hay separador claro, devuelve el texto completo.
 */
function splitVariants(text: string, expected: number): string[] {
  // Try splitting by numbered variants: "1.", "2.", etc.
  const numberedPattern = /(?:^|\n)(?:\*\*)?(\d+)[.)]\s+/
  if (numberedPattern.test(text)) {
    const parts = text.split(/\n(?:\*\*)?(\d+)[.)]\s+/).filter(p => p.trim() && !/^\d+$/.test(p.trim()))
    if (parts.length >= expected) return parts.slice(0, expected).map(p => p.trim())
  }

  // Try splitting by --- separator
  const hrParts = text.split(/\n---+\n/).map(p => p.trim()).filter(Boolean)
  if (hrParts.length >= expected) return hrParts.slice(0, expected)

  // Try splitting by double newline blocks
  const blocks = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  if (blocks.length >= expected) return blocks.slice(0, expected)

  // Fallback: return full text as single item
  return [text]
}
