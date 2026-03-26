// ============================================================
// UNRLVL CopyLab — db/types.ts
// BrandContext: output de fetchBrandContext(brandId)
// Generado desde schema Supabase amlvyycfepwhiindxgzw · 2026-03-26
// ============================================================

// ─── Brands ─────────────────────────────────────────────────
export interface Brand {
  id: string
  display_name: string
  tagline: string | null
  domain: string | null
  market: string | null
  language_primary: string
  sam_role: string
  type: string
  industry: string | null
  status: string
  health: string
  visual_identity: string | null
  default_negative_prompt: string | null
  agent_name: string | null
  agent_tone: string | null
  agent_value_prop: string | null
  extra_instructions: string | null
  positioning: string | null
  territory: string | null
  db_variables_context: boolean
  notes: string | null
}

// ─── Humanize F2.5 ──────────────────────────────────────────
export interface HumanizeProfile {
  id: string
  brand_id: string | null
  medium: string
  tone: string | null
  vocabulary_include: string[] | null
  vocabulary_exclude: string[] | null
  sentence_style: string | null
  personality: string | null
  anti_patterns: string[] | null
  authenticity_rules: string | null
  temperature: number | null
  raw_config: Record<string, unknown> | null
}

// ─── Output Templates (SMPC) ────────────────────────────────
export interface OutputTemplate {
  id: string
  name: string
  category: string | null
  template_text: string
  variables: string[] | null
  applies_to: string[] | null
  platforms: string[] | null
  word_count_min: number | null
  word_count_max: number | null
  active: boolean
  version: string
}

// ─── Canal Blocks ───────────────────────────────────────────
export interface CanalBlock {
  id: string
  name: string
  platform: string
  format: string | null
  char_limit: number | null
  tone_modifier: string | null
  restrictions: Record<string, unknown> | null
  media_types: string[] | null
  aspect_ratios: string[] | null
  block_text: string | null
  active: boolean
  version: string
}

// ─── Keywords ───────────────────────────────────────────────
export interface Keyword {
  id: string
  brand_id: string
  keyword: string
  type: string | null
  intent: string | null
  volume: number | null
  difficulty: number | null
  market: string | null
  language: string
  grupo_3: string | null
  canal: string | null
  active: boolean
}

// ─── CTAs ────────────────────────────────────────────────────
export interface Cta {
  id: string
  brand_id: string | null
  servicio: string | null
  idioma: string
  cta_smpc: string | null
  cta_ads: string | null
  cta_seo: string | null
  cta_story: string | null
  cta_spot: string | null
  cta_ab1: string | null
  cta_ab2: string | null
  cta_ultrashort: string | null
  active: boolean
}

// ─── Compliance Rules ────────────────────────────────────────
export interface ComplianceRule {
  id: string
  brand_id: string | null
  rule_type: string
  jurisdiction: string | null
  rule_text: string
  severity: string
  applies_to: Record<string, unknown> | null
  version: string
  active: boolean
}

// ─── GeoMix ─────────────────────────────────────────────────
export interface GeoMix {
  id: string
  brand_id: string
  geo: string
  country: string | null
  region: string | null
  city: string | null
  language: string | null
  servicios: string[] | null
  combos: string[] | null
  lighting: string | null
  color_mood: string | null
  aesthetic: string | null
  local_slang: string[] | null
  avoid_slang: string[] | null
  cultural_refs: string[] | null
  active: boolean
}

// ─── ImageLab Presets ────────────────────────────────────────
export interface ImagelabPreset {
  id: string
  brand_id: string | null
  canal: string
  preset_id: string | null
  realism_level: string | null
  film_look: string | null
  lens_preset: string | null
  depth_of_field: string | null
  framing: string | null
  lighting_style: string | null
  color_grading: string | null
  aspect_ratio: string | null
  resolution: string | null
  negative_prompt: string | null
  extra_params: Record<string, unknown> | null
}

