/**
 * CopyLab — Supabase Query Layer
 * Fase 5: Conexión a DB centralizada UNRLVL
 * 
 * Patrón: cada función tiene fallback explícito (null | []).
 * CopyLab nunca rompe por un fetch fallido — retorna datos vacíos y loguea.
 */

import { supabase } from '../supabaseClient'
import type {
  Brand,
  BrandContext,
  HumanizeProfile,
  ComplianceRule,
  OutputTemplate,
  CanalBlock,
  Keyword,
  CTA,
  GeoMix,
  ImagelabPreset,
  VoicelabParams,
  BlueprintSchema,
  PersonBlueprint,
  LocationBlueprint,
  BrandPalette,
  BrandTypography,
} from './types'

// ─── helpers ────────────────────────────────────────────────────────

function logError(fn: string, error: unknown) {
  console.error(`[CopyLab/db] ${fn}:`, error)
}

// ─── BRANDS ─────────────────────────────────────────────────────────

export async function fetchAllBrands(): Promise<Brand[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('status', 'active')
    .order('display_name')

  if (error) { logError('fetchAllBrands', error); return [] }
  return data ?? []
}

export async function fetchBrand(brandId: string): Promise<Brand | null> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .single()

  if (error) { logError('fetchBrand', error); return null }
  return data
}

// ─── HUMANIZE ────────────────────────────────────────────────────────
// Patrón: DEFAULT (brand_id IS NULL) + override de la marca específica.
// CopyLab inyecta ambos en el prompt — el override prevalece.

export async function fetchHumanizeProfiles(brandId: string): Promise<HumanizeProfile[]> {
  const { data, error } = await supabase
    .from('humanize_profiles')
    .select('*')
    .or(`brand_id.is.null,brand_id.eq.${brandId}`)
    .order('brand_id', { nullsFirst: true })  // DEFAULT primero

  if (error) { logError('fetchHumanizeProfiles', error); return [] }
  return data ?? []
}

// ─── COMPLIANCE ──────────────────────────────────────────────────────
// Mismo patrón: reglas globales (NULL) + reglas específicas de la marca.

export async function fetchComplianceRules(brandId: string): Promise<ComplianceRule[]> {
  const { data, error } = await supabase
    .from('compliance_rules')
    .select('*')
    .or(`brand_id.is.null,brand_id.eq.${brandId}`)
    .eq('active', true)

  if (error) { logError('fetchComplianceRules', error); return [] }
  return data ?? []
}

// ─── OUTPUT TEMPLATES (16 SMPC) ──────────────────────────────────────

export async function fetchOutputTemplates(templateId?: string): Promise<OutputTemplate[]> {
  let query = supabase
    .from('output_templates')
    .select('*')
    .eq('active', true)

  if (templateId) {
    query = query.eq('id', templateId)
  }

  const { data, error } = await query.order('name')
  if (error) { logError('fetchOutputTemplates', error); return [] }
  return data ?? []
}

export async function fetchOutputTemplate(templateId: string): Promise<OutputTemplate | null> {
  const { data, error } = await supabase
    .from('output_templates')
    .select('*')
    .eq('id', templateId)
    .eq('active', true)
    .single()

  if (error) { logError('fetchOutputTemplate', error); return null }
  return data
}

// ─── CANAL BLOCKS (13 canales) ───────────────────────────────────────

export async function fetchCanalBlocks(canalId?: string): Promise<CanalBlock[]> {
  let query = supabase
    .from('canal_blocks')
    .select('*')
    .eq('active', true)

  if (canalId) {
    query = query.eq('id', canalId)
  }

  const { data, error } = await query.order('name')
  if (error) { logError('fetchCanalBlocks', error); return [] }
  return data ?? []
}

export async function fetchCanalBlock(canalId: string): Promise<CanalBlock | null> {
  const { data, error } = await supabase
    .from('canal_blocks')
    .select('*')
    .eq('id', canalId)
    .single()

  if (error) { logError('fetchCanalBlock', error); return null }
  return data
}

// ─── KEYWORDS ────────────────────────────────────────────────────────

export async function fetchKeywords(brandId: string, opts?: {
  intent?: string
  canal?: string
  grupo_3?: string
  limit?: number
}): Promise<Keyword[]> {
  let query = supabase
    .from('keywords')
    .select('*')
    .eq('brand_id', brandId)
    .eq('active', true)

  if (opts?.intent)  query = query.eq('intent', opts.intent)
  if (opts?.canal)   query = query.eq('canal', opts.canal)
  if (opts?.grupo_3) query = query.eq('grupo_3', opts.grupo_3)

  const { data, error } = await query
    .order('volume', { ascending: false, nullsLast: true })
    .limit(opts?.limit ?? 200)

  if (error) { logError('fetchKeywords', error); return [] }
  return data ?? []
}

// ─── CTAs ────────────────────────────────────────────────────────────

export async function fetchCTAs(brandId: string, servicio?: string): Promise<CTA[]> {
  let query = supabase
    .from('ctas')
    .select('*')
    .or(`brand_id.is.null,brand_id.eq.${brandId}`)
    .eq('active', true)

  if (servicio) query = query.eq('servicio', servicio)

  const { data, error } = await query.order('servicio')
  if (error) { logError('fetchCTAs', error); return [] }
  return data ?? []
}

