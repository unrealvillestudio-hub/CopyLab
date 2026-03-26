// ============================================================
// UNRLVL CopyLab — queries.ts
// fetchBrandContext(brandId) → BrandContext completo en paralelo
// Usa fetch nativo (sin SDK Supabase) · RLS anon key
// Commit base: 7bb1adf · Fase 5 infra ✅ · Fase 5b integración
// ============================================================

import type {
  BrandContext,
  Brand,
  HumanizeProfile,
  OutputTemplate,
  CanalBlock,
  Keyword,
  Cta,
  ComplianceRule,
  GeoMix,
  ImagelabPreset,
  BlueprintSchema,
  PersonBlueprint,
  LocationBlueprint,
  BrandPalette,
  BrandTypography,
  VoicelabParam,
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

// ─── fetchBrandContext ───────────────────────────────────────
/**
 * Carga el BrandContext completo de una marca en paralelo.
 * Punto de entrada único para el SMPC (buildCopyPrompt).
 *
 * @param brandId  ID canónico de la marca (e.g. "DiamondDetails")
 * @returns        BrandContext — null en brand si brandId no existe
 */
export async function fetchBrandContext(brandId: string): Promise<BrandContext> {
  const enc = encodeURIComponent

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
  ] = await Promise.all([
    // brand
    sbFetch<Brand>(
      `brands?id=eq.${enc(brandId)}&select=*&limit=1`
    ),
    // humanize DEFAULT (brand_id IS NULL)
    sbFetch<HumanizeProfile>(
      `humanize_profiles?brand_id=is.null&select=*`
    ),
    // humanize override para esta marca
    sbFetch<HumanizeProfile>(
      `humanize_profiles?brand_id=eq.${enc(brandId)}&select=*`
    ),
    // output templates (global — no tienen brand_id)
    sbFetch<OutputTemplate>(
      `output_templates?active=eq.true&select=*&order=id`
    ),
    // canal blocks (global)
    sbFetch<CanalBlock>(
      `canal_blocks?active=eq.true&select=*&order=id`
    ),
    // keywords de marca
    sbFetch<Keyword>(
      `keywords?brand_id=eq.${enc(brandId)}&active=eq.true&select=*&order=volume.desc&limit=50`
    ),
    // CTAs de marca
    sbFetch<Cta>(
      `ctas?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    // compliance global (brand_id IS NULL)
    sbFetch<ComplianceRule>(
      `compliance_rules?brand_id=is.null&active=eq.true&select=*`
    ),
    // compliance brand-specific
    sbFetch<ComplianceRule>(
      `compliance_rules?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
    ),
    // geomix
    sbFetch<GeoMix>(
      `geomix?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`
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
  ])

  return {
    brand: brandRes[0] ?? null,
    // humanize: DEFAULT primero, overrides de marca sobreescriben por medium
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
  }
}

// ─── Merge helpers ───────────────────────────────────────────

/**
 * Humanize F2.5: DEFAULT + overrides por medium.
 * El override de marca gana sobre el DEFAULT para el mismo medium.
 */
function mergeHumanize(
  defaults: HumanizeProfile[],
  overrides: HumanizeProfile[]
): HumanizeProfile[] {
  const map = new Map<string, HumanizeProfile>()
  for (const d of defaults) map.set(d.medium, d)
  for (const o of overrides) map.set(o.medium, o) // override wins
  return Array.from(map.values())
}

/**
 * ImageLab presets: global base + brand-specific sobreescriben por canal.
 */
function mergeImagelabPresets(
  globals: ImagelabPreset[],
  brandSpecific: ImagelabPreset[]
): ImagelabPreset[] {
  const map = new Map<string, ImagelabPreset>()
  for (const g of globals) map.set(g.canal, g)
  for (const b of brandSpecific) map.set(b.canal, b) // brand wins
  return Array.from(map.values())
}

// ─── Helpers de acceso rápido ────────────────────────────────

/** Resuelve el humanize profile para un medium dado, con fallback a DEFAULT */
export function resolveHumanize(
  ctx: BrandContext,
  medium: string = 'copy'
): HumanizeProfile | null {
  return (
    ctx.humanize.find((h) => h.brand_id !== null && h.medium === medium) ??
    ctx.humanize.find((h) => h.brand_id === null && h.medium === medium) ??
    null
  )
}

/** Resuelve output template por ID */
export function resolveTemplate(
  ctx: BrandContext,
  templateId: string
): OutputTemplate | null {
  return ctx.outputTemplates.find((t) => t.id === templateId) ?? null
}

/** Resuelve canal block por ID */
export function resolveCanalBlock(
  ctx: BrandContext,
  canalId: string
): CanalBlock | null {
  return ctx.canalBlocks.find((c) => c.id === canalId) ?? null
}

/** Keywords top por canal (opcional) */
export function getKeywords(ctx: BrandContext, canal?: string): string[] {
  const kws = canal
    ? ctx.keywords.filter((k) => !k.canal || k.canal === canal)
    : ctx.keywords
  return kws.slice(0, 10).map((k) => k.keyword)
}

/** CTA del tipo solicitado (con fallback a cta_smpc) */
export function getCta(ctx: BrandContext, type: keyof Cta = 'cta_smpc'): string {
  const cta = ctx.ctas[0]
  if (!cta) return ''
  return (cta[type] as string | null) ?? cta.cta_smpc ?? ''
}

/** Compliance rules como strings listos para prompt */
export function getComplianceRules(ctx: BrandContext): string[] {
  return ctx.compliance
    .filter((r) => r.severity === 'hard')
    .map((r) => r.rule_text)
}

/** GeoMix para un geo específico (o el primero disponible) */
export function resolveGeoMix(ctx: BrandContext, geo?: string): GeoMix | null {
  if (geo) return ctx.geomix.find((g) => g.geo === geo) ?? null
  return ctx.geomix[0] ?? null
}
