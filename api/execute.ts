export const maxDuration = 300;

/**
 * CopyLab – POST /api/execute  v9.7
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
  _shape: 'snapshot' | 'context_json';
}

const CACHE_SLICES: Array<keyof NormalizedCache> = [
  'brands', 'humanize_profiles', 'brand_goals', 'brand_personas', 'compliance_rules',
  'keywords', 'ctas', 'brand_copy_profiles', 'brand_voice_genome', 'creative_vectors',
  'tension_architectures', 'aggro_presets', 'creative_compatibility_rules',
  'pipeline_skills', 'output_templates',
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
    Array.isArray(raw.compliance_rules) || Array.isArray(raw.humanize_profiles);

  if (looksSnapshot) {
    const nc = emptyNormalizedCache('snapshot');
    for (const k of CACHE_SLICES) if (Array.isArray(raw[k])) (nc as any)[k] = raw[k];
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
  rules: CompatibilityRule[],
): { vector: CreativeVector | null; tension: TensionArchitecture | null; aggro: AggroPreset | null } {
  const rule = rules[0] ?? null;

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

async function buildPrompt(req: ExecuteRequest): Promise<{
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
  rules_injected: string[];
  rules_skipped: string[];
}> {
  const brandId = req.brandId ?? 'DEFAULT';
  const pack    = req.params.pack ?? 'social_post_pack';
  const canal   = req.params.canal ?? 'instagram';
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

  const isEmailSeq       = pack.startsWith('email_sequence');
  const isProductB2C     = pack === 'product_description_pack';
  const sequenceSubType  = meta.sequence_type ?? 'generic';
  const position         = meta.position ?? 1;

  const creativeContentType = isEmailSeq
    ? `${sequenceSubType}_${position}`
    : isProductB2C ? 'product_description_b2c'
    : pack.replace('_pack', '');

  const pipelineContentType = isEmailSeq
    ? 'email_sequence'
    : isProductB2C ? 'product_description_b2c'
    : pack.replace('_pack', '');

  const aggroByType: Record<string, number> = {
    abandoned_cart_1: 2, abandoned_cart_2: 4,
    welcome: 1, post_purchase: 1, review_request: 2, win_back: 3,
    ad_copy: 3, social_post: 2, landing_page: 3, product_description_b2c: 2,
  };
  const aggroLevel = aggroByType[creativeContentType] ?? aggroByType[pipelineContentType] ?? 2;

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

  const [
    brand, hum, goalsList, personasList, complianceRows, kwList, ctaList, cp,
    genomes, allVectors, allTensions, allAggros, compatSliceRaw,
    pipelineSkillsSlice, outputTemplatesSlice, seqContext,
  ] = await Promise.all([
    (sliceOf(bc, 'brands')?.[0]) ?? sb<any>(`brands?id=eq.${eBrand}&select=id,display_name,market,language_primary`),
    (sliceOf(bc, 'humanize_profiles')?.[0]) ?? sb<any>(`humanize_profiles?brand_id=eq.${eBrand}&select=*`),
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
    sliceOf(bc, 'creative_compatibility_rules') ?? sbArray<CompatibilityRule>(`creative_compatibility_rules?content_type=eq.${encodeURIComponent(creativeContentType)}&active=eq.true&select=*`),
    sliceOf(bc, 'pipeline_skills'),
    sliceOf(bc, 'output_templates'),
    isEmailSeq ? buildSequenceContext(req) : Promise.resolve({ previousMechanism: 'none', previousPiece: '', spPool: '' }),
  ]);

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

  // Creative engine — resolved per-slice; a genuinely empty catalogue or a
  // missing compatibility rule degrades, but NEVER in silence (§5.3.4 / §7).
  const compatForType = (compatSliceRaw as CompatibilityRule[]).filter(
    (r: any) => r.content_type === creativeContentType,
  );
  if (!(allVectors as CreativeVector[]).length) {
    console.warn(`[CopyLab] sin creative_vectors para ${brandId} (content_type=${creativeContentType}) — motor creativo degradado`);
  } else if (!compatForType.length) {
    console.warn(`[CopyLab] sin creative_compatibility_rules para ${brandId} content_type=${creativeContentType} — selección degradada a filtro por aggro`);
  }
  const creativeCombo = applyCreativeLogic(
    creativeContentType, aggroLevel, previousVectorId,
    allVectors as CreativeVector[], allTensions as TensionArchitecture[],
    allAggros as AggroPreset[], compatForType,
  );

  const appliedLayers = pipelineSkillsSlice
    ? resolveAppliedLayersFromData(pipelineContentType, pipelineSkillsSlice)
    : await resolveAppliedLayers(pipelineContentType);

  const outputTemplate: OutputTemplate | null = outputTemplatesSlice
    ? (outputTemplatesSlice.find((t: any) => t.category === pipelineContentType && t.active !== false) ?? null)
    : await sb<OutputTemplate>(`output_templates?category=eq.${encodeURIComponent(pipelineContentType)}&active=eq.true&select=id,name,category,template_text&limit=1`);

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
  const rulesInjected: string[] = [];
  const rulesSkipped: string[] = [];
  let watcherRulesBlock: string | null = null;
  if (bi) {
    const lines: string[] = [];
    for (const r of bi.rules ?? []) {
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
  layers.push(`CANAL: ${canal.toUpperCase()}. Adapta longitud, tono y formato al canal.`);

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

  if (outputTemplate?.template_text) {
    layers.push(`TEMPLATE DE OUTPUT [${outputTemplate.name}]:\n${outputTemplate.template_text}`);
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
 */
function buildLiteralBrandBlock(bc: any | null, brandId: string): { block: string; hashtagStyle: string; allowEmoji: boolean } {
  if (!bc) return { block: '', hashtagStyle: '', allowEmoji: false };

  const voice   = bc?.brand_voice_genome?.[0]  ?? null;
  const profile = bc?.brand_copy_profiles?.[0] ?? null;

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

async function runLiteralCopy(literal: string, language: string, brandId: string): Promise<{ output: string; caption: string; hashtags: string[]; cache_mode: string }> {
  const lang = (language || 'EN').toUpperCase();
  const langInstruction =
    lang === 'EN+ES' ? 'Output the caption with the English version first, then a blank line, then the Spanish version. The literal text MUST appear verbatim in BOTH languages — if the literal is in English, translate it precisely for the Spanish version (no creative reinterpretation, only direct translation). Hashtags can mix EN and ES.'
    : lang === 'ES'  ? 'Output the caption in Spanish only. The literal text MUST appear verbatim — do not translate it (it is already in the intended language). Hashtags in Spanish.'
    :                  'Output the caption in English only. The literal text MUST appear verbatim. Hashtags in English.';

  // v9.7: pull the brand cache so the literal mode reflects the brand
  // identity (voice + hashtag style + compliance) instead of a generic
  // "social media caption with emojis and generic hashtags" output.
  const bc = await fetchBrandCache(brandId);
  const { block: brandBlock, hashtagStyle, allowEmoji } = buildLiteralBrandBlock(bc, brandId);
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

async function callClaude(
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
      const { output, caption, hashtags, cache_mode } = await runLiteralCopy(literal_text, language, body.brandId ?? 'unknown');
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
        },
      });
    }

    // ── UI response (sin cambios) ──────────────────────────────────────
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
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CopyLab /api/execute v9.6]', msg);
    return res.status(500).json({ error: msg, status: 'error' });
  }
}
