/**
 * UNRLVL Brand Cache Endpoint v2.0
 * GET /api/brand-cache?brand_id=NeuroneSCF
 * GET /api/brand-cache?brand_id=NeuroneSCF&refresh=true   → fuerza reconstrucción
 * GET /api/brand-cache?action=build_all&secret=XXX         → reconstruye todas las marcas activas
 * GET /api/brand-cache?brand_id=X&action=invalidate&secret=XXX → marca como stale
 *
 * v2.1 — 2026-07-31:
 *   FIX motor creativo. El snapshot traía la clave creative_vectors PRESENTE pero VACÍA:
 *   TABLES_INCLUDED no listaba las cuatro tablas creativas y buildSnapshot no las buscaba,
 *   así que selectCreativeComboFromData (api/execute.ts:436) recibía [] y el bloque L14 nunca
 *   se inyectaba — el diferenciador de CopyLab estaba muerto en la ruta cacheada. Se añaden
 *   creative_vectors, tension_architectures, aggro_presets y creative_compatibility_rules.
 *   FIX persistencia. upsertSnapshot se llamaba SIN await: en Edge la promesa pendiente muere al
 *   retornar → el snapshot devolvía 200 correcto pero NUNCA persistía (seguían siendo de mayo).
 *   Ahora va con await. FIX build_all: el filtro `neq.type=eq.system` era sintaxis PostgREST
 *   inválida (400 → [] silencioso) → corregido a `type=neq.system`. version bumpeada 2.0→2.1.
 *
 * v2.0 — 2026-05-20:
 *   Modelo proactivo. El cache vive en brand_cache_snapshots (Supabase).
 *   Lectura: SELECT → si existe y fresco, retorna directamente (0 queries al resto de Supabase).
 *   Escritura: construye desde las tablas fuente, hace UPSERT en brand_cache_snapshots.
 *   Cobertura: 26 tablas (v2.1: +4 creativas; v2.0: 22; antes 8) — todo excepto keywords y ctas
 *   que se filtran por language/service en tiempo de ejecución.
 *
 *   Para múltiples jobs del mismo brand en el mismo período:
 *   Job 1 → lee snapshot. Job 2..N → mismo snapshot, 0 queries adicionales.
 *
 *   Invalidación:
 *   - Cron diario reconstruye todos los snapshots activos (vía action=build_all)
 *   - stale_after: 4h por defecto — si llega request y está stale, reconstruye
 *   - Manual: ?refresh=true o action=invalidate
 *
 * v1.2 (anterior): on-demand, solo 8 tablas, CDN cache s-maxage=3600
 */

export const config = { runtime: 'edge' };

const SB_URL    = () => process.env.SUPABASE_URL      ?? '';
const SB_KEY    = () => process.env.SUPABASE_ANON_KEY ?? '';
const CACHE_SECRET = () => process.env.CLAUDE_BRIDGE_SECRET ?? '';
const CACHE_TTL_HOURS = 4;

