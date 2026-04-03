// ============================================================
// UNRLVL CopyLab — queries.ts
// fetchBrandContext(brandId) → BrandContext completo en paralelo
// Usa fetch nativo (sin SDK Supabase) · RLS anon key
// Updated: 2026-04-03 — v7.1: brand_goals + brand_personas conectados al SMPC
// Updated: 2026-03-28 — v7 initial + product catalog
// ============================================================
import type {
  BrandContext,
  Brand,
  HumanizeProfile,
  OutputTemplate,
  CanalBlock,
  Keyword,
  CTA,
  ComplianceRule,
  GeoMix,
  ImagelabPreset,
  BlueprintSchema,
  PersonBlueprint,
  LocationBlueprint,
  BrandPalette,
  BrandTypography,
  VoicelabParam,
  BrandLanguage,
  BrandService,
  ChannelPromptRule,
  ProductBlueprint,
  BrandGoal,
  BrandPersona,
} from './db/types'

// ─── Config ─────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('[CopyLab] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no definidas')
}

// ─── Fetch helper ────────────────────────────────────────────
async function sbFetch<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`[sbFetch] ${path} → ${res.status}: ${msg}`)
  }
  return res.json() as Promise<T[]>
}

// ─── Brand SELECT — columnas verificadas contra schema real ──
const BRAND_SELECT = [
  'id', 'display_name', 'type', 'market',
  'language_primary', 'status',
  // context & identity
  'brand_context', 'brand_story', 'icp', 'key_messages',
  'competitors', 'differentiators',
  // geo & tone
  'geo_principal', 'tono_base', 'canal_base', 'canales_activos', 'formatos_activos',
  // CTAs
  'cta_base', 'cta_ab_testing', 'cta_ads',
  // legal
  'disclaimer_base', 'url_base', 'cta_url_base', 'diferenciador_base',
  // imagelab
  'imagelab_industry', 'imagelab_visual_identity', 'imagelab_realism_level',
  'imagelab_film_look', 'imagelab_lens_preset', 'imagelab_depth_of_field',
  'imagelab_framing', 'imagelab_skin_detail', 'imagelab_imperfections',
  'imagelab_humidity_level', 'imagelab_grain_level',
  'imagelab_requires_product_lock', 'imagelab_compliance_rules',
  // videolab
  'videolab_motion_style_default', 'videolab_duration_default',
  'videolab_aspect_ratio', 'videolab_music_mood', 'videolab_model_preferred',
  'videolab_cut_rhythm', 'videolab_compliance_rules',
  // voicelab
  'voicelab_voice_id', 'voicelab_language', 'voicelab_speed_default',
  'voicelab_emotion_base', 'voicelab_model_preferred', 'voicelab_format_default',
  'voicelab_script_style', 'voicelab_compliance_rules',
].join(',')

// ─── fetchBrandContext ────────────────────────────────────────
/**
 * Carga el BrandContext completo de una marca en paralelo.
 * Punto de entrada único para el SMPC (buildCopyPrompt).
 *
 * @param brandId   ID canónico (e.g. "NeuroneSCF") — filtra por columna 'id'
 * @param language  Idioma activo — filtra keywords (e.g. "ES", "es-FL")
 * @param servicio  Servicio activo — filtra keywords (e.g. "tintado de lunas")
 */