// ─── Blueprint Schemas ───────────────────────────────────────
export interface BlueprintSchema {
  id: string
  version: string
  type: string
  schema_json: Record<string, unknown>
  description: string | null
  labs_using: string[] | null
  active: boolean
}

// ─── Person Blueprints ───────────────────────────────────────
export interface PersonBlueprint {
  id: string
  brand_id: string
  blueprint_id: string | null
  schema_version: string
  display_name: string
  role_default: string | null
  status: string
  imagelab_description: string | null
  speaking_style: string | null
  expertise: string | null
  compliance_notes: string | null
  compatible_archetypes: string[] | null
  has_reference_photos: boolean
  active: boolean
}

// ─── Location Blueprints ─────────────────────────────────────
export interface LocationBlueprint {
  id: string
  brand_id: string
  blueprint_id: string | null
  display_name: string
  location_type: string | null
  city: string | null
  country: string | null
  status: string
  visual_description: string | null
  imagelab_prompt: string | null
  has_reference_photos: boolean
  active: boolean
}

// ─── Brand Palette ───────────────────────────────────────────
export interface BrandPalette {
  id: string
  brand_id: string
  role: string
  name: string | null
  hex: string
  pantone: string | null
  usage: string | null
}

// ─── Brand Typography ────────────────────────────────────────
export interface BrandTypography {
  id: string
  brand_id: string
  role: string
  font_family: string
  weights: number[] | null
  css_import: string | null
  fallback: string | null
}

// ─── Voicelab Params ─────────────────────────────────────────
export interface VoicelabParam {
  id: string
  brand_id: string
  persona_name: string
  voice_id: string | null
  language: string
  gender: string | null
  script_style: string | null
  engine: string
  status: string
}

// ============================================================
// BrandContext — output completo de fetchBrandContext(brandId)
// Todas las propiedades son arrays vacíos si no hay datos,
// excepto brand que puede ser null si el brandId no existe.
// ============================================================
export interface BrandContext {
  brand: Brand | null
  humanize: HumanizeProfile[]        // DEFAULT + override de marca (copy/medium)
  outputTemplates: OutputTemplate[]  // todos los activos (global, no por marca)
  canalBlocks: CanalBlock[]          // todos los activos (global, no por marca)
  keywords: Keyword[]                // filtrados por brand_id
  ctas: Cta[]                        // filtrados por brand_id
  compliance: ComplianceRule[]       // GLOBAL (brand_id IS NULL) + brand-specific
  geomix: GeoMix[]                   // filtrados por brand_id
  imagelabPresets: ImagelabPreset[]  // GLOBAL (brand_id IS NULL) + brand-specific
  blueprintSchemas: BlueprintSchema[]
  personBlueprints: PersonBlueprint[]
  locationBlueprints: LocationBlueprint[]
  brandPalette: BrandPalette[]
  brandTypography: BrandTypography[]
  voicelabParams: VoicelabParam[]
}

// ─── Input para buildCopyPrompt ──────────────────────────────
export interface CopyPromptInput {
  brandId: string
  templateId: string          // ID de output_templates (e.g. "Ads_FullPro")
  canalId: string             // ID de canal_blocks (e.g. "META_FEED")
  servicio: string
  objetivo: string
  // Opcionales
  productName?: string
  sku?: string
  geo?: string                // filtrar geomix por geo específico
  medium?: string             // para resolver humanize override (default: 'copy')
  extraContext?: string       // inyección libre adicional
}

// ─── Output de buildCopyPrompt ───────────────────────────────
export interface CopyPromptResult {
  prompt: string
  templateName: string
  canalName: string
  brandName: string
  temperature: number
  wordCountMin: number | null
  wordCountMax: number | null
  metadata: {
    keywordsInjected: number
    ctasInjected: number
    complianceRulesInjected: number
    humanizeApplied: boolean
    geomixApplied: boolean
  }
}
