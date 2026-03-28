// ============================================================
// UNRLVL CopyLab — queries.ts
// fetchBrandContext(brandId) → BrandContext completo en paralelo
// Usa fetch nativo (sin SDK Supabase) · RLS anon key
// Updated: 2026-03-28 — v7 + product catalog:
//   · FIX: brand query filtra por id (no brand_id — columna no existe)
//   · FIX: brand_type → type (nombre real de columna)
//   · FIX: active removido de filtro y select (columna no existe)
//   · FIX: cta_ultrashort removido del select (columna no existe)
//   · FIX: humanize DEFAULT usa brand_id=eq.DEFAULT (no is.null)
//   · FIX: keywords filtrados por language+servicio+prioridad.asc
//   · NEW: brand_languages, brand_services, channel_prompt_rules
//   · NEW: fetchProductCatalog(brandId, linea?) → ProductBlueprint[]
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
} from './db/types'

// ─── Config ──────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('[CopyLab] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no definidas')
}

// ─── Fetch helper ─────────────────────────────────────────────
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

// ─── Brand SELECT — columnas verificadas contra schema real ───
// FIXES vs versión anterior:
//   · brand_id  → removido (no existe; PK es 'id')
//   · brand_type → type    (nombre real de columna)
//   · active    → removido (no existe; usar 'status')
//   · cta_ultrashort → removido (no existe)
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
 * @param language  Idioma activo → filtra keywords (e.g. "ES", "es-FL")
 * @param servicio  Servicio activo → filtra keywords (e.g. "tintado de lunas")
 */
