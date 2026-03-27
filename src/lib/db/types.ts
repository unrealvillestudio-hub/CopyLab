// ============================================================
// UNRLVL CopyLab — db/types.ts
// Schema Supabase v7 — Updated: 2026-03-27
// Changes vs previous:
//   · Brand: added geo_principal, tono_base, canal_base,
//     canales_activos, formatos_activos, cta_base, cta_ab_testing,
//     cta_ads, cta_ultrashort, disclaimer_base, url_base,
//     cta_url_base, diferenciador_base + full imagelab/videolab/voicelab
//   · HumanizeProfile: updated to real schema (parameter/value)
//   · GeoMix: updated to real schema (servicio_1..servicio_6)
//   · NEW: BrandLanguage, BrandService, ChannelPromptRule (v7)
//   · NEW: CopyPromptInput, CopyPromptResult
// ============================================================

// ─── Core tables ─────────────────────────────────────────────

export interface Brand {
  id: string
  brand_id: string
  display_name: string
  brand_type: string | null
  market: string | null
  language_primary: string | null
  status: string | null
  active: boolean

  // Context & identity
  brand_context: string | null
  brand_story: string | null
  icp: string | null
  key_messages: string | null
  competitors: string | null
  differentiators: string | null

  // Geo & tone (v7)
  geo_principal: string | null
  tono_base: string | null
  canal_base: string | null
  canales_activos: string | null
  formatos_activos: string | null

  // CTAs (v7)
  cta_base: string | null
  cta_ab_testing: string | null
  cta_ads: string | null
  cta_ultrashort: string | null

  // Legal (v7)
  disclaimer_base: string | null
  url_base: string | null
  cta_url_base: string | null
  diferenciador_base: string | null

  // ImageLab
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

  // VideoLab
  videolab_motion_style_default: string | null
  videolab_duration_default: number | null
  videolab_aspect_ratio: string | null
  videolab_music_mood: string | null
  videolab_model_preferred: string | null
  videolab_cut_rhythm: string | null
  videolab_compliance_rules: string | null

  // VoiceLab
  voicelab_voice_id: string | null
  voicelab_language: string | null
  voicelab_speed_default: number | null
  voicelab_emotion_base: string | null
  voicelab_model_preferred: string | null
  voicelab_format_default: string | null
  voicelab_script_style: string | null
  voicelab_compliance_rules: string | null
}

/**
 * HumanizeProfile — schema real Supabase:
 *   brand_id = 'DEFAULT' o brand_id canónico
 *   medium   = 'copy' | 'image' | 'video' | 'voice' | 'web'
 *   parameter = 'humanize_instructions'
 *   value    = texto completo de instrucciones de autenticidad
 */
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

export interface OutputTemplate {
  id: string
  output_type: string
  template_text: string
  active: boolean
}

export interface CanalBlock {
  id: string
  canal_id: string
  block_text: string
  active: boolean
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
 * GeoMix — schema real Supabase:
 *   geo = nombre del área geográfica
 *   servicio_1..servicio_6 = servicios disponibles en esa zona
 */
export interface GeoMix {
  id: string
  brand_id: string
  geo: string
  servicio_1: string | null
  servicio_2: string | null
  servicio_3: string | null
  servicio_4: string | null
  servicio_5: string | null
  servicio_6: string | null
}

export interface ImagelabPreset {
  id: string
  preset_id: string
  channel: string | null
  canal: string | null       // alias used in some rows
  preset_name: string | null
  realism_level: string | null
  film_look: string | null
  lens_preset: string | null
  depth_of_field: string | null
  framing: string | null
  skin_detail: string | null
  imperfections: string | null
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

// ─── NEW v7 tables ───────────────────────────────────────────

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
}

export interface ChannelPromptRule {
  id: string
  channel_id: string
  prompt_type: string
  allowed: boolean
  recommended: boolean
  note: string | null
}

// ─── BrandContext — assembled by fetchBrandContext ────────────

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
  // v7
  brandLanguages: BrandLanguage[]
  brandServices: BrandService[]
  channelPromptRules: ChannelPromptRule[]
}

// ─── CopyLab input/output types ──────────────────────────────

export interface CopyPromptInput {
  brandId: string
  templateId: string     // output_type key (e.g. 'SMPC_full', 'Ads_FullPro')
  canalId: string        // canal_id key (e.g. 'META_ADS', 'BLOG')
  language?: string      // e.g. 'ES', 'es-FL' — for keyword filtering
  producto?: string
  servicio?: string      // e.g. 'tintado de lunas' — for keyword + CTA filtering
  objetivo?: string
  geo?: string           // for geomix resolution
  medium?: string        // 'copy' | 'image' | 'video' | 'voice' | 'web'
  extraContext?: string
  extraNotes?: string
  complianceMode?: 'strict' | 'balanced'
  variantStyle?: 'conservative' | 'balanced' | 'creative'
  includeHashtags?: boolean
  includeEmojis?: boolean
  includeCta?: boolean
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
}
