/**
 * UNRLVL Brand Cache Endpoint v3.0 — LECTOR (ya no constructor)
 * GET /api/brand-cache?brand_id=X                              → sirve el snapshot persistido
 * GET /api/brand-cache?brand_id=X&refresh=true                 → delega la reconstrucción en la EF y relee
 * GET /api/brand-cache?brand_id=X&action=invalidate&secret=XXX → delega la reconstrucción en la EF
 * GET /api/brand-cache?action=build_all                        → 410 Gone (retirado 2026-08-16)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * v3.0 — 2026-08-16 — CAMBIO DE ROL, no de features. CopyLab dejó de ser constructor.
 *
 *   POR QUÉ: el eje —componer el snapshot de contexto de una marca— sirve a N labs. Alojarlo
 *   dentro de CopyLab hacía que VideoLab e ImageLab dependieran de CopyLab para tener contexto.
 *   El eje es del sistema, no del primer lab que lo necesitó. Desde el 2026-08-16 el constructor
 *   es la EF `brand-snapshot-builder` (Supabase, ecosistema), con cron cada 3 h.
 *
 *   El riesgo que cierra: mientras buildSnapshot y TABLES_INCLUDED existieran duplicados en dos
 *   lugares iban a divergir. Estaban en paridad; en tres meses uno tendría una tabla que el otro
 *   no, y los labs leerían snapshots distintos según quién los construyó — degradando en silencio.
 *
 *   ── EL PATRÓN QUE ADOPTAN VIDEOLAB E IMAGELAB ─────────────────────────────
 *   Un lab LEE el snapshot. Ningún lab lo CONSTRUYE.
 *
 *     GET brand_cache_snapshots?brand_id=eq.X&select=cache_data,stale_after
 *     si stale → POST a brand-snapshot-builder {brand_id:X} → releer
 *     verificar que ninguna capa GLOBAL venga vacía → gritar si degradado
 *
 *   Sin TABLES_INCLUDED, sin buildSnapshot, sin service_role. Un lab que necesita service_role
 *   para tener contexto está mal cableado.
 *
 *   Cambios concretos:
 *     - action=build_all → 410 Gone con puntero. NO se borra el alias: un caller viejo recibe un
 *       error nominal en vez de fallar sin explicación. Se retira en un PR posterior cuando se
 *       confirme que ningún caller lo invoca.
 *     - refresh=true deja de construir: delega en la EF y relee el snapshot persistido. Un solo
 *       constructor, un solo formato. Si la EF falla → error nominal. PROHIBIDO construir por
 *       cuenta propia como fallback: eso reintroduce la duplicación por la puerta de atrás.
 *     - action=invalidate conserva nombre y firma (ningún caller externo se rompe) pero por dentro
 *       delega la reconstrucción y responde qué pasó realmente: mode:'rebuilt'. El objetivo de quien
 *       invalida no es "marcar stale" — es tener el snapshot fresco. Marcar stale era el rodeo de
 *       cuando la reconstrucción ocurría en la siguiente lectura; con el builder es directo.
 *       No se miente sobre la semántica en la respuesta.
 *     - ELIMINADOS: buildSnapshot, upsertSnapshot, sbWriteHeaders, TABLES_INCLUDED. Mientras
 *       existieran, alguien las volvía a llamar.
 *     - CopyLab ya NO usa SUPABASE_SERVICE_ROLE_KEY. Delegar exige IID_CRON_SECRET (lo que la EF
 *       acepta), NO service_role. Nueva env var en Vercel.
 *     - Salvaguarda de degradación: se grita si alguna capa GLOBAL viene vacía. Un snapshot que
 *       llega con creative_vectors:[] hoy pasaba como éxito — y pasó: la primera corrida del
 *       builder devolvió 200 OK con 22 de 30 capas vacías por GRANT ausente a service_role. Esta
 *       comprobación es lo único que separa "el lab tiene contexto" de "el lab cree que tiene
 *       contexto". El criterio NO es un porcentaje: una capa global vacía es SIEMPRE un fallo del
 *       sistema, mientras que una capa por marca puede estar vacía por dato ausente legítimo (una
 *       marca de servicios legales no tiene keywords ni ctas). Un umbral porcentual se traga una
 *       global vacía suelta —justo donde estuvo el bug— y grita por vacíos legítimos.
 *       No es un rechazo: es log ruidoso + headers. El lab sirve igual — decidir sobre un snapshot
 *       degradado es de quien lo consume.
 *     - Headers de lectura, siempre presentes se degrade o no: X-Snapshot-Globals (el detector real)
 *       y X-Snapshot-Layers (el panorama). Más X-Snapshot-Age-Hours, porque "STALE" sin la edad no
 *       distingue 5 horas de 3 semanas.
 *
 *   Degradación con la EF caída (stale no es vacío — un snapshot de 5 h tiene el genoma, las reglas
 *   creativas y los vectores reales):
 *     - hay snapshot stale → se sirve con X-Cache: STALE + X-Snapshot-Refresh: FAILED + console.error
 *     - no hay snapshot    → 502 nominal: no hay nada que servir
 *     - refresh=true       → 502 aunque exista stale: el caller pidió fresco, devolverle viejo
 *                            contradice lo que pidió
 *   Servir stale en silencio queda descartado: es el fail-silent que este archivo lleva tres
 *   versiones combatiendo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── HISTORIA (el rol de constructor descrito abajo ya NO aplica desde v3.0) ──
 *
 * v2.4 — 2026-08-03:
 *   A2·a — bloque de canal real. Se emite platform_canal_map (active, select=*): el puente
 *   plataforma → canal_blocks.id que api/execute.ts usa para inyectar el block_text real en vez
 *   de la línea genérica 'CANAL: X. Adapta...'. canal_blocks YA viajaba (17 filas), no se toca.
 *   REGENERAR los snapshots vivos tras el merge — los viejos no traen platform_canal_map.
 *   version 2.3→2.4.
 *
 * v2.3 — 2026-08-02:
 *   FIX persistencia (raíz). brand_cache_snapshots tiene RLS: bcs_anon_read (SELECT/anon) y
 *   bcs_service_all (ALL/service_role). El escritor usaba SUPABASE_ANON_KEY → la policy rechazaba el
 *   POST y el snapshot NUNCA persistía; como upsertSnapshot no comprobaba res.ok, devolvía 200 con
 *   X-Cache: MISS y la tabla no cambiaba (fail-silent en la función cuyo único trabajo es escribir —
 *   la peor variante posible). Cambios:
 *     + SB_WRITE_KEY (SUPABASE_SERVICE_ROLE_KEY) se usa SÓLO al escribir: upsertSnapshot (POST) e
 *       invalidate (PATCH). Las lecturas siguen con anon (bcs_anon_read alcanza).
 *     + upsertSnapshot comprueba res.ok y lanza con status + cuerpo.
 *     + si SUPABASE_SERVICE_ROLE_KEY no está definida, la escritura lanza con mensaje nominal — no se
 *       cae a anon en silencio (reproduciría el bug).
 *     + build_all acumula los fallos por marca y responde 207 si alguno falló, en vez de declarar
 *       'ok' global sobre un upsert que no ocurrió.
 *   El camino on-demand devuelve el snapshot recién construido igual (es válido) pero marca la falla
 *   de persistencia como RUIDOSA (log + header X-Cache-Persist: FAILED). version 2.2→2.3.
 *   REQUIERE: definir SUPABASE_SERVICE_ROLE_KEY en el entorno de Vercel antes del deploy.
 *
 * v2.2 — 2026-08-02:
 *   Cableado del registro (Fase B). El snapshot NO emitía tres slices que api/execute.ts
 *   consume, y como sliceOf() trata vacío/ausente igual, caían a query directa —
 *   que además buscaba el vocabulario equivocado:
 *     + pipeline_skills            — no viajaba en ningún snapshot vivo (LucienSael y
 *       UnrealvilleStudio sin la clave; NeuroneSCF con 0). Se emite completo (active,
 *       con applies_to y layer_order) — resolveAppliedLayersFromData lo consume.
 *     + content_type_registry      — tabla nueva; única fuente de pipeline_family /
 *       output_template_id / aggro_default. Se emite completa.
 *     + creative_compatibility_rules ya viajaba, pero AHORA la tabla tiene la columna
 *       voice_id (precedencia voz > BASE). select=* ya la incluye; los snapshots viejos
 *       la omiten porque se escribieron antes de la columna → REGENERAR tras el merge.
 *   version bumpeada 2.1→2.2. Un snapshot viejo no se arregla reescribiendo el escritor:
 *   hay que regenerar los tres snapshots vivos después del merge.
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

const SB_URL       = () => process.env.SUPABASE_URL       ?? '';
const SB_KEY       = () => process.env.SUPABASE_ANON_KEY  ?? '';
const CACHE_SECRET = () => process.env.CLAUDE_BRIDGE_SECRET ?? '';
// Credencial para invocar al constructor. La EF acepta IID_CRON_SECRET o service_role; se usa el
// PRIMERO a propósito: un lab que necesita service_role para tener contexto está mal cableado.
const CRON_SECRET  = () => process.env.IID_CRON_SECRET ?? '';

// El constructor, a nivel ecosistema. NO vive en este repo y no debe volver a vivir acá.
const BUILDER_FN = 'brand-snapshot-builder';

// Las capas GLOBALES: exactamente las que el builder consulta SIN predicado de marca alguno.
// Son el detector de degradación, y el criterio es binario, no porcentual: una global vacía es
// SIEMPRE un fallo del sistema (GRANT ausente, RLS, tabla despoblada), porque su contenido no
// depende de qué marca se pida. Una capa por marca vacía puede ser dato ausente legítimo — una
// marca de servicios legales no tiene keywords ni ctas. Un umbral por porcentaje confunde ambas
// cosas: se traga una global vacía suelta (justo el modo de fallo que ya ocurrió: creative_vectors
// presente y vacío durante semanas) y a la vez grita por marcas legítimamente flacas.
//
// PARIDAD CON EL BUILDER: si brand-snapshot-builder suma una tabla global, va también acá, o el
// detector queda ciego en la capa nueva. Las tres claves que mezclan mitad global/DEFAULT con
// mitad de marca (humanize_profiles, compliance_rules, imagelab_presets) quedan FUERA a propósito:
// su vacío no es atribuible sin ambigüedad a un fallo del sistema.
const GLOBAL_LAYERS = [
  'psycho_presets',
  'channel_prompt_rules',
  'output_templates',
  'canal_blocks',
  'platform_canal_map',
  'blueprint_schemas',
  'creative_vectors',
  'tension_architectures',
  'aggro_presets',
  'creative_compatibility_rules',
  'pipeline_skills',
  'content_type_registry',
];

// Sólo LECTURA. brand_cache_snapshots tiene RLS bcs_anon_read (SELECT/anon): alcanza y sobra.
// Este endpoint ya no escribe en Supabase — el único que escribe es el builder.
function sbHeaders() {
  return {
    apikey: SB_KEY(),
    Authorization: `Bearer ${SB_KEY()}`,
    'Content-Type': 'application/json',
  };
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

// ── Delegar la construcción en la EF ──────────────────────────────────────
// Único camino de reconstrucción que le queda a CopyLab. Lanza si falla: el llamador decide si
// eso es un 502 o una degradación servible. Lo que NUNCA hace es construir por su cuenta.
async function invokeBuilder(brandId) {
  const secret = CRON_SECRET();
  if (!secret) {
    throw new Error(
      `[brand-cache] IID_CRON_SECRET no definida: no se puede delegar en ${BUILDER_FN}. ` +
      'CopyLab dejó de ser constructor el 2026-08-16 y no construye como fallback — ' +
      'definir IID_CRON_SECRET en el entorno.'
    );
  }
  const res = await fetch(`${SB_URL()}/functions/v1/${BUILDER_FN}`, {
    method: 'POST',
    // x-cron-secret y no Authorization: la EF lee `x-cron-secret ?? authorization`, y mandar un
    // Bearer con la anon key haría fallar su comprobación (no contiene el secreto) → 401.
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify({ brand_id: brandId }),
  });
  const text = await res.text().catch(() => '');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* cuerpo no-JSON: se reporta crudo */ }
  // La EF devuelve 207 (res.ok true) cuando alguna marca falló, con ok:false. Un 207 no es éxito.
  if (!res.ok || parsed?.ok === false) {
    throw new Error(`[brand-cache] ${BUILDER_FN} falló para ${brandId}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return parsed;
}

// ── Salvaguarda de degradación ────────────────────────────────────────────
// Un snapshot que llega con creative_vectors:[] pasaba como éxito — pasó: la primera corrida del
// builder devolvió 200 OK con 22 de 30 capas vacías por GRANT ausente a service_role. Esta
// comprobación es lo único que separa "el lab tiene contexto" de "el lab cree que tiene contexto".
// El veredicto lo dan las GLOBALES (ver GLOBAL_LAYERS); el conteo total va como panorama.
const isEmptyLayer = (v) => v == null || (Array.isArray(v) && v.length === 0);

function inspectSnapshot(snap) {
  const declared  = snap?._meta?.tables_included?.length ?? 0;
  const populated = Object.entries(snap ?? {})
    .filter(([k, v]) => k !== '_meta' && !isEmptyLayer(v)).length;
  const globalsMissing = GLOBAL_LAYERS.filter((k) => isEmptyLayer(snap?.[k]));
  return {
    declared,
    populated,
    globalsMissing,
    globalsOk: GLOBAL_LAYERS.length - globalsMissing.length,
  };
}

// Sin la edad, "STALE" no distingue 5 horas de 3 semanas — y hubo snapshots de 288 h.
// El consumidor decide con el número delante.
function ageHours(builtAt) {
  if (!builtAt) return null;
  const ms = Date.now() - new Date(builtAt).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round((ms / 3_600_000) * 10) / 10;
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

// Cuerpo idéntico al de siempre (el cache_data crudo): el contrato de lectura no cambia.
// Lo que se agrega es diagnóstico, y va en headers.
function serveSnapshot(brandId, snapshot, cacheState, extra = {}) {
  const { declared, populated, globalsOk, globalsMissing } = inspectSnapshot(snapshot.data);
  if (globalsMissing.length) {
    console.error(
      `[brand-cache] snapshot DEGRADADO ${brandId}: ${globalsMissing.length} capa(s) GLOBAL(es) vacía(s) ` +
      `[${globalsMissing.join(', ')}] — una global vacía es fallo del sistema, no dato ausente de la marca. ` +
      `Globales ${globalsOk}/${GLOBAL_LAYERS.length}, capas pobladas ${populated}/${declared}.`
    );
  }
  const age = ageHours(snapshot.builtAt);
  return json(snapshot.data, 200, {
    'X-Cache': cacheState,
    'X-Built-At': snapshot.builtAt ?? '',
    'X-Brand-Id': brandId,
    'X-Snapshot-Globals': `${globalsOk}/${GLOBAL_LAYERS.length}`,
    'X-Snapshot-Layers': `${populated}/${declared}`,
    'X-Snapshot-Age-Hours': age === null ? 'unknown' : String(age),
    ...extra,
  });
}

export default async function handler(req) {
  const url     = new URL(req.url);
  const p       = url.searchParams;
  const action  = p.get('action') ?? 'read';
  const brandId = p.get('brand_id') ?? '';
  const refresh = p.get('refresh') === 'true';
  const secret  = p.get('secret') ?? req.headers.get('authorization')?.replace('Bearer ', '') ?? '';

  // ── action=build_all: RETIRADO ──
  // No se borra el alias: responde con puntero, para que un caller viejo reciba un error nominal
  // en vez de fallar sin explicación. Se retira del todo en un PR posterior.
  if (action === 'build_all') {
    return json({
      error: 'Gone',
      message: 'build_all se retiró de CopyLab el 2026-08-16. El constructor de snapshots es ' +
               `la Edge Function ${BUILDER_FN} (ecosistema), con cron cada 3h. ` +
               'Un lab lee el snapshot; ningún lab lo construye.',
      replacement: `POST {supabase_url}/functions/v1/${BUILDER_FN} con body {} o {brand_id}`,
    }, 410);
  }

  // ── action=invalidate: mismo nombre y firma, reconstrucción delegada ──
  // Ningún caller externo se rompe. El objetivo de quien invalida no es "marcar stale" — es tener
  // el snapshot fresco; marcar stale era el rodeo de cuando la reconstrucción ocurría en la
  // siguiente lectura. La respuesta dice mode:'rebuilt' porque eso es lo que pasó: no se miente
  // sobre la semántica.
  if (action === 'invalidate') {
    if (!brandId) return json({ error: 'brand_id required' }, 400);
    if (CACHE_SECRET() && secret !== CACHE_SECRET()) return json({ error: 'Unauthorized' }, 401);
    try {
      await invokeBuilder(brandId);
    } catch (e) {
      return json({ action: 'invalidate', brand_id: brandId, status: 'error', error: e.message }, 502);
    }
    const rebuilt = await readSnapshot(brandId);
    return json({
      action:   'invalidate',
      mode:     'rebuilt',
      brand_id: brandId,
      built_at: rebuilt?.builtAt ?? null,
    });
  }

  // ── Lectura estándar ──
  if (!brandId) return json({ error: 'brand_id required' }, 400);

  const snapshot = await readSnapshot(brandId);

  // 1. Snapshot fresco y nadie pidió refresh → se sirve tal cual. 0 queries al resto de Supabase.
  if (!refresh && snapshot && !snapshot.isStale) {
    return serveSnapshot(brandId, snapshot, 'HIT');
  }

  // 2. Ausente, stale, o refresh forzado → DELEGAR. Nunca construir acá.
  let delegationError = null;
  try {
    await invokeBuilder(brandId);
    const rebuilt = await readSnapshot(brandId);
    if (rebuilt) {
      return serveSnapshot(brandId, rebuilt, 'MISS', { 'X-Snapshot-Refresh': 'OK' });
    }
    delegationError = new Error(
      `[brand-cache] ${BUILDER_FN} reportó ok para ${brandId} pero el snapshot no se pudo releer`
    );
  } catch (e) {
    delegationError = e;
  }

  // 3. La delegación falló.
  //    refresh=true explícito → 502 aunque exista una stale: el caller pidió fresco, devolverle
  //    viejo con un header contradice lo que pidió.
  if (refresh) {
    return json({ error: 'Bad Gateway', brand_id: brandId, message: delegationError.message }, 502);
  }
  //    Lectura normal con snapshot stale disponible → se sirve, gritando. Stale no es vacío: un
  //    snapshot de 5 h tiene el genoma, las reglas creativas y los vectores reales. Negarle
  //    contexto a un lab por antigüedad es peor que dárselo con la etiqueta puesta.
  if (snapshot) {
    console.error(`[brand-cache] refresh FALLIDO ${brandId}, se sirve stale: ${delegationError.message}`);
    return serveSnapshot(brandId, snapshot, 'STALE', { 'X-Snapshot-Refresh': 'FAILED' });
  }
  //    Sin snapshot no hay nada que servir.
  return json({ error: 'Bad Gateway', brand_id: brandId, message: delegationError.message }, 502);
}
