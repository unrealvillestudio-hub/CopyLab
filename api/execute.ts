export const maxDuration = 300;

/**
 * CopyLab – POST /api/execute  v9.7
 *
 * G2-F (2026-08-21) — una pieza con 1–2 fallos se REPARA, no se tira. Corrida G2-E del 21-ago con
 *   el juez v84 y su filtro de aplicabilidad vivo: muerto el ruido condicional, lo que queda es
 *   cola larga — 10 reglas distintas, 1–3 disparos cada una, y la mayoría de los REJECT con UNA o
 *   DOS violaciones sobre ~19 reglas evaluadas. Pedir 90% de PASS en una sola pasada exige ~99,5%
 *   de cumplimiento POR REGLA: inalcanzable por redacción. `builder_input.repair`
 *   ({ piece_text, violations[] }) activa la SEGUNDA PASADA DIRIGIDA: mismo system —voz, genoma,
 *   reglas del Watcher, PRESUPUESTO DE LONGITUD— y otra TAREA, la de corregir lo listado cambiando
 *   lo mínimo. La respuesta conserva el contrato y gana `meta.repair` + `meta.repair_codes`; el
 *   título se conserva del original salvo que la pieza corregida traiga uno nuevo. Un encargo
 *   presente pero incompleto CORTA (COPYLAB_REPAIR_*) en vez de degenerar en pieza nueva. Sin la
 *   clave, prompt y respuesta byte-idénticos a hoy.
 *
 * G1-D (2026-08-20) — el presupuesto de longitud se le dice al ESCRITOR, no sólo a la API. G1-C
 *   hizo que el techo declarado se aplicara y destapó la mitad que faltaba: medido sobre 48 piezas,
 *   meta_fb cayó de 1.839 a 953 caracteres promedio (los 320 tokens exactos) y las truncadas a media
 *   frase SUBIERON de 26/48 a 34/48, con HR-GEN-01 de 19% a 40%. El escritor no conocía su
 *   presupuesto: planificaba su largo natural y la API lo cortaba donde cayera el token. Tres piezas:
 *   `buildLengthBudgetBlock` (puro) inyecta el presupuesto en CARACTERES (techo × 3, ratio empírico
 *   de esa corrida, redondeado a la centena) con instrucción constructiva —si no entra se achica el
 *   ALCANCE, nunca el cierre—; el max_tokens de la API pasa a `ceil(declarado × 1,2)` sólo cuando hay
 *   techo declarado, para ser red de seguridad y no guillotina; y `builder_meta` gana
 *   `length_budget_chars` junto al `max_tokens_applied` existente. Sin techo declarado no hay bloque
 *   ni margen: modo UI y emisores anteriores a F1 quedan byte-idénticos.
 *
 * G2-C (2026-08-20) — la política de CTA por frente vuelve a tener texto: `AUDIENCE_CTA` pasa a las
 *   claves canónicas (`decide` | `influye` | `general`), redactadas desde la semántica NUEVA —poder
 *   del lector sobre la contratación, no estado emocional— como espejo en modo escritura de la regla
 *   con la que gate7 juzga el cierre. Los topics habían migrado al eje canónico y el mapa se quedó en
 *   el legacy resolviendo con `?? ''`: cada pieza con frente declarado recibía el encabezado
 *   "POLÍTICA DE CTA [audiencia: …]:" y NADA debajo. Sin alias `jd`/`doliente` a propósito (reponerlos
 *   pediría el CTA que el juez rechaza). Un frente no nulo que no resuelve ahora corta el request con
 *   `AUDIENCE_FRAME_UNKNOWN: <valor>`; `null` sigue siendo ausencia legítima, sin bloque. `builder_meta`
 *   gana `audience_cta_applied` — sin el eco, la próxima migración del eje vuelve a ser invisible.
 *
 * D2 (2026-08-18) — la regla que se le da al ESCRITOR deja de ser la del JUEZ:
 *   `builder_input.rules[].instruction` es la misma regla en modo escritura, y el bloque de reglas
 *   usa `instruction ?? statement`. El fallback es lo que permite desplegarlo hoy: 58 de 62 reglas
 *   siguen llegando como hoy. `builder_meta` gana `rules_by_instruction` y sus conteos — sin esa
 *   marca no se puede saber si una mejora del ratio vino de la redacción o del azar de generación.
 *
 * D1 (2026-08-18) — el caso pasa a ser LISTA: `case_examples`. `HR-GEN-08` pide "al menos un caso
 *   concreto DISTINTO del que abre" —son dos— y con `case_example` singular la regla era incumplible
 *   por construcción. El bloque cambia de instrucción según cuántos haya: con dos o más, el primero
 *   abre y el segundo confirma que el patrón se repite; con uno solo no se promete ilustración doble.
 *   El singular se sigue aceptando y se lee como lista de uno.
 *
 * C1 (2026-08-18) — el carril manda un BRIEF DE ESCRITURA, no un resumen:
 *   `builder_input` gana `mechanism` y `case_example`, y `claims` gana `source_name`. Las reglas
 *   del Watcher ya se inyectaban —HR-UNRLVL-01 y HR-GEN-08 entre ellas— y se violaban igual:
 *   decirle a un generador "no enuncies sin ilustrar" no le da CON QUÉ ilustrar. Tres piezas:
 *     · `source_name` cambia la instrucción de las cifras: además de salir sólo de la lista, cada
 *       una se escribe con su fuente NOMBRADA en el texto ("según Convert"), nunca con la URL.
 *       Eso es la "procedencia declarada" que pide HR-UNRLVL-01 (kind proof).
 *     · `buildWritingMaterialBlock` (puro) inyecta mecanismo y caso concreto entre las
 *       restricciones, con instrucción CONSTRUCTIVA — desarrollá, ilustrá — no una prohibición más.
 *     · cualquier campo ausente ⇒ sin bloque ⇒ prompt byte-idéntico al de hoy. Modo UI intacto.
 *
 * A1 · CAMBIO 8 (2026-08-18) — las CIFRAS dejan de ser palabra del modelo:
 *   `builder_input.claims` (12ª clave del contrato) llega del carril con {claim, value, source_url}
 *   —el finding que originó la pieza, misma fila de la que ya salían las source_urls— y se inyecta
 *   como BLOQUE CITABLE (`buildClaimsBlock`, puro) entre las restricciones, junto a las reglas del
 *   Watcher: las cifras salen sólo de esa lista y una cifra sin claim no se escribe. Sin claims (o
 *   con la lista vacía) no hay bloque y el prompt queda byte-idéntico al de hoy.
 *
 * A2 (2026-08-18) — el canal editorial deja de salir de un literal de marca:
 *   `CARRIL_EDITORIAL_CANAL = { blog, blog_forumphs, linkedin }` se RETIRA. `blog_forumphs` era el
 *   nombre de la plataforma de UNA marca escrito como clave en capa compartida (viola
 *   MULTIBRAND_RULE; la deuda estaba registrada en este archivo desde el 14-ago). El eje correcto ya
 *   existía como dato: `platform_canal_map` (plataforma + traffic_type → canal_blocks.id), que
 *   `resolveCanalBlockId` ya consumía para el bloque ## CANAL. Ahora el canal editorial sale de esa
 *   misma vía — una sola fuente, no dos que puedan divergir — y `resolveCarrilContentType` recibe el
 *   mapa COMO DATO (sigue siendo pura). Plataforma sin fila → warn nominal que la nombra + par de su
 *   destination ('blog'), sin default silencioso. `platform_canal_map` se resuelve ahora ANTES del
 *   Promise.all porque el content_type del carril es llave de dos de sus queries.
 *   Deuda REMANENTE anotada, fuera de este PR: `email_propietarios` también es plataforma de una
 *   marca; lo que decide ahí es el CONTENT_TYPE, y el puente que lo resolvería por dato
 *   (platform_canal_map.content_type) hoy está en NULL en las 9 filas.
 *
 * B2 (2026-08-02) — el mapa del carril (bloque PURO COPYLAB_PURE, testeable):
 *   resolveCarrilContentType(destination, platform, canalMap) → { content_type, canal }. En modo
 *   carril, content_type y canal salen del mapa (no del pack ni del `?? 'instagram'` mudo del modo
 *   UI); plataforma desconocida → warn nominal + par de su destination. Además, builder_input.rules
 *   (que PR-1 manda SIN filtrar por kind) se filtra a las imperativas (prohibition|requirement|proof)
 *   antes de inyectarse. Modo UI (sin builder_input) intacto.
 *   Nota (§4) — CORREGIDA 2026-08-18. La versión del 14-ago afirmaba: "Lo que NO tiene fila es la voz
 *   fphs_conversion, en ningún content_type". Es FALSO: consulta a public.creative_compatibility_rules
 *   al 2026-08-18 devuelve `fphs_conversion × editorial_post` (9 vectores permitidos) y
 *   `fphs_conversion × social_post` (7). La siembra se hizo. Lo que SIGUE siendo cierto de aquella
 *   nota es que editorial_post NO tiene fila BASE (voice_id NULL): una voz sin su propia fila en ese
 *   content_type cae a source='none' y el motor degrada a filtro por aggro.
 *   Lo que HOY falta, verificado el 2026-08-18: `email_divulgacion` sólo tiene `fphs_educativa`
 *   (6 vectores); `fphs_conversion × email_divulgacion` y `fphs_editorial × email_divulgacion` no
 *   existen. Con email_propietarios en la cadencia de ForumPHs, esas dos voces caen a source='none'.
 *   Es siembra (SQL bajo HRD), no código: no entra en este PR.
 *
 * v9.7 (2026-05-28) — LITERAL mode for teasers/announcements:
 *   When params.mode === 'literal', the prompt's literal_text is treated as
 *   the immutable copy. CopyLab only generates caption + hashtags around it,
 *   respecting language (EN | ES | EN+ES).
 *
 * v9.6 (2026-05-21) — Node.js native handler (VercelRequest/VercelResponse)
 * v9.5 (2026-05-21) — Zero-query mode con brand_cache_snapshots v2.0
 * v9.4 (2026-05-20) — Dual mode async/sync
 * v9.3 (2026-05-20) — L1.5 VOICE_GENOME_INJECTION
 *
 * Env vars: ANTHROPIC_API_KEY · SUPABASE_URL · SUPABASE_ANON_KEY
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

declare const process: { env: Record<string, string | undefined> };

const CLAUDE_MODEL = 'claude-sonnet-5';

// Normalize SUPABASE_URL — same defensive parse as ImageLab. Tolerates three
// shapes commonly pasted into Vercel env panels:
//   1) bare project ref     "amlvyycfepwhiindxgzw"
//   2) bare hostname        "amlvyycfepwhiindxgzw.supabase.co"
//   3) full url             "https://amlvyycfepwhiindxgzw.supabase.co"
// All three end up as `https://{ref}.supabase.co`. Prevents silent "fetch
// failed" / "Invalid URL" when the env was saved without a protocol.
function normalizeSupabaseUrl(raw: string | undefined): string {
  if (!raw) return '';
  const s = raw.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (s.startsWith('https://') || s.startsWith('http://')) return s;
  if (s.includes('.supabase.co')) return `https://${s}`;
  if (/^[a-z]{20}$/.test(s)) return `https://${s}.supabase.co`;
  return s;
}

const SB_URL  = () => normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SB_KEY  = () => process.env.SUPABASE_ANON_KEY ?? '';
const ANT_KEY = () => process.env.ANTHROPIC_API_KEY ?? '';

// ── ASYNC MODE HELPERS v9.4 ───────────────────────────────────────────────

async function createJob(input: unknown): Promise<string> {
  const b = input as any;
  const res = await fetch(`${SB_URL()}/rest/v1/copylab_jobs`, {
    method:  'POST',
    headers: {
      apikey:         SB_KEY(),
      Authorization:  `Bearer ${SB_KEY()}`,
      'Content-Type': 'application/json',
      Prefer:         'return=representation',
    },
    body: JSON.stringify({
      brand_id: b.brandId ?? 'unknown',
      pack:     b.params?.pack ?? 'unknown',
      input,
      status:   'queued',
    }),
  });
  if (!res.ok) throw new Error(`createJob ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data[0].id : data.id;
}

// ── INTERFACES ────────────────────────────────────────────────────────────

// ── BUILDER_INPUT — el transporte del modo carril (Contrato 1, §3.2) ───────
// Top-level, hermana de brandId/stage/params/previousOutputs. Su PRESENCIA
// activa el modo carril; su AUSENCIA deja intacto el modo UI (§3.3). Todos los
// campos llegan YA RESUELTOS por el carril (voz, destino, reglas) — CopyLab no
// vuelve a resolver ninguno (§2). Consumo obligatorio en §3.4.
interface BuilderInput {
  domain: string;                                   // requerido
  voice_id: string;                                 // YA RESUELTO por el carril
  destination: 'editorial' | 'social';              // YA RESUELTO
  platform: string;                                 // x | meta_fb | meta_ig | linkedin | blog | tiktok | email_propietarios
  language: string | null;                          // eje M-12·B
  psycho_preset: string | null;
  // BRIEF 8 · A — el presupuesto del TÍTULO, en caracteres, ya resuelto por el carril contra la
  // física real del overlay (los `fit_steps` de los tokens de la marca) o su fallback declarado.
  // Opcional: su ausencia deja la sección ## TÍTULO sin cifra, nunca sin título. Acá no se decide
  // el número — mismo contrato que `max_tokens`: el carril resuelve, CopyLab obedece y hace eco.
  title_budget_chars?: number | null;
  title_budget_source?: string | null;   // de qué nivel salió el número, verbatim del carril
  // BRIEF-04 — el MODO de relación entre el texto de la imagen y el título, resuelto por el carril
  // contra `intel.brand_publish_channels.image_title_mode` para el canal de ESTA pieza. Mismo
  // contrato que `title_budget_chars` y `max_tokens`: el carril resuelve, CopyLab obedece. Ausente
  // o desconocido ⇒ el modo que REPITE, que es el comportamiento vigente.
  image_title_mode?: string | null;
  // F1 / G1-C — el TECHO de generación, ya resuelto por el carril contra
  // public.content_type_registry (cascada voz+plataforma > voz > BASE+plataforma > BASE), y QUIÉN lo
  // resolvió. `null` = nadie lo declaró ⇒ CopyLab aplica su default por destino, byte-idéntico a
  // antes de G1-C. Opcionales: un emisor anterior a F1 que no los mande no cambia de comportamiento.
  max_tokens?: number | null;
  max_tokens_source?: string | null;
  // D2 (2026-08-18) — `instruction` es la MISMA regla en modo ESCRITURA. `statement` está redactado
  // para el JUEZ ("Mira el FINAL de la pieza. CUMPLE si…") y pedirle eso a quien todavía está
  // escribiendo la pieza es criterio de auditoría sobre un objeto ausente. Opcional: 58 de 62 reglas
  // todavía no tienen redacción propia y caen a `statement`, exactamente como hoy.
  rules: Array<{ code: string; kind: string; statement: string; instruction?: string | null }>;
  iid_brief: string;
  angle: string | null;
  // G2-C (2026-08-20) — el eje CANÓNICO del frente de audiencia: cuánto PODER tiene el lector
  // sobre la contratación. Reemplaza a 'jd' | 'doliente', que leían el frente como estado
  // emocional y que la DB ya no manda (los topics migraron al eje nuevo). Sin alias legacy a
  // propósito — ver AUDIENCE_CTA. `null` = frente no declarado: legítimo, no emite bloque.
  audience_frame: AudienceFrame | null;
  // A1 · CAMBIO 8 — la 12ª clave del contrato: las CIFRAS con procedencia, tal cual viajan desde
  // intel.iid_findings.claims. Cada entrada ata un dato numérico a la URL que lo sostiene. Opcional
  // a propósito: un emisor que no la manda (UI, carril viejo, fila sin claims) deja el prompt
  // byte-idéntico al de hoy.
  claims?: Array<{ claim: string; value: string; source_url: string; source_name?: string }>;
  // C1 (2026-08-18) — las otras dos piezas del BRIEF DE ESCRITURA. Lo que el carril mandaba era un
  // resumen de investigación; un brief tiene que traer con qué CONSTRUIR. Opcionales: emisor que no
  // las manda ⇒ sin bloque ⇒ prompt byte-idéntico al de hoy.
  mechanism?: string | null;
  // D1 (2026-08-18) — LISTA. HR-GEN-08 pide "al menos un caso concreto DISTINTO del que abre": son
  // DOS. El singular de C1 se sigue aceptando (emisor anterior a D1) y se lee como lista de uno.
  case_examples?: Array<{ case: string; source_url: string; source_name: string }> | null;
  case_example?: { case: string; source_url: string; source_name: string } | null;
  // G2-F (2026-08-21) — el ENCARGO DE REPARACIÓN. Su PRESENCIA cambia la TAREA del prompt (la
  // pieza ya escrita vuelve con las instrucciones que violó, para una segunda pasada dirigida);
  // su AUSENCIA deja el carril de generación byte-idéntico. Opcional a propósito: un emisor que
  // no la manda no cambia de comportamiento. Ver la sección G2-F del bloque puro.
  repair?: { piece_text: string; violations: Array<{ code: string; instruction: string }> } | null;
}

interface ExecuteRequest {
  brandId: string | null;
  stage: { labId: string; label: string; description: string; order: number };
  params: { pack?: string; canal?: string; idioma?: string; extra_instructions?: string; };
  previousOutputs: Record<string, string>;
  builder_input?: BuilderInput;
  meta?: {
    motor?: 'claude' | 'gemini';
    sequence_type?: string;
    position?: number;
    language?: string;
    voice_id?: string;
    persona_key?: string;
    psycho_presets?: string[];
    mechanism_primary?: string;
    depends_on?: string[];
    klaviyo_template_slot?: string;
    utm_content?: string;
    previous_mechanism?: string;
  };
}

interface CreativeVector {
  id: string; category: string; label: string; instruction: string;
  aggro_min: number; aggro_max: number; active?: boolean;
}
interface TensionArchitecture { id: string; label: string; instruction: string; curve: string; }
interface AggroPreset { id: string; level: number; label: string; instruction: string; anti_hedging: string; }
interface CompatibilityRule {
  content_type: string; allowed_vectors: string[]; excluded_vectors: string[];
  allowed_tensions: string[]; allowed_aggro: string[];
  voice_id?: string | null;   // Cambio 2 — fila específica de voz vs. BASE (null)
}
// Cambio 1 — el registro de content_type. Única fuente (keyed por pipelineContentType)
// de pipeline_family (el vocabulario que hablan pipeline_skills.applies_to y demás),
// output_template_id y aggro_default. Reemplaza el objeto literal aggroByType y los
// lookups por content_type crudo contra tablas que hablan otro vocabulario.
interface ContentTypeRegistry {
  content_type: string; pipeline_family: string; output_template_id: string | null;
  aggro_default: number; active?: boolean; notes?: string | null;
  voice_id?: string | null;   // B·Fix 2 — eje de voz (precedencia voz→BASE como compat)
}
// A2·a — puente plataforma → bloque de canal. PK compuesta (platform, traffic_type).
// canal_block_id → FK a canal_blocks; content_type → gancho de ADS (null en organic).
interface PlatformCanalMap {
  platform: string; traffic_type: string; canal_block_id: string;
  content_type: string | null; active?: boolean; notes?: string | null;
}
interface VoiceGenome {
  voice_id: string; version: string; maturity: string;
  // B0 — identity_anchors y emotional_register son OBJETO en 9 de 10 voces (el tipo `string`
  // anterior era una mentira que dejó pasar el bug del [object Object] por tsc durante meses).
  // Todos los campos jsonb del genoma se tipan `any`: la forma la decide la fila, no el código.
  identity_anchors: any; lexicon_signature: any; lexicon_forbidden: any;
  syntactic_signatures: any; argumentative_architecture: any;
  relational_stance: any; emotional_register: any; prohibited_registers: any;
  application_constraints: any;
}
interface OutputTemplate {
  id: string; name: string; category: string; template_text: string | null;
}

// ── PURE HELPERS (harness-tested — api/execute.test.ts) ────────────────────
// Everything in this region is side-effect free: no network, no env reads, no
// Date.now / Math.random. The QA harness extracts this exact block from the
// deployed source and exercises it in isolation, so it must stay self-contained
// and pure. Keep new pure logic here.

// ── COPYLAB_PURE:BEGIN ──────────────────────────────────────────────────────
// The QA harness (api/execute.test.ts) extracts EXACTLY this block from the
// deployed source, transpiles it, and exercises it in isolation. Nothing here
// may reference module-level values (env getters, fetch, sb, Math.random,
// Date) — only JS built-ins, `console`, and each other. Keep it self-contained.

// Canonical internal cache shape. Every slice is an array. A missing OR empty
// slice is ABSENCE (see sliceOf) — it can never cancel the query that would
// fill it (§5.3.1 / §5.3.4).
interface NormalizedCache {
  brands: any[];
  humanize_profiles: any[];
  brand_goals: any[];
  brand_personas: any[];
  compliance_rules: any[];
  keywords: any[];
  ctas: any[];
  brand_copy_profiles: any[];
  brand_voice_genome: any[];
  creative_vectors: any[];
  tension_architectures: any[];
  aggro_presets: any[];
  creative_compatibility_rules: any[];
  pipeline_skills: any[];
  output_templates: any[];
  content_type_registry: any[];
  canal_blocks: any[];
  platform_canal_map: any[];
  geomix: any[];
  language_directives: any[];
  _shape: 'snapshot' | 'context_json';
}

const CACHE_SLICES: Array<keyof NormalizedCache> = [
  'brands', 'humanize_profiles', 'brand_goals', 'brand_personas', 'compliance_rules',
  'keywords', 'ctas', 'brand_copy_profiles', 'brand_voice_genome', 'creative_vectors',
  'tension_architectures', 'aggro_presets', 'creative_compatibility_rules',
  'pipeline_skills', 'output_templates', 'content_type_registry',
  // A2·a — el bloque de canal real: canal_blocks (block_text) resuelto vía platform_canal_map.
  // canal_blocks ya viajaba en el snapshot pero execute.ts no lo mapeaba como slice; se añade
  // para poder leerlo por id sin segundo viaje.
  'canal_blocks', 'platform_canal_map',
  // A2·b — geomix (mezcla geográfica); ya viaja en el snapshot, execute.ts no lo mapeaba.
  'geomix',
  // FIX-LANG-01 — directivas de idioma. Se declara como slice para que el día que el
  // snapshot las traiga se lean de memoria; hoy ningún snapshot las emite y el
  // fallback de la query directa las trae (sliceOf trata [] y ausencia por igual).
  'language_directives',
];

function emptyNormalizedCache(shape: NormalizedCache['_shape']): NormalizedCache {
  const nc: any = { _shape: shape };
  for (const k of CACHE_SLICES) nc[k] = [];
  return nc as NormalizedCache;
}

// Map either supported cache envelope to the single internal shape (§5.3.2):
//   • brand_cache_snapshots.cache_data → native array slices.
//   • context-cache EF context_json    → { identity, goals, personas, compliance }.
// An unrecognized envelope returns { cache: null } so the caller warns nominally
// and falls through to direct queries — a shape we don't understand must never
// cancel a query.
function normalizeCache(raw: any | null): { cache: NormalizedCache | null; shape: string; keys: string[] } {
  if (!raw || typeof raw !== 'object') return { cache: null, shape: 'none', keys: [] };
  const keys = Object.keys(raw);

  const looksSnapshot =
    Array.isArray(raw.brands) || Array.isArray(raw.brand_voice_genome) ||
    Array.isArray(raw.brand_copy_profiles) || Array.isArray(raw.creative_vectors) ||
    Array.isArray(raw.brand_goals) || Array.isArray(raw.brand_personas) ||
    Array.isArray(raw.compliance_rules) || Array.isArray(raw.humanize_profiles) ||
    (raw.brand && typeof raw.brand === 'object');

  if (looksSnapshot) {
    const nc = emptyNormalizedCache('snapshot');
    for (const k of CACHE_SLICES) if (Array.isArray(raw[k])) (nc as any)[k] = raw[k];
    // brand-cache.js v2.1 emite el registro como `brand` (singular, objeto);
    // v2.0 y anteriores lo emiten como `brands` (array). El lector acepta las
    // dos porque hay snapshots vivos de ambas versiones en la tabla y reescribir
    // el escritor no arregla los que ya están escritos.
    if (!nc.brands.length && raw.brand && typeof raw.brand === 'object') {
      nc.brands = [raw.brand];
    }
    return { cache: nc, shape: 'snapshot', keys };
  }

  const looksContextJson =
    (raw.identity && typeof raw.identity === 'object') ||
    Array.isArray(raw.goals) || Array.isArray(raw.personas) || 'compliance' in raw;

  if (looksContextJson) {
    const nc = emptyNormalizedCache('context_json');
    const id = raw.identity ?? {};
    if (id.display_name || id.name || id.language_primary || id.language || id.market) {
      nc.brands = [{
        id: id.id ?? id.brand_id ?? null,
        display_name: id.display_name ?? id.name ?? null,
        market: id.market ?? '',
        language_primary: id.language_primary ?? id.language ?? null,
      }];
    }
    if (id.copy_profile) nc.brand_copy_profiles = [id.copy_profile];
    if (id.humanize)     nc.humanize_profiles   = [id.humanize];
    if (id.voice_genome) nc.brand_voice_genome  = Array.isArray(id.voice_genome) ? id.voice_genome : [id.voice_genome];
    if (Array.isArray(raw.goals))    nc.brand_goals    = raw.goals;
    if (Array.isArray(raw.personas)) nc.brand_personas = raw.personas;
    if (raw.compliance) {
      nc.compliance_rules = Array.isArray(raw.compliance)
        ? raw.compliance
        : [{ rule_text: typeof raw.compliance === 'string' ? raw.compliance : (raw.compliance.rule_text ?? '') }];
    }
    return { cache: nc, shape: 'context_json', keys };
  }

  return { cache: null, shape: 'unknown', keys };
}

// A slice counts as PRESENT only when it is a non-empty array. A present-but-
// empty array is absence — the caller must consult the source, never skip it.
function sliceOf(cache: NormalizedCache | null, key: keyof NormalizedCache): any[] | null {
  if (!cache) return null;
  const v = (cache as any)[key];
  return Array.isArray(v) && v.length ? (v as any[]) : null;
}

// Single language precedence — no 'ES' literal, no default (§5.3.3):
//   builder_input.language → meta.language → params.idioma → brands.language_primary
// Returns null when nothing resolves; the caller throws COPYLAB_LANGUAGE_UNRESOLVED.
function resolveLanguage(
  builderLanguage: string | null | undefined,
  metaLanguage: string | undefined,
  paramsIdioma: string | undefined,
  brandLanguagePrimary: string | null | undefined,
): string | null {
  for (const c of [builderLanguage, metaLanguage, paramsIdioma, brandLanguagePrimary]) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

// Voice genome selection (§5.4). Carril mode (voiceId given) MUST match by
// voice_id or throw COPYLAB_VOICE_NOT_FOUND naming the available voices — never
// [0], because the array order decides the voice otherwise. UI mode (no voiceId)
// keeps first-active but warns nominally when more than one genome is active and
// nobody declared a voice, instead of today's silence.
function selectGenome(genomes: any[], voiceId: string | null | undefined, brandId: string): any | null {
  if (!genomes || !genomes.length) return null;
  const available = genomes.map(g => g?.voice_id).filter(Boolean).sort();
  if (voiceId) {
    const match = genomes.find(g => g?.voice_id === voiceId);
    if (!match) {
      throw new Error(
        `COPYLAB_VOICE_NOT_FOUND: voice_id '${voiceId}' no está en los genomas activos de ` +
        `${brandId} (disponibles: ${available.join(', ') || '∅'})`,
      );
    }
    return match;
  }
  if (genomes.length > 1) {
    console.warn(
      `[CopyLab] ${brandId} tiene ${genomes.length} genomas activos y ninguna voz declarada ` +
      `(${available.join(', ')}) — usando el primero; declarar builder_input.voice_id para fijar la voz`,
    );
  }
  return genomes[0];
}

// Precedencia de humanize (§5.3.6). Dos ejes, en este orden:
//   1) marca > DEFAULT   — el cache mergea [DEFAULT, marca], así que [0] es
//                          adverso por construcción.
//   2) medium: copy > text > cualquier otro — LucienSael declara su único
//      perfil como 'text', y DEFAULT trae cinco medios (copy/image/video/
//      voice/web) sin orden garantizado: sin este eje se puede aplicar el
//      perfil de imagen o de voz a un job de copy.
// Desempate final por `id` para que el resultado sea determinista.
const HUMANIZE_MEDIUM_RANK: Record<string, number> = { copy: 0, text: 1 };
function selectHumanize(rows: any[] | null | undefined, brandId: string): any | null {
  if (!Array.isArray(rows) || !rows.length) return null;
  const score = (r: any): [number, number, string] => [
    r?.brand_id === brandId ? 0 : (r?.brand_id === 'DEFAULT' ? 1 : 2),
    HUMANIZE_MEDIUM_RANK[String(r?.medium ?? '')] ?? 2,
    String(r?.id ?? ''),
  ];
  return [...rows].sort((a, b) => {
    const [a0, a1, a2] = score(a), [b0, b1, b2] = score(b);
    return a0 - b0 || a1 - b1 || a2.localeCompare(b2);
  })[0] ?? null;
}

// Token ceiling (§3.5 + G1-C). El carril YA TRANSPORTA el techo en
// `builder_input.max_tokens`, resuelto contra `public.content_type_registry` por la
// cascada (voz+plataforma) > (voz) > (BASE+plataforma) > (BASE); `max_tokens_source`
// dice qué nivel lo resolvió. CopyLab lo recibía y NO lo aplicaba: escribía contra el
// default por destino de abajo, y el adaptador recortaba después.
//
// EL HALLAZGO, medido. Sembrar los techos por plataforma no movió una sola pieza —
// 1.685→1.732 (linkedin), 1.780→1.839 (meta_fb), 1.766→1.825 (meta_ig) caracteres,
// antes y después. Lo que SÍ cambió fue el recorte aguas abajo: de lo que CopyLab
// escribe, SocialLab entrega 809 de 1.839 en meta_fb (56% menos), 1.242 de 1.825 en
// meta_ig (32%), 1.555 de 1.732 en linkedin (10%). Y el juez castiga esa mutilación:
// entre las dos corridas HR-GEN-01 (cierre completo) subió de 14% a 19% y
// HR-UNRLVL-03 de 16% a 25%. Comprimir a la mitad deja frases suspendidas y cierres
// rotos — una pieza ESCRITA corta cierra bien; una pieza larga RECORTADA al 56%, no.
//
// El techo declarado gana. `null` —nadie lo declaró— deja el default por destino
// EXACTAMENTE como estaba: retrocompatibilidad byte a byte, y el modo UI (sin
// builder_input) ni se entera. Un valor ilegible (no finito, ≤ 0, no numérico) NO es
// una declaración: cae al default y se avisa, porque un techo roto que silenciosamente
// alarga o acorta la pieza es el fallo que este cambio viene a cerrar.
//
// Acá NO se decide CUÁNTO: el número es dato de tabla, resuelto por el carril. Lo que
// vive acá es que el techo declarado se aplique — eje, no instancia.
const CARRIL_DESTINATION_MAX_TOKENS: Record<string, number> = { editorial: 4000, social: 640 };
const MAX_TOKENS_UI_DEFAULT = 1600;
// G1-D — el lector del techo declarado, SILENCIOSO y en un solo lugar. Tres cifras salen del
// mismo valor (el techo con el que se planifica, el presupuesto que se le dice al escritor y el
// max_tokens que se le manda a la API) y derivarlo tres veces es como se desincronizan. El aviso
// de una declaración rota lo emite `maxTokensFor`, que es quien decide el techo: avisar tres
// veces del mismo valor roto es ruido, no observabilidad.
// `max_tokens` entra como `unknown` a propósito: el CONTRATO lo declara `number | null`
// (interface BuilderInput) pero lo que llega es JSON de la red, y esta función es justamente la
// que decide si ese valor es una declaración. Tiparlo `number` acá sería asumir lo que se valida.
function readDeclaredMaxTokens(declared: unknown): number | null {
  if (declared === null || declared === undefined) return null;
  // `Number()` a secas convierte `true` en 1 y `[7]` en 7: un techo de UN token, aplicado en
  // silencio, por un valor que nunca fue un número. Sólo un number, o un string que ES un número
  // (el transporte es JSON y un emisor puede serializar de más), cuenta como declaración.
  const n = typeof declared === 'number'
    ? declared
    : (typeof declared === 'string' && declared.trim() !== '' ? Number(declared) : NaN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

// El techo con el que se PLANIFICA la pieza: el declarado si lo hay, el default por destino si no.
// Contrato intacto desde G1-C — G1-D no cambia ni un número acá.
function maxTokensFor(
  builderInput: { destination?: string; max_tokens?: unknown; max_tokens_source?: string | null } | null | undefined,
): number {
  if (!builderInput) return MAX_TOKENS_UI_DEFAULT;
  const declared = builderInput.max_tokens;
  if (declared !== null && declared !== undefined) {
    const n = readDeclaredMaxTokens(declared);
    if (n !== null) return n;
    console.warn(
      `[CopyLab] builder_input.max_tokens ilegible (${JSON.stringify(declared)}, source=${JSON.stringify(builderInput.max_tokens_source ?? null)}) ` +
      `— se aplica el default por destino. Una declaración rota NO es una declaración.`,
    );
  }
  return CARRIL_DESTINATION_MAX_TOKENS[String(builderInput.destination ?? '')] ?? MAX_TOKENS_UI_DEFAULT;
}

// ── G1-D · el presupuesto de longitud se le DICE al escritor ─────────────────
// EL HALLAZGO, medido en la corrida de 48 piezas del 20-ago (post G1-B/G1-C, mismos briefs que
// la línea base del 19). G1-C hizo su trabajo y destapó la mitad que faltaba:
//   · meta_fb pasó de 1.839/2.068 caracteres (promedio/máx) a 953/1.045 — los 320 tokens exactos.
//   · truncadas a media frase: 26/48 → 34/48 (meta_ig 16/16, meta_fb 15/16).
//   · HR-GEN-01 (cierre completo, la regla del cierre): 19% → 40% de fallo.
//   · piezas limpias de toda regla: 18/48 → 2/48.
// El techo declarado ahora se aplica — como GUILLOTINA. El escritor no conoce su presupuesto:
// planifica su largo natural (~1.800 chars para este prompt) y la API lo corta donde caiga el
// token 320. La tesis de G1-C era "una pieza ESCRITA corta cierra bien; una pieza larga RECORTADA
// no", y G1-C implementó el corte sin implementar lo que hace que la pieza se escriba corta. Es
// el patrón que este archivo ya documenta en A1 y C1: darle al modelo la orden sin darle el
// material — acá, darle el corte sin darle el número. LinkedIn lo confirma por contraste: su
// largo natural cabe en 700 tokens y truncó sólo 3/16.
//
// El ratio es EMPÍRICO, no teórico: 320 tokens rindieron 1.045 caracteres medidos (≈3,27) en
// español con este modelo. Se usa 3 —por debajo de lo medido— para que el presupuesto entre
// holgado en el techo. Es propiedad del modelo del ecosistema, no de una marca.
const LENGTH_BUDGET_CHARS_PER_TOKEN = 3;
// Redondeo a la centena: un "1.045 caracteres" invita a perseguir un número falso-preciso; un
// "1.000 caracteres" se lee como lo que es, un presupuesto.
const LENGTH_BUDGET_ROUND_TO = 100;
// Piso: un techo diminuto no puede producir un presupuesto de 0 caracteres, que sería una orden
// imposible en vez de un presupuesto.
const LENGTH_BUDGET_MIN_CHARS = 100;
// Margen de la API sobre el techo declarado. Con el escritor auto-limitándose por el bloque, la
// API deja de ser el mecanismo de corte y pasa a ser RED DE SEGURIDAD: el 20% absorbe la varianza
// del tokenizador para que una pieza bien planificada no muera a dos palabras del final. La pieza
// corta la garantiza el prompt, no la tijera.
const LENGTH_BUDGET_API_MARGIN = 1.2;

// El presupuesto en caracteres que se le DICE al escritor. `null` (nadie declaró techo) → null:
// sin número no hay presupuesto que comunicar, y el prompt queda byte-idéntico al de hoy.
function lengthBudgetCharsFor(declaredMaxTokens: number | null | undefined): number | null {
  if (declaredMaxTokens === null || declaredMaxTokens === undefined) return null;
  const raw = declaredMaxTokens * LENGTH_BUDGET_CHARS_PER_TOKEN;
  return Math.max(LENGTH_BUDGET_MIN_CHARS, Math.round(raw / LENGTH_BUDGET_ROUND_TO) * LENGTH_BUDGET_ROUND_TO);
}

// El bloque para el prompt. Instrucción CONSTRUCTIVA, no una prohibición más: dice cuánto espacio
// hay y qué sacrificar cuando no alcanza (el ALCANCE, nunca el cierre). Sin nombrar plataformas ni
// marcas — el número llega como dato, el bloque es motor.
function buildLengthBudgetBlock(declaredMaxTokens: number | null | undefined): string | null {
  const chars = lengthBudgetCharsFor(declaredMaxTokens);
  if (chars === null) return null;
  return `## PRESUPUESTO DE LONGITUD\n`
    + `Escribí la pieza COMPLETA en unos ${chars} caracteres. No es un objetivo que haya que`
    + ' alcanzar ni un límite del que convenga quedarse lejos: es el espacio TOTAL que tenés,'
    + ' cierre incluido.\n\n'
    + 'Planificá antes de escribir: apertura, desarrollo y CIERRE tienen que caber ahí adentro.'
    + ' Si el material no entra, achicá el ALCANCE —un caso en vez de dos, un ángulo en vez de'
    + ' tres, una idea desarrollada en vez de tres enunciadas—, nunca el cierre ni la última'
    + ' frase. Una pieza que termina a media frase es el fallo que este presupuesto existe para'
    + ' impedir: vale más decir menos y cerrarlo, que decirlo todo y quedar cortado.';
}

// El max_tokens que se le manda a la API. Con techo declarado, el declarado + margen (red de
// seguridad, no guillotina). Sin techo declarado —default por destino o modo UI— el número exacto
// de siempre: el margen sólo tiene sentido cuando el escritor recibió un presupuesto que respetar.
function apiMaxTokensFor(
  builderInput: { destination?: string; max_tokens?: unknown; max_tokens_source?: string | null } | null | undefined,
): number {
  const declared = readDeclaredMaxTokens(builderInput?.max_tokens);
  if (declared === null) return maxTokensFor(builderInput);
  return Math.ceil(declared * LENGTH_BUDGET_API_MARGIN);
}

// ── BRIEF 8 · A · EL TÍTULO ES CIUDADANO DE PRIMERA ────────────────────────────────────────────
//
// POR QUÉ AHORA. El compositor (BRIEF 7, en producción) convirtió a `title` en el texto MÁS VISIBLE
// del sistema: es lo que se dibuja sobre la imagen. Y era el menos gobernado de todos.
//
// LA CAUSA, medida contra esta fuente y no supuesta: el bloque FORMATO de abajo le decía al
// escritor, en modo social, «Sin título, sin la etiqueta "TÍTULO:"». No es que CopyLab emitiera el
// título de forma poco confiable — es que en social tenía PROHIBIDO emitirlo. Por eso el lote de 9
// piezas no trae ninguno: son sociales. El título nunca fue opcional por descuido; era imposible.
//
// QUÉ CAMBIA. El título pasa a ser obligatorio en LOS DOS destinos, con tres piezas:
//   1 · OFICIO — el título es la afirmación más filosa de la pieza, no su resumen. Y cumple TODAS
//       las reglas de marca que gobiernan el cuerpo: tratamiento, tono, legal, neutralidad. Esto
//       último no es retórica: desde el BRIEF 8-B el Watcher juzga el título con las mismas reglas,
//       así que un título que las rompe REPRUEBA la pieza entera.
//   2 · PRESUPUESTO — `title_budget_chars` llega por builder_input, resuelto por el carril contra
//       la física real del overlay (los `fit_steps` de la marca). Acá no se decide CUÁNTO: el
//       número es dato, igual que `max_tokens`. Sin número, la sección sale igual pero sin cifra.
//   3 · SEPARACIÓN — en social el título NO se publica en el cuerpo: es el texto del overlay. Hay
//       que decírselo, o el escritor lo repite en la primera línea y la pieza sale duplicada.
//
// CERO MARCAS Y CERO PLATAFORMAS acá: el destino es un eje del sistema ('editorial' | 'social') y
// el número llega como dato. Test de la marca N+1 en `api/execute.test.ts`.

// Piso del presupuesto de título. Un número diminuto (o negativo, o basura) no es un presupuesto:
// es una orden imposible. Se nombra por lo que es y NO se usa como default cuando el dato falta —
// sin dato no hay cifra en la instrucción, que es distinto de tener una inventada.
const TITLE_BUDGET_MIN_CHARS = 20;

// Lector fail-soft del presupuesto de título, gemelo de `readDeclaredMaxTokens`: un valor ilegible
// NO corta la generación (la pieza es más importante que su presupuesto) pero DEJA RASTRO. Ausente
// ⇒ null, que es el caso legítimo de un emisor anterior a BRIEF 8.
function readTitleBudgetChars(declared: unknown): number | null {
  if (declared === null || declared === undefined) return null;
  const n = typeof declared === 'number' ? declared : Number(declared);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`[CopyLab][BRIEF8] builder_input.title_budget_chars ilegible (${JSON.stringify(declared)}) — se escribe el título sin cifra declarada`);
    return null;
  }
  return Math.max(TITLE_BUDGET_MIN_CHARS, Math.round(n));
}

// ── BRIEF-04 · LA IMAGEN ABRE, EL TÍTULO RESPONDE ──────────────────────────────────────────────
//
// EL DEFECTO. La imagen REPETÍA el texto de la pieza: el compositor estampaba `copy.title` como
// titular y la primera frase del cuerpo como bajada. Tres impactos de la misma idea — título
// estampado, primera frase estampada, y las dos otra vez debajo en texto.
//
// EL EJE. El escritor deja de entregar UN título que se replica y entrega TRES cadenas con
// funciones distintas: un gancho que abre sobre la imagen, un apoyo que lo matiza, y un título que
// le RESPONDE. La relación entre las tres es lo que se nombra; los dos estados de esa relación son
// `echo` (repetir, el comportamiento vigente) y `dialogue` (responder).
//
// EL MODO ES DEL CANAL Y LLEGA COMO DATO. Donde el título es la primera línea de un caption, el
// diálogo funciona; donde es un H1 que indexa o el asunto de un correo, un gancho suelto es un
// desastre de búsqueda. Eso depende de la SUPERFICIE, no de quién publica, y por eso NO se decide
// acá: llega resuelto en `builder_input`. Cero marcas y cero canales en este archivo.
//
// LA REGLA QUE HACE EL MODO SEGURO: LA RESPUESTA CONTIENE SU PREMISA. El texto sobre la imagen no
// distribuye —las plataformas rankean, buscan y previsualizan sobre el caption, y un lector de
// pantalla no lee píxeles—, así que el título no puede depender de que la imagen se haya visto. No
// repetir la premisa: IMPLICARLA dentro de la réplica.
const IMAGE_TITLE_MODES = ['echo', 'dialogue'] as const;
type ImageTitleMode = (typeof IMAGE_TITLE_MODES)[number];

// Lector fail-soft del modo, gemelo de `readTitleBudgetChars`. Un valor desconocido NO corta la
// generación y NO se obedece a medias: degrada al modo que repite —el vigente— y deja rastro.
// Inventar un modo a partir de un valor que no se entiende es peor que ignorarlo.
function readImageTitleMode(declared: unknown): ImageTitleMode {
  if (declared === null || declared === undefined) return 'echo';
  const raw = String(declared).trim().toLowerCase();
  if ((IMAGE_TITLE_MODES as readonly string[]).includes(raw)) return raw as ImageTitleMode;
  console.warn(`[CopyLab][BRIEF-04] builder_input.image_title_mode desconocido (${JSON.stringify(declared)}) — se escribe en modo 'echo', que es el comportamiento vigente`);
  return 'echo';
}

// La sección ## IMAGEN Y TÍTULO del system. Sólo existe en modo diálogo: en `echo` el prompt queda
// BYTE-IDÉNTICO al de hoy, que es lo que hace que este cambio no toque las piezas vigentes.
//
// El presupuesto de caracteres se lo lleva el GANCHO, y no es un detalle: `title_budget_chars` lo
// resolvió el carril contra los `fit_steps` del overlay, y en modo diálogo quien ocupa esa ranura
// es el gancho. Decirle al escritor que el título tiene N caracteres para un espacio que ya no
// ocupa sería darle una restricción de un sitio donde no va a estar.
function buildImageDialogueBlock(hookBudgetChars: number | null): string {
  const presupuesto = hookBudgetChars === null
    ? 'El gancho es UNA línea que se lee de un vistazo.'
    : `El gancho tiene ${hookBudgetChars} caracteres, cierre incluido: es el espacio que hay sobre`
      + ' la imagen. Un gancho que no CIERRA dentro de ese espacio no sirve — se reescribe más'
      + ' corto, no se recorta.';
  return '## IMAGEN Y TÍTULO\n'
    + 'Esta pieza lleva texto sobre la imagen, y ese texto y el título son DOS TURNOS DE UNA'
    + ' CONVERSACIÓN, no la misma frase dos veces.\n\n'
    + 'GANCHO — va sobre la imagen. Abre, provoca, y NO se explica. Es lo que hace detener el'
    + ' scroll, no lo que resume la pieza.\n\n'
    + presupuesto + '\n\n'
    + 'APOYO — va sobre la imagen, debajo del gancho. MATIZA el gancho: le da el giro que el gancho'
    + ' insinúa. NUNCA es la primera frase del cuerpo, y nunca repite el gancho con otras palabras.'
    + ' Si no aporta nada que el gancho no diga ya, se omite.\n\n'
    + 'TÍTULO — RESPONDE al gancho, y es la primera línea del texto publicado.\n\n'
    + 'LA REGLA QUE NO SE NEGOCIA: LA RESPUESTA CONTIENE SU PREMISA. El texto sobre la imagen no'
    + ' viaja — quien busca, quien previsualiza y quien lee con lector de pantalla recibe SÓLO el'
    + ' texto—, así que el título no puede depender de que la imagen se haya visto. No repitas la'
    + ' premisa: IMPLÍCALA dentro de la réplica. Alguien que lee únicamente el título, sin haber'
    + ' visto la imagen, tiene que entender la pieza entera.\n\n'
    + 'Y no compartas secuencias de palabras entre el gancho y el título: si las dos cadenas'
    + ' repiten la misma tirada, no hay conversación, hay eco.';
}

// La sección ## TÍTULO del system. Instrucción de OFICIO, no una restricción más: dice qué clase de
// frase es un título y qué NO es. La cifra entra sólo si el carril la declaró.
function buildTitleBlock(
  titleBudgetChars: number | null, destination: string | null | undefined,
  // BRIEF-04 — parámetro con default al final, mismo patrón que DIV-01 en el carril: sin él, el
  // bloque es byte-idéntico al de antes de este brief y ningún llamador existente se mueve.
  mode: ImageTitleMode = 'echo',
): string {
  const esSocial = String(destination ?? '').trim() !== 'editorial';
  const dialogo = mode === 'dialogue';
  // En diálogo la cifra pertenece al GANCHO, que es quien ocupa la ranura del overlay: la declara
  // `## IMAGEN Y TÍTULO` y aquí NO se repite. El título deja de estar limitado por un espacio que
  // ya no ocupa.
  const presupuesto = (dialogo || titleBudgetChars === null)
    ? 'Es UNA línea: una afirmación que se lee de un vistazo, sin subordinadas apiladas.'
    : `Tiene ${titleBudgetChars} caracteres, cierre incluido. No es un límite del que convenga`
      + ' quedarse lejos ni una meta que alcanzar: es el espacio que hay. Un título que no CIERRA'
      + ' dentro de ese espacio no sirve — se reescribe más corto, no se recorta.';
  // En diálogo el título SÍ se publica: es la primera línea del texto, y lo que va sobre la imagen
  // es el gancho. La advertencia de no repetirlo en el cuerpo describía el modo que repite y sería
  // falsa aquí.
  const publicacion = (esSocial && !dialogo)
    ? '\n\nEl título NO se publica dentro del cuerpo: es el texto que va sobre la imagen. No lo'
      + ' repitas en la primera línea ni lo anuncies — el cuerpo empieza por su propia apertura.'
    : '';
  const respuesta = dialogo
    ? '\n\nEn esta pieza el título RESPONDE al gancho de la imagen — ver ## IMAGEN Y TÍTULO. Sigue'
      + ' siendo la afirmación más filosa y sigue sosteniéndose solo: la réplica IMPLICA su premisa'
      + ' en vez de repetirla.'
    : '';
  return '## TÍTULO\n'
    + 'Toda pieza lleva título, y el título es la AFIRMACIÓN MÁS FILOSA de la pieza — no su resumen,'
    + ' no su tema, no una etiqueta de categoría. Si el cuerpo demuestra algo, el título lo AFIRMA.\n\n'
    + 'Tiene que sostenerse solo: alguien que lee únicamente el título entiende qué se le está'
    + ' diciendo, sin el cuerpo debajo.\n\n'
    + 'El título es PARTE DE LA PIEZA, no su envoltorio: todas las reglas que gobiernan el cuerpo lo'
    + ' gobiernan a él —tratamiento, tono, prohibiciones, exigencias de prueba, neutralidad—, y se'
    + ' juzga con ellas. Un título que rompe una regla reprueba la pieza entera.\n\n'
    + presupuesto
    + respuesta
    + publicacion;
}

// El bloque FORMATO de la instrucción de usuario. Función pura del destino — el ternario que vivía
// suelto dentro de buildPrompt, ahora testeable y con el título obligatorio en las DOS ramas.
// Lo único que separa a los destinos es DÓNDE vive el título: en editorial encabeza la pieza
// publicada; en social es sólo el texto del overlay y el cuerpo se publica sin él.
function buildCarrilFormatBlock(
  destination: string | null | undefined, mode: ImageTitleMode = 'echo',
): string {
  // En diálogo la salida trae TRES cadenas antes del cuerpo, cada una en su centinela. El apoyo es
  // el único omitible: si no matiza el gancho, su línea no se escribe (ver ## IMAGEN Y TÍTULO).
  const primeraLinea = mode === 'dialogue'
    ? '- Primera línea EXACTA: "GANCHO: <el texto que va sobre la imagen>".\n'
      + '- Segunda línea EXACTA: "APOYO: <el matiz del gancho>". Si el apoyo no aporta nada, OMITE'
      + ' esta línea entera — no la escribas vacía.\n'
      + '- Luego la línea EXACTA: "TÍTULO: <el título que responde al gancho>".\n'
      + '- Luego una línea en blanco y el cuerpo.\n'
    : '- Primera línea EXACTA: "TÍTULO: <título de la pieza>".\n'
      + '- Luego una línea en blanco y el cuerpo.\n';
  return String(destination ?? '').trim() === 'editorial'
    ? 'FORMATO (editorial):\n'
      + primeraLinea
      + '- El cuerpo termina en su última frase de contenido: sin repetir el título, sin H1, sin CTA final, sin firma.'
    : 'FORMATO (social):\n'
      + primeraLinea
      + '- El cuerpo NO repite el título ni lo cita: arranca con su propia apertura.\n'
      + '- El cuerpo termina en su última frase de contenido: sin CTA final añadido, sin firma.';
}

// Eco medible del título emitido. Se cuenta en caracteres —la misma unidad del presupuesto— para
// que la próxima corrida pueda cruzar "cuánto se le dio" contra "cuánto usó" sin convertir nada.
function titleCharCount(title: string | null | undefined): number {
  return typeof title === 'string' ? title.trim().length : 0;
}

// Split CopyLab's internal `TÍTULO:` sentinel into { title, body } (§4.3). The
// sentinel is internal to CopyLab — the carril receives title/body already split
// and never parses again. body is trimmed and never carries a trailing signature.
function parsePiece(output: string): {
  title: string | null; image_hook: string | null; image_support: string | null; body: string;
} {
  let text = String(output ?? '').trim();

  // BRIEF-04 — los centinelas del modo diálogo, en el orden en que el formato los pide y SÓLO desde
  // el principio del texto. Se consumen si están; su ausencia es el modo que repite y deja el
  // resultado byte-idéntico al de antes de este brief. El apoyo es legítimamente omitible.
  const comer = (re: RegExp): string | null => {
    const m = text.match(re);
    if (!m) return null;
    text = text.slice(m[0].length).trimStart();
    const v = m[1].trim();
    return v || null;
  };
  const image_hook = comer(/^\s*GANCHO:\s*(.+?)\s*(?:\n|$)/i);
  const image_support = comer(/^\s*APOYO:\s*(.+?)\s*(?:\n|$)/i);

  const m = text.match(/^\s*T[IÍ]TULO:\s*(.+?)\s*(?:\n|$)/i);
  if (m) {
    const title = m[1].trim();
    return { title: title || null, image_hook, image_support, body: text.slice(m[0].length).trim() };
  }
  return { title: null, image_hook, image_support, body: text };
}

// The signature travels WITHOUT stamping (§4.3): stampSignature runs in the
// carril's finalizePiece AFTER the Watcher PASS, so CopyLab must NEVER append it
// to the body. When a rule declares a signature (kind ~ firma/signature), surface
// it as { text, rule } so the carril can stamp post-Watcher; otherwise null.
function deriveSignature(
  rules: Array<{ code: string; kind: string; statement: string }> | null | undefined,
): { text: string; rule: string } | null {
  if (!Array.isArray(rules)) return null;
  const sig = rules.find(r => r && typeof r.kind === 'string' && /firma|signature/i.test(r.kind) && r.statement);
  return sig ? { text: String(sig.statement).trim(), rule: sig.code } : null;
}

// ── G2-F · el bucle de reparación acotado ───────────────────────────────────
// EL HALLAZGO, medido en la corrida G2-E del 21-ago (ForumPHs, juez v84 con el filtro de
// aplicabilidad vivo). Muerto el ruido condicional, lo que queda es COLA LARGA: 10 reglas
// distintas, 1–3 disparos cada una, y la mayoría de los REJECT con UNA o DOS violaciones sobre
// ~19 reglas evaluadas. La aritmética cierra el caso: pedir 90% de PASS en una sola pasada exige
// ~99,5% de cumplimiento POR REGLA, y eso no se consigue redactando mejor la orden. Se consigue
// no tirando una pieza que ya cumple 17 de 19.
//
// El mecanismo es la SEGUNDA PASADA DIRIGIDA: la pieza rechazada vuelve al generador con SÓLO las
// instrucciones que violó, un único reintento, y se re-juzga con el mismo gate. No afloja ningún
// gate —el juez sigue decidiendo con las mismas reglas— y convierte la cola larga en PASS.
//
// Lo que cambia acá es la TAREA, no la VOZ. El system queda EXACTAMENTE como el de generación
// —voz, genoma, reglas del Watcher, presupuesto de longitud— porque la pieza reparada tiene que
// seguir cumpliendo todo lo que ya cumplía: quitarle las 17 reglas que sí cumple para dejarle sólo
// las 2 violadas es invitarla a romper las otras 17. Lo que se reemplaza es la INSTRUCCIÓN DE
// USUARIO: donde iba la materia prima del brief va la pieza escrita y la lista de violaciones.
//
// Sin `builder_input.repair` no corre nada de esto y el prompt queda byte-idéntico al de hoy (modo
// UI y carril de generación intactos) — el mismo contrato de aditividad de A1 / C1 / G1-D.
//
// Cero marcas y cero plataformas acá: las violaciones son DATO del payload (código + instruction,
// las mismas que el juez usó para rechazar), no una enumeración escrita en el motor.
interface RepairViolation { code: string; instruction: string }
interface RepairInput { piece_text: string; violations: RepairViolation[] }

// El lector del encargo. Devuelve `null` SÓLO cuando la clave está ausente —ése es el modo
// generación de siempre—; un encargo PRESENTE pero incompleto CORTA con nombre propio en vez de
// caer a generación en silencio. La caída silenciosa sería el peor fallo posible de este cambio:
// el contrato de respuesta es el mismo, así que aguas abajo una "reparación" que en realidad
// escribió una pieza nueva es indistinguible de una que corrigió la que había.
function normalizeRepair(repair: unknown): RepairInput | null {
  if (repair === null || repair === undefined) return null;
  if (typeof repair !== 'object' || Array.isArray(repair)) {
    throw new Error(`COPYLAB_REPAIR_MALFORMED: builder_input.repair debe ser un objeto { piece_text, violations } (recibido: ${JSON.stringify(repair)})`);
  }
  const r = repair as { piece_text?: unknown; violations?: unknown };
  const piece_text = String(r.piece_text ?? '').trim();
  if (!piece_text) {
    throw new Error('COPYLAB_REPAIR_PIECE_REQUIRED: builder_input.repair.piece_text es obligatorio — sin la pieza escrita no hay nada que reparar');
  }
  // Una violación sin `instruction` no se puede reparar: el código NOMBRA la regla, pero la
  // instrucción es lo único que le dice al escritor QUÉ cambiar. Se descartan, y si no queda
  // ninguna se corta: mandar la pieza de vuelta sin decirle qué falló es pedirle que reescriba.
  const violations = (Array.isArray(r.violations) ? r.violations : [])
    .filter((v: any) => v && String(v.instruction ?? '').trim())
    .map((v: any) => ({ code: String(v.code ?? '').trim() || '∅', instruction: String(v.instruction).trim() }));
  if (!violations.length) {
    throw new Error('COPYLAB_REPAIR_VIOLATIONS_REQUIRED: builder_input.repair.violations necesita al menos una violación con instruction — reparar sin saber qué falló es reescribir');
  }
  return { piece_text, violations };
}

// La instrucción de usuario del modo reparación. Conserva el BLOQUE DE FORMATO de la generación
// —la pieza tiene que volver con la misma forma con la que salió— y reemplaza la materia prima por
// la pieza escrita más las violaciones, una por bloque (código + instrucción).
//
// Tres cuidados, cada uno por un fallo que este bloque tiene que impedir:
//   · MÍNIMO NECESARIO — sin esto el modelo reescribe la pieza entera y rompe las reglas que ya
//     cumplía, que es exactamente lo que la segunda pasada viene a evitar.
//   · PRESUPUESTO — el techo de G1-D sigue vigente: reparar no puede ser agregar. El número se
//     repite acá porque la orden de esta pasada es "corregí sin crecer", no "escribí en N".
//   · TÍTULO — sólo se menciona si la pieza original TRAE título (editorial): en social no hay
//     título y nombrarlo sería invitar a inventar uno. Lo decide el dato, no el destino escrito acá.
function buildRepairInstruction(
  formatBlock: string,
  repair: RepairInput,
  lengthBudgetChars: number | null,
): string {
  const { title } = parsePiece(repair.piece_text);
  const tituloRegla = title
    ? '\n\nEl título es parte de la pieza: devolvelo TAL CUAL, salvo que una de las violaciones sea'
      + ' sobre él.'
    : '';
  const presupuesto = lengthBudgetChars === null
    ? ''
    : `\n\nEl presupuesto de longitud sigue vigente: la pieza corregida entra en los mismos ~${lengthBudgetChars}`
      + ' caracteres. Reparar no es agregar — si una corrección necesita espacio, sale de otra parte'
      + ' de la pieza.';
  const bloques = repair.violations.map(v => `[${v.code}]\n${v.instruction}`).join('\n\n');
  return `${formatBlock}\n\n`
    + 'TAREA — REPARACIÓN DIRIGIDA (no es una pieza nueva):\n'
    + 'Esta pieza ya está escrita y cumple todo salvo lo listado. Devolvé la pieza COMPLETA'
    + ' corregida, cambiando lo MÍNIMO necesario para cumplir cada código listado. No reescribas lo'
    + ' que ya cumple. Cerrala completa.'
    + tituloRegla
    + presupuesto
    + `\n\nPIEZA A REPARAR (íntegra, tal como se publicaría):\n${repair.piece_text}`
    + `\n\nQUÉ INCUMPLE (${repair.violations.length}) — una por bloque, cada una tiene que quedar`
    + ` cumplida:\n${bloques}`
    + '\n\nDevolvé SOLO la pieza corregida completa, en el formato de arriba. Sin preámbulos, sin'
    + ' explicar qué cambiaste y sin nombrar los códigos dentro del texto.';
}

// ── B2 · el mapa del carril ─────────────────────────────────────────────────
// resolveCarrilContentType(destination, platform, canalMap) → { content_type, canal }. En
// modo carril, content_type y canal salen de ACÁ (no del pack ni del `?? 'instagram'`
// mudo del modo UI). El destino manda; la plataforma afina el canal:
//   social (x/meta_fb/meta_ig/tiktok/linkedin)      → social_post,     canal = la plataforma
//   editorial (canal por platform_canal_map)        → editorial_post,  canal = canal_blocks.id
//   email_propietarios (cualquier destino)          → email_divulgacion, canal = email
// Plataforma desconocida → WARN NOMINAL que la nombra + caída al par de su destination
// (nunca una coerción muda). Puro y self-contained: sólo built-ins + console.
const CARRIL_SOCIAL_PLATFORMS = new Set(['x', 'meta_fb', 'meta_ig', 'tiktok', 'linkedin']);

// A2 (2026-08-18) — SE RETIRA el literal de marca. Hasta hoy el canal editorial salía de
//
//   const CARRIL_EDITORIAL_CANAL = { blog: 'blog', blog_forumphs: 'blog', linkedin: 'linkedin' };
//
// `blog_forumphs` es el nombre de la plataforma de UNA marca (ForumPHs, 32 filas de
// brand_topics) escrito como clave en capa compartida: viola MULTIBRAND_RULE, y la deuda estaba
// registrada en este mismo archivo desde el 14-ago. Con ForumPHs entrando al scheduler el 22, sale.
//
// El eje correcto YA EXISTÍA COMO DATO: `platform_canal_map` es la tabla puente
// (plataforma + traffic_type → canal_blocks.id), y `resolveCanalBlockId` —unas líneas más abajo,
// en este mismo bloque puro— ya la consumía para el bloque ## CANAL. El canal editorial se
// resuelve ahora por esa MISMA vía: una sola fuente para el canal, no dos que puedan divergir.
// Alta de plataforma nueva = fila en la tabla, no deploy.
//
// El caso legacy queda documentado, no cableado: `blog_forumphs` tiene su fila
// (traffic_type=organic → canal_block BLOG, el mismo que `blog` genérico) y su retiro como alias
// es un PR posterior, según MULTIBRAND_RULE.
//
// El mapa llega COMO DATO (parámetro), no se consulta acá: la función sigue siendo PURA y
// testeable. Plataforma sin fila → warn nominal que la nombra + par de su destination ('blog'),
// exactamente el mismo comportamiento observable que hoy. Sin default silencioso.
function resolveCarrilContentType(
  destination: string,
  platform: string,
  canalMap?: any[] | null,
): { content_type: string; canal: string } {
  const d = String(destination ?? '').trim().toLowerCase();
  const p = String(platform ?? '').trim().toLowerCase();

  // El email de divulgación se ancla en la PLATAFORMA, no en el destino.
  // ⚠️ DEUDA MULTIMARCA REMANENTE (no es el alcance de este PR): `email_propietarios` también es
  // el nombre de la plataforma de UNA marca. A diferencia del canal editorial, acá lo que se
  // decide es el CONTENT_TYPE, y el puente que lo resolvería por dato —platform_canal_map.
  // content_type— hoy está en NULL en las 9 filas (es el gancho de ADS, sin cablear). Queda
  // anotado y se retira cuando esa columna sea la fuente.
  if (p === 'email_propietarios') return { content_type: 'email_divulgacion', canal: 'email' };

  if (d === 'social') {
    if (CARRIL_SOCIAL_PLATFORMS.has(p)) return { content_type: 'social_post', canal: p };
    console.warn(`[CopyLab][carril] plataforma social desconocida '${p}' → social_post, canal='${p || 'social'}' (nominal, sin coerción)`);
    return { content_type: 'social_post', canal: p || 'social' };
  }

  if (d === 'editorial') {
    const { canal_block_id, source } = resolveCanalBlockId(canalMap, p, 'organic');
    if (source === 'map' && canal_block_id) return { content_type: 'editorial_post', canal: canal_block_id };
    console.warn(`[CopyLab][carril] plataforma editorial '${p}' sin fila en platform_canal_map (traffic_type=organic) → editorial_post, canal='blog' (par de su destination)`);
    return { content_type: 'editorial_post', canal: 'blog' };
  }

  // destination fuera de {social, editorial}: ruidoso pero no mudo (§3.4 ya lo valida aguas arriba).
  console.warn(`[CopyLab][carril] destination desconocido '${d}' (platform '${p}') → social_post, canal='${p || 'social'}' (nominal)`);
  return { content_type: 'social_post', canal: p || 'social' };
}

// El filtro imperativo que PR-1 dejó a cargo de CopyLab: builder_input.rules viaja SIN filtrar por kind
// (todas las reglas del Watcher). Antes de inyectarlas al modelo se filtran a las de forma imperativa
// (prohibition | requirement | proof) — las órdenes. Similitud/duplicación se VERIFICAN aguas abajo (gate
// del Watcher), no se prescriben: meterlas al prompt es pedirle al modelo que cumpla algo que no es orden.
const CARRIL_IMPERATIVE_KINDS = new Set(['prohibition', 'requirement', 'proof']);
function filterCarrilImperativeRules(
  rules: Array<{ code: string; kind: string; statement: string; instruction?: string | null }> | null | undefined,
): Array<{ code: string; kind: string; statement: string; instruction?: string | null }> {
  return (rules ?? []).filter(r => CARRIL_IMPERATIVE_KINDS.has(String(r?.kind)));
}

// ── claims · las cifras y su procedencia (contraparte de A1·CAMBIO 8) ────────────────────────
// `builder_input.claims` llega del carril con la forma {claim, value, source_url}: cada cifra ATADA
// a la URL de la lista cerrada del memo que la sostiene. Acá se vuelve BLOQUE CITABLE, con la misma
// gramática que las reglas del Watcher (lista + instrucción que la hace exigible), y la instrucción
// cierra el grifo: las cifras salen SÓLO de esta lista, y una cifra sin claim no se escribe.
// Sin claims → null → sin bloque: el prompt queda exactamente como hoy. La entrada incompleta (sin
// dato, sin valor o sin fuente) NO viaja: un número sin procedencia es justo lo que este bloque
// viene a impedir. La función se llama como el dato que consume y no conoce plataformas ni marcas:
// lo que decide es la fila, no una enumeración escrita acá.
//
// C1 (2026-08-18) — el claim gana `source_name`: el NOMBRE citable de la entidad ("Convert",
// "Adobe", "Ley 284"), no el dominio de la URL. Con él la instrucción deja de ser sólo prohibitiva
// y pasa a decir CÓMO se escribe la cifra: con su fuente nominal dentro de la frase, nunca con la
// URL. Eso es exactamente lo que HR-UNRLVL-01 (kind proof) llama "cifra con procedencia declarada"
// — el juez ve la lista de fuentes y puede cotejar el nombre. Un claim sin `source_name` (fila
// anterior a C1) sigue viajando y se lista igual: lo que pierde es la atribución nominal, que es
// justamente lo que no se puede inventar acá.
function buildClaimsBlock(
  claims: Array<{ claim: string; value: string; source_url: string; source_name?: string }> | null | undefined,
): string | null {
  const usable = (Array.isArray(claims) ? claims : [])
    .filter(c => c && String(c.claim ?? '').trim() && String(c.value ?? '').trim() && String(c.source_url ?? '').trim());
  if (!usable.length) return null;
  const lines = usable.map(c => {
    const name = String(c.source_name ?? '').trim();
    return `- ${String(c.claim).trim()}: ${String(c.value).trim()}`
      + (name ? ` — fuente citable: ${name}` : '')
      + ` (${String(c.source_url).trim()})`;
  });
  const anyName = usable.some(c => String(c.source_name ?? '').trim());
  return 'CIFRAS CITABLES (lista cerrada — cada una atada a la fuente que la sostiene):\n'
    + lines.join('\n')
    + '\n\nToda cifra que escribas sale SÓLO de esta lista, con el valor tal como figura acá y sin'
    + ' redondearlo. Una cifra que no esté en la lista NO se escribe: ni estimada, ni inferida del'
    + ' brief, ni deducida de otra. Si la frase la necesita y no está, la frase va sin cifra.'
    + (anyName
      ? '\n\nCada cifra que uses se escribe CON su fuente citable nombrada en el texto — "según'
        + ' <fuente citable>", "de acuerdo con <fuente citable>" — dentro de la misma frase o la'
        + ' inmediata. Nunca pegues la URL en el copy: la URL está acá para que el dato sea'
        + ' verificable, el nombre es lo que se publica. Una cifra sin su fuente nombrada es una'
        + ' cifra sin procedencia declarada, y así no se puede escribir.'
      : '');
}

// ── C1 · el MATERIAL con el que se cumple, no la orden de cumplir ────────────────────────────
// Las reglas del Watcher ya se inyectan —HR-UNRLVL-01 y HR-GEN-08 entre ellas— y se violan igual,
// porque decirle a un generador "no enuncies sin ilustrar" no le da CON QUÉ ilustrar. Este bloque
// es lo otro: el mecanismo (cómo funciona el asunto por dentro) y un caso concreto del memo, con
// su fuente. Instrucción CONSTRUCTIVA a propósito — desarrollá, ilustrá — y no una prohibición más.
//
// Cualquiera de los dos puede faltar: se emite lo que haya. Sin ninguno ⇒ null ⇒ sin bloque, y el
// prompt queda exactamente como hoy. El caso se exige DISTINTO del que abre la pieza: repetir el
// de apertura no ilustra, y es la falla que HR-GEN-08 marca.
//
// D1 (2026-08-18) — el caso pasa a ser una LISTA, porque la regla pedía dos y el contrato daba uno.
// `HR-GEN-08` exige "al menos un caso concreto DISTINTO del que abre": el que abre y uno más. Con un
// solo caso era incumplible por construcción — o se abría con él y no quedaba segundo, o se
// ilustraba con él y se abría con algo sin respaldo. La instrucción cambia en consecuencia: con dos
// o más, el primero ABRE y el segundo CONFIRMA que el patrón se repite; con uno solo NO se promete
// ilustración doble, porque prometerla es empujar al generador a inventar el segundo.
function buildWritingMaterialBlock(
  mechanism: string | null | undefined,
  caseExamples: Array<{ case?: string; source_url?: string; source_name?: string }>
    | { case?: string; source_url?: string; source_name?: string } | null | undefined,
): string | null {
  const parts: string[] = [];
  const mech = String(mechanism ?? '').trim();
  if (mech) {
    parts.push(`MECANISMO (cómo funciona el asunto por dentro):\n${mech}\n`
      + 'Desarrollalo en la pieza: los pasos, o la relación causal — qué provoca qué y por qué. Es'
      + ' lo que separa una afirmación de una explicación, y es lo que la pieza tiene que dejar'
      + ' entendido.');
  }
  // Retrocompat: un objeto suelto (contrato C1) se lee como lista de uno.
  const raw = Array.isArray(caseExamples) ? caseExamples
    : (caseExamples && typeof caseExamples === 'object' ? [caseExamples] : []);
  const casos = raw
    .filter(c => c && String(c.case ?? '').trim() && String(c.source_name ?? '').trim() && String(c.source_url ?? '').trim())
    .map(c => ({ case: String(c.case).trim(), source_name: String(c.source_name).trim(), source_url: String(c.source_url).trim() }));

  if (casos.length) {
    const lista = casos
      .map((c, i) => `${i + 1}. [${c.source_name}] ${c.case} (${c.source_url})`)
      .join('\n');
    const comoUsarlos = casos.length >= 2
      ? 'Usá el PRIMERO para abrir: es el caso con el que entrás. Usá el SEGUNDO más adelante, para'
        + ' mostrar que el patrón se repite — no basta con que algo haya pasado una vez. Cada uno con'
        + ' su especificidad y nombrando su fuente citable en el texto. No ilustres con el mismo caso'
        + ' con el que abriste: eso no ilustra, repite.'
      : 'Es UN solo caso: usalo donde más pese, con su especificidad y nombrando su fuente citable en'
        + ' el texto. No lo repitas como si fueran dos, y no inventes un segundo caso para acompañarlo'
        + ' — si el patrón necesita un segundo ejemplo y no lo tenés, no lo afirmes como patrón.';
    parts.push(`CASOS PARA ILUSTRAR (${casos.length}):\n${lista}\n\n${comoUsarlos}`);
  }
  return parts.length ? parts.join('\n\n') : null;
}

// ── G2-C · la política de CTA según el frente de audiencia ──────────────────
// `audience_frame` declara cuánto PODER tiene el lector sobre la contratación — no en qué estado
// de ánimo está. Estas tres políticas son el espejo en modo ESCRITURA de la regla con la que el
// juez evalúa el cierre (gate7 / AUDIENCE_FRAME_RULES de content-watcher): el patrón que D2 ya
// estableció —una redacción para quien JUZGA, otra para quien ESCRIBE, la misma regla—, aplicado
// a un mapa que todavía es código y no tabla.
//
// NO hay alias del eje legacy (`jd`→`decide`, `doliente`→`influye`), y su ausencia es la decisión,
// no un olvido: la semántica cambió de raíz. `doliente` le pedía al escritor un "CTA empático, la
// audiencia está en un momento sensible"; `influye` prohíbe TODO CTA de contratación. Reponer el
// alias restauraría el texto que le pide al escritor exactamente el cierre que el juez rechaza —
// peor que el bloque vacío que este cambio repara.
//
// Ningún nombre de marca ni vocabulario de una jurisdicción: el eje es funcional (poder de decisión
// del lector) y describe a cualquier marca de servicios. La instancia —qué frente tiene cada topic—
// vive en el dato (`intel.brand_topics.audience_frame`), no acá.
type AudienceFrame = 'decide' | 'influye' | 'general';
// Lo que se REPORTA: los tres frentes más 'none' (frente no declarado). No hay cuarto valor:
// un frente que no resuelve no llega a reportarse, corta el request.
type AudienceCtaApplied = AudienceFrame | 'none';
const AUDIENCE_CTA: Record<AudienceFrame, string> = {
  decide:
    'El lector DECIDE y FIRMA: puede contratar o comprar y responde por esa decisión. El cierre PUEDE'
    + ' pedirle que contrate —contactar, agendar, pedir una propuesta— en el registro de la voz y sin'
    + ' fórmula publicitaria. No es obligatorio: si la pieza cierra mejor sin pedido, cerrá sin pedido.'
    + ' Su ausencia no es fallo; lo que sí es fallo es un pedido pegado que la pieza no se ganó.',
  influye:
    'El lector NO FIRMA ni contrata: no toma la decisión de compra — la padece o la condiciona.'
    + ' PROHIBIDO todo CTA de contratación, en cualquier formulación, incluida la indirecta o sugerida'
    + ' (contactar, agendar, cotizar, contratar, "nuestros servicios", "estamos para ayudarte").'
    + ' Ofrecerle comprar a quien no puede comprar es fallo del frente. El único cierre válido es lo'
    + ' que ese lector debe EXIGIR o recomendar donde sí tiene poder: ante quien decide, en la'
    + ' instancia que decide, con su voto o dentro de su ámbito. Cerrá dándole esa exigencia formulada,'
    + ' no una invitación a comprar.',
  general:
    'Audiencia MIXTA: entre tus lectores hay quien firma y quien no, y la pieza no sabe cuál la está'
    + ' leyendo. Sin CTA de contratación directo — no le pidas al lector un paso que la mitad no puede'
    + ' dar. El cierre convierte ENTREGANDO: la respuesta completa a lo que la pieza abrió, clara y'
    + ' orientada al resultado. La conversión está en la respuesta, no en el pedido.',
};

// Resuelve el frente a su política. Tres salidas, ninguna muda:
//   • frente vacío / null → { key: 'none', block: null } — ausencia DECLARADA: sin frente no hay
//     política, y sin política no se emite el encabezado.
//   • frente conocido     → { key, block } — encabezado + política, siempre CON cuerpo debajo.
//   • frente desconocido  → throw `AUDIENCE_FRAME_UNKNOWN: <valor>`. Lo que había antes era un
//     `?? ''`: emitía "POLÍTICA DE CTA [audiencia: influye]:" y nada debajo — una sección que
//     anuncia contenido y no lo entrega, mientras el juez evalúa contra la regla completa. Un
//     frente que el mapa no cubre es un error de contrato entre el carril y CopyLab, y tiene que
//     doler acá, no aguas abajo en el veredicto.
// Normaliza igual que gate7 (trim + lowercase) para que la frontera no invente un desconocido por
// diferencia de capitalización; el valor que reporta el error es el que llegó.
function resolveAudienceCta(frame: string | null | undefined): { key: AudienceCtaApplied; block: string | null } {
  const raw = String(frame ?? '').trim();
  if (!raw) return { key: 'none', block: null };
  const norm = raw.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(AUDIENCE_CTA, norm)) {
    throw new Error(`AUDIENCE_FRAME_UNKNOWN: ${raw}`);
  }
  const key = norm as AudienceFrame;
  return { key, block: `POLÍTICA DE CTA [audiencia: ${key}]:\n${AUDIENCE_CTA[key]}` };
}

// ── Cambio 2 · precedencia por voz en la compatibilidad ─────────────────────
// La precedencia es LÓGICA, no I/O, así que vive acá (pura) y sirve a los dos
// caminos: la query directa (que trae voz + BASE de una vez) y el .filter() del
// snapshot (que traía TODAS las reglas y filtraba sólo por content_type, quedando
// desalineado si sólo se arreglaba la query). Reglas:
//   • fila con voice_id === voiceId  → gana          (source 'voice')
//   • si no, fila con voice_id null  → BASE          (source 'base')
//   • si ninguna                     → null          (source 'none')
// Orden-independiente: no depende del orden en que PostgREST devuelva las filas.
function selectCompatRule(
  rows: any[] | null | undefined,
  contentType: string,
  voiceId: string | null | undefined,
): { rule: any | null; source: 'voice' | 'base' | 'none' } {
  const forType = (rows ?? []).filter(r => r && r.content_type === contentType);
  if (voiceId) {
    const v = forType.find(r => r.voice_id === voiceId);
    if (v) return { rule: v, source: 'voice' };
  }
  const base = forType.find(r => r.voice_id === null || r.voice_id === undefined);
  if (base) return { rule: base, source: 'base' };
  return { rule: null, source: 'none' };
}

// ── A1 · sustitución de variables de template ───────────────────────────────
// Portado de src/lib/buildCopyPrompt.ts. buildPrompt inyectaba outputTemplate.template_text
// crudo: 18 de 24 templates activos traen {{...}} (prompt_Email_Sequence, Email_Campaign,
// Landing_Page_Full, los de YouTube, etc.) que llegaban LITERALES al modelo. Diferencia
// clave con el original: una variable sin valor (ausente o vacía) → cadena vacía + se
// REGISTRA como no resuelta, NUNCA el placeholder crudo `{{clave}}` (que era lo que dejaba
// el original). Soporta {{clave}} y {clave}. Puro: regex sobre strings.
//
// El reemplazo usa función (no string): así un VALOR que contenga `$&`, `$1`, `$\`` u otro
// patrón especial de String.replace se inserta LITERAL, no se interpola.
function applyTemplateVars(
  template: string | null | undefined,
  vars: Record<string, string>,
): { text: string; unresolved: string[] } {
  const unresolved = new Set<string>();
  const sub = (key: string): string => {
    const v = vars[key];
    if (v === undefined || v === null || v === '') { unresolved.add(key); return ''; }
    return String(v);
  };
  const text = String(template ?? '')
    .replace(/\{\{(\w+)\}\}/g, (_m, key) => sub(key))
    .replace(/\{(\w+)\}/g,     (_m, key) => sub(key));
  return { text, unresolved: [...unresolved] };
}

// Mapa de variables desde el registro de marca (que ahora llega con select=*) + el idioma
// YA RESUELTO. Adaptado del original: en modo carril `servicio` y `extra_notes` no existen
// (van vacíos), y `language` sale de `idioma` (no de un input crudo ni del 'ES' literal).
// Toda ausencia queda como '' → applyTemplateVars la marca como no resuelta.
function buildTemplateVars(brand: any, idioma: string, cta: string, keywords: string[]): Record<string, string> {
  const b = brand ?? {};
  return {
    marca:              b.display_name ?? b.name ?? '',
    contexto_marca:     b.brand_context ?? '',
    geo_principal:      b.geo_principal ?? '',
    tono_base:          b.tono_base ?? '',
    canal_base:         b.canal_base ?? '',
    canales_activos:    Array.isArray(b.canales_activos)  ? b.canales_activos.join(', ')  : (b.canales_activos ?? ''),
    formatos_activos:   Array.isArray(b.formatos_activos) ? b.formatos_activos.join(', ') : (b.formatos_activos ?? ''),
    cta_base:           b.cta_base ?? '',
    cta_ads:            b.cta_ads ?? cta ?? '',
    diferenciador_base: b.diferenciador_base ?? '',
    disclaimer_base:    b.disclaimer_base ?? '',
    url_base:           b.url_base ?? '',
    cta_url_base:       b.cta_url_base ?? '',
    keywords_top:       (keywords ?? []).slice(0, 5).join(', '),
    grupo_3:            '',
    servicio:           '',      // no existe en modo carril
    language:           idioma,  // el idioma ya resuelto (nunca el 'ES' literal)
    extra_notes:        '',      // no existe en modo carril
  };
}

// Variables de CUMPLIMIENTO: existen para cumplir, no para decorar. Su ausencia no es
// cosmética — si un template las pide y la marca no las tiene, va cadena vacía (nunca el
// literal '[DISCLAIMER]', que parece contenido y así termina publicándose) PERO se marca
// aparte, con severidad distinta, para que el Watcher lo lea (template_vars_unresolved_compliance).
const TEMPLATE_COMPLIANCE_VARS = new Set(['disclaimer_base']);

// ── A2·a · puente plataforma → bloque de canal ──────────────────────────────
// La plataforma del carril (meta_ig, blog_forumphs, email_propietarios…) no coincide con
// canal_blocks.id (INSTAGRAM_ORGANICO, BLOG, EMAIL…). platform_canal_map es el puente:
// match por platform + traffic_type sobre filas active. Sin match → source 'none' (el
// caller avisa nominal y cae al layer genérico, nunca un default silencioso).
// forced_content_type sale de la columna content_type — hoy siempre null (ninguna fila
// organic la puebla); se devuelve para que el gancho de ADS exista desde ya, pero NO se
// cablea en este PR: si alguien la puebla, se ignora (eso es del proyecto ADS).
function resolveCanalBlockId(
  rows: any[] | null | undefined,
  platform: string,
  trafficType: string = 'organic',
): { canal_block_id: string | null; forced_content_type: string | null; source: 'map' | 'none' } {
  const p  = String(platform ?? '').trim().toLowerCase();
  const tt = String(trafficType ?? 'organic').trim().toLowerCase();
  const match = (rows ?? []).find(r =>
    r && r.active !== false &&
    String(r.platform ?? '').trim().toLowerCase() === p &&
    String(r.traffic_type ?? '').trim().toLowerCase() === tt,
  );
  if (!match) return { canal_block_id: null, forced_content_type: null, source: 'none' };
  return { canal_block_id: match.canal_block_id ?? null, forced_content_type: match.content_type ?? null, source: 'map' };
}

// ── A2·b · builders trasplantados de src/lib/buildCopyPrompt.ts ──────────────
// Trasplante del resto de bloques que buildCopyPrompt arma y /api/execute no. Todos
// puros (string ops). La forma (## headers) y el orden se alinean con buildCopyPrompt para
// que el prompt tenga UNA sola gramática — un prompt con dos formatos tiene dos autores y
// el modelo lo nota. NOTA: buildHumanizeBlock NO se trasplanta: el modelo de datos de
// humanize en /api/execute (humanize_profiles: tone/personality/authenticity_rules/
// anti_patterns) difiere del de buildCopyPrompt (humanize.value/notes); portarlo a ciegas
// rompería. El bloque humanize conserva su formato actual a propósito (ver buildPrompt).

function ensureArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return [val];
  return [];
}

// FIX-LANG-01 · ALIAS LEGACY, con fecha de retiro declarada ─────────────────
// Este mapa fue la ÚNICA fuente de la etiqueta de idioma y por eso produjo el
// defecto que FIX-LANG-01 repara: estaba indexado en MAYÚSCULAS ('ES', 'EN') y
// el código de idioma viaja por la cascada en MINÚSCULAS. `LANGUAGE_LABELS['es']`
// era `undefined`, el `?? language` imprimía el código crudo, y al escritor le
// llegaba literalmente «exclusivamente en: **es**». La palabra «neutro» nunca
// llegó al modelo.
//
// **Sólo dos entradas, y es a propósito.** La versión anterior de este mapa
// enumeraba variantes regionales —'es-ES', 'es-FL', 'es-PA', 'es-MX', 'en-US',
// 'en-FL'— más 'pt' y 'fr'. **Ninguna existe.** `select language_primary,
// count(*) from public.brands group by 1` → **14 marcas en 'es', 1 en 'en', cero
// códigos regionales** [medido 2026-08-30]. Las variantes regionales entraron en
// el mapa desde un fixture de test cuyo comentario afirmaba una forma de
// producción que nunca fue cierta (ver `PROD_SNAPSHOT` en execute.test.ts).
// Modelar una variante que ninguna marca declara no es previsión: es un camino
// vivo que nadie prueba y que ablanda el fail-loud.
//
// Un código que no esté acá y no tenga fila en `language_directives` DETIENE la
// generación. Es lo correcto: si mañana entra una marca lituana, la generación
// se para hasta que su fila esté sembrada, en vez de mandarle al escritor una
// instrucción que no dice nada.
//
// RETIRO PREVISTO: tercer PR de FIX-LANG-01, cuando `language_directives` tenga
// fila para todo código en uso.
const LANGUAGE_LABELS_LEGACY: Record<string, string> = {
  es: 'español neutro internacional',
  en: 'neutral international English',
};

// La directiva de idioma resuelta: lo que la capa de idioma inyecta al prompt.
//
// `directive_block` es el bloque COMPLETO —encabezado incluido— y viene redactado
// en la propia lengua de salida; el código no arma texto de instrucción, sólo lo
// coloca. Ése es el eje: cada idioma declarado trae su propio bloque. El texto de
// cada bloque es instancia y vive en dato.
//
// `register_type` y `register_scope` son el eje que declaró Sam el 2026-08-30:
// todo idioma del ecosistema es NEUTRO e INTERNACIONAL, sin regionalismos
// (`DELIVERY_AND_VERIFICATION_RULE` §2-BIS lo exige y hasta hoy no lo comprobaba
// nadie). Son **tokens canónicos en inglés**, no texto de prompt, y por eso NO se
// renderizan: meter la palabra «neutro» dentro de una directiva en inglés sería
// el mismo defecto que este corte repara. Lo que el modelo lee es `label` y
// `directive_block`, que ya lo dicen en su propia lengua. Lo que estos dos campos
// habilitan es la AUDITORÍA —`where register_type <> 'neutral'` responde «¿queda
// alguna variante regional viva?»— y viajan en la meta de la corrida para que la
// procedencia de cada pieza diga bajo qué registro se generó.
type LanguageDirective = {
  language_code: string;
  label: string;
  register_type: string;
  register_scope: string;
  directive_block: string;
  register_constraints: string | null;
};

// El código de idioma viaja sin forma canónica ('ES', 'es', ' es '). Se normaliza
// a minúsculas y sin espacios ANTES de cualquier búsqueda — el defecto de origen
// fue exactamente una búsqueda sobre una forma no normalizada.
function normalizeLanguageCode(code: string): string {
  return String(code ?? '').trim().toLowerCase();
}

// Resuelve la directiva del idioma declarado. Devuelve también su PROCEDENCIA,
// para que el caller la registre: una degradación al alias legacy nunca cae en
// silencio, que es el defecto que este corte repara.
//
// Precedencia — DOS pasos y un throw, sin escalones intermedios:
//   1. fila en `language_directives` (activa, con bloque no vacío)
//   2. alias legacy por código exacto → warn nominal
//   3. throw COPYLAB_LANGUAGE_DIRECTIVE_MISSING
//
// No hay caída a la subetiqueta base ('en-FL' → 'en'). La versión anterior la
// tenía, y era un escalón para cubrir códigos regionales que **ninguna marca
// declara** [medido 2026-08-30]: un camino que nadie ejerce y que convierte un
// código desconocido en una generación silenciosamente aproximada. Un código que
// no se reconoce se para y se dice.
//
// El `?? language` de la versión original —que imprimía el código crudo como si
// fuese una etiqueta— se retira aquí.
function resolveLanguageDirective(
  rows: any[] | null | undefined,
  language: string,
): { directive: LanguageDirective; source: 'table' | 'legacy_alias' } {
  const code = normalizeLanguageCode(language);

  const row = (rows ?? []).find(
    (r: any) => r && r.active !== false && normalizeLanguageCode(r.language_code) === code,
  );
  if (row && String(row.directive_block ?? '').trim()) {
    return {
      source: 'table',
      directive: {
        language_code: code,
        label: String(row.label ?? '').trim() || code,
        register_type: String(row.register_type ?? '').trim() || 'unknown',
        register_scope: String(row.register_scope ?? '').trim() || 'unknown',
        directive_block: String(row.directive_block).trim(),
        register_constraints: String(row.register_constraints ?? '').trim() || null,
      },
    };
  }

  const label = code ? LANGUAGE_LABELS_LEGACY[code] : undefined;
  if (label) return { source: 'legacy_alias', directive: legacyDirective(code, label) };

  throw new Error(
    `COPYLAB_LANGUAGE_DIRECTIVE_MISSING: sin fila en language_directives para '${code}' ` +
    `y sin alias legacy que lo cubra — sembrar la fila del idioma antes de generar en él`,
  );
}

// Respaldo mientras `language_directives` no exista ni esté sembrada. El bloque va
// REDACTADO EN LA LENGUA QUE INSTRUYE —no traducido desde el español— porque ése
// es el fondo del corte: una directiva en inglés dentro de un prompt en español
// pierde contra las ~24 capas que la rodean. Es respaldo, no destino: el destino
// es la fila, que además trae sus restricciones de registro.
function legacyDirective(code: string, label: string): LanguageDirective {
  const BLOCKS: Record<string, string> = {
    es: [
      '## IDIOMA DE OUTPUT',
      'Escribe TODO el contenido exclusivamente en **español neutro internacional**.',
      'Esta instrucción tiene prioridad absoluta sobre cualquier idioma implícito en el contexto.',
      'Neutro internacional significa: léxico comprensible en todo el ámbito hispanohablante, SIN VOSEO, sin modismos locales y sin jerga regional.',
      'El voseo se prohíbe por una razón operativa: el imperativo voseante y el pretérito son homógrafos («decidí» es a la vez una orden y un hecho consumado).',
      'No mezcles idiomas. Si un término técnico no tiene traducción natural, mantenlo en su idioma original.',
    ].join('\n'),
    en: [
      '## OUTPUT LANGUAGE',
      'Write ALL content exclusively in **neutral international English**.',
      'This instruction takes absolute priority over any language implied by the surrounding context.',
      'Neutral international means: vocabulary understood across the entire English-speaking world, with no local idioms and no regional slang.',
      'Do not mix languages. If a technical term has no natural translation, keep it in its original language.',
    ].join('\n'),
  };
  return {
    language_code: code,
    label,
    register_type: 'neutral',
    register_scope: 'international',
    register_constraints: null,
    directive_block: BLOCKS[code] ?? `## OUTPUT LANGUAGE\nWrite ALL content exclusively in ${label}.`,
  };
}

// CTA field por canal_block_id (A2·a lo resuelve). Los IDs (META_ADS, BLOG, INSTAGRAM_
// ORGANICO…) son el vocabulario que esta función espera. cta_ads sale de aquí (lo usa ADS).
function getCTAFieldForCanal(canalId: string): string {
  const adsCanals   = ['META_ADS', 'META_FEED', 'META_STORY', 'META_REEL', 'TIKTOK_ADS', 'GOOGLE_SEARCH_(RSA)', 'GOOGLE_PMAX'];
  const seoCanals   = ['BLOG', 'BLOG_HTML', 'WEB', 'WEB_HTML', 'LANDING_PAGE', 'LANDING_HTML'];
  const storyCanals = ['INSTAGRAM_ORGANICO', 'TIKTOK_ORGANICO'];
  if (adsCanals.includes(canalId))   return 'cta_ads';
  if (seoCanals.includes(canalId))   return 'cta_seo';
  if (storyCanals.includes(canalId)) return 'cta_story';
  return 'cta_smpc';
}

function getActiveCTA(ctas: any[] | null | undefined, ctaField: string, brandCtaBase: string): string {
  const cta = (ctas ?? [])[0];
  if (!cta) return brandCtaBase ?? '';
  return cta[ctaField] ?? cta.cta_smpc ?? brandCtaBase ?? '';
}

function getTopKeywords(keywords: any[] | null | undefined, limit = 10): string[] {
  return (keywords ?? []).filter((k: any) => (k.prioridad ?? 99) <= 3).slice(0, limit).map((k: any) => k.keyword);
}

function getGrupo3(keywords: any[] | null | undefined): string {
  const kw1 = (keywords ?? []).find((k: any) => (k.prioridad ?? 99) === 1);
  return kw1?.grupo_3 ?? getTopKeywords(keywords, 3).join(', ');
}

// Compliance ORDENADO: severity 'hard' primero, resto después. El caller lo numera.
function getComplianceRules(rows: any[] | null | undefined): string[] {
  const rs = rows ?? [];
  const hard = rs.filter((r: any) => r.severity === 'hard').map((r: any) => r.rule_text).filter(Boolean);
  const soft = rs.filter((r: any) => r.severity !== 'hard').map((r: any) => r.rule_text).filter(Boolean);
  return [...hard, ...soft];
}

function buildBrandBlock(brand: any): string {
  const b = brand ?? {};
  const lines = [`## MARCA: ${b.display_name ?? b.name ?? ''}`];
  if (b.brand_context)      lines.push(`Contexto: ${b.brand_context}`);
  if (b.geo_principal)      lines.push(`Geo principal: ${b.geo_principal}`);
  if (b.tono_base)          lines.push(`Tono base: ${b.tono_base}`);
  if (b.canales_activos)    lines.push(`Canales activos: ${Array.isArray(b.canales_activos) ? b.canales_activos.join(', ') : b.canales_activos}`);
  if (b.formatos_activos)   lines.push(`Formatos: ${Array.isArray(b.formatos_activos) ? b.formatos_activos.join(', ') : b.formatos_activos}`);
  if (b.cta_base)           lines.push(`CTA base: ${b.cta_base}`);
  if (b.diferenciador_base) lines.push(`Diferenciador: ${b.diferenciador_base}`);
  if (b.disclaimer_base)    lines.push(`Disclaimer: ${b.disclaimer_base}`);
  if (b.market)             lines.push(`Mercado: ${b.market}`);
  if (b.language_primary)   lines.push(`Idioma: ${b.language_primary}`);
  return lines.join('\n');
}

function buildGoalsBlock(goals: any[] | null | undefined): string {
  const gs = goals ?? [];
  if (!gs.length) return '';
  const horizonLabels: Record<string, string> = { '6m': '6 meses', '12m': '12 meses (año 1)', '24m': '24 meses (año 2)' };
  const lines = ['## OBJETIVOS ESTRATÉGICOS DE LA MARCA'];
  lines.push('Estos objetivos deben guiar el enfoque del copy — priorizar mensajes que acerquen al lector a estos resultados.');
  const grouped = gs.reduce((acc: Record<string, any[]>, goal: any) => {
    const h = goal.horizon ?? 'general';
    (acc[h] = acc[h] ?? []).push(goal);
    return acc;
  }, {});
  for (const [horizon, items] of Object.entries(grouped)) {
    const label = horizonLabels[horizon] ?? horizon;
    lines.push(`\n**Horizonte ${label}:**`);
    for (const item of (items as any[]).slice(0, 3)) {
      const kpiStr = item.kpi && item.target ? ` → KPI: ${item.kpi} ${item.target}` : '';
      lines.push(`- [${item.category?.toUpperCase() ?? 'GENERAL'}] ${item.goal ?? item.goal_text ?? ''}${kpiStr}`);
    }
  }
  return lines.join('\n');
}

function buildPersonasBlock(personas: any[] | null | undefined): string {
  const ps = personas ?? [];
  if (!ps.length) return '';
  const lines = ['## SEGMENTOS OBJETIVO (ICP)'];
  lines.push('Escribe para estas personas. Sus dolores, motivaciones y objeciones deben resonar en el copy.');
  const sorted = [...ps].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2)).slice(0, 3);
  for (const p of sorted) {
    lines.push(`\n**${p.label}** (${p.segment_type?.toUpperCase() ?? 'B2C'})`);
    if (p.age_range || p.gender || p.location) {
      lines.push(`  Perfil: ${[p.age_range, p.gender, p.location].filter(Boolean).join(' · ')}`);
    }
    if (p.pain_points?.length) lines.push(`  Dolores: ${p.pain_points.slice(0, 2).join(' | ')}`);
    if (p.motivations?.length) lines.push(`  Motivaciones: ${p.motivations.slice(0, 2).join(' | ')}`);
    if (p.objections?.length)  lines.push(`  Objeciones a superar: ${p.objections.slice(0, 2).join(' | ')}`);
    if (p.copy_hooks?.length)  lines.push(`  Hooks que convierten: ${p.copy_hooks.slice(0, 2).join(' | ')}`);
    if (p.tone_for_segment)    lines.push(`  Tono recomendado: ${p.tone_for_segment}`);
    if (p.avoid?.length)       lines.push(`  Evitar: ${p.avoid.slice(0, 2).join(' | ')}`);
    if (p.buying_trigger)      lines.push(`  Trigger de compra: ${p.buying_trigger}`);
  }
  return lines.join('\n');
}

// FIX-LANG-01 · la capa de idioma COLOCA la directiva, no la redacta. El texto
// llega ya escrito en la lengua de salida desde `language_directives`; el código
// no aporta ni una palabra de andamiaje en otro idioma, que es lo que hacía que
// una línea en inglés compitiera contra dos docenas de bloques en español.
// `register_constraints` va DENTRO del mismo bloque —lo prohibido de registro es
// parte de la instrucción de idioma, no una capa aparte— y viene redactado en esa
// misma lengua.
function buildIdiomaBlock(directive: LanguageDirective): string {
  const parts = [directive.directive_block.trim()];
  const constraints = (directive.register_constraints ?? '').trim();
  if (constraints) parts.push(constraints);
  return parts.join('\n\n');
}

function buildGeomixBlock(geo: any): string {
  if (!geo) return '';
  const lines = [`## GEOMIX — ${geo.geo}`];
  if (geo.servicios?.length) lines.push(`Servicios en esta zona: ${geo.servicios.join(', ')}`);
  if (geo.combos?.length)    lines.push(`Combos SEO: ${geo.combos.slice(0, 3).join(' | ')}`);
  lines.push(`Integrar la geo "${geo.geo}" de forma natural en el copy.`);
  if (geo.local_slang)       lines.push(`Lenguaje local: ${geo.local_slang}`);
  if (geo.cultural_refs)     lines.push(`Referencias culturales: ${geo.cultural_refs}`);
  return lines.join('\n');
}

function buildKeywordsBlock(keywords: any[] | null | undefined): string {
  const top = getTopKeywords(keywords, 10);
  if (!top.length) return '';
  const grupo3 = getGrupo3(keywords);
  return `## KEYWORDS\nPrincipales: ${top.slice(0, 5).join(', ')}` + (grupo3 ? `\nGrupo SEO (grupo_3): ${grupo3}` : '');
}

function buildCopyProfileLayer(profile: any): string {
  if (!profile) return '';
  const lines = ['## VOZ DE MARCA — BP_COPY_1.0'];
  lines.push('Aplica estos parámetros de voz con prioridad sobre cualquier configuración genérica de tono.');
  if (profile.voice_tone_primary)    lines.push(`TONO PRINCIPAL: ${profile.voice_tone_primary}`);
  if (profile.voice_tone_secondary)  lines.push(`TONO SECUNDARIO: ${profile.voice_tone_secondary}`);
  if (profile.voice_writing_style)   lines.push(`ESTILO DE ESCRITURA: ${profile.voice_writing_style}`);
  if (profile.voice_pov)             lines.push(`PUNTO DE VISTA: ${profile.voice_pov}`);
  if (profile.style_sentence_length) lines.push(`LONGITUD DE FRASES: ${profile.style_sentence_length}`);
  if (profile.style_emoji_usage)     lines.push(`USO DE EMOJIS: ${profile.style_emoji_usage}`);
  if (profile.style_cta_style)       lines.push(`ESTILO DE CTA: ${profile.style_cta_style}`);
  const hooks = ensureArray(profile.style_hooks);
  if (hooks.length)                  lines.push(`HOOKS RECOMENDADOS: ${hooks.join(' | ')}`);
  const signatures = ensureArray(profile.style_signature_phrases);
  if (signatures.length)             lines.push(`FRASES FIRMA: "${signatures.join('" | "')}"`);
  const avoid = ensureArray(profile.style_avoid_phrases);
  if (avoid.length)                  lines.push(`FRASES A EVITAR: ${avoid.join(', ')}`);
  const prohibited = ensureArray(profile.compliance_prohibited_words);
  if (prohibited.length)             lines.push(`PALABRAS PROHIBIDAS: ${prohibited.join(', ')}`);
  const disclaimers = ensureArray(profile.compliance_required_disclaimers);
  if (disclaimers.length)            lines.push(`DISCLAIMERS REQUERIDOS: ${disclaimers.join(' | ')}`);
  if (profile.compliance_rules)      lines.push(`COMPLIANCE ADICIONAL: ${profile.compliance_rules}`);
  return lines.join('\n');
}

// ── B0 · el inyector del genoma ──────────────────────────────────────────────
// Serializa un valor del genoma por las claves que la fila REALMENTE tiene — NO por nombres
// de campo hardcodeados. El bug de origen: assembleVoiceGenomeLayer interpolaba objetos jsonb
// en template literals (`${identity_anchors}` → "[object Object]") y buscaba claves internas
// (default_pattern, phases, signature_words…) que casi ninguna voz tiene, omitiendo bloques en
// silencio. Los genomas evolucionan; el serializador no debe conocer su forma.
//   • string no vacío  → `LABEL: <value>`
//   • array            → `LABEL: a, b, c`
//   • objeto           → `LABEL:` + una línea por clave (`CLAVE: valor`), recursivo UN nivel,
//                        omitiendo claves vacías
//   • null / vacío     → '' (bloque omitido)
function renderGenomeInline(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(renderGenomeInline).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    // UN nivel más: pares "clave: valor" en línea. No se baja otro nivel (evita [object Object]).
    return Object.entries(value)
      .map(([k, v]) => {
        const r = (v !== null && typeof v === 'object' && !Array.isArray(v)) ? '' : renderGenomeInline(v);
        return r ? `${k}: ${r}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}

function renderGenomeSection(label: string, value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') { const s = value.trim(); return s ? `${label}: ${s}` : ''; }
  if (typeof value === 'number' || typeof value === 'boolean') return `${label}: ${String(value)}`;
  if (Array.isArray(value)) {
    const items = value.map(renderGenomeInline).filter(Boolean);
    return items.length ? `${label}: ${items.join(', ')}` : '';
  }
  if (typeof value === 'object') {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      const rendered = renderGenomeInline(v);
      if (rendered) lines.push(`${k.toUpperCase()}: ${rendered}`);
    }
    return lines.length ? `${label}:\n${lines.join('\n')}` : '';
  }
  return '';
}

// ── COPYLAB_PURE:END ────────────────────────────────────────────────────────

// ── SUPABASE FETCH ─────────────────────────────────────────────────────────

// sb/sbArray distinguish ABSENCE from FAILURE (§6). Heredar gobierno a un motor
// fail-silent es perder la garantía: un 4xx era indistinguible de un [] vacío y
// un fallo de red se tragaba en null. Ahora:
//   • 200 + fila/[]  → dato o ausencia legítima (null / []).
//   • 4xx / 5xx      → throw con el CUERPO de la respuesta (PostgREST nombra ahí
//                      la columna ofensora).
//   • red / abort    → throw etiquetado.
// El carril etiqueta y persiste estos errores en orchestrator_jobs.error_log.
async function sb<T>(path: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
      headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
    });
  } catch (e) {
    throw new Error(`COPYLAB_SB_FETCH_FAILED ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`COPYLAB_SB_${res.status} ${path}: ${bodyText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

async function sbArray<T>(path: string): Promise<T[]> {
  let res: Response;
  try {
    res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
      headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
    });
  } catch (e) {
    throw new Error(`COPYLAB_SB_FETCH_FAILED ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`COPYLAB_SB_${res.status} ${path}: ${bodyText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// FIX-LANG-01 · TOLERANCIA TRANSITORIA — se retira con el alias legacy (tercer PR)
// El orden inviolable del corte es: PR de código → deploy → DDL → siembra. Entre el
// deploy y el DDL la tabla NO existe, y `sbArray` convierte ese 404 de PostgREST en
// throw: sin esta tolerancia, el PR que repara el idioma detendría el 100 % de las
// generaciones durante esa ventana. Acá el fallo de LECTURA del catálogo degrada al
// alias legacy y lo DECLARA con su error; el fail-loud sigue vivo donde importa —
// si además no hay alias que cubra el código, `resolveLanguageDirective` lanza.
async function fetchLanguageDirectives(): Promise<any[]> {
  try {
    return await sbArray<any>('language_directives?active=eq.true&select=*');
  } catch (e) {
    console.warn(
      `[CopyLab] no se pudo leer language_directives (${e instanceof Error ? e.message : String(e)}) — ` +
      'se cae al alias legacy de idioma; si la tabla ya está creada y sembrada, esto es un defecto a revisar',
    );
    return [];
  }
}

// ── BRAND CACHE FETCH v9.5 ─────────────────────────────────────────────────

async function fetchBrandCache(brandId: string): Promise<any | null> {
  // El fallo del snapshot NO puede caer en silencio a la ruta v1.x y de ahí a
  // null (§6.4): se avisa en cada salto. Un miss legítimo (200 + []) sí cae al
  // fallback sin ruido; un fallo duro (4xx/5xx/red) avisa nominalmente.
  try {
    const snap = await sb<{ cache_data: any }>(`brand_cache_snapshots?brand_id=eq.${encodeURIComponent(brandId)}&select=cache_data&limit=1`);
    if (snap?.cache_data) {
      console.log(`[CopyLab v9.7] snapshot hit for ${brandId}`);
      return snap.cache_data;
    }
  } catch (e) {
    console.warn(`[CopyLab] snapshot de ${brandId} falló (${e instanceof Error ? e.message : String(e)}) — probando fallback v1.x, luego fuentes directas`);
  }

  try {
    const res = await fetch(`https://unrlvl-context.vercel.app/api/brand-cache?brand_id=${encodeURIComponent(brandId)}`);
    if (res.ok) {
      console.log(`[CopyLab v9.7] brand-cache v1.x hit for ${brandId}`);
      return await res.json();
    }
    console.warn(`[CopyLab] fallback v1.x devolvió ${res.status} para ${brandId} — se consultarán las fuentes directas`);
  } catch (e) {
    console.warn(`[CopyLab] fallback v1.x de ${brandId} falló (${e instanceof Error ? e.message : String(e)}) — se consultarán las fuentes directas`);
  }

  console.log(`[CopyLab v9.7] cache miss for ${brandId} — falling back to direct queries`);
  return null;
}

// ── PIPELINE LAYER RESOLVER ────────────────────────────────────────────────

async function resolveAppliedLayers(contentType: string): Promise<string[]> {
  const layers = await sbArray<{ layer_code: string; layer_order: number }>(
    `pipeline_skills?applies_to=cs.%7B${encodeURIComponent(contentType)}%7D&active=eq.true&select=layer_code,layer_order&order=layer_order`
  );
  return layers.map(l => l.layer_code);
}

function resolveAppliedLayersFromData(contentType: string, skills: any[]): string[] {
  return skills
    .filter(s => Array.isArray(s.applies_to) && s.applies_to.includes(contentType))
    .sort((a, b) => (a.layer_order ?? 0) - (b.layer_order ?? 0))
    .map(s => s.layer_code);
}

// ── CREATIVE ENGINE ────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function applyCreativeLogic(
  _contentType: string,
  aggroLevel: number,
  previousVectorId: string | undefined,
  allVectors: CreativeVector[],
  allTensions: TensionArchitecture[],
  allAggros: AggroPreset[],
  rule: CompatibilityRule | null,
): { vector: CreativeVector | null; tension: TensionArchitecture | null; aggro: AggroPreset | null } {
  // Cambio 2 — recibe la regla YA ELEGIDA por selectCompatRule (voz > BASE), no un
  // array del que sacar rules[0]. El rules[0] era de la misma familia que los [0]
  // que ya se corrigieron aguas arriba.
  let eligibleVectors = allVectors.filter(v => {
    if (aggroLevel < v.aggro_min || aggroLevel > v.aggro_max) return false;
    if (rule) {
      if (!rule.allowed_vectors.includes(v.id)) return false;
      if (rule.excluded_vectors.includes(v.id)) return false;
    }
    if (previousVectorId && v.id === previousVectorId) return false;
    return true;
  });
  if (!eligibleVectors.length) eligibleVectors = allVectors.slice(0, 5);
  const vector = eligibleVectors.length ? pickRandom(eligibleVectors) : null;

  let eligibleTensions = allTensions.filter(t => !rule || rule.allowed_tensions.includes(t.id));
  if (!eligibleTensions.length) eligibleTensions = allTensions;
  const tension = eligibleTensions.length ? pickRandom(eligibleTensions) : null;

  const aggroId = rule?.allowed_aggro?.length
    ? pickRandom(rule.allowed_aggro)
    : `AGGRO_${Math.min(Math.max(aggroLevel, 1), 5)}`;
  const aggro = allAggros.find(a => a.id === aggroId) ?? allAggros[1] ?? null;

  return { vector, tension, aggro };
}

// ── L1.5 VOICE GENOME INJECTION ───────────────────────────────────────────

function assembleVoiceGenomeLayer(genome: VoiceGenome, idioma: string): { layer: string; voice_id: string; voice_version: string } {
  const parts: string[] = [];
  parts.push(`VOICE ID: ${genome.voice_id} v${genome.version} (maturity: ${genome.maturity})`);
  parts.push(`IDIOMA DE GENERACIÓN: ${idioma}. Reescribir desde origen en ${idioma} aplicando el mismo genoma. NUNCA traducir.`);

  // B0 — se serializa por la forma REAL de cada campo (renderGenomeSection), SIN enumerar
  // claves internas. Antes se interpolaban objetos crudos (→ [object Object]) y se buscaban
  // claves que casi ninguna voz tiene. Ausencia → warn nominal (voz + campo), no silencio.
  const sections: Array<[string, any]> = [
    ['IDENTITY ANCHORS',           genome.identity_anchors],
    ['LEXICÓN FIRMADO',            genome.lexicon_signature],
    ['LÉXICO PROHIBIDO',           genome.lexicon_forbidden],
    ['FIRMAS SINTÁCTICAS',         genome.syntactic_signatures],
    ['ARQUITECTURA ARGUMENTATIVA', genome.argumentative_architecture],
    ['POSICIÓN RELACIONAL',        genome.relational_stance],
    ['REGISTRO EMOCIONAL',         genome.emotional_register],
    ['REGISTROS PROHIBIDOS',       genome.prohibited_registers],
    ['APPLICATION CONSTRAINTS',    genome.application_constraints],
  ];
  for (const [label, value] of sections) {
    const rendered = renderGenomeSection(label, value);
    if (rendered) parts.push(rendered);
    else console.warn(`[CopyLab] voice genome '${genome.voice_id}': sección '${label}' vacía o ausente — omitida`);
  }

  parts.push(`REGLA CRÍTICA DE FIRMA:\nLos recursos firmados (trademark_word, emphatic_triplication, signature_phrases) son FIRMA, no FÓRMULA. Si se repiten en cada pieza, se vacían. Úsalos solo cuando el contenido los justifica naturalmente — si no encajan, omítelos. El voice genome modula el TONO del output; el vector creativo define el ÁNGULO de entrada. Cuando conflicten: el vector gana en arquitectura, el voice gana en superficie léxica.`);

  return {
    layer: `## L1.5 VOICE GENOME INJECTION [${genome.voice_id} v${genome.version}]\n\n${parts.join('\n\n')}`,
    voice_id: genome.voice_id,
    voice_version: genome.version,
  };
}

// ── EMAIL SEQUENCE CONTEXT ─────────────────────────────────────────────────

async function buildSequenceContext(req: ExecuteRequest): Promise<{
  previousMechanism: string; previousPiece: string; spPool: string;
}> {
  const meta = req.meta ?? {};
  const position = meta.position ?? 1;

  if (position <= 1) return { previousMechanism: 'none', previousPiece: '', spPool: '' };

  let previousMechanism = 'unknown';
  let previousPiece = '';

  const prevPieces = await sbArray<any>(
    `content_sequence_pieces?position=eq.${position - 1}&language=eq.${meta.language ?? 'ES'}&status=in.(ready,deployed)&select=mechanism_primary,subject,body_html&order=generated_at.desc&limit=1`
  );

  if (prevPieces.length) {
    previousMechanism = prevPieces[0].mechanism_primary ?? 'unknown';
    previousPiece = `Pieza anterior (position ${position - 1}): Subject: "${prevPieces[0].subject ?? ''}"`;
  }

  const spPool = (req.previousOutputs as any)['sp_pool']
    ? `Social proof disponible:\n${String((req.previousOutputs as any)['sp_pool']).slice(0, 800)}`
    : '';

  return { previousMechanism, previousPiece, spPool };
}

// ── BUILD COPY PROMPT ──────────────────────────────────────────────────────

export async function buildPrompt(req: ExecuteRequest): Promise<{
  system: string;
  user: string;
  layers_applied: string[];
  voice_id: string | null;
  voice_version: string | null;
  language: string;
  // FIX-LANG-01 — bajo qué DIRECTIVA se generó, no sólo en qué código. `source`
  // distingue la fila sembrada del alias legacy: sin él, una corrida degradada y
  // una corrida gobernada por la tabla se leen igual en la procedencia.
  language_directive: {
    code: string;
    label: string;
    register_type: string;
    register_scope: string;
    source: 'table' | 'legacy_alias';
  };
  creative_seed: { vector_id: string | null; tension_id: string | null; aggro_id: string | null; };
  cache_mode: string;
  max_tokens: number;
  max_tokens_source: string | null;
  length_budget_chars: number | null;
  title_budget_chars: number | null;
  title_budget_source: string | null;
  image_title_mode: ImageTitleMode;
  audience_cta_applied: AudienceCtaApplied;
  signature: { text: string; rule: string } | null;
  psycho_preset: string | null;
  platform_key: string | null;
  copy_profile_id: string | null;
  humanize_profile_id: string | null;
  output_template_id: string | null;
  template_vars_unresolved: string[];
  template_vars_unresolved_compliance: string[];
  rules_injected: string[];
  rules_skipped: string[];
  rules_by_instruction: string[];
  repair: { codes: string[]; original_title: string | null } | null;
}> {
  const brandId = req.brandId ?? 'DEFAULT';
  const pack    = req.params.pack ?? 'social_post_pack';
  const meta    = req.meta ?? {};

  // ── Modo carril (§3.3): la PRESENCIA de builder_input activa el carril.
  //    Consumo obligatorio y validación fail-fast en §3.4 — nada de defaults.
  const bi = req.builder_input ?? null;
  // G2-F — el encargo de reparación se lee ACÁ, con el resto de la validación fail-fast: un
  // encargo roto tiene que cortar antes de gastar queries y una llamada a Claude. `null` = modo
  // generación, y entonces nada de G2-F corre.
  let repair: RepairInput | null = null;
  if (bi) {
    if (bi.destination !== 'editorial' && bi.destination !== 'social') {
      throw new Error(`COPYLAB_DESTINATION_REQUIRED: builder_input.destination debe ser 'editorial' | 'social' (recibido: ${JSON.stringify(bi.destination ?? null)})`);
    }
    if (!bi.voice_id || !String(bi.voice_id).trim()) {
      throw new Error('COPYLAB_VOICE_ID_REQUIRED: builder_input.voice_id es obligatorio en modo carril — nunca [0]');
    }
    if (!bi.iid_brief || !String(bi.iid_brief).trim()) {
      throw new Error('COPYLAB_IID_BRIEF_REQUIRED: builder_input.iid_brief es obligatorio en modo carril');
    }
    // El brief sigue siendo obligatorio también en reparación —el contrato del carril no cambia—
    // aunque en esa pasada NO llegue al prompt: lo que se le da al escritor es la pieza, no la
    // materia prima con la que ya la escribió.
    repair = normalizeRepair(bi.repair);
  }

  const isEmailSeq       = pack.startsWith('email_sequence');
  const isProductB2C     = pack === 'product_description_pack';
  const sequenceSubType  = meta.sequence_type ?? 'generic';
  const position         = meta.position ?? 1;

  // Cambio 1 — aggroLevel, pipeline_family y output_template_id salen del registro
  // (content_type_registry), resuelto tras el Promise.all. El objeto literal
  // aggroByType se borró: era el hardcode que el registro reemplaza.

  // ── Cache resolution — per-slice suppression (§5.3) ────────────────────
  // The old design cancelled all 8 queries whenever `bc` was truthy, so a
  // present-but-hollow cache silently produced a piece with no L0. Now every
  // source decides ALONE: a slice that is absent OR empty falls through to its
  // own direct query. `isV2` as a global flag is gone (§5.3.4).
  const rawCache = (req.previousOutputs as any)?.brandContext ?? await fetchBrandCache(brandId);
  const { cache: bc, keys: cacheKeys } = normalizeCache(rawCache);
  if (rawCache && !bc) {
    console.warn(`[CopyLab] cache de marca con forma desconocida para ${brandId} — keys=[${cacheKeys.join(', ')}]; se ignora el cache y se consultan las fuentes directas`);
  }

  // A2 (2026-08-18) — `platform_canal_map` sale del Promise.all y se resuelve ACÁ, porque ahora es
  // la fuente del canal editorial y `resolveCarrilContentType` corre ANTES del Promise.all (su
  // content_type es la llave de dos de sus queries: creative_compatibility_rules y
  // content_type_registry). Con el snapshot presente es lectura de memoria y no cuesta un viaje;
  // sin snapshot es UNA query de 9 filas, serializada. El precio de tener una sola fuente de canal.
  const platformCanalMapSlice: any[] = (sliceOf(bc, 'platform_canal_map')
    ?? await sbArray<PlatformCanalMap>(`platform_canal_map?active=eq.true&select=*`)) as any[];

  // B2 — en modo carril, content_type y canal salen del MAPA (destino + plataforma + el puente
  // platform_canal_map). En modo UI `carril` es null y todo sigue saliendo del pack /
  // `req.params.canal ?? 'instagram'` (byte-idéntico).
  const carril = bi ? resolveCarrilContentType(bi.destination, bi.platform, platformCanalMapSlice) : null;
  const canal  = carril ? carril.canal : (req.params.canal ?? 'instagram');

  const creativeContentType = carril
    ? carril.content_type
    : isEmailSeq
    ? `${sequenceSubType}_${position}`
    : isProductB2C ? 'product_description_b2c'
    : pack.replace('_pack', '');

  const pipelineContentType = carril
    ? carril.content_type
    : isEmailSeq
    ? 'email_sequence'
    : isProductB2C ? 'product_description_b2c'
    : pack.replace('_pack', '');

  const eBrand = encodeURIComponent(brandId);
  const previousVectorId = (req.previousOutputs as any)?.last_creative_vector;

  // B·Fix 1 — la voz que decide la precedencia (compat + registro) se resuelve DESPUÉS del
  // Promise.all (en carril = builder_input.voice_id; en UI = el genoma resuelto). La query trae
  // TODAS las filas activas del content_type (sin filtro de voz, porque la voz de UI no se
  // conoce hasta resolver el genoma) y selectCompatRule elige con effectiveVoiceId. Así la UI
  // deja de caer SIEMPRE en BASE. (Sin filtro de voz tampoco hay riesgo del 400 de PostgREST.)

  const [
    brand, humRows, goalsList, personasList, complianceRows, kwList, ctaList, cp,
    genomes, allVectors, allTensions, allAggros, compatSliceRaw,
    pipelineSkillsSlice, outputTemplatesSlice, contentTypeRegistrySlice,
    canalBlocksSlice, geomixSlice, languageDirectivesSlice, seqContext,
  ] = await Promise.all([
    // select=* (A1): las variables de template necesitan cta_base, diferenciador_base,
    // disclaimer_base, url_base, cta_url_base, geo_principal, tono_base, canales_activos,
    // formatos_activos, brand_context. Por snapshot ya vienen (el escritor usa select=*);
    // por query directa NO, y sin esto las variables saldrían vacías en silencio.
    (sliceOf(bc, 'brands')?.[0]) ?? sb<any>(`brands?id=eq.${eBrand}&select=*`),
    // humanize: marca Y DEFAULT juntas; la precedencia la resuelve selectHumanize,
    // no `[0]` (que sería el DEFAULT, mergeado primero — §5.3.6 / A2).
    sliceOf(bc, 'humanize_profiles') ?? sbArray<any>(`humanize_profiles?brand_id=in.(${eBrand},DEFAULT)&select=*`),
    // A2·b — select=* : buildGoalsBlock necesita horizon/kpi/target/category/goal (antes
    // sólo goal_text,priority → sin horizonte ni KPI).
    sliceOf(bc, 'brand_goals') ?? sbArray<any>(`brand_goals?brand_id=eq.${eBrand}&select=*&order=priority`),
    sliceOf(bc, 'brand_personas') ?? sbArray<any>(`brand_personas?brand_id=eq.${eBrand}&active=eq.true&select=*&order=priority`),
    // A2·b — +severity : getComplianceRules ordena hard primero (antes sólo rule_text).
    sliceOf(bc, 'compliance_rules') ?? sbArray<any>(`compliance_rules?brand_id=eq.${eBrand}&active=eq.true&select=rule_text,severity`),
    // A2·b — select=* : buildKeywordsBlock filtra por prioridad≤3 y usa grupo_3 (antes keyword,type).
    sliceOf(bc, 'keywords') ?? sbArray<any>(`keywords?brand_id=eq.${eBrand}&active=eq.true&select=*&order=prioridad&limit=50`),
    sliceOf(bc, 'ctas') ?? sbArray<any>(`ctas?brand_id=eq.${eBrand}&select=*&active=eq.true&limit=5`),
    (sliceOf(bc, 'brand_copy_profiles')?.[0]) ?? sb<any>(`brand_copy_profiles?brand_id=eq.${eBrand}&active=eq.true&select=*`),
    sliceOf(bc, 'brand_voice_genome') ?? sbArray<any>(`brand_voice_genome?brand_id=eq.${eBrand}&active=eq.true&order=version.desc`),
    sliceOf(bc, 'creative_vectors') ?? sbArray<CreativeVector>('creative_vectors?active=eq.true&select=id,category,label,instruction,aggro_min,aggro_max'),
    sliceOf(bc, 'tension_architectures') ?? sbArray<TensionArchitecture>('tension_architectures?active=eq.true&select=id,label,instruction,curve'),
    sliceOf(bc, 'aggro_presets') ?? sbArray<AggroPreset>('aggro_presets?active=eq.true&select=id,level,label,instruction,anti_hedging&order=level'),
    sliceOf(bc, 'creative_compatibility_rules') ?? sbArray<CompatibilityRule>(`creative_compatibility_rules?content_type=eq.${encodeURIComponent(creativeContentType)}&active=eq.true&select=*`),
    sliceOf(bc, 'pipeline_skills'),
    sliceOf(bc, 'output_templates'),
    sliceOf(bc, 'content_type_registry') ?? sbArray<ContentTypeRegistry>(`content_type_registry?content_type=in.(${encodeURIComponent(creativeContentType)},${encodeURIComponent(pipelineContentType)})&active=eq.true&select=*`),
    // A2·a — canal_blocks (block_text por id). `platform_canal_map` ya NO está acá: A2 (2026-08-18)
    // lo subió antes del Promise.all porque el canal editorial se resuelve con él y esa resolución
    // corre antes (ver el bloque `carril`). Sólo se leen en modo carril.
    sliceOf(bc, 'canal_blocks') ?? sbArray<any>(`canal_blocks?active=eq.true&select=*`),
    // A2·b — geomix por marca (buildGeomixBlock). Se omite el bloque si la marca no tiene fila.
    sliceOf(bc, 'geomix') ?? sbArray<any>(`geomix?brand_id=eq.${eBrand}&active=eq.true&select=*`),
    // FIX-LANG-01 — directivas de idioma. Catálogo del sistema, no de marca: se
    // indexa por CÓDIGO DE IDIOMA y una marca nueva de otro país entra con un
    // INSERT, sin tocar este archivo. Va en el Promise.all —como creative_vectors
    // o aggro_presets— para no añadir un viaje serializado: el código de idioma
    // todavía no está resuelto acá, pero la tabla es pequeña y se filtra en memoria.
    sliceOf(bc, 'language_directives') ?? fetchLanguageDirectives(),
    isEmailSeq ? buildSequenceContext(req) : Promise.resolve({ previousMechanism: 'none', previousPiece: '', spPool: '' }),
  ]);

  const hum = selectHumanize(humRows as any[], brandId);

  // A2·b — compliance ORDENADO (severity 'hard' primero), la capa lo numera.
  const complianceRules = getComplianceRules(complianceRows as any[]);
  // A2·b — geomix: primera fila de la marca (getGeomix sin geo → geomix[0]); null → bloque omitido.
  const geomixRow = (geomixSlice as any[])[0] ?? null;

  // Language precedence — no 'ES' literal, no default (§5.3.3). brand may come
  // from cache slice or from the direct query above; either way its real
  // language_primary is honoured before anything falls to an error.
  const idioma = resolveLanguage(bi?.language, meta.language, req.params.idioma, brand?.language_primary);
  if (!idioma) {
    throw new Error(`COPYLAB_LANGUAGE_UNRESOLVED: sin idioma para ${brandId} — declarar builder_input.language, meta.language, params.idioma o brands.language_primary`);
  }

  // FIX-LANG-01 — la directiva del idioma declarado sale de `language_directives`.
  // Mientras la tabla no exista o no tenga la fila, cae al alias legacy y lo DICE:
  // la degradación se registra con el código y la procedencia, nunca en silencio.
  const { directive: languageDirective, source: languageDirectiveSource } =
    resolveLanguageDirective(languageDirectivesSlice as any[], idioma);
  if (languageDirectiveSource !== 'table') {
    console.warn(
      `[CopyLab] sin fila en language_directives para '${normalizeLanguageCode(idioma)}' (${brandId}) — ` +
      `se usa el alias legacy (etiqueta '${languageDirective.label}'); ` +
      `sembrar la fila para que la directiva llegue redactada en su propia lengua`,
    );
  }

  // ── Cambio 1 · el registro decide, en DOS ejes ─────────────────────────────
  // El registro se lee con dos llaves distintas, cada campo con la suya:
  //   • aggro_default: cadena creativeContentType → pipelineContentType → 2. Replica
  //     EXACTAMENTE el viejo aggroByType (que caía en creative y luego en pipeline);
  //     así abandoned_cart_2 (creativo) conserva su aggro 4 aunque el pipeline sea
  //     'email_sequence' (aggro 2). Aplastar los dos ejes en uno bajaría ese 4 a 2.
  //   • pipeline_family / output_template_id: SIEMPRE por pipelineContentType, nunca
  //     del creativo (el template de la secuencia vive en la fila del pipeline).
  // Una sola query trajo ambas filas (in.(creative,pipeline)); si coinciden, PostgREST
  // devuelve una y la resolución es idéntica. Snapshot: trae TODAS → se busca por llave.
  // B·Fix 1 — genoma + voz efectiva ANTES de la precedencia (compat + registro). En UI la voz
  // sale del genoma resuelto (antes la UI no alimentaba la voz y caía SIEMPRE en BASE).
  const genome = selectGenome(genomes as any[], bi?.voice_id, brandId);
  const voiceGenomeResult = genome
    ? assembleVoiceGenomeLayer(genome, languageDirective.label)
    : { layer: null, voice_id: null, voice_version: null };
  const effectiveVoiceId = bi?.voice_id ?? genome?.voice_id ?? null;

  // B·Fix 2 — el registro también resuelve por eje de voz (misma precedencia voz→BASE que la
  // compatibilidad): reusa selectCompatRule sobre las filas del registro (content_type + voice_id).
  // La fila con voice_id === effectiveVoiceId gana a la BASE (voice_id null). Si el registro aún no
  // tiene columna/filas de voz, todas son BASE → comportamiento previo (goldens intactos).
  const registryRows = (contentTypeRegistrySlice as ContentTypeRegistry[]).filter((r: any) => r.active !== false);
  const registryFor = (ct: string): ContentTypeRegistry | null =>
    (selectCompatRule(registryRows as any[], ct, effectiveVoiceId).rule as ContentTypeRegistry | null);
  const registryByCreative = registryFor(creativeContentType);
  const registryByPipeline = creativeContentType === pipelineContentType
    ? registryByCreative
    : registryFor(pipelineContentType);

  const aggroLevel = registryByCreative?.aggro_default ?? registryByPipeline?.aggro_default ?? 2;
  if (registryByCreative?.aggro_default == null && registryByPipeline?.aggro_default == null) {
    console.warn(`[CopyLab] sin content_type_registry para ${brandId} (creativo=${creativeContentType} · pipeline=${pipelineContentType}) — aggro degradado a ?? 2`);
  }
  // pipeline_family y output_template_id: SIEMPRE por pipelineContentType.
  const pipelineFamily = registryByPipeline?.pipeline_family ?? pipelineContentType;

  // Creative engine — resolved per-slice; a genuinely empty catalogue or a
  // missing compatibility rule degrades, but NEVER in silence (§5.3.4 / §7).
  // Cambio 2 — la precedencia por voz: la fila de la voz gana a la BASE; si sólo hay
  // BASE habiendo voz declarada, es degradación (warn distinto); si no hay ninguna,
  // el motor cae a filtro por aggro (warn que nombra la voz, no sólo el tipo).
  const { rule: compatRule, source: compatSource } = selectCompatRule(
    compatSliceRaw as any[], creativeContentType, effectiveVoiceId,
  );
  if (!(allVectors as CreativeVector[]).length) {
    console.warn(`[CopyLab] sin creative_vectors para ${brandId} (content_type=${creativeContentType}) — motor creativo degradado`);
  } else if (compatSource === 'none') {
    console.warn(`[CopyLab] sin creative_compatibility_rules para ${brandId} content_type=${creativeContentType} voice=${effectiveVoiceId ?? '∅'} (ni fila de voz ni BASE) — selección degradada a filtro por aggro`);
  } else if (compatSource === 'base' && effectiveVoiceId) {
    console.warn(`[CopyLab] creative_compatibility_rules usando fila BASE — ${effectiveVoiceId} no tiene la suya (content_type=${creativeContentType})`);
  }
  const creativeCombo = applyCreativeLogic(
    creativeContentType, aggroLevel, previousVectorId,
    allVectors as CreativeVector[], allTensions as TensionArchitecture[],
    allAggros as AggroPreset[], compatRule,
  );

  // Cambio 1 — las capas se resuelven por pipeline_family (el vocabulario que
  // pipeline_skills.applies_to realmente habla: post/blog/email), no por el
  // content_type crudo.
  const appliedLayers = pipelineSkillsSlice
    ? resolveAppliedLayersFromData(pipelineFamily, pipelineSkillsSlice)
    : await resolveAppliedLayers(pipelineFamily);

  // Cambio 1 — outputTemplate por id === registry[pipelineContentType].output_template_id.
  // NULL → null sin query y sin warn (ausencia declarada). Sin fila de pipeline en el
  // registro → comportamiento actual (por category), nunca throw.
  let outputTemplate: OutputTemplate | null = null;
  if (registryByPipeline) {
    const tid = registryByPipeline.output_template_id;
    if (tid) {
      outputTemplate = outputTemplatesSlice
        ? (outputTemplatesSlice.find((t: any) => t.id === tid && t.active !== false) ?? null)
        : await sb<OutputTemplate>(`output_templates?id=eq.${encodeURIComponent(tid)}&active=eq.true&select=id,name,category,template_text&limit=1`);
    }
  } else {
    outputTemplate = outputTemplatesSlice
      ? (outputTemplatesSlice.find((t: any) => t.category === pipelineContentType && t.active !== false) ?? null)
      : await sb<OutputTemplate>(`output_templates?category=eq.${encodeURIComponent(pipelineContentType)}&active=eq.true&select=id,name,category,template_text&limit=1`);
  }

  const bcShape = bc?._shape ?? null;

  // Psycho preset — injection_copy TEXTUAL desde public.psycho_presets (§3.4).
  // Un preset inexistente o inactivo es ERROR, no default: escribir con un
  // estímulo que nadie declaró es el sesgo que la Ruta B vino a matar, y gate7
  // juzgaría contra un preset que el Builder nunca aplicó.
  let psychoInjection: string | null = null;
  if (bi?.psycho_preset) {
    const preset = await sb<{ id: string; injection_copy: string }>(
      `psycho_presets?id=eq.${encodeURIComponent(bi.psycho_preset)}&active=eq.true&select=id,injection_copy`,
    );
    if (!preset) {
      throw new Error(`COPYLAB_PSYCHO_PRESET_NOT_FOUND: psycho_preset '${bi.psycho_preset}' no existe o está inactivo en public.psycho_presets`);
    }
    psychoInjection = preset.injection_copy ?? null;
  }

  // Watcher rules → bloque citable por código (§3.4). [] es legítimo. Una regla
  // sin statement se registra en rules_skipped en vez de inyectarse muda.
  // B2 — PR-1 manda TODAS las reglas del Watcher (sin filtrar por kind); acá se filtran a las IMPERATIVAS
  // (prohibition|requirement|proof) antes de inyectar: las órdenes. Las de similitud/duplicación se
  // verifican aguas abajo, no se prescriben — no se inyectan ni cuentan como skipped.
  //
  // D2 (2026-08-18) — se prefiere `instruction` y se cae a `statement`. El fallback es lo que hace
  // que esto se pueda desplegar hoy: 58 de las 62 reglas todavía no tienen redacción propia y siguen
  // llegando exactamente como hoy, así que el ratio mejora regla por regla en vez de en un salto.
  // `rules_by_instruction` / `rules_by_statement` cuentan de dónde vino cada una: sin esa marca no se
  // puede saber si una mejora del ratio vino de la redacción o del azar de generación, que es
  // justamente lo que la medición tiene que distinguir.
  const rulesInjected: string[] = [];
  const rulesSkipped: string[] = [];
  const rulesByInstruction: string[] = [];
  let watcherRulesBlock: string | null = null;
  if (bi) {
    const lines: string[] = [];
    for (const r of filterCarrilImperativeRules(bi.rules)) {
      const instruction = String(r?.instruction ?? '').trim();
      const statement   = String(r?.statement ?? '').trim();
      const text = instruction || statement;
      if (r && text) {
        rulesInjected.push(r.code);
        if (instruction) rulesByInstruction.push(r.code);
        lines.push(`- [${r.code}${r.kind ? ' · ' + r.kind : ''}] ${text}`);
      } else if (r) {
        rulesSkipped.push(r.code ?? '∅');
      }
    }
    if (lines.length) {
      watcherRulesBlock = `REGLAS DEL WATCHER (citables por código — el stage 5 juzga con estas mismas):\n${lines.join('\n')}`;
    }
  }

  // claims → bloque citable de CIFRAS (A1·CAMBIO 8). Ausente / vacío → null → sin bloque.
  const claimsBlock = buildClaimsBlock(bi?.claims);

  // C1 — mecanismo + caso concreto: el material de escritura. Ausentes → null → sin bloque.
  const writingMaterialBlock = buildWritingMaterialBlock(bi?.mechanism, bi?.case_examples ?? bi?.case_example);

  // audience_frame → política de CTA (C.3 · G2-C). Sin frente declarado no hay bloque; un frente
  // que el mapa no cubre corta el request con nombre propio (AUDIENCE_FRAME_UNKNOWN) en vez de
  // emitir el encabezado con la política vacía debajo.
  const { key: audienceCtaApplied, block: audienceCtaBlock } = resolveAudienceCta(bi?.audience_frame);

  // signature — surfaced, NUNCA estampada (§4.3). Se estampa en el carril
  // (finalizePiece) DESPUÉS del PASS del Watcher.
  const signature = deriveSignature(bi?.rules);

  const { vector, tension, aggro } = creativeCombo;
  const { layer: voiceLayer, voice_id, voice_version } = voiceGenomeResult;

  // A2·b — orden de capas alineado con buildCopyPrompt (una sola gramática):
  //   contexto → restricciones → ángulo creativo → forma de salida → instrucción.
  const layers: string[] = [];

  // ── IDIOMA — PRIMERO Y ÚLTIMO ─────────────────────────────────────────────
  // FIX-LANG-01. Antes esta capa era la 4.ª de ~28 y las ~24 que la seguían están
  // redactadas en español, sea cual sea el idioma de salida (## CANAL, VOZ DE MARCA,
  // ## COMPLIANCE, L1.5, reglas del Watcher, ## PRESUPUESTO DE LONGITUD, ## TÍTULO…).
  // Una instrucción de idioma sepultada entre dos docenas de bloques en otra lengua
  // compite con ellos y pierde: la pieza e3c9acc3 de UnrealvilleStudio tenía
  // meta.language='en' y salió en español. Este corte NO traduce el andamiaje —eso es
  // otro corte—: antepone la directiva y la REPITE al cierre, que es la contramedida
  // barata y no cuesta tokens significativos.
  const idiomaBlock = buildIdiomaBlock(languageDirective);
  layers.push(idiomaBlock);                                            // idioma — apertura

  // ── CONTEXTO ──────────────────────────────────────────────────────────────
  layers.push(buildBrandBlock(brand));                                  // ## MARCA

  const goalsBlock = buildGoalsBlock(goalsList as any[]);
  if (goalsBlock) layers.push(goalsBlock);                              // ## OBJETIVOS ESTRATÉGICOS

  const personasBlock = buildPersonasBlock(personasList as any[]);
  if (personasBlock) layers.push(personasBlock);                       // ## SEGMENTOS OBJETIVO (ICP)

  // A2·a — bloque de canal REAL en modo carril: platform_canal_map (plataforma → canal_block_id)
  // + canal_blocks.block_text. Sin bi (UI): layer genérico. canalBlockId se reusa para el CTA.
  let canalBlockId: string | null = null;
  // A2·b — gramática unificada: el fallback genérico también es `## CANAL` (en carril es
  // `## CANAL: <id>` con block_text). El 'UI no cambia' era condición de A2·a por el golden
  // byte-idéntico; A2·b reescribe el golden, así que se unifica el header.
  let canalLayer = `## CANAL: ${canal.toUpperCase()}\nAdapta longitud, tono y formato al canal.`;
  if (bi) {
    const { canal_block_id, source } = resolveCanalBlockId(platformCanalMapSlice as any[], bi.platform, 'organic');
    canalBlockId = canal_block_id;
    if (source === 'none') {
      console.warn(`[CopyLab] sin platform_canal_map para plataforma '${bi.platform}' (traffic_type=organic) — cae al layer de canal genérico`);
    } else {
      const block = (canalBlocksSlice as any[]).find((c: any) => c && c.id === canal_block_id && c.active !== false) ?? null;
      if (block?.block_text && String(block.block_text).trim()) {
        canalLayer = `## CANAL: ${canal_block_id}\n${block.block_text}`;
      } else {
        console.warn(`[CopyLab] canal_blocks '${canal_block_id}' ausente o sin block_text (plataforma '${bi.platform}') — cae al layer de canal genérico`);
      }
    }
  }
  layers.push(canalLayer);                                             // ## CANAL / genérico

  // Humanize — A2·b: NO se armoniza al formato buildCopyPrompt a propósito. El modelo de
  // datos difiere: acá humanize_profiles trae tone/personality/authenticity_rules/anti_patterns
  // (selectHumanize); buildCopyPrompt.buildHumanizeBlock espera humanize.value/notes. Portarlo
  // a ciegas rompería. Se conserva este formato hasta unificar el modelo de datos aguas arriba.
  if (hum) {
    layers.push(`VOZ DE MARCA — BASE (L1):\nTono: ${hum.tone ?? ''}\nPersonalidad: ${hum.personality ?? ''}\nReglas de autenticidad: ${hum.authenticity_rules ?? ''}\nAnti-patterns: ${Array.isArray(hum.anti_patterns) ? (hum.anti_patterns as string[]).join(', ') : hum.anti_patterns ?? ''}`);
  }

  const geomixBlock = buildGeomixBlock(geomixRow);
  if (geomixBlock) layers.push(geomixBlock);                          // ## GEOMIX (omitido si no hay fila)

  const keywordsBlock = buildKeywordsBlock(kwList as any[]);
  if (keywordsBlock) layers.push(keywordsBlock);                      // ## KEYWORDS (prioridad≤3 + grupo_3)

  // ── RESTRICCIONES ─────────────────────────────────────────────────────────
  // CTA por canal_block_id (A2·a). UI / sin canal → cta_smpc. cta_ads sale de aquí.
  const ctaField  = getCTAFieldForCanal(canalBlockId ?? '');
  const ctaActive = getActiveCTA(ctaList as any[], ctaField, brand?.cta_base ?? '');
  if (ctaActive) layers.push(`## CTA ACTIVO\n${ctaActive}`);

  if (complianceRules.length) {                                       // ## COMPLIANCE (hard primero, numerado)
    layers.push(`## COMPLIANCE — REGLAS OBLIGATORIAS\n` + complianceRules.map((r, i) => `${i + 1}. ${r}`).join('\n'));
  }

  const copyProfileBlock = buildCopyProfileLayer(cp);
  if (copyProfileBlock) layers.push(copyProfileBlock);               // ## VOZ DE MARCA — BP_COPY_1.0

  if (voiceLayer) layers.push(voiceLayer);                           // L1.5 genoma — override de ADN, DESPUÉS del copy profile

  if (watcherRulesBlock) layers.push(watcherRulesBlock);
  if (claimsBlock)       layers.push(claimsBlock);        // las cifras que SÍ se pueden escribir
  if (writingMaterialBlock) layers.push(writingMaterialBlock);   // y con qué desarrollarlas
  if (audienceCtaBlock)  layers.push(audienceCtaBlock);

  const extra = req.params.extra_instructions ?? '';
  if (extra) layers.push(`INSTRUCCIONES ESPECÍFICAS: ${extra}`);

  const prevEntries = Object.entries(req.previousOutputs).filter(
    ([lab]) => !['brandContext', 'last_creative_vector', 'sp_pool'].includes(lab)
  );
  if (prevEntries.length) {
    layers.push(`OUTPUTS ANTERIORES:\n${prevEntries.map(([l, o]) => `[${l.toUpperCase()}]: ${String(o).slice(0, 300)}`).join('\n')}`);
  }

  if (isEmailSeq && seqContext) {
    const seqLayers: string[] = [];
    seqLayers.push(`SEQUENCE TYPE: ${sequenceSubType} | POSITION: ${position} | LANGUAGE: ${idioma}`);
    if (seqContext.previousMechanism !== 'none') {
      seqLayers.push(`SEQUENCE RULE — CRÍTICA:\n- Mecanismo anterior: ${seqContext.previousMechanism}\n- Tu mecanismo DEBE ser diferente en eje.\n- ${seqContext.previousPiece}`);
    }
    if (position === 2) {
      seqLayers.push(`CART B RULES:\n- Incluir producto: {{ item.product_title }}, {{ item.image_url }}, {{ item.price }}\n- Social proof real (no inventar quotes)\n- PSY-SCARCITY = escasez de oportunidad, NUNCA de inventario`);
    }
    if (seqContext.spPool) seqLayers.push(seqContext.spPool);
    if (meta.psycho_presets?.length) seqLayers.push(`PSYCHO PRESETS (en arquitectura, no en copy): ${meta.psycho_presets.join(', ')}`);
    layers.push(`EMAIL SEQUENCE CONTEXT:\n${seqLayers.join('\n\n')}`);
  }

  if (psychoInjection) {
    layers.push(`PSICO-ESTÍMULO [${bi?.psycho_preset}] (en arquitectura, no en superficie):\n${psychoInjection}`);
  }

  // ── ÁNGULO CREATIVO ───────────────────────────────────────────────────────
  if (bi && bi.angle && bi.angle.trim()) {
    layers.push(`EJE ESTRUCTURAL:\n${bi.angle.trim()}`);
  }
  if (vector) layers.push(`## L14 CREATIVE VECTOR [${vector.id} · ${vector.label}]\nAplica este vector de apertura. No lo nombres — ejecútalo.\n${vector.instruction}`);
  if (tension) layers.push(`## L15 TENSION ARCHITECTURE [${tension.id} · ${tension.label}]\nCurva: ${tension.curve}\n${tension.instruction}`);
  if (aggro)   layers.push(`## L16 AGGRO DIAL [${aggro.id} · ${aggro.label}]\n${aggro.instruction}\n\nANTI-HEDGING:\n${aggro.anti_hedging}\n\nEl objetivo es la conversión. El copy sirve a ese objetivo sin disculparse por ello.`);

  // ── FORMA DE SALIDA (último bloque antes de la instrucción) ────────────────
  // G1-D — cuánto ESPACIO tiene la pieza es forma de salida, igual que el template: va en esta
  // banda, no entre las restricciones. Antes del template a propósito — el template cierra las
  // capas, como dice la línea de abajo. Sin techo declarado no hay bloque y el prompt queda
  // byte-idéntico al de hoy (modo UI y emisores anteriores a F1, intactos).
  const declaredCeiling = readDeclaredMaxTokens(bi?.max_tokens);
  const lengthBudgetChars = lengthBudgetCharsFor(declaredCeiling);
  const lengthBudgetBlock = buildLengthBudgetBlock(declaredCeiling);
  if (lengthBudgetBlock) layers.push(lengthBudgetBlock);              // ## PRESUPUESTO DE LONGITUD

  // BRIEF 8 · A — la sección ## TÍTULO va en la misma banda de FORMA DE SALIDA y DESPUÉS del
  // presupuesto de longitud: primero cuánto espacio tiene la pieza, después qué clase de frase la
  // encabeza. Sólo en modo carril — el modo UI no tiene destino ni contrato title/body y su prompt
  // queda byte-idéntico al de hoy.
  const titleBudgetChars = bi ? readTitleBudgetChars(bi.title_budget_chars) : null;
  // BRIEF-04 — el modo llega resuelto por el canal. En `echo` las dos líneas de abajo producen el
  // prompt de siempre, byte a byte: el bloque de diálogo no se empuja y el de título no cambia.
  const imageTitleMode = bi ? readImageTitleMode(bi.image_title_mode) : 'echo';
  if (bi && imageTitleMode === 'dialogue') {
    layers.push(buildImageDialogueBlock(titleBudgetChars));                 // ## IMAGEN Y TÍTULO
  }
  if (bi) layers.push(buildTitleBlock(titleBudgetChars, bi.destination, imageTitleMode));   // ## TÍTULO

  // A1 — sustituir variables del template ANTES de inyectarlo; nunca {{...}} crudo. El template
  // dice QUÉ FORMA tiene la salida → va al final, cerrando las capas creativas, no compitiendo.
  // FIX-LANG-01 — el idioma se REPITE al cierre, antes del template de output: es lo
  // último que el escritor lee antes del formato de salida, después de las ~24 capas
  // en español que lo separan de la apertura. Misma directiva, misma fuente, sin
  // reformular: dos colocaciones del mismo bloque, no dos instrucciones.
  layers.push(idiomaBlock);                                            // idioma — cierre

  let templateVarsUnresolved: string[] = [];
  let templateVarsUnresolvedCompliance: string[] = [];
  if (outputTemplate?.template_text) {
    const ctaForVars = ctaActive || ((ctaList as any[])[0]?.cta_smpc ?? '');
    const templateVars = buildTemplateVars(brand, idioma, ctaForVars, (kwList as any[]).map((k: any) => k.keyword));
    const { text: filledTemplate, unresolved } = applyTemplateVars(outputTemplate.template_text, templateVars);
    templateVarsUnresolved = unresolved;
    templateVarsUnresolvedCompliance = unresolved.filter(k => TEMPLATE_COMPLIANCE_VARS.has(k));
    const cosmetic = unresolved.filter(k => !TEMPLATE_COMPLIANCE_VARS.has(k));
    if (cosmetic.length) {
      console.warn(`[CopyLab] template ${outputTemplate.id} (${outputTemplate.name}) — variables sin valor, se inyectan vacías (nunca el placeholder crudo): ${cosmetic.join(', ')}`);
    }
    // Cumplimiento: severidad distinta (error), nombrando la variable — el Watcher lo lee.
    if (templateVarsUnresolvedCompliance.length) {
      console.error(`[CopyLab][COMPLIANCE] template ${outputTemplate.id} (${outputTemplate.name}) — variable(s) de cumplimiento SIN valor, se inyectan vacías (${brandId} no las tiene): ${templateVarsUnresolvedCompliance.join(', ')}`);
    }
    layers.push(`## TEMPLATE DE OUTPUT [${outputTemplate.name}]\n${filledTemplate}`);
  }

  const cacheMode = bcShape === 'snapshot' ? 'v2.0_per_slice'
    : bcShape === 'context_json' ? 'context_json_per_slice'
    : 'no_cache';
  const system = `Eres CopyLab v9.7, el motor de copy de UNRLVL Studio. Content Pipeline v2.6.\n\n${layers.join('\n\n---\n\n')}`;

  let userInstruction: string;
  if (isEmailSeq) {
    userInstruction = `Genera la pieza de email sequence:\n\nFORMATO OBLIGATORIO:\n---SUBJECT---\n[subject — máx 50 chars]\n\n---PREVIEW---\n[preview text — máx 90 chars]\n\n---BODY---\n[body completo. Variables Klaviyo: {{ person.first_name }}, {{ item.product_title }}, {{ item.image_url }}, {{ item.price }}. Sin markdown. Sin links directos.]\n\n---CTA---\n[texto del botón — máx 6 palabras — orientado al resultado]\n---END---\n\nGenera ahora. Sin preámbulos.`;
  } else {
    const packInstructions: Record<string, string> = {
      social_post_pack: 'Hook (1 línea) + Cuerpo (3-5 líneas) + CTA + hashtags.',
      ad_copy_pack: 'Headline (máx 40 chars) + Descripción (máx 125 chars) + CTA. Versión A y B.',
      email_pack: 'Asunto (máx 50) + Preview + Cuerpo (4-6 párrafos) + CTA + Firma.',
      blog_pack: 'Título SEO + Intro (150 palabras) + 3 secciones H2 + Conclusión + Meta.',
      seo_meta_pack: 'Title (máx 60) + Meta description (máx 155) + H1 + 3 títulos alternativos.',
      video_podcast_script: 'Intro hook (15s) + Bloques HOST/GUEST + Outro + CTA.',
      landing_page_pack: 'Hero headline + Subheadline + 3 beneficios + SP placeholder + CTA.',
      product_description_pack: (() => {
        const isKit = (req.previousOutputs as any)?.product?.product_type === 'kit';
        const product = (req.previousOutputs as any)?.product ?? null;
        let kitBlock = '';
        if (isKit && product) {
          const components = (product.kit_components ?? [])
            .map((c: any) => `  - ${c.name} ${c.size} ($${c.price_individual}) · rol: ${c.role}`)
            .join('\n');
          kitBlock = `\n\nKIT COMPOSITION:\nComponentes: \n${components}\nValor individual: $${product.kit_value_individual} | Precio kit: $${product.price} | Ahorro: $${product.kit_savings_amount} (${product.kit_savings_pct}% OFF)\nTagline: "${product.tagline}"`;
        }
        return `Título SEO del producto (máx 70 chars) + Descripción corta (2-3 líneas, beneficio principal del ${isKit ? 'ritual completo' : 'producto'}) + Descripción larga (3-4 párrafos: pain point → mecanismo → beneficio sentido → social proof placeholder) + Bullet points de características (5-7 bullets, beneficio no feature) + ${isKit ? 'Bloque KIT_VALUE: qué incluye + valor vs precio + % ahorro + "envío gratis incluido" +' : ''} Bloque HOW_TO_USE separado (orden + frecuencia + cantidad por paso) + CTA de ficha.${kitBlock}`;
      })(),
    };
    userInstruction = `PACK: ${pack}\n\n${packInstructions[pack] ?? 'Genera el copy apropiado para este pack.'}\n\nGenera ahora. Sin preámbulos.`;
  }

  // Carril mode overrides the user instruction: destination drives the format
  // (editorial → TÍTULO: sentinel; social → body only) and the iid_brief is the
  // neutral raw material — interpret it, NEVER copy it verbatim (§3.4 / §4.3).
  if (bi) {
    // BRIEF 8 · A — el título es obligatorio en los DOS destinos. Antes, la rama social decía
    // literalmente «Sin título, sin la etiqueta "TÍTULO:"»: el overlay no tenía qué componer porque
    // el escritor tenía prohibido escribirlo. Ahora lo que cambia entre destinos es DÓNDE vive el
    // título, no si existe.
    const fmt = buildCarrilFormatBlock(bi.destination, imageTitleMode);
    // G2-F — lo ÚNICO que cambia en modo reparación: la tarea. El mismo bloque de formato (la pieza
    // vuelve con la forma con la que salió) y el mismo system de arriba —voz, genoma, reglas,
    // presupuesto—; en lugar de la materia prima, la pieza escrita y las instrucciones que violó.
    userInstruction = repair
      ? buildRepairInstruction(fmt, repair, lengthBudgetChars)
      : `${fmt}\n\nMATERIA PRIMA (IID BRIEF) — interprétala, NUNCA la copies textualmente:\n${bi.iid_brief}\n\nGenera ahora. Sin preámbulos.`;
  }

  return {
    system,
    user: userInstruction,
    layers_applied: appliedLayers,
    voice_id,
    voice_version,
    language: idioma,
    language_directive: {
      code: languageDirective.language_code,
      label: languageDirective.label,
      register_type: languageDirective.register_type,
      register_scope: languageDirective.register_scope,
      source: languageDirectiveSource,
    },
    creative_seed: {
      vector_id: vector?.id ?? null,
      tension_id: tension?.id ?? null,
      aggro_id: aggro?.id ?? null,
    },
    cache_mode: cacheMode,
    // G1-D — lo que se le manda a la API: el techo declarado CON margen (red de seguridad), o el
    // default por destino exacto si nadie declaró. La pieza corta la garantiza el PRESUPUESTO del
    // prompt; esto es lo que evita que una pieza bien planificada muera a dos palabras del final.
    max_tokens: apiMaxTokensFor(bi),
    // Qué nivel declaró el techo, verbatim del carril. Viaja aunque el techo sea null: una ausencia
    // DICHA es dato ('internal_default'), una ausencia muda no se puede leer.
    max_tokens_source: bi?.max_tokens_source ?? null,
    // G1-D — el presupuesto que se le DIJO al escritor, en caracteres. `null` = no se le dijo nada.
    // Sin los DOS números (este y max_tokens_applied) la próxima medición no puede distinguir "el
    // escritor ignoró el presupuesto" de "la API lo cortó igual" — la lección de esta corrida.
    length_budget_chars: lengthBudgetChars,
    // BRIEF 8 · A — el presupuesto de título APLICADO (el declarado, saneado) y de qué nivel salió.
    // Los dos, por la misma razón que los dos de longitud: sin ellos, una corrida con títulos largos
    // no se puede leer — no se distingue "no se le dijo" de "se le dijo y lo ignoró".
    title_budget_chars: titleBudgetChars,
    title_budget_source: bi?.title_budget_source ?? null,
    // BRIEF-04 — el modo con el que se ESCRIBIÓ, para que el eco diga en qué régimen salió la pieza
    // y no haya que deducirlo de si vinieron las cadenas.
    image_title_mode: imageTitleMode,
    // G2-C — QUÉ política de CTA se aplicó de verdad ('none' = frente no declarado). Misma lección
    // que max_tokens_applied: sin el eco, la próxima migración del eje vuelve a ser invisible.
    audience_cta_applied: audienceCtaApplied,
    signature,
    psycho_preset: bi?.psycho_preset ?? null,
    platform_key: bi?.platform ?? null,
    copy_profile_id: cp?.id ?? null,
    humanize_profile_id: hum?.id ?? null,
    output_template_id: outputTemplate?.id ?? null,
    template_vars_unresolved: templateVarsUnresolved,
    template_vars_unresolved_compliance: templateVarsUnresolvedCompliance,
    rules_injected: rulesInjected,
    rules_skipped: rulesSkipped,
    rules_by_instruction: rulesByInstruction,
    // G2-F — el encargo ya leído: qué códigos se mandaron a reparar (para el eco del meta) y el
    // título del ORIGINAL, que el handler conserva si la pieza corregida vuelve sin él. `null` =
    // modo generación: nada de esto viaja, y la respuesta queda como hoy.
    repair: repair
      ? { codes: repair.violations.map(v => v.code), original_title: parsePiece(repair.piece_text).title }
      : null,
  };
}

// ── LITERAL MODE v9.7 ──────────────────────────────────────────────────────
// Used by Orchestrator job_type ∈ {teaser, announcement}. The literal_text is
// treated as immutable copy; CopyLab only wraps it with hashtags + minimal framing.

/**
 * Assemble a compact brand-context block for LITERAL MODE from the brand cache.
 * Pulls only what's strictly relevant to constraining caption tone and hashtags:
 *   voice_genome → identity_anchors, lexicon_signature, lexicon_forbidden,
 *                  emotional_register, prohibited_registers
 *   copy_profile → voice_tone_primary, style_hashtag_style,
 *                  style_signature_phrases, style_avoid_phrases,
 *                  compliance_prohibited_words
 * Returns empty string when no signals are available (caller falls back to a
 * neutral system prompt).
 *
 * A3: recibe el genoma y el perfil YA RESUELTOS por el caller (normalizeCache +
 * selectGenome), no el cache crudo. Antes leía `bc.brand_voice_genome[0]` — el
 * mismo bug del `[0]` que §5.4 corrigió en buildPrompt, intacto en este camino:
 * LucienSael tiene dos genomas activos y el modo literal (teasers/announcements
 * del Orchestrator, camino de producción) tomaba el que el array trajera primero.
 */
