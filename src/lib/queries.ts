// src/lib/queries.ts
// CopyLab v8.0 — 100% Supabase-driven
// Modificación 2026-05-20: query #25 brand_voice_genome → L1.5 Voice Genome Injection (content-pipeline v2.6)
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

// ─── brand_context_cache — Cache-first fetchBrandContext ─────────────────────
//
// Flujo:
//   1. Consultar brand_context_cache WHERE brand_id = X AND is_stale = false
//   2a. Cache HIT  → retornar datos del cache + keywords/CTAs dinámicos (3 queries total)
//   2b. Cache MISS → full fetch (25 queries). Desde 2026-09-25 NO se reescribe la caché:
//       medido que estaba obsoleta para todas las marcas activas y que nadie la leía.
//
// Invalidación: triggers automáticos en Postgres marcan is_stale=true
// cuando cualquier tabla fuente cambia. Sin TTL — los datos son válidos hasta
// que algo los cambia.

// ── LA CACHÉ QUE NADIE LEÍA DEJA DE ESCRIBIRSE · 2026-09-25 ──────────────────
// Aquí vivía `writeBrandCache`, que llamaba a `rpc/upsert_brand_cache` —una función
// SECURITY DEFINER— con `VITE_SUPABASE_ANON_KEY` desde el navegador. Su comentario lo decía
// sin rodeos: «Usar RPC (SECURITY DEFINER) para escribir con privilegios elevados desde el
// browser». Una variable `VITE_*` se INCRUSTA en el bundle, y este lab es un sitio PÚBLICO:
// la única autenticación de esa escritura era descargar la página.
//
// SE RETIRA EN VEZ DE MOVERSE AL SERVIDOR, y el motivo está medido, no supuesto.
//
// MEDIDO el 2026-09-25 sobre `public.brand_context_cache`:
//   · 15 filas. CATORCE con `is_stale = true`.
//   · La única con `is_stale = false` es de una marca compilada el 2026-08-30, hace casi un mes.
//   · La escritura más reciente de toda la tabla es del 2026-09-04.
//
// Y la lectura de más abajo pide `is_stale=eq.false`. Es decir: para TODAS las marcas activas
// esta caché falla siempre, el `full fetch` de 25 consultas corre igual, y la escritura produce
// una fila que un disparador vuelve a marcar obsoleta. Una escritura que nadie lee no se
// traslada a una ruta del servidor: se quita. Mover la credencial habría sido cambiar de sitio
// el riesgo sin ganar nada — y este lab no tiene SSO, así que una ruta propia habría quedado
// igual de alcanzable que la RPC.
//
// LO QUE QUEDA DECLARADO, no resuelto: `brand_context_cache` y `brand_cache_snapshots` son DOS
// cachés del mismo concepto. La segunda la construye la EF `brand-snapshot-builder` cada 3 h
// —MEDIDO: su última construcción es de hoy—, y `api/brand-cache.js` ya la sirve bajo la regla
// de v3.0: «un lab LEE el snapshot; ningún lab lo CONSTRUYE». Migrar la lectura de aquí a esa
// vía es el paso siguiente, y es un cambio de comportamiento del lab: va en su propio PR.

async function buildContextFromCache(
  cached: any,
  keywords: any[],
  ctas: any[],
): Promise<any> {
  return {
    brand:              cached.brand_data,
    humanize:           cached.humanize        ?? [],
    outputTemplates:    cached.output_templates ?? [],
    canalBlocks:        cached.canal_blocks     ?? [],
    keywords,
    ctas,
    compliance:         cached.compliance       ?? [],
    geomix:             cached.geomix           ?? [],
    imagelabPresets:    [],   // no cacheado — pocas veces usado en copy
    blueprintSchemas:   [],
    personBlueprints:   [],
    locationBlueprints: [],
    brandPalette:       [],
    brandTypography:    [],
    voicelabParams:     [],
    brandLanguages:     cached.languages        ?? [],
    brandServices:      cached.services         ?? [],
    channelPromptRules: cached.channel_rules    ?? [],
    brandGoals:         cached.goals            ?? [],
    brandPersonas:      cached.personas         ?? [],
    copyProfile:        cached.copy_profile     ?? null,
    voiceGenome:        cached.voice_genome     ?? null,
    psychoPresets:      cached.psycho_presets   ?? [],
    _source: 'cache',
  };
}

