// ============================================================
// UNRLVL CopyLab — buildCopyPrompt.ts
// SMPC: construye el prompt final a partir de BrandContext
// Updated: 2026-03-28c — fixes audit completo:
//   · canal.canal_id → canal.id (columna no existía)
//   · canalName: canal.name ?? canal.id
//   · buildGeomixBlock: servicio_1..6 → servicios[], combos[]
// Updated: 2026-03-28b:
//   · template.output_type → template.id
//   · templateName: template.name ?? template.id
// Updated: 2026-03-27 — v7 initial
// ============================================================

import {
  fetchBrandContext,
  resolveHumanize,
  resolveTemplate,
  resolveCanalBlock,
  getKeywords,
  getGrupo3,
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

// ─── Temperatura por tipo de output ──────────────────────────
const TEMPERATURE_BY_TEMPLATE: Record<string, number> = {
  Ads_FullPro:         0.5,
  Ads_Short:           0.5,
  Google_Search_RSA:   0.5,
  Email_Campaign:      0.6,
  Product_Description: 0.6,
  Landing_Page_Full:   0.6,
  SEO_FullPro:         0.7,
  BLOG:                0.8,
  YouTube_Script:      0.9,
  Blog_Article:        0.9,
  Social_Post:         1.0,
  Instagram_Caption:   1.0,
  TikTok_Hook:         1.0,
  Brand_Kit_Copy:      1.0,
  Storytelling:        1.0,
  SMPC_full:           1.0,
  Organic_FullPro:     1.0,
}

const DEFAULT_TEMPERATURE = 0.9

export async function buildCopyPrompt(input: CopyPromptInput): Promise<CopyPromptResult> {
  const { brandId, templateId, canalId, servicio, medium = 'copy' } = input

  const ctx = await fetchBrandContext(brandId, input.language, servicio)

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

  const humanize        = resolveHumanize(ctx, medium)
  const geomix          = resolveGeoMix(ctx, input.geo)
  const keywords        = getKeywords(ctx)
  const grupo3          = getGrupo3(ctx)
  const cta             = getCta(ctx, ctaTypeForCanal(canalId), servicio)
  const complianceRules = getComplianceRules(ctx)
  const temperature     = Math.min(
    TEMPERATURE_BY_TEMPLATE[templateId] ?? DEFAULT_TEMPERATURE,
    1.0
  )

  const prompt = assemblePrompt({
    ctx, template: template.template_text, canal, humanize,
    geomix, keywords, grupo3, cta, complianceRules, input,
  })

  return {
    prompt,
    templateName: template.name ?? template.id,
    canalName:    canal.name ?? canal.id,
    brandName:    ctx.brand.display_name,
    temperature,
    metadata: {
      keywordsInjected:        keywords.length,
      ctasInjected:            cta ? 1 : 0,
      complianceRulesInjected: complianceRules.length,
      humanizeApplied:         !!humanize,
      geomixApplied:           !!geomix,
    },
  }
}

// ─── assemblePrompt ───────────────────────────────────────────

interface AssembleParams {
  ctx: BrandContext
  template: string
  canal: ReturnType<typeof resolveCanalBlock>
  humanize: HumanizeProfile | null
  geomix: GeoMix | null
  keywords: string[]
  grupo3: string
  cta: string
  complianceRules: string[]
  input: CopyPromptInput
}

function assemblePrompt(p: AssembleParams): string {
  const { ctx, template, canal, humanize, geomix, keywords, grupo3, cta, complianceRules, input } = p
  const brand = ctx.brand!
  const sections: string[] = []

  sections.push(buildBrandBlock(brand))

  if (canal?.block_text) {
    sections.push(`## CANAL: ${canal.id}\n${canal.block_text}`)
  }

  if (humanize) sections.push(buildHumanizeBlock(humanize))
  if (geomix)   sections.push(buildGeomixBlock(geomix))

  if (keywords.length > 0) {
    sections.push(
      `## KEYWORDS\nPrincipales: ${keywords.slice(0, 5).join(', ')}` +
      (grupo3 ? `\nGrupo SEO (grupo_3): ${grupo3}` : '')
    )
  }

  if (cta) sections.push(`## CTA ACTIVO\n${cta}`)

  if (complianceRules.length > 0) {
    sections.push(
      `## COMPLIANCE — REGLAS OBLIGATORIAS\n` +
      complianceRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    )
  }

  if (input.extraNotes) {
    sections.push(`## CONTEXTO ADICIONAL\n${input.extraNotes}`)
  }

  const resolvedTemplate = resolveTemplateVariables(
    template,
    buildVarMap(brand, cta, keywords, grupo3, input)
  )
  sections.push(`## INSTRUCCIÓN\n${resolvedTemplate}`)

  return sections.join('\n\n---\n\n')
}

// ─── buildBrandBlock ──────────────────────────────────────────

function buildBrandBlock(brand: NonNullable<BrandContext['brand']>): string {
  const lines: string[] = [`## MARCA: ${brand.display_name}`]
  if (brand.brand_context)      lines.push(`Contexto: ${brand.brand_context}`)
  if (brand.geo_principal)      lines.push(`Geo principal: ${brand.geo_principal}`)
  if (brand.tono_base)          lines.push(`Tono base: ${brand.tono_base}`)
  if (brand.canales_activos)    lines.push(`Canales activos: ${brand.canales_activos}`)
  if (brand.formatos_activos)   lines.push(`Formatos: ${brand.formatos_activos}`)
  if (brand.cta_base)           lines.push(`CTA base: ${brand.cta_base}`)
  if (brand.diferenciador_base) lines.push(`Diferenciador: ${brand.diferenciador_base}`)
  if (brand.disclaimer_base)    lines.push(`Disclaimer: ${brand.disclaimer_base}`)
  if (brand.market)             lines.push(`Mercado: ${brand.market}`)
  if (brand.language_primary)   lines.push(`Idioma: ${brand.language_primary}`)
  return lines.join('\n')
}

// ─── buildHumanizeBlock ───────────────────────────────────────

function buildHumanizeBlock(h: HumanizeProfile): string {
  return [
    '## HUMANIZE F2.5 — VOZ AUTÉNTICA',
    h.value,
    h.notes ? `Nota: ${h.notes}` : null,
  ].filter(Boolean).join('\n')
}

// ─── buildGeomixBlock — schema real: servicios[], combos[] ────

function buildGeomixBlock(g: GeoMix): string {
  const lines = [`## GEOMIX — ${g.geo}`]

  if (g.servicios && g.servicios.length > 0) {
    lines.push(`Servicios en esta zona: ${g.servicios.join(', ')}`)
  }
  if (g.combos && g.combos.length > 0) {
    lines.push(`Combos SEO: ${g.combos.slice(0, 3).join(' | ')}`)
  }
  lines.push(`Integrar la geo "${g.geo}" de forma natural en el copy.`)
  if (g.local_slang)    lines.push(`Lenguaje local: ${g.local_slang}`)
  if (g.cultural_refs)  lines.push(`Referencias culturales: ${g.cultural_refs}`)
  if (g.color_mood)     lines.push(`Color mood: ${g.color_mood}`)

  return lines.join('\n')
}

// ─── Variable resolution ──────────────────────────────────────

function buildVarMap(
  brand: NonNullable<BrandContext['brand']>,
  cta: string,
  keywords: string[],
  grupo3: string,
  input: CopyPromptInput
): Record<string, string> {
  return {
    marca:                 brand.display_name,
    contexto_marca:        brand.brand_context      ?? '',
    geo_principal:         brand.geo_principal       ?? '',
    tono_base:             brand.tono_base           ?? '',
    canal_base:            brand.canal_base          ?? '',
    canales_activos:       brand.canales_activos      ?? '',
    formatos_activos:      brand.formatos_activos     ?? '',
    cta_base:              brand.cta_base            ?? '',
    cta_ads:               brand.cta_ads             ?? cta,
    diferenciador_base:    brand.diferenciador_base  ?? '',
    disclaimer_base:       brand.disclaimer_base     ?? '[DISCLAIMER_BASE]',
    url_base:              brand.url_base            ?? '[URL_BASE]',
    cta_url_base:          brand.cta_url_base        ?? '[CTA_URL_BASE]',
    market:                brand.market              ?? '',
    idioma:                brand.language_primary    ?? 'ES',
    producto:              input.producto            ?? '',
    servicio:              input.servicio            ?? '',
    objetivo:              input.objetivo            ?? '',
    keyword_principal:     keywords[0]               ?? '',
    keywords_prioritarias: keywords.slice(0, 5).join(', '),
    grupo_3_keywords:      grupo3,
    cta_smpc:              cta,
    extra_context:         input.extraContext        ?? '',
    extra_notes:           input.extraNotes          ?? '',
  }
}

function resolveTemplateVariables(
  template: string,
  vars: Record<string, string>
): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] !== undefined ? vars[key] : match)
    .replace(/\{(\w+)\}/g,     (match, key) => vars[key] !== undefined ? vars[key] : match)
}

// ─── Helpers ──────────────────────────────────────────────────

function ctaTypeForCanal(
  canalId: string
): keyof Omit<ReturnType<typeof getCta> extends string ? never : never, never> {
  const ADS    = ['META_ADS','META_FEED','META_STORY','META_REEL','TIKTOK_ADS','GOOGLE_SEARCH_(RSA)','GOOGLE_PMAX']
  const SEO    = ['BLOG','BLOG_HTML','WEB','WEB_HTML','LANDING_PAGE','LANDING_HTML']
  const STORY  = ['INSTAGRAM_ORGANICO','TIKTOK_ORGANICO']

  if (ADS.includes(canalId))   return 'cta_ads'   as any
  if (SEO.includes(canalId))   return 'cta_seo'   as any
  if (STORY.includes(canalId)) return 'cta_story' as any
  return 'cta_smpc' as any
}