function buildLiteralBrandBlock(voice: any | null, profile: any | null, brandId: string): { block: string; hashtagStyle: string; allowEmoji: boolean } {
  if (!voice && !profile) return { block: '', hashtagStyle: '', allowEmoji: false };

  const parts: string[] = [];
  parts.push(`BRAND: ${brandId}`);

  // ── Voice genome ─────────────────────────────────────────────────────
  if (voice) {
    if (voice.identity_anchors) {
      parts.push(`IDENTITY ANCHORS:\n${String(voice.identity_anchors).slice(0, 400)}`);
    }
    const sig = voice.lexicon_signature ?? {};
    const sigBits: string[] = [];
    if (Array.isArray(sig.signature_words)   && sig.signature_words.length)   sigBits.push(`signature words: ${sig.signature_words.join(', ')}`);
    if (sig.trademark_word)                                                   sigBits.push(`trademark: "${sig.trademark_word}"`);
    if (Array.isArray(sig.signature_phrases) && sig.signature_phrases.length) sigBits.push(`signature phrases: ${sig.signature_phrases.join(' | ')}`);
    if (sigBits.length) parts.push(`LEXICON SIGNATURE:\n${sigBits.join('\n')}`);

    if (Array.isArray(voice.lexicon_forbidden) && voice.lexicon_forbidden.length) {
      parts.push(`FORBIDDEN LEXICON: ${voice.lexicon_forbidden.join(', ')}`);
    }
    if (voice.emotional_register) parts.push(`EMOTIONAL REGISTER: ${voice.emotional_register}`);
    if (Array.isArray(voice.prohibited_registers) && voice.prohibited_registers.length) {
      parts.push(`PROHIBITED REGISTERS: ${voice.prohibited_registers.join(', ')}`);
    }
  }

  // ── Copy profile ─────────────────────────────────────────────────────
  let hashtagStyle = '';
  let allowEmoji = false;
  if (profile) {
    if (profile.voice_tone_primary)       parts.push(`PRIMARY TONE: ${profile.voice_tone_primary}`);

    if (profile.style_hashtag_style) {
      hashtagStyle = String(profile.style_hashtag_style);
      parts.push(`HASHTAG STYLE: ${hashtagStyle}`);
    }
    const sigPhrases = Array.isArray(profile.style_signature_phrases) ? profile.style_signature_phrases : null;
    if (sigPhrases?.length) parts.push(`COPY SIGNATURE PHRASES: ${sigPhrases.join(' | ')}`);

    const avoidPhrases = Array.isArray(profile.style_avoid_phrases) ? profile.style_avoid_phrases : null;
    if (avoidPhrases?.length) parts.push(`AVOID PHRASES: ${avoidPhrases.join(', ')}`);

    const compliance = Array.isArray(profile.compliance_prohibited_words) ? profile.compliance_prohibited_words : null;
    if (compliance?.length) parts.push(`COMPLIANCE PROHIBITED: ${compliance.join(', ')}`);

    // Emoji authorization heuristic: explicit field, OR profile clearly
    // describes an emoji policy via tone/style fields. Default to disallow.
    if (profile.emoji_policy === 'allowed' || profile.allow_emoji === true) allowEmoji = true;
    else if (typeof profile.style_emoji_policy === 'string' && /allow|yes/i.test(profile.style_emoji_policy)) allowEmoji = true;
  }

  return { block: parts.length > 1 ? parts.join('\n\n') : '', hashtagStyle, allowEmoji };
}