export async function fetchBrandContext(
  brandId: string,
  language?: string,
  servicio?: string
): Promise<BrandContext> {
  const enc = encodeURIComponent

  // Keywords: filter by language+servicio when provided, order by prioridad ASC
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
  ] = await Promise.all([
    // FIX: filtra por 'id' (PK real). brand_id no existe en brands.
    sbFetch<Brand>(
      `brands?id=eq.${enc(brandId)}&select=${BRAND_SELECT}&limit=1`
    ),
    // DEFAULT rows tienen brand_id='DEFAULT'
    sbFetch<HumanizeProfile>(
      `humanize_profiles?brand_id=eq.DEFAULT&select=*`
    ),
    // humanize override para esta marca
    sbFetch<HumanizeProfile>(
      `humanize_profiles?brand_id=eq.${enc(brandId)}&select=*`
    ),
    // output templates (global)
    sbFetch<OutputTemplate>(
      `output_templates?active=eq.true&select=*&order=id`
    ),
    // canal blocks (global)
    sbFetch<CanalBlock>(
      `canal_blocks?active=eq.true&select=*&order=id`
    ),
    // keywords — filtered + ordered by prioridad
    sbFetch<Keyword>(keywordsPath),
    // CTAs de marca
    sbFetch<CTA>(
      `ctas?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    // compliance global (DEFAULT)
    sbFetch<ComplianceRule>(
      `compliance_rules?brand_id=eq.DEFAULT&active=eq.true&select=*`
    ),
    // compliance brand-specific
    sbFetch<ComplianceRule>(
      `compliance_rules?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    // geomix
    sbFetch<GeoMix>(
      `geomix?brand_id=eq.${enc(brandId)}&select=*`
    ),
    // imagelab presets global
    sbFetch<ImagelabPreset>(
      `imagelab_presets?brand_id=is.null&select=*`
    ),
    // imagelab presets brand-specific
    sbFetch<ImagelabPreset>(
      `imagelab_presets?brand_id=eq.${enc(brandId)}&select=*`
    ),
    // blueprint schemas
    sbFetch<BlueprintSchema>(
      `blueprint_schemas?active=eq.true&select=id,version,type,description,labs_using`
    ),
    // person blueprints
    sbFetch<PersonBlueprint>(
      `person_blueprints?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    // location blueprints
    sbFetch<LocationBlueprint>(
      `location_blueprints?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    // brand palette
    sbFetch<BrandPalette>(
      `brand_palette?brand_id=eq.${enc(brandId)}&select=*`
    ),
    // brand typography
    sbFetch<BrandTypography>(
      `brand_typography?brand_id=eq.${enc(brandId)}&select=*`
    ),
    // voicelab params
    sbFetch<VoicelabParam>(
      `voicelab_params?brand_id=eq.${enc(brandId)}&select=*`
    ),
    // brand languages
    sbFetch<BrandLanguage>(
      `brand_languages?brand_id=eq.${enc(brandId)}&active=eq.true&select=*&order=is_primary.desc`
    ),
    // brand services
    sbFetch<BrandService>(
      `brand_services?brand_id=eq.${enc(brandId)}&active=eq.true&select=*&order=is_primary.desc`
    ),
    // channel prompt rules (global)
    sbFetch<ChannelPromptRule>(
      `channel_prompt_rules?select=*&order=channel_id.asc`
    ),
  ])

  return {
    brand: brandRes[0] ?? null,
    humanize: mergeHumanize(humanizeDefaultRes, humanizeOverrideRes),
    outputTemplates: outputTemplatesRes,
    canalBlocks: canalBlocksRes,
    keywords: keywordsRes,
    ctas: ctasRes,
    compliance: [...complianceGlobalRes, ...complianceBrandRes],
    geomix: geomixRes,
    imagelabPresets: mergeImagelabPresets(imagelabGlobalRes, imagelabBrandRes),
    blueprintSchemas: blueprintSchemasRes,
    personBlueprints: personBlueprintsRes,
    locationBlueprints: locationBlueprintsRes,
    brandPalette: brandPaletteRes,
    brandTypography: brandTypographyRes,
    voicelabParams: voicelabParamsRes,
    brandLanguages: brandLanguagesRes,
    brandServices: brandServicesRes,
    channelPromptRules: channelPromptRulesRes,
  }
}

// ─── fetchProductCatalog ──────────────────────────────────────
/**
 * Carga el catálogo de productos visibles en el selector de apps.
 * Filtra: is_variant = false, active = true.
 * Si se pasa linea, filtra además por línea de producto.
 *
 * Usado por CopyCustomizeModule para el selector de SKU.
 * Separado de fetchBrandContext para no cargar 39 productos en cada request.
 *
 * @param brandId  ID canónico (e.g. "NeuroneSCF")
 * @param linea    Línea opcional (e.g. "Moisture", "Restore")
 */
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

/**
 * Humanize F2.5: DEFAULT + overrides por medium+parameter.
 * Override de marca gana sobre DEFAULT para la misma combinación.
 */
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

/**
 * ImageLab presets: global base + brand-specific por canal.
 */
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

/**
 * Resuelve el humanize profile para un medium.
 * Schema real: parameter='humanize_instructions', value=texto completo.
 */
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

/** Resuelve output template por output_type */
export function resolveTemplate(ctx: BrandContext, templateId: string): OutputTemplate | null {
  return ctx.outputTemplates.find((t) => t.output_type === templateId) ?? null
}

/** Resuelve canal block por canal_id */
export function resolveCanalBlock(ctx: BrandContext, canalId: string): CanalBlock | null {
  return ctx.canalBlocks.find((c) => c.canal_id === canalId) ?? null
}

/**
 * Top keywords para el prompt (ya vienen filtrados por language+servicio).
 * Toma prioridad ≤ 3: Principal (1), Intención (2), Geo (3).
 */
export function getKeywords(ctx: BrandContext, limit = 10): string[] {
  return ctx.keywords
    .filter((k) => (k.prioridad ?? 99) <= 3)
    .slice(0, limit)
    .map((k) => k.keyword)
}

/**
 * grupo_3_keywords del keyword de mayor prioridad.
 * Bloque SEO listo para prompt.
 */
export function getGrupo3(ctx: BrandContext): string {
  const top = ctx.keywords.find((k) => (k.prioridad ?? 99) === 1)
  return top?.grupo_3 ?? getKeywords(ctx, 3).join(', ')
}

/**
 * CTA del tipo solicitado, filtrado por servicio si se provee.
 * Fallback: brand.cta_base.
 */
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

/** Compliance rules como strings listos para prompt (hard primero) */
export function getComplianceRules(ctx: BrandContext): string[] {
  const hard = ctx.compliance.filter((r) => r.severity === 'hard').map((r) => r.rule_text)
  const soft = ctx.compliance.filter((r) => r.severity !== 'hard').map((r) => r.rule_text)
  return [...hard, ...soft]
}

/** GeoMix para un geo específico o el primero disponible */
export function resolveGeoMix(ctx: BrandContext, geo?: string): GeoMix | null {
  if (geo) return ctx.geomix.find((g) => g.geo === geo) ?? null
  return ctx.geomix[0] ?? null
}

/** Idioma primario de la marca */
export function getPrimaryLanguage(ctx: BrandContext): string {
  return ctx.brandLanguages.find((l) => l.is_primary)?.idioma_id
    ?? ctx.brand?.language_primary
    ?? 'ES'
}

/** Servicios primarios por idioma */
export function getPrimaryServices(ctx: BrandContext, idioma?: string): BrandService[] {
  return ctx.brandServices.filter(
    (s) => s.is_primary && (!idioma || s.idioma === idioma)
  )
}

/** Prompt types recomendados para un canal */
export function getRecommendedPromptTypes(ctx: BrandContext, canalId: string): string[] {
  return ctx.channelPromptRules
    .filter((r) => r.channel_id === canalId && r.recommended)
    .map((r) => r.prompt_type)
}
