// ============================================================
// UNRLVL CopyLab — buildCopyPrompt.ts
// SMPC: construye el prompt final a partir de BrandContext
// Updated: 2026-03-27 — v7 fixes:
//   · FIX: buildBrandBlock usa campos v7 (brand_context, tono_base,
//     geo_principal, cta_base, canales_activos, diferenciador_base)
//   · FIX: buildHumanizeBlock usa schema real (parameter/value)
//   · FIX: buildGeomixBlock usa schema real (servicio_1..servicio_6)
//   · FIX: resolveTemplateVariables soporta {{var}} doble-brace
//   · temperatura capeada a 1.0 (Claude API max)
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

// ─── Temperatura por tipo de output ─────────────────────────
// Claude API acepta 0.0–1.0 únicamente
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

  // Pass language+servicio for targeted keyword filtering
  const ctx = await fetchBrandContext(brandId, input.language, servicio)

  if (!ctx.brand) {
    throw new Error(`[buildCopyPrompt] Brand '${brandId}' no encontrado en Supabase`)
  }

  const template = resolveTemplate(ctx, templateId)
  if (!template) {
    throw new Error(
      `[buildCopyPrompt] OutputTemplate '${templateId}' no encontrado. ` +
      `Disponibles: ${ctx.outputTemplates.map((t) => t.output_type).join(', ')}`
    )
  }

  const canal = resolveCanalBlock(ctx, canalId)
  if (!canal) {
    throw new Error(
      `[buildCopyPrompt] CanalBlock '${canalId}' no encontrado. ` +
      `Disponibles: ${ctx.canalBlocks.map((c) => c.canal_id).join(', ')}`
    )
  }

  const humanize      = resolveHumanize(ctx, medium)
  const geomix        = resolveGeoMix(ctx, input.geo)
  const keywords      = getKeywords(ctx)
  const grupo3        = getGrupo3(ctx)
  const cta           = getCta(ctx, ctaTypeForCanal(canalId), servicio)
  const complianceRules = getComplianceRules(ctx)
  // Cap temperature — Claude API max is 1.0
  const temperature   = Math.min(
    TEMPERATURE_BY_TEMPLATE[templateId] ?? DEFAULT_TEMPERATURE,
    1.0
  )

  const prompt = assemblePrompt({
    ctx, template: template.template_text, canal, humanize,
    geomix, keywords, grupo3, cta, complianceRules, input,
  })

  return {
    prompt,
    templateName: template.output_type,
    canalName: canal.canal_id,
    brandName: ctx.brand.display_name,
    temperature,
    metadata: {
      keywordsInjected: keywords.length,
      ctasInjected: cta ? 1 : 0,
      complianceRulesInjected: complianceRules.length,
      humanizeApplied: !!humanize,
      geomixApplied: !!geomix,
    },
  }
}

// ─── assemblePrompt ──────────────────────────────────────────

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

  // 1. Brand block — v7 fields
  sections.push(buildBrandBlock(brand))

  // 2. Canal block
  if (canal?.block_text) {
    sections.push(`## CANAL: ${canal.canal_id}\n${canal.block_text}`)
  }

  // 3. Humanize F2.5
  if (humanize) sections.push(buildHumanizeBlock(humanize))

  // 4. GeoMix
  if (geomix) sections.push(buildGeomixBlock(geomix))

  // 5. Keywords
  if (keywords.length > 0) {
    sections.push(
      `## KEYWORDS\nPrincipales: ${keywords.slice(0, 5).join(', ')}` +
      (grupo3 ? `\nGrupo SEO (grupo_3): ${grupo3}` : '')
    )
  }

  // 6. CTA
  if (cta) sections.push(`## CTA ACTIVO\n${cta}`)

  // 7. Compliance
  if (complianceRules.length > 0) {
    sections.push(
      `## COMPLIANCE — REGLAS OBLIGATORIAS\n` +
      complianceRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    )
  }

  // 8. Extra context del usuario
  if (input.extraNotes) {
    sections.push(`## CONTEXTO ADICIONAL\n${input.extraNotes}`)
  }

  // 9. Template con variables resueltas (doble-brace {{var}})
  const resolvedTemplate = resolveTemplateVariables(template, buildVarMap(brand, cta, keywords, grupo3, input))
  sections.push(`## INSTRUCCIÓN\n${resolvedTemplate}`)

  return sections.join('\n\n---\n\n')
}