export async function fetchBrandContext(
  brandId: string,
  language?: string,
  servicio?: string,
) {
  const enc = encodeURIComponent;

  // ── Cache-first ───────────────────────────────────────────────────────────
  // Keyword servicio limpio: solo el nombre del producto/kit/servicio,
  // sin el bloque de contexto adicional que lleva el productContext de CopyPackModule
  const servicioClean = servicio ? servicio.split('\n\nContexto adicional')[0].trim() : undefined;

  try {
    const cached = await sbFetch(
      `brand_context_cache?brand_id=eq.${enc(brandId)}&is_stale=eq.false&limit=1`
    );
    if (cached.length > 0) {
      // Cache HIT — solo keywords y CTAs dinámicos (3 queries total)
      let kwPath = `keywords?brand_id=eq.${enc(brandId)}&active=eq.true&order=prioridad.asc&limit=50`;
      if (language)      kwPath += `&language=eq.${enc(language)}`;
      if (servicioClean) kwPath += `&servicio=eq.${enc(servicioClean)}`;
      const [keywords, ctas] = await Promise.all([
        sbFetch(kwPath),
        sbFetch(`ctas?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
      ]);
      return buildContextFromCache(cached[0], keywords, ctas);
    }
  } catch {
    // Cache miss o error — continúa con full fetch
  }
  // ── Cache MISS o stale → full fetch ───────────────────────────────────────
  const _t0 = Date.now();

  // servicioClean ya definido arriba — usa solo el nombre, no el bloque de contexto
  let keywordsPath = `keywords?brand_id=eq.${enc(brandId)}&active=eq.true&order=prioridad.asc&limit=50`;
  if (language)      keywordsPath += `&language=eq.${enc(language)}`;
  if (servicioClean) keywordsPath += `&servicio=eq.${enc(servicioClean)}`;

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
    // ── Query #25 — L1.5 VOICE GENOME (content-pipeline v2.6) ──────────────
    voiceGenomeResult,
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
    // Query #25: voice genome activo para este brand (L1.5)
    sbFetch(`brand_voice_genome?brand_id=eq.${enc(brandId)}&active=eq.true&order=version.desc&limit=1`),
  ]);

  const _ctx = {
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
    voiceGenome:        voiceGenomeResult[0] ?? null,  // ← L1.5: null si no existe para esta marca
  };

  // Ya no se escribe la caché desde el navegador — ver el bloque «LA CACHÉ QUE NADIE LEÍA»
  // más arriba. `_t0` se conserva porque mide el tiempo de compilación y se sigue usando en el
  // registro; si dejara de usarse, se quita entonces y no antes.
  void _t0;

  return _ctx;

}

export type BrandContext = Awaited<ReturnType<typeof fetchBrandContext>>;

// ─── fetchProductCatalog ──────────────────────────────────────────────────────
// Usado por CopyCustomizeModule.tsx para el selector de producto/SKU

export async function fetchProductCatalog(brandId: string): Promise<any[]> {
  const enc = encodeURIComponent;
  return sbFetch(
    `product_blueprints?brand_id=eq.${enc(brandId)}&is_variant=eq.false&active=eq.true` +
    `&order=product_type.asc,linea.asc,name.asc` +
    `&select=id,brand_id,sku,name,linea,line_family,subcategory,size,b2b_only,` +
    `shopify_visibility,image_filename,description_en,description_es,` +
    `benefit_claims,hair_type,dominant_hex,tagline,` +
    `product_type,kit_components,kit_value_individual,kit_savings_amount,kit_savings_pct`,
  );
}