export async function fetchBrandContext(
  brandId: string,
  language?: string,
  servicio?: string
): Promise<BrandContext> {
  const enc = encodeURIComponent

  let keywordsPath =
    `keywords?brand_id=eq.${enc(brandId)}&active=eq.true&order=prioridad.asc&limit=50`
  if (language) keywordsPath += `&language=eq.${enc(language)}`
  if (servicio)  keywordsPath += `&servicio=eq.${enc(servicio)}`

  const [
    brandRes,
    humanizeDefaultRes,
    humanizeOverrideRes,
    outputTemplatesRes,
    canalBlocksRes,
    keywordsRes,
    ctasRes,
    complianceGlobalRes,
    complianceBrandRes,
    geomixRes,
    imagelabGlobalRes,
    imagelabBrandRes,
    blueprintSchemasRes,
    personBlueprintsRes,
    locationBlueprintsRes,
    brandPaletteRes,
    brandTypographyRes,
    voicelabParamsRes,
    brandLanguagesRes,
    brandServicesRes,
    channelPromptRulesRes,
    // ── NUEVO: brand_goals + brand_personas ────────────────────
    brandGoalsRes,
    brandPersonasRes,
  ] = await Promise.all([
    sbFetch<Brand>(
      `brands?id=eq.${enc(brandId)}&select=${BRAND_SELECT}&limit=1`
    ),
    sbFetch<HumanizeProfile>(
      `humanize_profiles?brand_id=eq.DEFAULT&select=*`
    ),
    sbFetch<HumanizeProfile>(
      `humanize_profiles?brand_id=eq.${enc(brandId)}&select=*`
    ),
    sbFetch<OutputTemplate>(
      `output_templates?active=eq.true&select=*&order=id`
    ),
    sbFetch<CanalBlock>(
      `canal_blocks?active=eq.true&select=*&order=id`
    ),
    sbFetch<Keyword>(keywordsPath),
    sbFetch<CTA>(
      `ctas?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    sbFetch<ComplianceRule>(
      `compliance_rules?brand_id=eq.DEFAULT&active=eq.true&select=*`
    ),
    sbFetch<ComplianceRule>(
      `compliance_rules?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    sbFetch<GeoMix>(
      `geomix?brand_id=eq.${enc(brandId)}&select=*`
    ),
    sbFetch<ImagelabPreset>(
      `imagelab_presets?brand_id=is.null&select=*`
    ),
    sbFetch<ImagelabPreset>(
      `imagelab_presets?brand_id=eq.${enc(brandId)}&select=*`
    ),
    sbFetch<BlueprintSchema>(
      `blueprint_schemas?active=eq.true&select=id,version,type,description,labs_using`
    ),
    sbFetch<PersonBlueprint>(
      `person_blueprints?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    sbFetch<LocationBlueprint>(
      `location_blueprints?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    sbFetch<BrandPalette>(
      `brand_palette?brand_id=eq.${enc(brandId)}&select=*`
    ),
    sbFetch<BrandTypography>(
      `brand_typography?brand_id=eq.${enc(brandId)}&select=*`
    ),
    sbFetch<VoicelabParam>(
      `voicelab_params?brand_id=eq.${enc(brandId)}&select=*`
    ),
    sbFetch<BrandLanguage>(
      `brand_languages?brand_id=eq.${enc(brandId)}&active=eq.true&select=*&order=is_primary.desc`
    ),
    sbFetch<BrandService>(
      `brand_services?brand_id=eq.${enc(brandId)}&active=eq.true&select=*&order=is_primary.desc`
    ),
    sbFetch<ChannelPromptRule>(
      `channel_prompt_rules?select=*&order=channel_id.asc`
    ),
    // ── NUEVAS QUERIES ─────────────────────────────────────────
    // brand_goals: objetivos estratégicos 6m/12m/24m — filtrar solo activos, ordenar por prioridad
    sbFetch<BrandGoal>(
      `brand_goals?brand_id=eq.${enc(brandId)}&status=eq.active&order=priority.asc,horizon.asc&select=*`
    ),
    // brand_personas: segmentos ICP — filtrar activos, ordenar por prioridad
    sbFetch<BrandPersona>(
      `brand_personas?brand_id=eq.${enc(brandId)}&active=eq.true&order=priority.asc&select=*`
    ),
  ])

  return {
    brand:              brandRes[0] ?? null,
    humanize:           mergeHumanize(humanizeDefaultRes, humanizeOverrideRes),
    outputTemplates:    outputTemplatesRes,
    canalBlocks:        canalBlocksRes,
    keywords:           keywordsRes,
    ctas:               ctasRes,
    compliance:         [...complianceGlobalRes, ...complianceBrandRes],
    geomix:             geomixRes,
    imagelabPresets:    mergeImagelabPresets(imagelabGlobalRes, imagelabBrandRes),
    blueprintSchemas:   blueprintSchemasRes,
    personBlueprints:   personBlueprintsRes,
    locationBlueprints: locationBlueprintsRes,
    brandPalette:       brandPaletteRes,
    brandTypography:    brandTypographyRes,
    voicelabParams:     voicelabParamsRes,
    brandLanguages:     brandLanguagesRes,
    brandServices:      brandServicesRes,
    channelPromptRules: channelPromptRulesRes,
    brandGoals:         brandGoalsRes,
    brandPersonas:      brandPersonasRes,
  }
}

// ─── fetchProductCatalog ──────────────────────────────────────
export async function fetchProductCatalog(
  brandId: string,
  linea?: string
): Promise<ProductBlueprint[]> {
  const enc = encodeURIComponent
  let path = `product_blueprints?brand_id=eq.${enc(brandId)}&is_variant=eq.false&active=eq.true`
  if (linea) path += `&linea=eq.${enc(linea)}`
  path += `&order=linea.asc,name.asc`
  path += `&select=id,brand_id,sku,name,linea,line_family,subcategory,size,b2b_only,shopify_visibility,image_filename,description_en,description_es,benefit_claims,hair_type,dominant_hex`
  return sbFetch<ProductBlueprint>(path)
}

// ─── Merge helpers ────────────────────────────────────────────
function mergeHumanize(
  defaults: HumanizeProfile[],
  overrides: HumanizeProfile[]
): HumanizeProfile[] {
  const key = (h: HumanizeProfile) => `${h.medium}::${h.parameter}`
  const map = new Map<string, HumanizeProfile>()
  for (const d of defaults) map.set(key(d), d)
  for (const o of overrides) map.set(key(o), o)
  return Array.from(map.values())
}

function mergeImagelabPresets(
  globals: ImagelabPreset[],
  brandSpecific: ImagelabPreset[]
): ImagelabPreset[] {
  const map = new Map<string, ImagelabPreset>()
  for (const g of globals) map.set(g.canal ?? g.preset_id, g)
  for (const b of brandSpecific) map.set(b.canal ?? b.preset_id, b)
  return Array.from(map.values())
}

// ─── Helpers de acceso rápido ─────────────────────────────────
export function resolveHumanize(
  ctx: BrandContext,
  medium: string = 'copy'
): HumanizeProfile | null {
  const override = ctx.humanize.find(
    (h) => h.brand_id !== 'DEFAULT' && h.medium === medium && h.parameter === 'humanize_instructions'
  )
  if (override) return override
  return ctx.humanize.find(
    (h) => h.brand_id === 'DEFAULT' && h.medium === medium && h.parameter === 'humanize_instructions'
  ) ?? null
}

export function resolveTemplate(ctx: BrandContext, templateId: string): OutputTemplate | null {
  return ctx.outputTemplates.find((t) => t.id === templateId) ?? null
}

export function resolveCanalBlock(ctx: BrandContext, canalId: string): CanalBlock | null {
  return ctx.canalBlocks.find((c) => c.id === canalId) ?? null
}

export function getKeywords(ctx: BrandContext, limit = 10): string[] {
  return ctx.keywords
    .filter((k) => (k.prioridad ?? 99) <= 3)
    .slice(0, limit)
    .map((k) => k.keyword)
}

export function getGrupo3(ctx: BrandContext): string {
  const top = ctx.keywords.find((k) => (k.prioridad ?? 99) === 1)
  return top?.grupo_3 ?? getKeywords(ctx, 3).join(', ')
}

export function getCta(
  ctx: BrandContext,
  type: keyof Omit<CTA, 'id' | 'brand_id' | 'servicio' | 'idioma' | 'active'> = 'cta_smpc',
  servicio?: string
): string {
  const pool = servicio ? ctx.ctas.filter((c) => c.servicio === servicio) : ctx.ctas
  const cta = pool[0] ?? ctx.ctas[0]
  if (!cta) return ctx.brand?.cta_base ?? ''
  return (cta[type] as string | null) ?? cta.cta_smpc ?? ctx.brand?.cta_base ?? ''
}

export function getComplianceRules(ctx: BrandContext): string[] {
  const hard = ctx.compliance.filter((r) => r.severity === 'hard').map((r) => r.rule_text)
  const soft = ctx.compliance.filter((r) => r.severity !== 'hard').map((r) => r.rule_text)
  return [...hard, ...soft]
}

export function resolveGeoMix(ctx: BrandContext, geo?: string): GeoMix | null {
  if (geo) return ctx.geomix.find((g) => g.geo === geo) ?? null
  return ctx.geomix[0] ?? null
}

export function getPrimaryLanguage(ctx: BrandContext): string {
  return ctx.brandLanguages.find((l) => l.is_primary)?.idioma_id
    ?? ctx.brand?.language_primary
    ?? 'ES'
}

export function getPrimaryServices(ctx: BrandContext, idioma?: string): BrandService[] {
  return ctx.brandServices.filter(
    (s) => s.is_primary && (!idioma || s.idioma === idioma)
  )
}

export function getRecommendedPromptTypes(ctx: BrandContext, canalId: string): string[] {
  return ctx.channelPromptRules
    .filter((r) => r.channel_id === canalId && r.recommended)
    .map((r) => r.prompt_type)
}