// ─── GEOMIX ──────────────────────────────────────────────────────────

export async function fetchGeoMix(brandId: string, geo?: string): Promise<GeoMix[]> {
  let query = supabase
    .from('geomix')
    .select('*')
    .eq('brand_id', brandId)
    .eq('active', true)

  if (geo) query = query.eq('geo', geo)

  const { data, error } = await query.order('geo')
  if (error) { logError('fetchGeoMix', error); return [] }
  return data ?? []
}

// ─── IMAGELAB PRESETS ────────────────────────────────────────────────
// Patrón: preset global (NULL) sobrescrito por preset de marca si existe.

export async function fetchImagelabPresets(brandId?: string, canal?: string): Promise<ImagelabPreset[]> {
  let query = supabase.from('imagelab_presets').select('*')

  if (brandId) {
    query = query.or(`brand_id.is.null,brand_id.eq.${brandId}`)
  } else {
    query = query.is('brand_id', null)
  }

  if (canal) query = query.eq('canal', canal)

  const { data, error } = await query.order('preset_id')
  if (error) { logError('fetchImagelabPresets', error); return [] }
  return data ?? []
}

// ─── VOICELAB PARAMS ─────────────────────────────────────────────────

export async function fetchVoicelabParams(brandId: string): Promise<VoicelabParams[]> {
  const { data, error } = await supabase
    .from('voicelab_params')
    .select('*')
    .eq('brand_id', brandId)
    .order('persona_name')

  if (error) { logError('fetchVoicelabParams', error); return [] }
  return data ?? []
}

// ─── BLUEPRINT SCHEMAS ───────────────────────────────────────────────

export async function fetchBlueprintSchemas(type?: string): Promise<BlueprintSchema[]> {
  let query = supabase
    .from('blueprint_schemas')
    .select('*')
    .eq('active', true)

  if (type) query = query.eq('type', type)

  const { data, error } = await query.order('id')
  if (error) { logError('fetchBlueprintSchemas', error); return [] }
  return data ?? []
}

// ─── PERSON BLUEPRINTS ───────────────────────────────────────────────

export async function fetchPersonBlueprints(brandId: string): Promise<PersonBlueprint[]> {
  const { data, error } = await supabase
    .from('person_blueprints')
    .select('*')
    .eq('brand_id', brandId)
    .eq('active', true)
    .order('display_name')

  if (error) { logError('fetchPersonBlueprints', error); return [] }
  return data ?? []
}

// ─── LOCATION BLUEPRINTS ─────────────────────────────────────────────

export async function fetchLocationBlueprints(brandId: string): Promise<LocationBlueprint[]> {
  const { data, error } = await supabase
    .from('location_blueprints')
    .select('*')
    .eq('brand_id', brandId)
    .eq('active', true)
    .order('display_name')

  if (error) { logError('fetchLocationBlueprints', error); return [] }
  return data ?? []
}

// ─── BRAND PALETTE ───────────────────────────────────────────────────

export async function fetchBrandPalette(brandId: string): Promise<BrandPalette[]> {
  const { data, error } = await supabase
    .from('brand_palette')
    .select('*')
    .eq('brand_id', brandId)
    .order('role')

  if (error) { logError('fetchBrandPalette', error); return [] }
  return data ?? []
}

// ─── BRAND TYPOGRAPHY ────────────────────────────────────────────────

export async function fetchBrandTypography(brandId: string): Promise<BrandTypography[]> {
  const { data, error } = await supabase
    .from('brand_typography')
    .select('*')
    .eq('brand_id', brandId)
    .order('role')

  if (error) { logError('fetchBrandTypography', error); return [] }
  return data ?? []
}

// ─── COMPOSED: FULL BRAND CONTEXT (buildCopyPrompt entry point) ──────
// Una sola llamada que hidrata todo lo que el SMPC necesita para una marca.
// Lanza todas las queries en paralelo — tiempo total = la más lenta.

export async function fetchBrandContext(brandId: string): Promise<BrandContext | null> {
  const brand = await fetchBrand(brandId)
  if (!brand) {
    console.error(`[CopyLab/db] Brand not found: ${brandId}`)
    return null
  }

  const [
    humanize,
    compliance,
    output_templates,
    canal_blocks,
    ctas,
    keywords,
    geomix,
    imagelab_presets,
    voicelab_params,
    blueprint_schemas,
    persons,
    locations,
    palette,
    typography,
  ] = await Promise.all([
    fetchHumanizeProfiles(brandId),
    fetchComplianceRules(brandId),
    fetchOutputTemplates(),
    fetchCanalBlocks(),
    fetchCTAs(brandId),
    fetchKeywords(brandId),
    fetchGeoMix(brandId),
    fetchImagelabPresets(brandId),
    fetchVoicelabParams(brandId),
    fetchBlueprintSchemas(),
    fetchPersonBlueprints(brandId),
    fetchLocationBlueprints(brandId),
    fetchBrandPalette(brandId),
    fetchBrandTypography(brandId),
  ])

  return {
    brand,
    humanize,
    compliance,
    output_templates,
    canal_blocks,
    ctas,
    keywords,
    geomix,
    imagelab_presets,
    voicelab_params,
    blueprint_schemas,
    persons,
    locations,
    palette,
    typography,
  }
}