const TABLES_INCLUDED = [
  // ── Marca ──────────────────────────────────────────────────────
  'brand_record',          // tabla brands — el registro base de la marca (1 fila)
  'brand_personas',        // ICP segments con pain_points, hooks, tone
  'brand_copy_profiles',   // BP_COPY_1.0 — voz de marca ejecutable
  'humanize_profiles',     // humanize params (DEFAULT + brand)
  'compliance_rules',      // hard + soft (DEFAULT + brand)
  'brand_goals',           // objetivos estratégicos activos
  'geomix',                // geo mix, slang local, cultural refs
  'brand_voice_genome',    // L1.5 — ADN ejecutable de voz (content-pipeline v2.6)
  'brand_languages',       // idiomas activos de la marca
  'brand_services',        // servicios y productos base
  'brand_palette',         // paleta de colores
  'brand_typography',      // tipografía
  'voicelab_params',       // parámetros VoiceLab
  'person_blueprints',     // blueprints de personas
  'location_blueprints',   // blueprints de locaciones
  // ── Globales (sin filtro de marca) ────────────────────────────
  'psycho_presets',        // 10 presets PSY-*
  'channel_prompt_rules',  // reglas por canal
  'output_templates',      // todos los templates activos
  'canal_blocks',          // bloques de canal activos
  'imagelab_presets',      // presets imagelab (global + brand)
  'blueprint_schemas',     // schemas de blueprints
  // ── Motor creativo (globales) — el diferenciador de CopyLab (L14/L15/L16) ──
  // Faltaban: el snapshot traía la clave creative_vectors VACÍA (las tablas fuente
  // sí están pobladas: 44 vectores / 10 tensiones / 5 aggros). Sin ellas,
  // selectCreativeComboFromData (api/execute.ts:436) recibe [] y el vector sale null.
  'creative_vectors',            // 44 ángulos de apertura (L14)
  'tension_architectures',       // 10 curvas de tensión (L15)
  'aggro_presets',               // 5 dials de agresividad + anti_hedging (L16)
  'creative_compatibility_rules',// reglas por content_type (filtradas en JS por execute.ts)
  // ── Operacionales (con brand_id, sin filtro lang/service) ─────
  'keywords',              // TODOS los keywords — filtrado lang/service en consumo
  'ctas',                  // TODOS los CTAs — filtrado service en consumo
];

function sbHeaders() {
  return {
    apikey: SB_KEY(),
    Authorization: `Bearer ${SB_KEY()}`,
    'Content-Type': 'application/json',
  };
}

