// Auto-generated from Supabase schema — unrlvl-db · 2026-03-26
// DO NOT edit manually. Regenerate with: supabase gen types typescript

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      brands: {
        Row: {
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
          created_at: string
          updated_at: string
        }
      }
      humanize_profiles: {
        Row: {
          id: string
          brand_id: string | null      // NULL = DEFAULT global
          medium: string
          tone: string | null
          vocabulary_include: Json | null
          vocabulary_exclude: Json | null
          sentence_style: string | null
          personality: string | null
          anti_patterns: Json | null
          authenticity_rules: string | null
          temperature: number | null
          raw_config: Json | null
          created_at: string
        }
      }
      compliance_rules: {
        Row: {
          id: string
          brand_id: string | null      // NULL = regla global
          rule_type: string
          jurisdiction: string | null
          rule_text: string
          severity: string
          applies_to: Json | null
          version: string
          active: boolean
          created_at: string
        }
      }
      output_templates: {
        Row: {
          id: string
          name: string
          category: string | null
          template_text: string
          variables: Json | null
          applies_to: Json | null
          platforms: Json | null
          word_count_min: number | null
          word_count_max: number | null
          active: boolean
          version: string
          created_at: string
        }
      }
      canal_blocks: {
        Row: {
          id: string
          name: string
          platform: string
          format: string | null
          char_limit: number | null
          tone_modifier: string | null
          restrictions: Json | null
          media_types: Json | null
          aspect_ratios: Json | null
          block_text: string | null
          active: boolean
          version: string
        }
      }
      keywords: {
        Row: {
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
      }
      ctas: {
        Row: {
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
      }
      geomix: {
        Row: {
          id: string
          brand_id: string
          geo: string
          country: string | null
          region: string | null
          city: string | null
          language: string | null
          servicios: Json | null
          combos: Json | null
          lighting: string | null
          color_mood: string | null
          aesthetic: string | null
          local_slang: Json | null
          avoid_slang: Json | null
          cultural_refs: Json | null
          active: boolean
        }
      }
      imagelab_presets: {
        Row: {
          id: string
          brand_id: string | null      // NULL = preset global
          canal: string
          preset_id: string | null
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
          extra_params: Json | null
          notes: string | null
        }
      }
      voicelab_params: {
        Row: {
          id: string
          brand_id: string
          persona_name: string
          voice_id: string | null
          language: string
          gender: string | null
          age_range: string | null
          emotion_base: string | null
          speed: number
          pitch: number
          stability: number | null
          clarity: number | null
          style_exaggeration: number | null
          script_style: string | null
          engine: string
          format_default: string
          status: string
          notes: string | null
        }
      }
      blueprint_schemas: {
        Row: {
          id: string
          version: string
          type: string
          schema_json: Json
          description: string | null
          labs_using: Json | null
          active: boolean
          created_at: string
        }
      }
      person_blueprints: {
        Row: {
          id: string
          brand_id: string
          blueprint_id: string | null
          schema_version: string
          display_name: string
          role_default: string | null
          status: string
          imagelab_description: string | null
          imagelab_style: string | null
          imagelab_realism: string | null
          imagelab_film_look: string | null
          imagelab_lens: string | null
          imagelab_dof: string | null
          voicelab_ref: string | null
          speaking_style: string | null
          expertise: string | null
          compliance_notes: string | null
          compatible_archetypes: Json | null
          has_reference_photos: boolean
          reference_photos: Json | null
          raw_config: Json | null
          active: boolean
        }
      }
      location_blueprints: {
        Row: {
          id: string
          brand_id: string
          blueprint_id: string | null
          schema_version: string
          display_name: string
          location_type: string | null
          city: string | null
          country: string | null
          status: string
          visual_description: string | null
          materials: Json | null
          color_palette: Json | null
          lighting: string | null
          time_of_day_best: string | null
          signature_elements: Json | null
          imagelab_realism: string | null
          imagelab_film_look: string | null
          imagelab_lens: string | null
          imagelab_dof: string | null
          imagelab_framing: string | null
          imagelab_prompt: string | null
          videolab_prompt: string | null
          compatible_archetypes: Json | null
          recommended_angles: Json | null
          has_reference_photos: boolean
          reference_photos: Json | null
          raw_config: Json | null
          active: boolean
        }
      }
      brand_palette: {
        Row: {
          id: string
          brand_id: string
          role: string
          name: string | null
          hex: string
          pantone: string | null
          rgb: Json | null
          cmyk: Json | null
          usage: string | null
        }
      }
      brand_typography: {
        Row: {
          id: string
          brand_id: string
          role: string
          font_family: string
          weights: Json | null
          css_import: string | null
          fallback: string | null
          sample_css: string | null
        }
      }
    }
  }
}

// ─── Convenience aliases ────────────────────────────────────────────
export type Brand           = Database['public']['Tables']['brands']['Row']
export type HumanizeProfile = Database['public']['Tables']['humanize_profiles']['Row']
export type ComplianceRule  = Database['public']['Tables']['compliance_rules']['Row']
export type OutputTemplate  = Database['public']['Tables']['output_templates']['Row']
export type CanalBlock      = Database['public']['Tables']['canal_blocks']['Row']
export type Keyword         = Database['public']['Tables']['keywords']['Row']
export type CTA             = Database['public']['Tables']['ctas']['Row']
export type GeoMix          = Database['public']['Tables']['geomix']['Row']
export type ImagelabPreset  = Database['public']['Tables']['imagelab_presets']['Row']
export type VoicelabParams  = Database['public']['Tables']['voicelab_params']['Row']
export type BlueprintSchema = Database['public']['Tables']['blueprint_schemas']['Row']
export type PersonBlueprint = Database['public']['Tables']['person_blueprints']['Row']
export type LocationBlueprint = Database['public']['Tables']['location_blueprints']['Row']
export type BrandPalette    = Database['public']['Tables']['brand_palette']['Row']
export type BrandTypography = Database['public']['Tables']['brand_typography']['Row']

// ─── Composed type — full brand context for SMPC ────────────────────
export interface BrandContext {
  brand: Brand
  humanize: HumanizeProfile[]           // DEFAULT + brand override
  compliance: ComplianceRule[]          // global + brand-specific
  output_templates: OutputTemplate[]
  canal_blocks: CanalBlock[]
  ctas: CTA[]
  keywords: Keyword[]
  geomix: GeoMix[]
  imagelab_presets: ImagelabPreset[]
  voicelab_params: VoicelabParams[]
  blueprint_schemas: BlueprintSchema[]
  persons: PersonBlueprint[]
  locations: LocationBlueprint[]
  palette: BrandPalette[]
  typography: BrandTypography[]
}
