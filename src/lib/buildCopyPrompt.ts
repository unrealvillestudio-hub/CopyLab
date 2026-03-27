// ============================================================
// UNRLVL CopyLab — buildCopyPrompt.ts
// SMPC: construye el prompt final a partir de BrandContext
// Fase 5b — reemplaza DB_VARIABLES por queries Supabase
// Fix: temperatura capeada a 1.0 (Claude API max)
// ============================================================

import {
  fetchBrandContext,
  resolveHumanize,
  resolveTemplate,
  resolveCanalBlock,
  getKeywords,
  getCta,
  getComplianceRules,
  resolveGeoMix,
} from './queries'

import type {
  BrandContext,
  CopyPromptInput,
  CopyPromptResult,
  HumanizeProfile,
  GeoMix,
} from './db/types'

// ─── Temperatura por tipo de output ─────────────────────────
// Claude API acepta 0.0 - 1.0 únicamente
const TEMPERATURE_BY_TEMPLATE: Record<string, number> = {
  Ads_FullPro: 0.5,
  Ads_Short: 0.5,
  Google_Search_RSA: 0.5,
  Email_Campaign: 0.6,
  Product_Description: 0.6,
  Landing_Page_Full: 0.6,
  Social_Post: 1.0,
  Instagram_Caption: 1.0,
  TikTok_Hook: 1.0,
  YouTube_Script: 0.9,
  Blog_Article: 0.9,
  Brand_Kit_Copy: 1.0,
  Storytelling: 1.0,
  SMPC_full: 1.0,
}

const DEFAULT_TEMPERATURE = 0.9

export async function buildCopyPrompt(input: CopyPromptInput): Promise<CopyPromptResult> {
  const { brandId, templateId, canalId, servicio, objetivo, medium = 'copy' } = input

  const ctx = await fetchBrandContext(brandId)

  if (!ctx.brand) {
    throw new Error(`[buildCopyPrompt] Brand '${brandId}' no encontrado en Supabase`)
  }

  const template = resolveTemplate(ctx, templateId)
  if (!template) {
    throw new Error(
      `[buildCopyPrompt] OutputTemplate '${templateId}' no encontrado. ` +
      `Disponibles: ${ctx.outputTemplates.map((t) => t.id).join(', ')}`
    )
  }

  const canal = resolveCanalBlock(ctx, canalId)
  if (!canal) {
    throw new Error(
      `[buildCopyPrompt] CanalBlock '${canalId}' no encontrado. ` +
      `Disponibles: ${ctx.canalBlocks.map((c) => c.id).join(', ')}`
    )
  }

  const humanize = resolveHumanize(ctx, medium)
  const geomix = resolveGeoMix(ctx, input.geo)
  const keywords = getKeywords(ctx, canalId)
  const cta = getCta(ctx, ctaTypeForCanal(canalId))
  const complianceRules = getComplianceRules(ctx)
  // Cap temperature to 1.0 — Claude API max
  const temperature = Math.min(TEMPERATURE_BY_TEMPLATE[templateId] ?? DEFAULT_TEMPERATURE, 1.0)

  const prompt = assemblePrompt({
    ctx, template: template.template_text, canal, humanize,
    geomix, keywords, cta, complianceRules, input,
  })

  return {
    prompt,
    templateName: template.name,
    canalName: canal.name,
    brandName: ctx.brand.display_name,
    temperature,
    wordCountMin: template.word_count_min,
    wordCountMax: template.word_count_max,
    metadata: {
      keywordsInjected: keywords.length,
      ctasInjected: cta ? 1 : 0,
      complianceRulesInjected: complianceRules.length,
      humanizeApplied: !!humanize,
      geomixApplied: !!geomix,
    },
  }
}

interface AssembleParams {
  ctx: BrandContext
  template: string
  canal: ReturnType<typeof resolveCanalBlock>
  humanize: HumanizeProfile | null
  geomix: GeoMix | null
  keywords: string[]
  cta: string
  complianceRules: string[]
  input: CopyPromptInput
}

