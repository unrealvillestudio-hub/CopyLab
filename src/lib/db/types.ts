// ============================================================
// UNRLVL CopyLab — db/types.ts
// Schema Supabase — Updated: 2026-03-28c (audit completo)
// FIXES aplicados contra schema real verificado:
//   · Brand: brand_id→id, brand_type→type, -active, -cta_ultrashort
//   · OutputTemplate: -output_type; id ES el identifier; +name,category,etc.
//   · CanalBlock: -canal_id; id ES el identifier; +name,platform,format,etc.
//   · GeoMix: -servicio_1..6 → +servicios:string[], +combos:string[],
//             +country,region,city,language,lighting,color_mood,
//             +aesthetic,local_slang,avoid_slang,cultural_refs,active
//   · ImagelabPreset: -channel,-preset_name; +humidity_level,sweat_level,
//             grain_level,lighting_style,color_grading,aspect_ratio,
//             resolution,negative_prompt,extra_params,notes
// ============================================================

// ─── Core tables ──────────────────────────────────────────────

export interface Brand {
  id: string
  display_name: string
  type: string | null
  market: string | null
  language_primary: string | null
  status: string | null
  brand_context: string | null
  brand_story: string | null
  icp: string | null
  key_messages: string | null
  competitors: string | null
  differentiators: string | null
  geo_principal: string | null
  tono_base: string | null
  canal_base: string | null
  canales_activos: string | null
  formatos_activos: string | null
  cta_base: string | null
  cta_ab_testing: string | null
  cta_ads: string | null
  disclaimer_base: string | null
  url_base: string | null
  cta_url_base: string | null
  diferenciador_base: string | null
  imagelab_industry: string | null
  imagelab_visual_identity: string | null
  imagelab_realism_level: string | null
  imagelab_film_look: string | null
  imagelab_lens_preset: string | null
  imagelab_depth_of_field: string | null
  imagelab_framing: string | null
  imagelab_skin_detail: string | null
  imagelab_imperfections: string | null
  imagelab_humidity_level: number | null
  imagelab_grain_level: number | null
  imagelab_requires_product_lock: boolean
  imagelab_compliance_rules: string | null
  videolab_motion_style_default: string | null
  videolab_duration_default: number | null
  videolab_aspect_ratio: string | null
  videolab_music_mood: string | null
  videolab_model_preferred: string | null
  videolab_cut_rhythm: string | null
  videolab_compliance_rules: string | null
  voicelab_voice_id: string | null
  voicelab_language: string | null
  voicelab_speed_default: number | null
  voicelab_emotion_base: string | null
  voicelab_model_preferred: string | null
  voicelab_format_default: string | null
  voicelab_script_style: string | null
  voicelab_compliance_rules: string | null
}

export interface HumanizeProfile {
  id: string
  brand_id: string
  medium: string
  parameter: string
  value: string
  notes: string | null
}

export interface ComplianceRule {
  id: string
  brand_id: string
  rule_type: string
  rule_text: string
  applies_to: string[] | null
  severity: string | null
  active: boolean
}

/** id ES el identificador funcional, e.g. 'YouTube_Ideas' */
export interface OutputTemplate {
  id: string
  name: string | null
  category: string | null
  template_text: string
  variables: Record<string, unknown> | null
  applies_to: string[] | null
  platforms: string[] | null
  word_count_min: number | null
  word_count_max: number | null
  active: boolean
}

/** id ES el identificador funcional, e.g. 'YOUTUBE', 'META_ADS' */
export interface CanalBlock {
  id: string
  name: string | null
  platform: string | null
  format: string | null
  char_limit: number | null
  tone_modifier: string | null
  restrictions: string | null
  media_types: string[] | null
  aspect_ratios: string[] | null
  block_text: string
  active: boolean
  version: string | null
}

export interface Keyword {
  id: string
  brand_id: string
  language: string | null
  producto: string | null
  servicio: string | null
  keyword: string
  type: string | null
  intent: string | null
  grupo_3: string | null
  prioridad: number | null
  active: boolean
}

export interface CTA {
  id: string
  brand_id: string
  servicio: string | null
  idioma: string | null
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

/**
 * GeoMix — schema real (verificado 2026-03-28):
 *   servicios = array de servicios disponibles en la zona
 *   combos    = array de frases SEO "servicio + geo"
 */
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
  local_slang: string | null
  avoid_slang: string | null
  cultural_refs: string | null
  active: boolean
}

/**
 * ImagelabPreset — schema real (verificado 2026-03-28):
 *   canal (no channel), sin preset_name
 */
export interface ImagelabPreset {
  id: string
  brand_id: string | null
  canal: string | null
  preset_id: string
  realism_level: string | null
  film_look: string | null
  lens_preset: string | null
  depth_of_field: string | null
  framing: string | null
  skin_detail: string | null
  imperfections: string | null
  humidity_level: number | null
  sweat_level: number | null
  grain_level: number | null
  lighting_style: string | null
  color_grading: string | null
  aspect_ratio: string | null
  resolution: string | null
  negative_prompt: string | null
  extra_params: Record<string, unknown> | null
  notes: string | null
}

export interface VoicelabParam {
  id: string
  brand_id: string
  voice_id: string | null
  language: string | null
  speed: number | null
  emotion: string | null
  model: string | null
  format: string | null
  script_style: string | null
  compliance_rules: string | null
}