// ─── buildBrandBlock — usa campos v7 ────────────────────────

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

// ─── buildHumanizeBlock — usa schema real (parameter/value) ─

function buildHumanizeBlock(h: HumanizeProfile): string {
  // Schema: parameter='humanize_instructions', value=texto completo de instrucciones
  return [
    '## HUMANIZE F2.5 — VOZ AUTÉNTICA',
    h.value,
    h.notes ? `Nota: ${h.notes}` : null,
  ].filter(Boolean).join('\n')
}

// ─── buildGeomixBlock — usa schema real (servicio_1..6) ──────

function buildGeomixBlock(g: GeoMix): string {
  const services = [
    g.servicio_1, g.servicio_2, g.servicio_3,
    g.servicio_4, g.servicio_5, g.servicio_6,
  ].filter(Boolean) as string[]

  const lines = [`## GEOMIX — ${g.geo}`]
  if (services.length > 0) {
    lines.push(`Servicios en esta zona: ${services.join(', ')}`)
    lines.push(`Integrar la geo "${g.geo}" de forma natural en el copy.`)
  }
  return lines.join('\n')
}

// ─── Variable resolution — doble-brace {{var}} ───────────────

function buildVarMap(
  brand: NonNullable<BrandContext['brand']>,
  cta: string,
  keywords: string[],
  grupo3: string,
  input: CopyPromptInput
): Record<string, string> {
  return {
    // brand v7 fields
    marca:              brand.display_name,
    contexto_marca:     brand.brand_context     ?? '',
    geo_principal:      brand.geo_principal      ?? '',
    tono_base:          brand.tono_base          ?? '',
    canal_base:         brand.canal_base         ?? '',
    canales_activos:    brand.canales_activos     ?? '',
    formatos_activos:   brand.formatos_activos    ?? '',
    cta_base:           brand.cta_base           ?? '',
    cta_ads:            brand.cta_ads            ?? cta,
    diferenciador_base: brand.diferenciador_base ?? '',
    disclaimer_base:    brand.disclaimer_base    ?? '[DISCLAIMER_BASE]',
    url_base:           brand.url_base           ?? '[URL_BASE]',
    cta_url_base:       brand.cta_url_base       ?? '[CTA_URL_BASE]',
    market:             brand.market             ?? '',
    idioma:             brand.language_primary   ?? 'ES',
    // input
    producto:           input.producto           ?? '',
    servicio:           input.servicio           ?? '',
    objetivo:           input.objetivo           ?? '',
    // keywords
    keyword_principal:  keywords[0]              ?? '',
    keywords_prioritarias: keywords.slice(0, 5).join(', '),
    grupo_3_keywords:   grupo3,
    // cta
    cta_smpc:           cta,
    // extra
    extra_context:      input.extraContext       ?? '',
    extra_notes:        input.extraNotes         ?? '',
  }
}

/**
 * Resuelve variables {{var}} en el texto del template.
 * Soporta tanto {{var}} como {var} para compatibilidad.
 */
function resolveTemplateVariables(
  template: string,
  vars: Record<string, string>
): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] !== undefined ? vars[key] : match)
    .replace(/\{(\w+)\}/g,     (match, key) => vars[key] !== undefined ? vars[key] : match)
}

// ─── Helpers ─────────────────────────────────────────────────

function ctaTypeForCanal(
  canalId: string
): keyof Omit<ReturnType<typeof getCta> extends string ? never : never, never> {
  const ADS_CANALES = [
    'META_ADS', 'META_FEED', 'META_STORY', 'META_REEL',
    'TIKTOK_ADS', 'GOOGLE_SEARCH_(RSA)', 'GOOGLE_PMAX',
  ]
  const SEO_CANALES = ['BLOG', 'BLOG_HTML', 'WEB', 'WEB_HTML', 'LANDING_PAGE', 'LANDING_HTML']
  const STORY_CANALES = ['INSTAGRAM_ORGANICO', 'TIKTOK_ORGANICO']

  if (ADS_CANALES.includes(canalId))   return 'cta_ads'  as any
  if (SEO_CANALES.includes(canalId))   return 'cta_seo'  as any
  if (STORY_CANALES.includes(canalId)) return 'cta_story' as any
  return 'cta_smpc' as any
}