async function sbFetch(path) {
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function sbGetOne(path) {
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

// ── Leer snapshot desde brand_cache_snapshots ─────────────────────────────
async function readSnapshot(brandId) {
  try {
    const row = await sbGetOne(
      `brand_cache_snapshots?brand_id=eq.${encodeURIComponent(brandId)}&select=cache_data,stale_after,built_at,version&limit=1`
    );
    if (!row) return null;
    const isStale = new Date(row.stale_after) < new Date();
    return { data: row.cache_data, isStale, builtAt: row.built_at };
  } catch { return null; }
}

// ── Construir snapshot desde las tablas fuente ────────────────────────────
async function buildSnapshot(brandId) {
  const enc = encodeURIComponent;

  const [
    brandRecord,
    brandPersonas,
    brandCopyProfiles,
    humanizeDefault,
    humanizeBrand,
    complianceDefault,
    complianceBrand,
    brandGoals,
    geomix,
    voiceGenome,
    brandLanguages,
    brandServices,
    brandPalette,
    brandTypography,
    voicelabParams,
    personBlueprints,
    locationBlueprints,
    psychoPresets,
    channelPromptRules,
    outputTemplates,
    canalBlocks,
    imagelabGlobal,
    imagelabBrand,
    blueprintSchemas,
    keywords,
    ctas,
    creativeVectors,
    tensionArchitectures,
    aggroPresets,
    creativeCompatibilityRules,
  ] = await Promise.all([
    sbFetch(`brands?id=eq.${enc(brandId)}&select=*&limit=1`),
    sbFetch(`brand_personas?brand_id=eq.${enc(brandId)}&active=is.true&order=priority.asc&select=*`),
    sbFetch(`brand_copy_profiles?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    sbFetch('humanize_profiles?brand_id=eq.DEFAULT&select=*&order=medium'),
    sbFetch(`humanize_profiles?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch('compliance_rules?brand_id=eq.DEFAULT&active=eq.true&select=*'),
    sbFetch(`compliance_rules?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    sbFetch(`brand_goals?brand_id=eq.${enc(brandId)}&status=eq.active&order=priority.asc&select=*`),
    sbFetch(`geomix?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch(`brand_voice_genome?brand_id=eq.${enc(brandId)}&active=eq.true&order=version.desc&select=*`),
    sbFetch(`brand_languages?brand_id=eq.${enc(brandId)}&active=eq.true&order=is_primary.desc&select=*`),
    sbFetch(`brand_services?brand_id=eq.${enc(brandId)}&active=eq.true&order=is_primary.desc&select=*`),
    sbFetch(`brand_palette?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch(`brand_typography?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch(`voicelab_params?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch(`person_blueprints?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    sbFetch(`location_blueprints?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    sbFetch('psycho_presets?select=*'),
    sbFetch('channel_prompt_rules?select=*&order=channel_id.asc'),
    sbFetch('output_templates?active=eq.true&select=*&order=id'),
    sbFetch('canal_blocks?active=eq.true&select=*&order=id'),
    sbFetch('imagelab_presets?brand_id=is.null&select=*'),
    sbFetch(`imagelab_presets?brand_id=eq.${enc(brandId)}&select=*`),
    sbFetch('blueprint_schemas?active=eq.true&select=id,version,type,description,labs_using'),
    sbFetch(`keywords?brand_id=eq.${enc(brandId)}&active=eq.true&order=prioridad.asc&limit=200`),
    sbFetch(`ctas?brand_id=eq.${enc(brandId)}&active=eq.true&select=*`),
    // Motor creativo — misma forma que el resto (select=*). Filtro active=eq.true igual que el
    // camino en vivo del consumidor (api/execute.ts:187-190): así la ruta cacheada y la no-cacheada
    // eligen sobre el MISMO conjunto. selectCreativeComboFromData filtra content_type en JS
    // (execute.ts:204), por eso el snapshot lleva TODAS las reglas activas, no una por content_type.
    sbFetch('creative_vectors?active=eq.true&select=*'),
    sbFetch('tension_architectures?active=eq.true&select=*'),
    sbFetch('aggro_presets?active=eq.true&select=*&order=level.asc'),
    sbFetch('creative_compatibility_rules?active=eq.true&select=*'),
  ]);

  // Merge imagelab presets (global + brand, brand overrides global)
  const imagelabMap = new Map();
  for (const p of imagelabGlobal) imagelabMap.set(p.canal ?? p.preset_id, p);
  for (const p of imagelabBrand)  imagelabMap.set(p.canal ?? p.preset_id, p);

  return {
    _meta: {
      brand_id:       brandId,
      generated_at:   new Date().toISOString(),
      ttl_hours:      CACHE_TTL_HOURS,
      tables_included: TABLES_INCLUDED,
      version:        '2.1',
    },
    // Marca
    brand:              brandRecord[0] ?? null,
    brand_personas:     brandPersonas,
    brand_copy_profiles: brandCopyProfiles,
    humanize_profiles:  [...humanizeDefault, ...humanizeBrand],  // merged
    compliance_rules:   [...complianceDefault, ...complianceBrand],  // merged
    brand_goals:        brandGoals,
    geomix,
    brand_voice_genome: voiceGenome,
    brand_languages:    brandLanguages,
    brand_services:     brandServices,
    brand_palette:      brandPalette,
    brand_typography:   brandTypography,
    voicelab_params:    voicelabParams,
    person_blueprints:  personBlueprints,
    location_blueprints: locationBlueprints,
    // Globales
    psycho_presets:     psychoPresets,
    channel_prompt_rules: channelPromptRules,
    output_templates:   outputTemplates,
    canal_blocks:       canalBlocks,
    imagelab_presets:   Array.from(imagelabMap.values()),
    blueprint_schemas:  blueprintSchemas,
    // Motor creativo (L14/L15/L16). Claves EXACTAS que consume api/execute.ts:436-439
    // (bc.creative_vectors / bc.tension_architectures / bc.aggro_presets /
    //  bc.creative_compatibility_rules) → selectCreativeComboFromData.
    creative_vectors:             creativeVectors,
    tension_architectures:        tensionArchitectures,
    aggro_presets:                aggroPresets,
    creative_compatibility_rules: creativeCompatibilityRules,
    // Operacionales — filtrar en consumo por language/service
    keywords,
    ctas,
  };
}

// ── Guardar snapshot en Supabase ──────────────────────────────────────────
async function upsertSnapshot(brandId, cacheData, builtBy = 'on_demand') {
  try {
    const staleAfter = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await fetch(`${SB_URL()}/rest/v1/brand_cache_snapshots`, {
      method: 'POST',
      headers: {
        ...sbHeaders(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        brand_id:        brandId,
        cache_data:      cacheData,
        built_at:        new Date().toISOString(),
        stale_after:     staleAfter,
        built_by:        builtBy,
        version:         '2.1',
        tables_included: TABLES_INCLUDED,
      }),
    });
  } catch (e) {
    console.error(`[brand-cache] upsert failed for ${brandId}: ${e.message}`);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      ...extra,
    },
  });
}

export default async function handler(req) {
  const url    = new URL(req.url);
  const p      = url.searchParams;
  const action  = p.get('action') ?? 'read';
  const brandId = p.get('brand_id') ?? '';
  const refresh = p.get('refresh') === 'true';
  const secret  = p.get('secret') ?? req.headers.get('authorization')?.replace('Bearer ', '') ?? '';

  // ── action=build_all: reconstruye cache de todas las marcas activas ──
  if (action === 'build_all') {
    if (CACHE_SECRET() && secret !== CACHE_SECRET()) return json({ error: 'Unauthorized' }, 401);
    // PostgREST válido: `type=neq.system` (columna=operador.valor). El anterior
    // `neq.type=eq.system` interpretaba `neq.type` como columna inexistente → 400 → sbFetch []
    // → build_all no reconstruía NADA en silencio. Excluye la marca system DEFAULT.
    const brands = await sbFetch('brands?status=eq.active&type=neq.system&select=id');
    const results = [];
    for (const b of brands) {
      try {
        const data = await buildSnapshot(b.id);
        await upsertSnapshot(b.id, data, 'build_all');
        results.push({ brand_id: b.id, status: 'ok' });
      } catch (e) {
        results.push({ brand_id: b.id, status: 'error', error: e.message });
      }
    }
    return json({ action: 'build_all', built: results.length, results });
  }

  // ── action=invalidate: marca el snapshot como stale ──
  if (action === 'invalidate') {
    if (!brandId) return json({ error: 'brand_id required' }, 400);
    if (CACHE_SECRET() && secret !== CACHE_SECRET()) return json({ error: 'Unauthorized' }, 401);
    await fetch(`${SB_URL()}/rest/v1/brand_cache_snapshots?brand_id=eq.${encodeURIComponent(brandId)}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ stale_after: new Date().toISOString() }),
    });
    return json({ action: 'invalidate', brand_id: brandId, status: 'ok' });
  }

  // ── Lectura estándar ──
  if (!brandId) return json({ error: 'brand_id required' }, 400);

  // 1. Intentar leer snapshot existente
  if (!refresh) {
    const snapshot = await readSnapshot(brandId);
    if (snapshot && !snapshot.isStale) {
      return json(snapshot.data, 200, {
        'X-Cache': 'HIT',
        'X-Built-At': snapshot.builtAt,
        'X-Brand-Id': brandId,
      });
    }
  }

  // 2. Construir (snapshot inexistente, stale, o refresh forzado)
  const cacheData = await buildSnapshot(brandId);

  // 3. Guardar el snapshot. DEBE ir con await: en Edge runtime la promesa pendiente muere al
  //    retornar, así que sin await el upsert NUNCA persistía (los snapshots seguían siendo de mayo
  //    pese a devolver 200 correcto). El await añade latencia — es el precio de que el caché exista;
  //    esto corre offline por cron, no en el camino caliente del usuario. (Alternativa Edge no
  //    bloqueante: ctx.waitUntil; se prefiere await por simplicidad.)
  await upsertSnapshot(brandId, cacheData, refresh ? 'manual_refresh' : 'on_demand');

  return json(cacheData, 200, {
    'X-Cache': 'MISS',
    'X-Built-At': new Date().toISOString(),
    'X-Brand-Id': brandId,
  });
}