export interface BlueprintSchema {
  id: string
  version: string | null
  type: string | null
  description: string | null
  labs_using: string[] | null
  active: boolean
}

export interface PersonBlueprint {
  id: string
  blueprint_id: string
  brand_id: string
  display_name: string | null
  role_default: string | null
  status: string | null
  imagelab_description: string | null
  imagelab_style: string | null
  imagelab_realism_level: string | null
  imagelab_film_look: string | null
  imagelab_lens_preset: string | null
  imagelab_depth_of_field: string | null
  voicelab_voice_id: string | null
  active: boolean
}

export interface LocationBlueprint {
  id: string
  blueprint_id: string
  brand_id: string
  display_name: string | null
  location_type: string | null
  city: string | null
  country: string | null
  status: string | null
  visual_description: string | null
  materials: string | null
  color_palette: string | null
  active: boolean
}

export interface BrandPalette {
  id: string
  brand_id: string
  role: string | null
  hex: string | null
  name: string | null
  usage: string | null
}

export interface BrandTypography {
  id: string
  brand_id: string
  role: string | null
  font_family: string | null
  weight: string | null
  usage: string | null
}

export interface BrandLanguage {
  id: string
  brand_id: string
  idioma_id: string
  descripcion: string | null
  mercado: string | null
  is_primary: boolean
  active: boolean
}

export interface BrandService {
  id: string
  brand_id: string
  producto: string | null
  servicio: string | null
  idioma: string | null
  is_primary: boolean
  active: boolean
  item_type: 'producto' | 'servicio' | 'ambos'
}

export interface ChannelPromptRule {
  id: string
  channel_id: string
  prompt_type: string
  allowed: boolean
  recommended: boolean
  note: string | null
}

export interface ProductBlueprint {
  id: string
  brand_id: string
  schema_version: string | null
  sku: string | null
  name: string
  linea: string | null
  line_family: string | null
  subcategory: string | null
  size: string | null
  barcode: string | null
  is_variant: boolean
  b2b_only: boolean
  shopify_visibility: 'public' | 'b2b_only' | 'hidden'
  description_en: string | null
  description_es: string | null
  benefit_claims: string[] | null
  hair_type: string[] | null
  image_filename: string | null
  image_dark_filename: string | null
  dominant_hex: string | null
  packaging_style: string | null
  lifestyle_context: string | null
  price: number | null
  msrp: number | null
  cross_sell: string[] | null
  related_skus: Array<{ sku: string; size: string; barcode?: string }> | null
  compliance_flags: { category_risk: string; notes: string } | null
  category: string | null
  tagline: string | null
  description_short: string | null
  description_long: string | null
  ingredients: Record<string, unknown>[] | null
  claims: string[] | null
  has_reference_photos: boolean
  reference_photos: string[] | null
  imagelab_params: Record<string, unknown> | null
  raw_config: Record<string, unknown> | null
  active: boolean
}

// ─── BrandContext ─────────────────────────────────────────────

export interface BrandContext {
  brand: Brand | null
  humanize: HumanizeProfile[]
  compliance: ComplianceRule[]
  outputTemplates: OutputTemplate[]
  canalBlocks: CanalBlock[]
  keywords: Keyword[]
  ctas: CTA[]
  geomix: GeoMix[]
  imagelabPresets: ImagelabPreset[]
  voicelabParams: VoicelabParam[]
  blueprintSchemas: BlueprintSchema[]
  personBlueprints: PersonBlueprint[]
  locationBlueprints: LocationBlueprint[]
  brandPalette: BrandPalette[]
  brandTypography: BrandTypography[]
  brandLanguages: BrandLanguage[]
  brandServices: BrandService[]
  channelPromptRules: ChannelPromptRule[]
}

// ─── CopyLab input/output ─────────────────────────────────────

export interface CopyPromptInput {
  brandId: string
  templateId: string
  canalId: string
  language?: string
  producto?: string
  servicio?: string
  objetivo?: string
  geo?: string
  medium?: string
  extraContext?: string
  extraNotes?: string
  complianceMode?: 'strict' | 'balanced'
  variantStyle?: 'conservative' | 'balanced' | 'creative'
  includeHashtags?: boolean
  includeEmojis?: boolean
  includeCta?: boolean
  selectedProduct?: ProductBlueprint | null
}

export interface CopyPromptResult {
  prompt: string
  templateName: string
  canalName: string
  brandName: string
  temperature: number
  metadata: {
    keywordsInjected: number
    ctasInjected: number
    complianceRulesInjected: number
    humanizeApplied: boolean
    geomixApplied: boolean
  }
// ── brand_goals ───────────────────────────────────────────────
export interface BrandGoal {
  id: string
  brand_id: string | null
  horizon: '6m' | '12m' | '24m'
  category: string
  goal: string
  kpi: string | null
  target: string | null
  priority: 1 | 2 | 3
  status: string | null
  notes: string | null
}

// ── brand_personas ────────────────────────────────────────────
export interface BrandPersona {
  id: string
  brand_id: string | null
  persona_key: string
  label: string
  segment_type: 'b2c' | 'b2b' | 'both' | null
  priority: 1 | 2 | 3
  age_range: string | null
  gender: string | null
  location: string | null
  pain_points: string[] | null
  motivations: string[] | null
  objections: string[] | null
  channels: string[] | null
  buying_trigger: string | null
  tone_for_segment: string | null
  copy_hooks: string[] | null
  avoid: string[] | null
  confidence: 1 | 2 | 3
  active: boolean
}
}
