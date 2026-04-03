// ============================================================
// UNRLVL CopyLab — buildCopyPrompt.ts
// SMPC: construye el prompt final a partir de BrandContext
// Updated: 2026-04-03 — v7.1: brand_goals + brand_personas inyectados en el prompt
//   · buildGoalsBlock: inyecta objetivos 6m/12m/24m como contexto estratégico
//   · buildPersonasBlock: inyecta segmentos ICP (pain_points, motivations, copy_hooks)
//   · Orden SMPC: Brand → Goals → Personas → Idioma → Canal → Humanize → GeoMix → Keywords → CTA → Compliance → Extra → Template
// Updated: 2026-03-28c — fixes audit completo
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
  BrandGoal,
  BrandPersona,
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
      goalsInjected:           ctx.brandGoals?.length ?? 0,
      personasInjected:        ctx.brandPersonas?.length ?? 0,
    },
  }
}

// ─── assemblePrompt ────────────────────────────────────────────
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

  // 1. Brand
  sections.push(buildBrandBlock(brand))

  // 2. Goals — objetivos estratégicos (NUEVO)
  if (ctx.brandGoals && ctx.brandGoals.length > 0) {
    sections.push(buildGoalsBlock(ctx.brandGoals))
  }

  // 3. Personas / ICP — segmentos objetivo (NUEVO)
  if (ctx.brandPersonas && ctx.brandPersonas.length > 0) {
    sections.push(buildPersonasBlock(ctx.brandPersonas))
  }

  // 4. Idioma — prioridad absoluta antes de cualquier otro contexto
  sections.push(buildLanguageBlock(input.language, ctx))

  // 5. Canal
  if (canal?.block_text) {
    sections.push(`## CANAL: ${canal.id}\n${canal.block_text}`)
  }

  // 6. Humanize F2.5
  if (humanize) sections.push(buildHumanizeBlock(humanize))

  // 7. GeoMix
  if (geomix) sections.push(buildGeomixBlock(geomix))

  // 8. Keywords
  if (keywords.length > 0) {
    sections.push(
      `## KEYWORDS\nPrincipales: ${keywords.slice(0, 5).join(', ')}` +
      (grupo3 ? `\nGrupo SEO (grupo_3): ${grupo3}` : '')
    )
  }

  // 9. CTA
  if (cta) sections.push(`## CTA ACTIVO\n${cta}`)

  // 10. Compliance
  if (complianceRules.length > 0) {
    sections.push(
      `## COMPLIANCE — REGLAS OBLIGATORIAS\n` +
      complianceRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    )
  }

  // 11. Notas extra
  if (input.extraNotes) {
    sections.push(`## CONTEXTO ADICIONAL\n${input.extraNotes}`)
  }

  // 12. Template
  const resolvedTemplate = resolveTemplateVariables(
    template,
    buildVarMap(brand, cta, keywords, grupo3, input)
  )
  sections.push(`## INSTRUCCIÓN\n${resolvedTemplate}`)

  return sections.join('\n\n---\n\n')
}

// ─── buildGoalsBlock — objetivos estratégicos ─────────────────
function buildGoalsBlock(goals: BrandGoal[]): string {
  const HORIZON_LABEL: Record<string, string> = {
    '6m':  '6 meses',
    '12m': '12 meses (año 1)',
    '24m': '24 meses (año 2)',
  }

  const lines = ['## OBJETIVOS ESTRATÉGICOS DE LA MARCA']
  lines.push('Estos objetivos deben guiar el enfoque del copy — priorizar mensajes que acerquen al lector a estos resultados.')

  // Agrupar por horizonte
  const byHorizon = goals.reduce<Record<string, BrandGoal[]>>((acc, g) => {
    const h = g.horizon ?? 'general'
    ;(acc[h] = acc[h] ?? []).push(g)
    return acc
  }, {})

  for (const [horizon, hGoals] of Object.entries(byHorizon)) {
    const label = HORIZON_LABEL[horizon] ?? horizon
    lines.push(`\n**Horizonte ${label}:**`)
    for (const goal of hGoals.slice(0, 3)) { // máx 3 por horizonte
      const kpiStr = goal.kpi && goal.target ? ` → KPI: ${goal.kpi} ${goal.target}` : ''
      lines.push(`- [${goal.category?.toUpperCase() ?? 'GENERAL'}] ${goal.goal}${kpiStr}`)
    }
  }

  return lines.join('\n')
}

// ─── buildPersonasBlock — segmentos ICP ──────────────────────
function buildPersonasBlock(personas: BrandPersona[]): string {
  const lines = ['## SEGMENTOS OBJETIVO (ICP)']
  lines.push('Escribe para estas personas. Sus dolores, motivaciones y objeciones deben resonar en el copy.')

  // Mostrar máx 3 personas por prioridad (B2C primero, luego B2B)
  const sorted = [...personas].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2))
  const top = sorted.slice(0, 3)

  for (const p of top) {
    lines.push(`\n**${p.label}** (${p.segment_type?.toUpperCase() ?? 'B2C'})`)

    if (p.age_range || p.gender || p.location) {
      const demo = [p.age_range, p.gender, p.location].filter(Boolean).join(' · ')
      lines.push(`  Perfil: ${demo}`)
    }

    if (p.pain_points && p.pain_points.length > 0) {
      lines.push(`  Dolores: ${p.pain_points.slice(0, 2).join(' | ')}`)
    }

    if (p.motivations && p.motivations.length > 0) {
      lines.push(`  Motivaciones: ${p.motivations.slice(0, 2).join(' | ')}`)
    }

    if (p.objections && p.objections.length > 0) {
      lines.push(`  Objeciones a superar: ${p.objections.slice(0, 2).join(' | ')}`)
    }

    if (p.copy_hooks && p.copy_hooks.length > 0) {
      lines.push(`  Hooks que convierten: ${p.copy_hooks.slice(0, 2).join(' | ')}`)
    }

    if (p.tone_for_segment) {
      lines.push(`  Tono recomendado: ${p.tone_for_segment}`)
    }

    if (p.avoid && p.avoid.length > 0) {
      lines.push(`  Evitar: ${p.avoid.slice(0, 2).join(' | ')}`)
    }

    if (p.buying_trigger) {
      lines.push(`  Trigger de compra: ${p.buying_trigger}`)
    }
  }

  return lines.join('\n')
}

// ─── buildLanguageBlock ───────────────────────────────────────
const LANGUAGE_LABELS: Record<string, string> = {
  'ES':    'Español (neutro)',
  'es-ES': 'Español de España',
  'es-FL': 'Español — mercado Florida/Miami (es-FL)',
  'es-PA': 'Español de Panamá',
  'es-MX': 'Español de México',
  'EN':    'English (neutral)',
  'en-US': 'English — US market',
  'en-FL': 'English — Florida market',
  'PT':    'Português',
  'FR':    'Français',
}

function buildLanguageBlock(language: string | undefined, ctx: BrandContext): string {
  const lang = language ?? ctx.brand?.language_primary ?? 'ES'
  const label = LANGUAGE_LABELS[lang] ?? lang
  return [
    `## IDIOMA DE OUTPUT`,
    `Genera TODO el contenido exclusivamente en: **${label}**`,
    `Esta instrucción tiene prioridad absoluta sobre cualquier idioma implícito en el contexto.`,
    `No mezcles idiomas. Si algún término técnico no tiene traducción natural, mantenlo en su idioma original.`,
  ].join('\n')
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
    idioma_output:         input.language ?? brand.language_primary ?? 'ES',
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