function assemblePrompt({ ctx, template, canal, humanize, geomix, keywords, cta, complianceRules, input }: AssembleParams): string {
  const brand = ctx.brand!
  const sections: string[] = []

  sections.push(buildBrandBlock(brand))

  if (canal?.block_text) {
    sections.push(`## CANAL\n${canal.block_text}`)
    if (canal.char_limit) sections.push(`Límite de caracteres: ${canal.char_limit}`)
  }

  if (humanize) sections.push(buildHumanizeBlock(humanize))
  if (geomix) sections.push(buildGeomixBlock(geomix))
  if (keywords.length > 0) sections.push(`## KEYWORDS\nIncorporar naturalmente: ${keywords.join(', ')}`)
  if (complianceRules.length > 0) {
    sections.push(`## COMPLIANCE (REGLAS DURAS — OBLIGATORIO)\n` + complianceRules.map((r, i) => `${i + 1}. ${r}`).join('\n'))
  }

  const resolvedTemplate = resolveTemplateVariables(template, {
    brand_id: brand.id,
    brand_name: brand.display_name,
    servicio: input.servicio,
    objetivo: input.objetivo,
    agent_tone: brand.agent_tone ?? '',
    agent_value_prop: brand.agent_value_prop ?? '',
    positioning: brand.positioning ?? '',
    territory: brand.territory ?? '',
    industry: brand.industry ?? '',
    market: brand.market ?? '',
    language: brand.language_primary,
    compliance_rules: complianceRules.join(' | '),
    keywords_primary: keywords.slice(0, 5).join(', '),
    cta_ads: cta, cta_smpc: cta, cta_seo: cta,
    humanize_copy: humanize?.authenticity_rules ?? '',
    product_name: input.productName ?? '',
    sku: input.sku ?? '',
    ...(input.extraContext ? { extra_context: input.extraContext } : {}),
  })

  sections.push(`## INSTRUCCIÓN\n${resolvedTemplate}`)

  const tpl = ctx.outputTemplates.find((t) => t.id === input.templateId)
  if (tpl?.word_count_min || tpl?.word_count_max) {
    const min = tpl.word_count_min ? `mínimo ${tpl.word_count_min}` : ''
    const max = tpl.word_count_max ? `máximo ${tpl.word_count_max}` : ''
    sections.push(`## EXTENSIÓN\n${[min, max].filter(Boolean).join(' — ')} palabras`)
  }

  return sections.join('\n\n---\n\n')
}

function buildBrandBlock(brand: BrandContext['brand']): string {
  if (!brand) return ''
  const lines = [
    `## MARCA: ${brand.display_name}`,
    brand.tagline ? `Tagline: "${brand.tagline}"` : null,
    (brand as any).brand_context ? `Contexto: ${(brand as any).brand_context}` : null,
    brand.positioning ? `Posicionamiento: ${brand.positioning}` : null,
    brand.territory ? `Territorio: ${brand.territory}` : null,
    brand.agent_tone ? `Tono: ${brand.agent_tone}` : null,
    brand.agent_value_prop ? `Propuesta de valor: ${brand.agent_value_prop}` : null,
    brand.market ? `Mercado: ${brand.market}` : null,
    `Idioma: ${brand.language_primary}`,
  ]
  return lines.filter(Boolean).join('\n')
}

function buildHumanizeBlock(h: HumanizeProfile): string {
  const lines = ['## HUMANIZE F2.5 — VOZ AUTÉNTICA']
  if (h.authenticity_rules) lines.push(h.authenticity_rules)
  if (h.tone) lines.push(`Tono: ${h.tone}`)
  if (h.sentence_style) lines.push(`Estilo de frase: ${h.sentence_style}`)
  if (h.personality) lines.push(`Personalidad: ${h.personality}`)
  if (h.vocabulary_include?.length) lines.push(`Vocabulario preferido: ${h.vocabulary_include.join(', ')}`)
  if (h.vocabulary_exclude?.length) lines.push(`Vocabulario PROHIBIDO: ${h.vocabulary_exclude.join(', ')}`)
  if (h.anti_patterns?.length) lines.push(`Anti-patrones: ${h.anti_patterns.join(', ')}`)
  return lines.join('\n')
}

function buildGeomixBlock(g: GeoMix): string {
  const lines = [`## GEOMIX — ${g.geo}`]
  if (g.language) lines.push(`Idioma local: ${g.language}`)
  if (g.aesthetic) lines.push(`Estética: ${g.aesthetic}`)
  if (g.local_slang?.length) lines.push(`Slang local: ${g.local_slang.join(', ')}`)
  if (g.avoid_slang?.length) lines.push(`Slang a EVITAR: ${g.avoid_slang.join(', ')}`)
  if (g.cultural_refs?.length) lines.push(`Referencias culturales: ${g.cultural_refs.join(', ')}`)
  return lines.join('\n')
}

function resolveTemplateVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] !== undefined ? vars[key] : match)
}

function ctaTypeForCanal(canalId: string): 'cta_ads' | 'cta_seo' | 'cta_story' | 'cta_smpc' {
  if (['META_FEED', 'META_ADS', 'META_STORY', 'META_REEL', 'GOOGLE_SEARCH_RSA', 'GOOGLE_PMAX', 'TIKTOK', 'TIKTOK_ADS'].includes(canalId)) return 'cta_ads'
  if (['BLOG', 'ECOMMERCE', 'WEB'].includes(canalId)) return 'cta_seo'
  if (['INSTAGRAM_STORY', 'INSTAGRAM_ORGANICO'].includes(canalId)) return 'cta_story'
  return 'cta_smpc'
}
