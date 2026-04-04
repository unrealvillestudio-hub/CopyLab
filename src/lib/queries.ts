// src/lib/queries.ts
// CopyLab v8.0 — 100% Supabase-driven
// Modificación 2026-04-04: query #24 brand_copy_profiles → SMPC Layer 13
// Fix v2: fetchProductCatalog reincorporado + sbFetch inline (no depende de supabaseClient.ts)

// ─── Supabase fetch helper (inline — no importa de supabaseClient.ts) ─────────
const SUPABASE_URL      = (import.meta as any).env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

async function sbFetch(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey:         SUPABASE_ANON_KEY,
      Authorization:  `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[sbFetch] ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Brand select fields ──────────────────────────────────────────────────────
const BRAND_SELECT_FIELDS = [
  'id', 'display_name', 'type', 'market', 'language_primary', 'status',
  'brand_context', 'brand_story', 'icp', 'key_messages', 'competitors',
  'differentiators', 'geo_principal', 'tono_base', 'canal_base',
  'canales_activos', 'formatos_activos', 'cta_base', 'cta_ab_testing',
  'cta_ads', 'disclaimer_base', 'url_base', 'cta_url_base',
  'diferenciador_base', 'imagelab_industry', 'imagelab_visual_identity',
  'imagelab_realism_level', 'imagelab_film_look', 'imagelab_lens_preset',
  'imagelab_depth_of_field', 'imagelab_framing', 'imagelab_skin_detail',
  'imagelab_imperfections', 'imagelab_humidity_level', 'imagelab_grain_level',
  'imagelab_requires_product_lock', 'imagelab_compliance_rules',
  'videolab_motion_style_default', 'videolab_duration_default',
  'videolab_aspect_ratio', 'videolab_music_mood', 'videolab_model_preferred',
  'videolab_cut_rhythm', 'videolab_compliance_rules',
  'voicelab_voice_id', 'voicelab_language', 'voicelab_speed_default',
  'voicelab_emotion_base', 'voicelab_model_preferred',
  'voicelab_format_default', 'voicelab_script_style', 'voicelab_compliance_rules',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeHumanizeProfiles(defaults: any[], brand: any[]) {
  const key = (p: any) => `${p.medium}::${p.parameter}`;
  const map = new Map<string, any>();
  for (const p of defaults) map.set(key(p), p);
  for (const p of brand)    map.set(key(p), p);
  return Array.from(map.values());
}

function mergeImagelabPresets(global: any[], brand: any[]) {
  const map = new Map<string, any>();
  for (const p of global) map.set(p.canal ?? p.preset_id, p);
  for (const p of brand)  map.set(p.canal ?? p.preset_id, p);
  return Array.from(map.values());
}

// ─── fetchBrandContext ────────────────────────────────────────────────────────

export async function fetchBrandContext(
  brandId: string,
  language?: string,
  servicio?: string,
) {
  const enc = encodeURIComponent;

  let keywordsPath = `keywords?brand_id=eq.${enc(brandId)}&active=eq.true&order=prioridad.asc&limit=50`;
  if (language) keywordsPath += `&language=eq.${enc(language)}`;
  if (servicio) keywordsPath += `&servicio=eq.${enc(servicio)}`;

  const [
    brandsResult,
    humanizeDEFAULT,
    humanizeBrand,
    outputTemplates,
    canalBlocks,
    keywords,
    ctas,
    complianceDEFAULT,
    complianceBrand,
    geomix,
    imagelabPresetsGlobal,
    imagelabPresetsBrand,
    blueprintSchemas,
    personBlueprints,
    locationBlueprints,
    brandPalette,
    brandTypography,
    voicelabParams,
    brandLanguages,
    brandServices,
    channelPromptRules,
    brandGoals,
    brandPersonas,
    copyProfileResult,
  ] = await Promise.all([
    sbFetch(`brands?id=eq.${enc(brandId)}&select=${BRAND_SELECT_FIELDS.join(',')}&limit=1`),
    sbFetch('humanize_profiles?brand_id=eq.DEFAULT&select=*'),
    sbFetch(`humanize_profiles?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch('output_templates?active=eq.true&select=*&order=id'),
    sbFetch('canal_blocks?active=eq.true&select=*&order=id'),
    sbFetch(keywordsPath),
    sbFetch(`ctas?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    sbFetch('compliance_rules?brand_id=eq.DEFAULT&active=eq.true&select=*'),
    sbFetch(`compliance_rules?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    sbFetch(`geomix?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch('imagelab_presets?brand_id=is.null&select=*'),
    sbFetch(`imagelab_presets?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch('blueprint_schemas?active=eq.true&select=id,version,type,description,labs_using'),
    sbFetch(`person_blueprints?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    sbFetch(`location_blueprints?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    sbFetch(`brand_palette?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch(`brand_typography?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch(`voicelab_params?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch(`brand_languages?brand_id=eq.${enc(brandId)}&active=eq.true&select=*&order=is_primary.desc`),
    sbFetch(`brand_services?brand_id=eq.${enc(brandId)}&active=eq.true&select=*&order=is_primary.desc`),
    sbFetch('channel_prompt_rules?select=*&order=channel_id.asc'),
    sbFetch(`brand_goals?brand_id=eq.${enc(brandId)}&status=eq.active&order=priority.asc,horizon.asc&select=*`),
    sbFetch(`brand_personas?brand_id=eq.${enc(brandId)}&active=eq.true&order=priority.asc&select=*`),
    sbFetch(`brand_copy_profiles?brand_id=eq.${enc(brandId)}&active=eq.true&limit=1&select=id,brand_id,voice_tone_primary,voice_tone_secondary,voice_writing_style,voice_pov,style_sentence_length,style_emoji_usage,style_hashtag_style,style_cta_style,style_hooks,style_signature_phrases,style_avoid_phrases,compliance_rules,compliance_prohibited_words,compliance_required_disclaimers`),
  ]);

  return {
    brand:              brandsResult[0] ?? null,
    humanize:           mergeHumanizeProfiles(humanizeDEFAULT, humanizeBrand),
    outputTemplates,
    canalBlocks,
    keywords,
    ctas,
    compliance:         [...complianceDEFAULT, ...complianceBrand],
    geomix,
    imagelabPresets:    mergeImagelabPresets(imagelabPresetsGlobal, imagelabPresetsBrand),
    blueprintSchemas,
    personBlueprints,
    locationBlueprints,
    brandPalette,
    brandTypography,
    voicelabParams,
    brandLanguages,
    brandServices,
    channelPromptRules,
    brandGoals,
    brandPersonas,
    copyProfile:        copyProfileResult[0] ?? null,
  };
}

export type BrandContext = Awaited<ReturnType<typeof fetchBrandContext>>;

// ─── fetchProductCatalog ──────────────────────────────────────────────────────
// Usado por CopyCustomizeModule.tsx para el selector de producto/SKU

export async function fetchProductCatalog(brandId: string): Promise<any[]> {
  const enc = encodeURIComponent;
  return sbFetch(
    `product_blueprints?brand_id=eq.${enc(brandId)}&is_variant=eq.false&active=eq.true` +
    `&order=linea.asc,name.asc` +
    `&select=id,brand_id,sku,name,linea,line_family,subcategory,size,b2b_only,` +
    `shopify_visibility,image_filename,description_en,description_es,` +
    `benefit_claims,hair_type,dominant_hex`,
  );
}
