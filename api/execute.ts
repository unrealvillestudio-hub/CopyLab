export const maxDuration = 300;

/**
 * CopyLab – POST /api/execute  v9.7
 *
 * B2 (2026-08-02) — el mapa del carril (bloque PURO COPYLAB_PURE, testeable):
 *   resolveCarrilContentType(destination, platform) → { content_type, canal }. En modo carril,
 *   content_type y canal salen del mapa (no del pack ni del `?? 'instagram'` mudo del modo UI); plataforma
 *   desconocida → warn nominal + par de su destination. Además, builder_input.rules (que PR-1 manda SIN
 *   filtrar por kind) se filtra a las imperativas (prohibition|requirement|proof) antes de inyectarse.
 *   Modo UI (sin builder_input) intacto. Nota (§4, fuera de este PR): editorial_post/email_divulgacion aún
 *   no tienen fila en creative_compatibility_rules → el motor degrada con warn a filtro por aggro (?? 2).
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
  rules: Array<{ code: string; kind: string; statement: string }>;
  iid_brief: string;
  angle: string | null;
  audience_frame: 'jd' | 'doliente' | 'general' | null;
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
}
// A2·a — puente plataforma → bloque de canal. PK compuesta (platform, traffic_type).
// canal_block_id → FK a canal_blocks; content_type → gancho de ADS (null en organic).
interface PlatformCanalMap {
  platform: string; traffic_type: string; canal_block_id: string;
  content_type: string | null; active?: boolean; notes?: string | null;
}
interface VoiceGenome {
  voice_id: string; version: string; maturity: string;
  identity_anchors: string; lexicon_signature: any; lexicon_forbidden: string[];
  syntactic_signatures: any; argumentative_architecture: any;
  relational_stance: any; emotional_register: string; prohibited_registers: string[];
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

// Token ceiling by destination (§3.5). The flat 1600 served neither destino:
// editorial 4000 · social 640 en modo carril; el modo UI mantiene 1600.
function maxTokensFor(builderInput: { destination?: string } | null | undefined): number {
  if (!builderInput) return 1600;
  if (builderInput.destination === 'editorial') return 4000;
  if (builderInput.destination === 'social') return 640;
  return 1600;
}

// Split CopyLab's internal `TÍTULO:` sentinel into { title, body } (§4.3). The
// sentinel is internal to CopyLab — the carril receives title/body already split
// and never parses again. body is trimmed and never carries a trailing signature.
function parsePiece(output: string): { title: string | null; body: string } {
  const text = String(output ?? '').trim();
  const m = text.match(/^\s*T[IÍ]TULO:\s*(.+?)\s*(?:\n|$)/i);
  if (m) {
    const title = m[1].trim();
    return { title: title || null, body: text.slice(m[0].length).trim() };
  }
  return { title: null, body: text };
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

// ── B2 · el mapa del carril ─────────────────────────────────────────────────
// resolveCarrilContentType(destination, platform) → { content_type, canal }. En
// modo carril, content_type y canal salen de ACÁ (no del pack ni del `?? 'instagram'`
// mudo del modo UI). El destino manda; la plataforma afina el canal:
//   social (x/meta_fb/meta_ig/tiktok/linkedin)      → social_post,     canal = la plataforma
//   editorial (blog/blog_forumphs→blog; linkedin)   → editorial_post,  canal = blog | linkedin
//   email_propietarios (cualquier destino)          → email_divulgacion, canal = email
// Plataforma desconocida → WARN NOMINAL que la nombra + caída al par de su destination
// (nunca una coerción muda). Puro y self-contained: sólo built-ins + console.
const CARRIL_SOCIAL_PLATFORMS = new Set(['x', 'meta_fb', 'meta_ig', 'tiktok', 'linkedin']);
const CARRIL_EDITORIAL_CANAL: Record<string, string> = { blog: 'blog', blog_forumphs: 'blog', linkedin: 'linkedin' };

function resolveCarrilContentType(destination: string, platform: string): { content_type: string; canal: string } {
  const d = String(destination ?? '').trim().toLowerCase();
  const p = String(platform ?? '').trim().toLowerCase();

  // El email de divulgación se ancla en la PLATAFORMA, no en el destino.
  if (p === 'email_propietarios') return { content_type: 'email_divulgacion', canal: 'email' };

  if (d === 'social') {
    if (CARRIL_SOCIAL_PLATFORMS.has(p)) return { content_type: 'social_post', canal: p };
    console.warn(`[CopyLab][carril] plataforma social desconocida '${p}' → social_post, canal='${p || 'social'}' (nominal, sin coerción)`);
    return { content_type: 'social_post', canal: p || 'social' };
  }

  if (d === 'editorial') {
    const canal = CARRIL_EDITORIAL_CANAL[p];
    if (canal) return { content_type: 'editorial_post', canal };
    console.warn(`[CopyLab][carril] plataforma editorial desconocida '${p}' → editorial_post, canal='blog' (par de su destination)`);
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
  rules: Array<{ code: string; kind: string; statement: string }> | null | undefined,
): Array<{ code: string; kind: string; statement: string }> {
  return (rules ?? []).filter(r => CARRIL_IMPERATIVE_KINDS.has(String(r?.kind)));
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
  const sig = genome.lexicon_signature ?? {};
  const syn = genome.syntactic_signatures ?? {};
  const arch = genome.argumentative_architecture ?? {};
  const stance = genome.relational_stance ?? {};

  const parts: string[] = [];
  parts.push(`VOICE ID: ${genome.voice_id} v${genome.version} (maturity: ${genome.maturity})`);
  parts.push(`IDIOMA DE GENERACIÓN: ${idioma}. Reescribir desde origen en ${idioma} aplicando el mismo genoma. NUNCA traducir.`);

  if (genome.identity_anchors) {
    parts.push(`IDENTITY ANCHORS (autoridad que puede invocar):\n${genome.identity_anchors}`);
  }

  if (sig.signature_words?.length) {
    parts.push(`LEXICÓN FIRMADO:\n- Palabras firmadas (1-3 por pieza MAX, donde encajen naturalmente): ${sig.signature_words.join(', ')}\n- Trademark word: "${sig.trademark_word ?? ''}" — MAX 1x por pieza, solo en contexto que lo justifique orgánicamente\n- Signature phrases (MAX 1 por pieza): ${(sig.signature_phrases ?? []).join(' | ')}`);
  }

  if (genome.lexicon_forbidden?.length) {
    parts.push(`LÉXICO PROHIBIDO (nunca usar en ningún output):\n${genome.lexicon_forbidden.join(', ')}`);
  }

  if (syn.structures?.length || syn.emphatic_triplication) {
    const synParts: string[] = [];
    if (syn.emphatic_triplication) synParts.push(`Triplicación enfática: "${syn.emphatic_triplication.example ?? ''}" — MAX 1x por pieza`);
    if (syn.structures?.length)    synParts.push(`Estructuras firmadas (MAX 1x cada una): ${syn.structures.join(' | ')}`);
    if (syn.rhythm)                synParts.push(`Ritmo: ${syn.rhythm}`);
    if (synParts.length) parts.push(`FIRMAS SINTÁCTICAS:\n${synParts.join('\n')}`);
  }

  if (arch.default_pattern) {
    parts.push(`ARQUITECTURA ARGUMENTATIVA:\nPatrón: ${arch.default_pattern}\nFases: ${JSON.stringify(arch.phases ?? {})}`);
  }

  if (stance.person_reference || stance.opening_stance) {
    const stanceParts: string[] = [];
    if (stance.person_reference) stanceParts.push(`Referencia a cliente: "${stance.person_reference}"`);
    if (stance.subject_priority) stanceParts.push(`Sujeto prioritario: ${stance.subject_priority}`);
    if (stance.opening_stance)   stanceParts.push(`Apertura: ${stance.opening_stance}`);
    parts.push(`POSICIÓN RELACIONAL:\n${stanceParts.join('\n')}`);
  }

  if (genome.emotional_register) parts.push(`REGISTRO EMOCIONAL: ${genome.emotional_register}`);
  if (genome.prohibited_registers?.length) parts.push(`REGISTROS PROHIBIDOS: ${genome.prohibited_registers.join(', ')}`);

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
  creative_seed: { vector_id: string | null; tension_id: string | null; aggro_id: string | null; };
  cache_mode: string;
  max_tokens: number;
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
}> {
  const brandId = req.brandId ?? 'DEFAULT';
  const pack    = req.params.pack ?? 'social_post_pack';
  const meta    = req.meta ?? {};

  // ── Modo carril (§3.3): la PRESENCIA de builder_input activa el carril.
  //    Consumo obligatorio y validación fail-fast en §3.4 — nada de defaults.
  const bi = req.builder_input ?? null;
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
  }

  // B2 — en modo carril, content_type y canal salen del MAPA (destino + plataforma). En modo UI
  // `carril` es null y todo sigue saliendo del pack / `req.params.canal ?? 'instagram'` (byte-idéntico).
  const carril = bi ? resolveCarrilContentType(bi.destination, bi.platform) : null;
  const canal  = carril ? carril.canal : (req.params.canal ?? 'instagram');

  const isEmailSeq       = pack.startsWith('email_sequence');
  const isProductB2C     = pack === 'product_description_pack';
  const sequenceSubType  = meta.sequence_type ?? 'generic';
  const position         = meta.position ?? 1;

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

  const eBrand = encodeURIComponent(brandId);
  const previousVectorId = (req.previousOutputs as any)?.last_creative_vector;

  // Cambio 2 — la voz que decide la precedencia de compatibilidad. En modo carril
  // viene YA RESUELTA en builder_input.voice_id; en modo UI no hay voz declarada →
  // null → sólo la fila BASE (voice_id null) es candidata. La query directa trae voz
  // + BASE de una vez (un viaje), y selectCompatRule elige.
  const compatVoiceId = bi?.voice_id ?? null;
  // Ojo PostgREST: la forma con punto (`voice_id.is.null`) SÓLO es válida DENTRO de
  // `or=(...)`. Como parámetro top-level exige `voice_id=is.null` (columna=operador.valor);
  // con punto apunta a una columna inexistente → 400 → sbArray lanza y rompe el modo UI
  // en cache miss. Por eso las dos ramas usan sintaxis distinta.
  const compatVoiceFilter = compatVoiceId
    ? `or=(voice_id.eq.${encodeURIComponent(compatVoiceId)},voice_id.is.null)`
    : 'voice_id=is.null';

  const [
    brand, humRows, goalsList, personasList, complianceRows, kwList, ctaList, cp,
    genomes, allVectors, allTensions, allAggros, compatSliceRaw,
    pipelineSkillsSlice, outputTemplatesSlice, contentTypeRegistrySlice,
    canalBlocksSlice, platformCanalMapSlice, seqContext,
  ] = await Promise.all([
    // select=* (A1): las variables de template necesitan cta_base, diferenciador_base,
    // disclaimer_base, url_base, cta_url_base, geo_principal, tono_base, canales_activos,
    // formatos_activos, brand_context. Por snapshot ya vienen (el escritor usa select=*);
    // por query directa NO, y sin esto las variables saldrían vacías en silencio.
    (sliceOf(bc, 'brands')?.[0]) ?? sb<any>(`brands?id=eq.${eBrand}&select=*`),
    // humanize: marca Y DEFAULT juntas; la precedencia la resuelve selectHumanize,
    // no `[0]` (que sería el DEFAULT, mergeado primero — §5.3.6 / A2).
    sliceOf(bc, 'humanize_profiles') ?? sbArray<any>(`humanize_profiles?brand_id=in.(${eBrand},DEFAULT)&select=*`),
    sliceOf(bc, 'brand_goals') ?? sbArray<any>(`brand_goals?brand_id=eq.${eBrand}&select=goal_text,priority&order=priority`),
    sliceOf(bc, 'brand_personas') ?? sbArray<any>(`brand_personas?brand_id=eq.${eBrand}&active=eq.true&select=*&order=priority`),
    sliceOf(bc, 'compliance_rules') ?? sbArray<any>(`compliance_rules?brand_id=eq.${eBrand}&active=eq.true&select=rule_text`),
    sliceOf(bc, 'keywords') ?? sbArray<any>(`keywords?brand_id=eq.${eBrand}&select=keyword,type&limit=20`),
    sliceOf(bc, 'ctas') ?? sbArray<any>(`ctas?brand_id=eq.${eBrand}&select=*&active=eq.true&limit=5`),
    (sliceOf(bc, 'brand_copy_profiles')?.[0]) ?? sb<any>(`brand_copy_profiles?brand_id=eq.${eBrand}&active=eq.true&select=*`),
    sliceOf(bc, 'brand_voice_genome') ?? sbArray<any>(`brand_voice_genome?brand_id=eq.${eBrand}&active=eq.true&order=version.desc`),
    sliceOf(bc, 'creative_vectors') ?? sbArray<CreativeVector>('creative_vectors?active=eq.true&select=id,category,label,instruction,aggro_min,aggro_max'),
    sliceOf(bc, 'tension_architectures') ?? sbArray<TensionArchitecture>('tension_architectures?active=eq.true&select=id,label,instruction,curve'),
    sliceOf(bc, 'aggro_presets') ?? sbArray<AggroPreset>('aggro_presets?active=eq.true&select=id,level,label,instruction,anti_hedging&order=level'),
    sliceOf(bc, 'creative_compatibility_rules') ?? sbArray<CompatibilityRule>(`creative_compatibility_rules?content_type=eq.${encodeURIComponent(creativeContentType)}&${compatVoiceFilter}&active=eq.true&select=*`),
    sliceOf(bc, 'pipeline_skills'),
    sliceOf(bc, 'output_templates'),
    sliceOf(bc, 'content_type_registry') ?? sbArray<ContentTypeRegistry>(`content_type_registry?content_type=in.(${encodeURIComponent(creativeContentType)},${encodeURIComponent(pipelineContentType)})&active=eq.true&select=*`),
    // A2·a — canal_blocks (block_text por id) + platform_canal_map (8 filas, sin filtro: la
    // función pura resuelve sin segundo viaje). Sólo se leen en modo carril.
    sliceOf(bc, 'canal_blocks') ?? sbArray<any>(`canal_blocks?active=eq.true&select=*`),
    sliceOf(bc, 'platform_canal_map') ?? sbArray<PlatformCanalMap>(`platform_canal_map?active=eq.true&select=*`),
    isEmailSeq ? buildSequenceContext(req) : Promise.resolve({ previousMechanism: 'none', previousPiece: '', spPool: '' }),
  ]);

  const hum = selectHumanize(humRows as any[], brandId);

  const comp = (complianceRows as any[]).length
    ? { rule_text: (complianceRows as any[]).map((c: any) => c.rule_text).filter(Boolean).join('\n') }
    : null;

  // Language precedence — no 'ES' literal, no default (§5.3.3). brand may come
  // from cache slice or from the direct query above; either way its real
  // language_primary is honoured before anything falls to an error.
  const idioma = resolveLanguage(bi?.language, meta.language, req.params.idioma, brand?.language_primary);
  if (!idioma) {
    throw new Error(`COPYLAB_LANGUAGE_UNRESOLVED: sin idioma para ${brandId} — declarar builder_input.language, meta.language, params.idioma o brands.language_primary`);
  }
  const market    = brand?.market ?? '';
  const brandName = brand?.display_name ?? brand?.name ?? brandId;

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
  const registryRows = contentTypeRegistrySlice as ContentTypeRegistry[];
  const registryFor = (ct: string) =>
    registryRows.find((r: any) => r.content_type === ct && r.active !== false) ?? null;
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
    compatSliceRaw as any[], creativeContentType, compatVoiceId,
  );
  if (!(allVectors as CreativeVector[]).length) {
    console.warn(`[CopyLab] sin creative_vectors para ${brandId} (content_type=${creativeContentType}) — motor creativo degradado`);
  } else if (compatSource === 'none') {
    console.warn(`[CopyLab] sin creative_compatibility_rules para ${brandId} content_type=${creativeContentType} voice=${compatVoiceId ?? '∅'} (ni fila de voz ni BASE) — selección degradada a filtro por aggro`);
  } else if (compatSource === 'base' && compatVoiceId) {
    console.warn(`[CopyLab] creative_compatibility_rules usando fila BASE — ${compatVoiceId} no tiene la suya (content_type=${creativeContentType})`);
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

  const genome = selectGenome(genomes as any[], bi?.voice_id, brandId);
  const voiceGenomeResult = genome
    ? assembleVoiceGenomeLayer(genome, idioma)
    : { layer: null, voice_id: null, voice_version: null };

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
  const rulesInjected: string[] = [];
  const rulesSkipped: string[] = [];
  let watcherRulesBlock: string | null = null;
  if (bi) {
    const lines: string[] = [];
    for (const r of filterCarrilImperativeRules(bi.rules)) {
      if (r && r.statement && String(r.statement).trim()) {
        rulesInjected.push(r.code);
        lines.push(`- [${r.code}${r.kind ? ' · ' + r.kind : ''}] ${String(r.statement).trim()}`);
      } else if (r) {
        rulesSkipped.push(r.code ?? '∅');
      }
    }
    if (lines.length) {
      watcherRulesBlock = `REGLAS DEL WATCHER (citables por código — el stage 5 juzga con estas mismas):\n${lines.join('\n')}`;
    }
  }

  // audience_frame → política de CTA (C.3). Ausente → bloque vacío (legítimo).
  const AUDIENCE_CTA: Record<string, string> = {
    jd: 'CTA orientado a la decisión de compra directa (quien decide). Claro y sin rodeos.',
    doliente: 'CTA empático, de acompañamiento — la audiencia está en un momento sensible; invita sin presionar ni urgir.',
    general: 'CTA de conversión estándar, claro y orientado al resultado.',
  };
  const audienceCtaBlock = bi?.audience_frame
    ? `POLÍTICA DE CTA [audiencia: ${bi.audience_frame}]:\n${AUDIENCE_CTA[bi.audience_frame] ?? ''}`
    : null;

  // signature — surfaced, NUNCA estampada (§4.3). Se estampa en el carril
  // (finalizePiece) DESPUÉS del PASS del Watcher.
  const signature = deriveSignature(bi?.rules);

  const { vector, tension, aggro } = creativeCombo;
  const { layer: voiceLayer, voice_id, voice_version } = voiceGenomeResult;

  const layers: string[] = [];

  layers.push(`MARCA: ${brandName} | MERCADO: ${market} | IDIOMA: ${idioma}`);

  if (goalsList.length) {
    layers.push(`OBJETIVOS:\n${goalsList.slice(0, 3).map((g: any) => `- ${g.goal ?? g.goal_text}`).join('\n')}`);
  }

  if (personasList.length) {
    const targetPersona = meta.persona_key
      ? personasList.find((p: any) => p.persona_key === meta.persona_key) ?? personasList[0]
      : personasList[0];
    if (targetPersona) {
      const pains = Array.isArray(targetPersona.pain_points) ? targetPersona.pain_points.slice(0, 3).join(' | ') : targetPersona.pain_points ?? '';
      const hooks = Array.isArray(targetPersona.copy_hooks)  ? targetPersona.copy_hooks.slice(0, 2).join(' | ')  : '';
      layers.push(`AUDIENCIA OBJETIVO:\n${targetPersona.label ?? 'B2C'}\nPain points: ${pains}\nHooks: ${hooks}\nTono: ${targetPersona.tone_for_segment ?? ''}\nEvitar: ${Array.isArray(targetPersona.avoid) ? targetPersona.avoid.join(', ') : targetPersona.avoid ?? ''}`);
    }
  }

  layers.push(`IDIOMA OBLIGATORIO: ${idioma}. Genera desde el origen en este idioma. NUNCA traduzcas de otro idioma.`);

  // A2·a — bloque de canal REAL en modo carril: platform_canal_map (plataforma → canal_block_id)
  // + canal_blocks.block_text. Sin bi (UI) el camino queda EXACTO (layer genérico + canal). Sin
  // mapeo, sin fila o sin block_text: warn nominal + layer genérico, nunca prompt sin canal.
  // forced_content_type se resuelve pero NO se cablea (gancho ADS, fuera de alcance).
  let canalLayer = `CANAL: ${canal.toUpperCase()}. Adapta longitud, tono y formato al canal.`;
  if (bi) {
    const { canal_block_id, source } = resolveCanalBlockId(platformCanalMapSlice as any[], bi.platform, 'organic');
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
  layers.push(canalLayer);

  if (hum) {
    layers.push(`VOZ DE MARCA — BASE (L1):\nTono: ${hum.tone ?? ''}\nPersonalidad: ${hum.personality ?? ''}\nReglas de autenticidad: ${hum.authenticity_rules ?? ''}\nAnti-patterns: ${Array.isArray(hum.anti_patterns) ? (hum.anti_patterns as string[]).join(', ') : hum.anti_patterns ?? ''}`);
  }

  if (cp) {
    const parts: string[] = [];
    if (cp.voice_tone_primary)  parts.push(`Tono primario: ${cp.voice_tone_primary}`);
    if (cp.voice_writing_style) parts.push(`Estilo: ${cp.voice_writing_style}`);
    const hooks = Array.isArray(cp.style_hooks) ? cp.style_hooks.join(', ') : cp.style_hooks;
    if (hooks) parts.push(`Hooks de marca: ${hooks}`);
    const avoid = Array.isArray(cp.style_avoid_phrases) ? cp.style_avoid_phrases.join(', ') : cp.style_avoid_phrases;
    if (avoid) parts.push(`Nunca usar: ${avoid}`);
    if (parts.length) layers.push(`PERFIL DE COPY BP_COPY_1.0:\n${parts.join('\n')}`);
  }

  if (bi && bi.angle && bi.angle.trim()) {
    layers.push(`EJE ESTRUCTURAL:\n${bi.angle.trim()}`);
  }

  if (voiceLayer) layers.push(voiceLayer);

  if (kwList.length) layers.push(`KEYWORDS: ${kwList.map((k: any) => k.keyword).join(', ')}`);

  if (ctaList.length) {
    const ctaText = ctaList.map((c: any) => `"${c.cta_smpc ?? c.cta_text ?? c.cta_ads ?? ''}"`).filter(Boolean).join(' | ');
    if (ctaText) layers.push(`CTAs APROBADOS: ${ctaText}`);
  }

  if (comp?.rule_text) layers.push(`COMPLIANCE — REGLAS OBLIGATORIAS:\n${comp.rule_text}`);

  if (watcherRulesBlock) layers.push(watcherRulesBlock);
  if (audienceCtaBlock)  layers.push(audienceCtaBlock);

  // A1 — sustituir las variables del template ANTES de inyectarlo; nunca mandar {{...}}
  // crudo al modelo. Las que no resuelven van vacías y se registran (template_vars_unresolved)
  // para que el carril las audite.
  let templateVarsUnresolved: string[] = [];
  let templateVarsUnresolvedCompliance: string[] = [];
  if (outputTemplate?.template_text) {
    const ctaForVars = (ctaList as any[])[0]?.cta_smpc ?? (ctaList as any[])[0]?.cta_text ?? (ctaList as any[])[0]?.cta_ads ?? '';
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
    layers.push(`TEMPLATE DE OUTPUT [${outputTemplate.name}]:\n${filledTemplate}`);
  }

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

  if (vector) layers.push(`## L14 CREATIVE VECTOR [${vector.id} · ${vector.label}]\nAplica este vector de apertura. No lo nombres — ejecútalo.\n${vector.instruction}`);
  if (tension) layers.push(`## L15 TENSION ARCHITECTURE [${tension.id} · ${tension.label}]\nCurva: ${tension.curve}\n${tension.instruction}`);
  if (aggro)   layers.push(`## L16 AGGRO DIAL [${aggro.id} · ${aggro.label}]\n${aggro.instruction}\n\nANTI-HEDGING:\n${aggro.anti_hedging}\n\nEl objetivo es la conversión. El copy sirve a ese objetivo sin disculparse por ello.`);

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
    const fmt = bi.destination === 'editorial'
      ? 'FORMATO (editorial):\n- Primera línea EXACTA: "TÍTULO: <título de la pieza>".\n- Luego una línea en blanco y el cuerpo.\n- El cuerpo termina en su última frase de contenido: sin repetir el título, sin H1, sin CTA final, sin firma.'
      : 'FORMATO (social):\n- Sin título, sin la etiqueta "TÍTULO:".\n- Solo el cuerpo, listo para publicar.\n- Termina en su última frase de contenido: sin CTA final añadido, sin firma.';
    userInstruction = `${fmt}\n\nMATERIA PRIMA (IID BRIEF) — interprétala, NUNCA la copies textualmente:\n${bi.iid_brief}\n\nGenera ahora. Sin preámbulos.`;
  }

  return {
    system,
    user: userInstruction,
    layers_applied: appliedLayers,
    voice_id,
    voice_version,
    language: idioma,
    creative_seed: {
      vector_id: vector?.id ?? null,
      tension_id: tension?.id ?? null,
      aggro_id: aggro?.id ?? null,
    },
    cache_mode: cacheMode,
    max_tokens: maxTokensFor(bi),
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

    console.log(`[CopyLab v9.7] cache_mode=${built.cache_mode} max_tokens=${built.max_tokens} — calling Claude`);
    const { text: output, usage } = await callClaude(built.system, built.user, built.max_tokens);

    // ── Carril response (Contrato 2, §4.2) — title/body ya separados, signature
    //    SIN estampar, usage real. El modo UI conserva su forma histórica.
    if (carril) {
      const { title, body: pieceBody } = parsePiece(output);
      return res.status(200).json({
        status: 'ok',
        title,
        body: pieceBody,
        signature: built.signature,
        usage,
        meta: {
          voice_id: built.voice_id,
          voice_version: built.voice_version,
          language: built.language,
          psycho_preset: built.psycho_preset,
          platform_key: built.platform_key,
          copy_profile_id: built.copy_profile_id,
          humanize_profile_id: built.humanize_profile_id,
          rules_injected: built.rules_injected,
          rules_skipped: built.rules_skipped,
          rules_count: built.rules_injected.length,
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