export async function runLiteralCopy(literal: string, language: string, brandId: string, voiceId: string | null = null): Promise<{ output: string; caption: string; hashtags: string[]; cache_mode: string }> {
  const lang = (language || 'EN').toUpperCase();
  const langInstruction =
    lang === 'EN+ES' ? 'Output the caption with the English version first, then a blank line, then the Spanish version. The literal text MUST appear verbatim in BOTH languages — if the literal is in English, translate it precisely for the Spanish version (no creative reinterpretation, only direct translation). Hashtags can mix EN and ES.'
    : lang === 'ES'  ? 'Output the caption in Spanish only. The literal text MUST appear verbatim — do not translate it (it is already in the intended language). Hashtags in Spanish.'
    :                  'Output the caption in English only. The literal text MUST appear verbatim. Hashtags in English.';

  // v9.7: pull the brand cache so the literal mode reflects the brand
  // identity (voice + hashtag style + compliance) instead of a generic
  // "social media caption with emojis and generic hashtags" output.
  // A3: normalizar el cache y elegir la voz por voice_id (o warn nominal si hay
  // más de un genoma y nadie declaró voz) — nunca `[0]` mudo.
  const { cache: nc } = normalizeCache(await fetchBrandCache(brandId));
  const genomes = sliceOf(nc, 'brand_voice_genome') ?? [];
  const voice = genomes.length ? selectGenome(genomes, voiceId, brandId) : null;
  const profile = (sliceOf(nc, 'brand_copy_profiles') ?? [])[0] ?? null;
  const { block: brandBlock, hashtagStyle, allowEmoji } = buildLiteralBrandBlock(voice, profile, brandId);
  const cache_mode = brandBlock ? 'v2.0_brand_context' : 'no_cache';

  const emojiRule = allowEmoji
    ? 'You MAY include at most one emoji ONLY if the brand voice or copy profile explicitly allows it; otherwise omit emojis entirely.'
    : 'Do NOT include any emoji. The brand context does not authorize emoji usage — omit them.';

  const hashtagRule = hashtagStyle
    ? `Hashtags MUST follow the brand's HASHTAG STYLE above and derive primarily from the LEXICON SIGNATURE (signature words, trademark, signature phrases) — not from free-association with the literal text.`
    : `Hashtags MUST derive from the brand voice and lexicon signature when provided — not from free-association with the literal text.`;

  const brandSection = brandBlock
    ? `BRAND CONTEXT (binds tone, lexicon, hashtags, compliance):\n\n${brandBlock}`
    : `BRAND: ${brandId} (no brand cache available — keep tone neutral and minimal).`;

  const system = `You are CopyLab v9.7 in LITERAL MODE.

Your job: format a literal text into a social-media-ready caption + hashtags that honour the brand identity below.

${brandSection}

HARD RULES:
- The literal text MUST appear VERBATIM inside the caption. Do NOT paraphrase, shorten, or rewrite it.
- ${emojiRule}
- You MAY add at most an ellipsis or a single short framing word IF it visibly improves the caption — never long sentences, never invented hooks.
- Total caption length: ≤ 150 characters per language version.
- Generate 4 to 8 relevant hashtags (no spaces inside hashtags, no duplicate "#", no leading/trailing punctuation).
- ${hashtagRule}
- Respect FORBIDDEN LEXICON / PROHIBITED REGISTERS / COMPLIANCE PROHIBITED / AVOID PHRASES if listed above. Treat them as hard exclusions.
- ${langInstruction}

OUTPUT FORMAT (strict JSON, no markdown, no preamble, no explanations):
{"caption": "...", "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"]}

Generate now.`;

  const user = `LITERAL TEXT (USE VERBATIM):\n${literal}`;

  const { text: raw } = await callClaude(system, user);
  let parsed: { caption?: string; hashtags?: string[] } = {};
  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: if Claude returned non-JSON, treat the whole raw output as the caption.
    parsed = { caption: raw.trim(), hashtags: [] };
  }
  const caption  = String(parsed.caption ?? literal).trim();
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.filter(h => typeof h === 'string' && h.length > 0)
    : [];
  const output = hashtags.length ? `${caption}\n\n${hashtags.join(' ')}` : caption;
  return { output, caption, hashtags, cache_mode };
}

// ── CLAUDE CALL ────────────────────────────────────────────────────────────

interface ClaudeUsage { input_tokens: number; output_tokens: number; }

export async function callClaude(
  system: string,
  user: string,
  maxTokens = 1600,
): Promise<{ text: string; usage: ClaudeUsage }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANT_KEY(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      // Token ceiling by destination (§3.5): editorial 4000 · social 640 en modo
      // carril; 1600 en modo UI (Sonnet 5 corre ~30% más pesado que sonnet-4).
      max_tokens: maxTokens,
      // Sonnet 5: copy is deterministic → keep thinking off so it doesn't eat
      // max_tokens. `temperature` is omitted intentionally — Sonnet 5 rejects
      // any non-default sampling value with a 400.
      thinking: { type: 'disabled' },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  // usage is asserted by the carril to log real copylab cost (§4.1/§4.3) — it
  // was silently discarded before.
  const usage = data.usage ?? {};
  return {
    text: data.content?.[0]?.text ?? '',
    usage: { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0 },
  };
}

// ── CORS HEADERS ───────────────────────────────────────────────────────────

const CORS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-vercel-protection-bypass',
};

// ── HANDLER v9.6 — Node.js native (VercelRequest/VercelResponse) ───────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body as ExecuteRequest & { async?: boolean };
  if (!body?.brandId)
    return res.status(400).json({ error: 'brandId is required' });

  // ── ASYNC MODE v9.4 ─────────────────────────────────────────────────
  if (body.async === true) {
    try {
      const { async: _, ...cleanInput } = body;
      const jobId = await createJob(cleanInput);
      console.log(`[CopyLab v9.7] async job created: ${jobId}`);
      return res.status(202).json({ job_id: jobId, status: 'queued' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg, status: 'error' });
    }
  }

  // ── LITERAL MODE v9.7 (teaser / announcement) ────────────────────────
  const params = body.params as any;
  if (params?.mode === 'literal') {
    try {
      const literal_text = String(params?.literal_text ?? '').trim();
      if (!literal_text) {
        return res.status(400).json({ error: 'literal_text required for mode=literal' });
      }
      const language = String(body.meta?.language ?? params?.language ?? 'EN');
      console.log(`[CopyLab v9.7] literal brand=${body.brandId} lang=${language} len=${literal_text.length}`);
      const literalVoiceId = body.builder_input?.voice_id ?? body.meta?.voice_id ?? null;
      const { output, caption, hashtags, cache_mode } = await runLiteralCopy(literal_text, language, body.brandId ?? 'unknown', literalVoiceId);
      return res.status(200).json({
        output,
        status: 'ok',
        meta: {
          mode: 'literal',
          cache_mode,
          language,
          copylab_version: '9.7',
          caption,
          hashtags,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CopyLab literal v9.7]', msg);
      return res.status(500).json({ error: msg, status: 'error' });
    }
  }

  // ── SYNC MODE v9.6 ────────────────────────────────────────────────────
  try {
    const pack     = body.params?.pack ?? 'social_post_pack';
    const position = body.meta?.position ?? 1;
    const carril   = !!body.builder_input;
    console.log(`[CopyLab v9.7] sync brand=${body.brandId} pack=${pack} pos=${position} mode=${carril ? 'carril' : 'ui'}`);

    const built = await buildPrompt(body);

    console.log(`[CopyLab v9.7] cache_mode=${built.cache_mode} max_tokens=${built.max_tokens} length_budget_chars=${built.length_budget_chars} title_budget_chars=${built.title_budget_chars} repair=${built.repair ? built.repair.codes.join(',') : 'no'} — calling Claude`);
    const { text: output, usage } = await callClaude(built.system, built.user, built.max_tokens);

    // ── Carril response (Contrato 2, §4.2) — title/body ya separados, signature
    //    SIN estampar, usage real. El modo UI conserva su forma histórica.
    if (carril) {
      const { title, image_hook: imageHook, image_support: imageSupport, body: pieceBody } = parsePiece(output);
      // BRIEF 8 · A — `title` es parte del CONTRATO, no un extra que a veces viene: la clave viaja
      // siempre y el eco dice cuánto midió. Un título ausente ahora es un INCUMPLIMIENTO del
      // escritor (la sección ## TÍTULO lo pide en los dos destinos), no un caso normal: se grita,
      // se marca en el meta y la pieza sigue viva — el carril decide qué hacer con una pieza sin
      // título, y hoy hace lo correcto: no compone y conserva la imagen limpia.
      const tituloFinal = built.repair ? (title ?? built.repair.original_title) : title;
      if (!tituloFinal) {
        console.error(
          `[CopyLab][BRIEF8] COPYLAB_TITLE_MISSING brand=${body.brandId} destination=${body.builder_input?.destination ?? '∅'} ` +
          `title_budget=${built.title_budget_chars ?? '∅'} (${built.title_budget_source ?? 'sin declarar'}) ` +
          '— la respuesta volvió sin la línea "TÍTULO:" pese a que el prompt la exige en ambos destinos',
        );
      }
      return res.status(200).json({
        status: 'ok',
        // G2-F — en reparación el título se conserva del ORIGINAL cuando la pieza corregida vuelve
        // sin él (el caso normal: la violación estaba en el cuerpo). Si vuelve CON título, ése gana:
        // es una violación que lo afectaba. En generación, exactamente como hoy.
        title: tituloFinal,
        // BRIEF-04 — las dos cadenas de la imagen. Viajan SIEMPRE, con `null` en el modo que
        // repite: una clave ausente y una clave nula se distinguen, y el carril necesita saber que
        // preguntó. En `echo` son null y el carril compone como hasta hoy.
        image_hook: imageHook,
        image_support: imageSupport,
        body: pieceBody,
        signature: built.signature,
        usage,
        meta: {
          voice_id: built.voice_id,
          voice_version: built.voice_version,
          language: built.language,
          psycho_preset: built.psycho_preset,
          platform_key: built.platform_key,
          // G2-F — la marca de la segunda pasada, y qué códigos se mandaron a reparar. Sólo viajan
          // en modo reparación: sin `builder_input.repair` el meta queda como hoy, clave por clave.
          ...(built.repair ? { repair: true, repair_codes: built.repair.codes } : {}),
          // G1-C — el techo que CopyLab APLICÓ de verdad, y el nivel que lo declaró. El carril ya
          // anota en builder_meta lo que MANDÓ; sin este eco no hay manera de saber si CopyLab lo
          // obedeció o escribió contra su default, que es exactamente la confusión que dejó pasar
          // el techo sin aplicar durante toda una corrida.
          // G1-D — desde ahora este número es el que se le mandó a la API: el declarado CON margen
          // (ceil × 1,2) cuando hay techo declarado, el default por destino exacto cuando no.
          max_tokens_applied: built.max_tokens,
          max_tokens_source: built.max_tokens_source,
          // G1-D — el presupuesto en caracteres que recibió el escritor, al lado del techo que se
          // le mandó a la API. Los dos juntos, o la próxima corrida no se puede leer.
          length_budget_chars: built.length_budget_chars,
          // BRIEF 8 · A — el trío del título: lo que se le dio (presupuesto + de dónde salió) y lo
          // que devolvió (caracteres). `title_missing` distingue la ausencia REAL de un título de
          // longitud cero, y es lo que el carril asienta cuando el overlay no puede componerse.
          title_budget_chars: built.title_budget_chars,
          title_budget_source: built.title_budget_source,
          title_chars: titleCharCount(tituloFinal),
          title_missing: !tituloFinal,
          // BRIEF-04 — en qué régimen se escribió, y si el escritor devolvió lo que ese régimen
          // pide. `image_hook_missing` sólo es un incumplimiento en modo diálogo; en `echo` es el
          // estado normal, y por eso se declara junto al modo y no suelto.
          image_title_mode: built.image_title_mode,
          image_hook_chars: titleCharCount(imageHook),
          image_hook_missing: built.image_title_mode === 'dialogue' && !imageHook,
          image_support_present: !!imageSupport,
          // G2-C — la política de CTA que se le dio al escritor, para que builder_meta la registre.
          // 'decide' | 'influye' | 'general' | 'none'.
          audience_cta_applied: built.audience_cta_applied,
          copy_profile_id: built.copy_profile_id,
          humanize_profile_id: built.humanize_profile_id,
          rules_injected: built.rules_injected,
          rules_skipped: built.rules_skipped,
          rules_count: built.rules_injected.length,
          // D2 — cuántas llegaron con su redacción de escritura y cuántas por fallback a statement.
          rules_by_instruction: built.rules_by_instruction,
          rules_by_instruction_count: built.rules_by_instruction.length,
          rules_by_statement_count: built.rules_injected.length - built.rules_by_instruction.length,
          creative_seed: built.creative_seed,
          cache_mode: built.cache_mode,
          layers_applied: built.layers_applied,
          output_template_id: built.output_template_id,
          template_vars_unresolved: built.template_vars_unresolved,
          template_vars_unresolved_compliance: built.template_vars_unresolved_compliance,
        },
      });
    }

    // ── UI response ────────────────────────────────────────────────────
    return res.status(200).json({
      output,
      status: 'ok',
      meta: {
        pipeline_version: '2.6',
        copylab_version:  '9.7',
        cache_mode: built.cache_mode,
        layers_applied: built.layers_applied,
        voice_genome: built.voice_id ? { voice_id: built.voice_id, version: built.voice_version } : null,
        creative_seed: built.creative_seed,
        template_vars_unresolved: built.template_vars_unresolved,
        template_vars_unresolved_compliance: built.template_vars_unresolved_compliance,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CopyLab /api/execute v9.6]', msg);
    return res.status(500).json({ error: msg, status: 'error' });
  }
}
