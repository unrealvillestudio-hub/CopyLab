/**
 * CopyLab — QA harness (Fase A · Contratos del modo carril)
 *
 * Run:  npm test        (→ npx tsx api/execute.test.ts)
 *
 * Patrón del ecosistema (ImageLab #95-C / content-run-stage): bloque puro entre
 * sentinelas + extracción desde la fuente que se deploya. La lógica pura se
 * extrae de `api/execute.ts` entre `// ── COPYLAB_PURE:BEGIN/END ──`, se
 * transpila y se ejerce en aislamiento (prueba que el núcleo es self-contained
 * y que se testea EXACTAMENTE lo que se despliega). Los contratos que dependen
 * de red se ejercen contra buildPrompt/handler reales con `fetch` mockeado.
 *
 * Cubre los 9 casos obligatorios del brief §8.
 */

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import handler, { buildPrompt, callClaude, runLiteralCopy } from './execute.ts';

// ── mini runner ────────────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];
const xfails: string[] = [];
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`  ✗ ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
}
// xfail — el test EXPONE un defecto vivo en `main` que este PR NO puede reparar
// (§7: api/execute.ts está fuera de alcance). La aserción NO se debilita: se
// espera que falle contra el código actual, se documenta con su evidencia, y si
// algún día PASA (defecto reparado) se marca XPASS para promover xfail→test.
function xfail(name: string, reason: string, fn: () => void | Promise<void>): Promise<void> {
  return (async () => {
    try {
      await fn();
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      xfails.push(`${name}\n      motivo: ${reason}\n      evidencia: ${detail}`);
      console.log(`  ⊘ xfail ${name}\n      (${reason})\n      evidencia: ${detail.split('\n')[0]}`);
      return;
    }
    failures.push(`${name}: XPASS — el defecto de main parece reparado; promover xfail→test`);
    console.log(`  ✗ XPASS ${name} — el defecto de main parece reparado; promover xfail→test`);
  })();
}
function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }
function eq(a: any, b: any, msg: string) {
  if (a !== b) throw new Error(`${msg} — esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function assertOrdered(haystack: string, needles: string[]) {
  let cursor = -1;
  for (const n of needles) {
    const at = haystack.indexOf(n, cursor + 1);
    assert(at > cursor, `secuencia rota / ausente: "${n}"`);
    cursor = at;
  }
}
async function assertThrows(fn: () => any, includes: string): Promise<void> {
  try { await fn(); } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert(m.includes(includes), `throw esperado con "${includes}", obtenido "${m}"`);
    return;
  }
  throw new Error(`se esperaba throw con "${includes}", no lanzó`);
}

// ── diff línea a línea para el golden (LCS) ─────────────────────────────────
type DiffLine = { tag: '-' | '+'; line: string };
function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ tag: '-', line: A[i++] }); }
    else { out.push({ tag: '+', line: B[j++] }); }
  }
  while (i < n) out.push({ tag: '-', line: A[i++] });
  while (j < m) out.push({ tag: '+', line: B[j++] });
  return out;
}
// A2·b retiró `clasificar` (lista blanca de deltas vs da182aa): con el trasplante el golden
// pasó a ser la referencia y los golden tests son equidad byte a byte. diffLines/fmtDiff se
// conservan para imprimir el diff cuando la equidad falla.
function fmtDiff(d: DiffLine): string { return `${d.tag} ${d.line}`; }
function stripGoldenHeader(raw: string): string {
  const lines = raw.split('\n');
  let k = 0; while (k < lines.length && lines[k].startsWith('# ')) k++;
  return lines.slice(k).join('\n');
}

// ── extracción del bloque puro desde la fuente desplegada ───────────────────
function extractPure(): any {
  const src = readFileSync(new URL('./execute.ts', import.meta.url), 'utf8');
  const start = src.indexOf('COPYLAB_PURE:BEGIN');
  const end = src.indexOf('COPYLAB_PURE:END');
  assert(start !== -1 && end !== -1 && end > start, 'sentinelas COPYLAB_PURE no encontradas en la fuente');
  const block = src.slice(src.indexOf('\n', start) + 1, end);
  const js = ts.transpileModule(block, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, removeComments: true },
  }).outputText;
  // Purity gate on the EMITTED code (comments stripped): the deployed pure block
  // must not reach for network/env/nondeterminism.
  assert(!/\bfetch\s*\(|\bMath\.random|\bawait\b|process\.env/.test(js), 'el bloque puro contiene un efecto (fetch/Math.random/await/process.env)');
  const factory = new Function(
    `${js}\nreturn { normalizeCache, sliceOf, resolveLanguage, selectGenome, selectHumanize, maxTokensFor, parsePiece, deriveSignature, resolveCarrilContentType, filterCarrilImperativeRules, CARRIL_IMPERATIVE_KINDS, selectCompatRule, applyTemplateVars, buildTemplateVars, resolveCanalBlockId, ensureArray, getCTAFieldForCanal, getActiveCTA, getTopKeywords, getGrupo3, getComplianceRules, buildBrandBlock, buildGoalsBlock, buildPersonasBlock, buildIdiomaBlock, buildGeomixBlock, buildKeywordsBlock, buildCopyProfileLayer, renderGenomeSection };`,
  );
  return factory();
}
const PURE = extractPure();

// ── mock fetch ──────────────────────────────────────────────────────────────
const REAL_FETCH = globalThis.fetch;
function res(data: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => (typeof data === 'string' ? data : JSON.stringify(data)) } as any;
}
type TableReply = any[] | ((url: string) => any);
function installFetch(opts: { tables?: Record<string, TableReply>; claude?: any; snapshot?: any[] }) {
  const calls: string[] = [];
  const claudeBodies: any[] = [];
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('api.anthropic.com')) {
      try { claudeBodies.push(JSON.parse(init?.body ?? '{}')); } catch { /* ignore */ }
      return res(opts.claude ?? { content: [{ text: '' }], usage: { input_tokens: 0, output_tokens: 0 } });
    }
    if (u.includes('unrlvl-context.vercel.app')) return res('', 404);
    if (u.includes('/rest/v1/')) {
      const table = u.split('/rest/v1/')[1].split('?')[0];
      if (table === 'brand_cache_snapshots') return res(opts.snapshot ?? []);
      const r = opts.tables?.[table];
      if (typeof r === 'function') return r(u);
      return res(r ?? []);
    }
    return res([]);
  }) as any;
  return { calls, claudeBodies, restore: () => { globalThis.fetch = REAL_FETCH; } };
}

// ── fixtures ─────────────────────────────────────────────────────────────────
// B0 — forma REAL del genoma: 9 de 10 voces vivas traen identity_anchors/emotional_register
// como OBJETO, lexicon_signature como array, argumentative_architecture/relational_stance como
// objetos con claves reconocibles. El fixture string anterior medía un caso que no existe (fue
// lo que escondió el bug del [object Object]). Valores con prefijos distintivos para no chocar
// con asserts de otros bloques.
const GENOME_V1 = {
  voice_id: 'v1', version: '1', maturity: 'stable',
  identity_anchors: { tagline: 'ia-tagline', thematic_gravity: 'ia-gravity', authority_basis: 'ia-authority' },
  lexicon_signature: ['firmada-1', 'firmada-2'],
  lexicon_forbidden: ['prohibida-1'],
  syntactic_signatures: { rhythm: 'syn-rhythm', structures: ['struct-1', 'struct-2'] },
  argumentative_architecture: { core_move: 'arch-core', ending_discipline: 'arch-ending', closing_repositions: 'arch-closing', financial_lens: 'arch-financial' },
  relational_stance: { address: 'stance-address', the_readers_moment: 'stance-moment' },
  emotional_register: { register: 'er-register', restraint: 'er-restraint' },
  prohibited_registers: ['reg-prohibido'],
  application_constraints: { no_emoji: true },
};
const FULL_SNAPSHOT = {
  brands: [{ id: 'B', display_name: 'BrandX', market: 'US', language_primary: 'en-US' }],
  humanize_profiles: [{ tone: 't', personality: 'p', authenticity_rules: 'a', anti_patterns: ['x'] }],
  brand_goals: [{ goal_text: 'g1', priority: 1 }],
  brand_personas: [{ label: 'P', pain_points: ['pp'], copy_hooks: ['ch'], tone_for_segment: 'ts', avoid: ['av'] }],
  compliance_rules: [{ rule_text: 'must comply' }],
  keywords: [{ keyword: 'k1', prioridad: 1, grupo_3: 'g3' }],
  ctas: [{ cta_smpc: 'Buy now' }],
  brand_copy_profiles: [{ id: 'cp1', voice_tone_primary: 'vtp', voice_writing_style: 'vws', style_hooks: ['sh'], style_avoid_phrases: ['sap'] }],
  brand_voice_genome: [GENOME_V1],
  creative_vectors: [{ id: 'VEC1', category: 'c', label: 'L', instruction: 'inst', aggro_min: 1, aggro_max: 5 }],
  tension_architectures: [{ id: 'TEN1', label: 'TL', instruction: 'ti', curve: 'cu' }],
  aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'AL', instruction: 'ai', anti_hedging: 'ah' }],
  creative_compatibility_rules: [{ content_type: 'social_post', allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
  pipeline_skills: [{ layer_code: 'LX', layer_order: 1, applies_to: ['social_post'] }],
  output_templates: [{ id: 't1', name: 'TPL', category: 'social_post', template_text: 'tmpl', active: true }],
  // Cambio 1 — un snapshot COMPLETO ahora incluye el registro. La fila mantiene los
  // valores implícitos del código pre-cableado (pipeline_family='social_post' ≡ el
  // applies_to del pipeline_skills de arriba; output_template_id='t1' ≡ el template de
  // arriba; aggro_default=2 ≡ el viejo aggroByType['social_post']) → la UI queda
  // byte-idéntica y el golden no se toca. El mapeo real (social_post→'post', 'SMPC_full')
  // lo ejercen los tests de integración del registro, no el golden.
  content_type_registry: [{ content_type: 'social_post', pipeline_family: 'social_post', output_template_id: 't1', aggro_default: 2, active: true }],
  // A2·a — un snapshot completo trae ahora estos dos slices. La UI (sin builder_input) NO los
  // lee (resolveCanalBlockId sólo corre en carril), así que no afectan el golden; están para que
  // el aserto de cero-queries siga valiendo (slice presente ⇒ sin query directa).
  canal_blocks: [{ id: 'INSTAGRAM_ORGANICO', block_text: 'IG block text', active: true }],
  platform_canal_map: [{ platform: 'meta_ig', traffic_type: 'organic', canal_block_id: 'INSTAGRAM_ORGANICO', content_type: null, active: true }],
  // A2·b — geomix en el snapshot completo (buildGeomixBlock). Mantiene cero-queries.
  geomix: [{ geo: 'US', servicios: ['s1'], combos: ['c1'] }],
};
// Forma de producción real (PR C): registro como `brand` singular (v2.1) · dos
// genomas hermanos · humanize [DEFAULT×5 (copy/image/video/voice/web), marca(text)].
// Debe coincidir byte a byte con scratchpad/prod_snapshot.json usado para generar
// api/__fixtures__/golden_ui_prod.txt.
const PROD_SNAPSHOT = {
  brand: { id: 'LucienSael', display_name: 'Lucien Sael', market: 'Miami', language_primary: 'en-FL' },
  humanize_profiles: [
    { id: 'd-copy',  brand_id: 'DEFAULT',    medium: 'copy',  tone: 'default-copy-tone', personality: 'def-persona', authenticity_rules: 'def-auth', anti_patterns: ['def-anti'] },
    { id: 'd-image', brand_id: 'DEFAULT',    medium: 'image', tone: 'img', personality: 'i', authenticity_rules: 'i', anti_patterns: ['i'] },
    { id: 'd-video', brand_id: 'DEFAULT',    medium: 'video', tone: 'vid', personality: 'v', authenticity_rules: 'v', anti_patterns: ['v'] },
    { id: 'd-voice', brand_id: 'DEFAULT',    medium: 'voice', tone: 'voi', personality: 'vo', authenticity_rules: 'vo', anti_patterns: ['vo'] },
    { id: 'd-web',   brand_id: 'DEFAULT',    medium: 'web',   tone: 'web', personality: 'w', authenticity_rules: 'w', anti_patterns: ['w'] },
    { id: 'lucien',  brand_id: 'LucienSael', medium: 'text',  tone: 'marca-text-tone', personality: 'marca-persona', authenticity_rules: 'marca-auth', anti_patterns: ['marca-anti'] },
  ],
  // B0 — genomas con la forma REAL de producción (objetos jsonb). El golden de PROD toma el
  // primero (lucien_editorial) → es el primer golden donde el genoma de Lucien llega ENTERO.
  brand_voice_genome: [
    { voice_id: 'lucien_editorial', version: '1', maturity: 'stable',
      identity_anchors: { tagline: 'I build worlds. Some survive.', thematic_gravity: 'la critica psicologica del comportamiento', authority_basis: 'thirty years of watching people misname what they build' },
      lexicon_signature: ['insumo', 'marioneta', 'criterio'],
      lexicon_forbidden: ['revolucionario', 'innovador'],
      syntactic_signatures: { rhythm: 'frases cortas, corte seco', structures: ['claim -> autoridad -> distincion'] },
      argumentative_architecture: { core_move: 'observa el patron y lo NOMBRA con precision', ending_discipline: 'No call to action. No summary. No lesson.', closing_repositions: 'el cierre revela el LUGAR real del lector', financial_lens: 'la inteligencia financiera como criterio de lectura, no como tema' },
      relational_stance: { address: 'habla al lector afin, no contra el mediocre', the_readers_moment: 'reconocerse y quedarse, o irse' },
      emotional_register: { register: 'frio, preciso, sin disculpas', restraint: 'tiene la municion pesada y no la usa' },
      prohibited_registers: ['motivacional', 'coach'],
      application_constraints: { no_emoji: true } },
    { voice_id: 'lucien_social', version: '1', maturity: 'stable',
      identity_anchors: { tagline: 'social-tagline', thematic_gravity: 'social-gravity' },
      lexicon_signature: ['social-firmada'], lexicon_forbidden: [], syntactic_signatures: {},
      argumentative_architecture: { core_move: 'social-core' }, relational_stance: { address: 'social-address' },
      emotional_register: { register: 'social-register' }, prohibited_registers: [], application_constraints: {} },
  ],
  brand_goals: [{ goal_text: 'g1', priority: 1 }],
  brand_personas: [{ label: 'P', pain_points: ['pp'], copy_hooks: ['ch'], tone_for_segment: 'ts', avoid: ['av'] }],
  compliance_rules: [{ rule_text: 'must comply' }],
  keywords: [{ keyword: 'k1', prioridad: 1, grupo_3: 'g3' }],
  ctas: [{ cta_smpc: 'Buy now' }],
  brand_copy_profiles: [{ id: 'cp1', voice_tone_primary: 'vtp', voice_writing_style: 'vws', style_hooks: ['sh'], style_avoid_phrases: ['sap'] }],
  creative_vectors: [{ id: 'VEC1', category: 'c', label: 'L', instruction: 'inst', aggro_min: 1, aggro_max: 5 }],
  tension_architectures: [{ id: 'TEN1', label: 'TL', instruction: 'ti', curve: 'cu' }],
  aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'AL', instruction: 'ai', anti_hedging: 'ah' }],
  creative_compatibility_rules: [{ content_type: 'social_post', allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
  pipeline_skills: [{ layer_code: 'LX', layer_order: 1, applies_to: ['social_post'] }],
  output_templates: [{ id: 't1', name: 'TPL', category: 'social_post', template_text: 'tmpl', active: true }],
  // Ver nota en FULL_SNAPSHOT: valores del registro que preservan la UI byte a byte.
  content_type_registry: [{ content_type: 'social_post', pipeline_family: 'social_post', output_template_id: 't1', aggro_default: 2, active: true }],
  canal_blocks: [{ id: 'INSTAGRAM_ORGANICO', block_text: 'IG block text', active: true }],
  platform_canal_map: [{ platform: 'meta_ig', traffic_type: 'organic', canal_block_id: 'INSTAGRAM_ORGANICO', content_type: null, active: true }],
  // A2·b — geomix en el snapshot completo (buildGeomixBlock). Mantiene cero-queries.
  geomix: [{ geo: 'US', servicios: ['s1'], combos: ['c1'] }],
};
function reqWith(previousOutputs: any, extra: any = {}): any {
  return {
    brandId: extra.brandId ?? 'B',
    stage: { labId: 'copylab', label: 'CopyLab', description: '', order: 1 },
    params: extra.params ?? {},
    previousOutputs,
    ...(extra.builder_input ? { builder_input: extra.builder_input } : {}),
    ...(extra.meta ? { meta: extra.meta } : {}),
  };
}
function makeRes() {
  const out: any = { _status: 0, _json: null, headers: {} };
  return {
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
    status(code: number) { out._status = code; return this; },
    json(obj: any) { out._json = obj; return this; },
    end() { return this; },
    _out: out,
  };
}

// ── suites ────────────────────────────────────────────────────────────────
async function run() {
  console.log('CopyLab harness — Fase A');

  console.log('\n[pure · bloque desplegado]');

  // Case 9 (pure) — techo de tokens
  await test('9·pure maxTokensFor: editorial 4000 · social 640 · UI 1600', () => {
    eq(PURE.maxTokensFor({ destination: 'editorial' }), 4000, 'editorial');
    eq(PURE.maxTokensFor({ destination: 'social' }), 640, 'social');
    eq(PURE.maxTokensFor(null), 1600, 'UI');
    eq(PURE.maxTokensFor(undefined), 1600, 'UI/undefined');
  });

  // Case 3 (pure) — selección por voice_id, orden-independiente
  await test('3·pure selectGenome por voice_id es orden-independiente', () => {
    const a = [{ voice_id: 'lucien_editorial', version: '1' }, { voice_id: 'lucien_social', version: '1' }];
    const b = [...a].reverse();
    eq(PURE.selectGenome(a, 'lucien_social', 'LucienSael').voice_id, 'lucien_social', 'orden A');
    eq(PURE.selectGenome(b, 'lucien_social', 'LucienSael').voice_id, 'lucien_social', 'orden B (invertido)');
  });

  // Case 4 (pure) — voz ausente → error nominando las voces
  await test('4·pure selectGenome sin match → COPYLAB_VOICE_NOT_FOUND nominal', async () => {
    await assertThrows(
      () => PURE.selectGenome([{ voice_id: 'lucien_editorial' }, { voice_id: 'lucien_social' }], 'nope', 'LucienSael'),
      'COPYLAB_VOICE_NOT_FOUND',
    );
    try { PURE.selectGenome([{ voice_id: 'lucien_editorial' }, { voice_id: 'lucien_social' }], 'nope', 'LucienSael'); } catch (e: any) {
      assert(e.message.includes('lucien_editorial') && e.message.includes('lucien_social'), 'debe listar las voces disponibles');
    }
  });

  // Case 7 (pure) — firma derivada + parsePiece separa TÍTULO
  await test('7·pure deriveSignature + parsePiece (title/body separados, sin estampar)', () => {
    const sig = PURE.deriveSignature([{ code: 'SIG-1', kind: 'firma', statement: '— Lucien Sael' }]);
    eq(sig.text, '— Lucien Sael', 'signature.text'); eq(sig.rule, 'SIG-1', 'signature.rule');
    eq(PURE.deriveSignature([{ code: 'R1', kind: 'compliance', statement: 'x' }]), null, 'sin regla de firma → null');
    const p = PURE.parsePiece('TÍTULO: Un título\n\nEste es el cuerpo.');
    eq(p.title, 'Un título', 'title'); eq(p.body, 'Este es el cuerpo.', 'body');
    assert(!p.body.endsWith(sig.text), 'body no debe terminar con la firma');
    eq(PURE.parsePiece('Solo cuerpo social.').title, null, 'social sin título');
  });

  // B2 (pure) — el mapa del carril: destino + plataforma → content_type + canal
  await test('B2·pure resolveCarrilContentType — el mapa (las 5 filas)', () => {
    for (const p of ['x', 'meta_fb', 'meta_ig', 'tiktok'])
      eq(JSON.stringify(PURE.resolveCarrilContentType('social', p)), JSON.stringify({ content_type: 'social_post', canal: p }), `social/${p}`);
    eq(JSON.stringify(PURE.resolveCarrilContentType('social', 'linkedin')), JSON.stringify({ content_type: 'social_post', canal: 'linkedin' }), 'social/linkedin');
    eq(JSON.stringify(PURE.resolveCarrilContentType('editorial', 'blog')), JSON.stringify({ content_type: 'editorial_post', canal: 'blog' }), 'editorial/blog');
    eq(JSON.stringify(PURE.resolveCarrilContentType('editorial', 'blog_forumphs')), JSON.stringify({ content_type: 'editorial_post', canal: 'blog' }), 'editorial/blog_forumphs');
    eq(JSON.stringify(PURE.resolveCarrilContentType('editorial', 'linkedin')), JSON.stringify({ content_type: 'editorial_post', canal: 'linkedin' }), 'editorial/linkedin');
    for (const d of ['social', 'editorial'])
      eq(JSON.stringify(PURE.resolveCarrilContentType(d, 'email_propietarios')), JSON.stringify({ content_type: 'email_divulgacion', canal: 'email' }), `${d}/email_propietarios`);
  });
  await test('B2·pure resolveCarrilContentType — plataforma desconocida: nombra + par de destination, nunca instagram mudo', () => {
    const s = PURE.resolveCarrilContentType('social', 'threads');
    eq(s.content_type, 'social_post', 'social desconocida → social_post'); eq(s.canal, 'threads', 'canal = la plataforma nombrada');
    const e = PURE.resolveCarrilContentType('editorial', 'substack');
    eq(e.content_type, 'editorial_post', 'editorial desconocida → editorial_post'); eq(e.canal, 'blog', 'canal = par de su destination (blog)');
    for (const [d, p] of [['social', 'bluesky'], ['editorial', 'medium']] as const)
      assert(PURE.resolveCarrilContentType(d, p).canal !== 'instagram', `nunca el ?? instagram mudo (${d}/${p})`);
    eq(PURE.resolveCarrilContentType('  SOCIAL ', ' Meta_IG ').canal, 'meta_ig', 'normaliza trim + lowercase');
  });
  await test('B2·pure filterCarrilImperativeRules — sólo prohibition|requirement|proof se prescriben', () => {
    eq(JSON.stringify([...PURE.CARRIL_IMPERATIVE_KINDS].sort()), JSON.stringify(['prohibition', 'proof', 'requirement']), 'kinds imperativos');
    const rules = [
      { code: 'HR-1', kind: 'prohibition', statement: 'a' }, { code: 'HR-2', kind: 'requirement', statement: 'b' },
      { code: 'HR-3', kind: 'proof', statement: 'c' }, { code: 'SIM-1', kind: 'similarity', statement: 'd' },
      { code: 'DUP-1', kind: 'duplication', statement: 'e' },
    ];
    eq(JSON.stringify(PURE.filterCarrilImperativeRules(rules).map((r: any) => r.code).sort()), JSON.stringify(['HR-1', 'HR-2', 'HR-3']), 'similitud/duplicación fuera');
    eq(JSON.stringify(PURE.filterCarrilImperativeRules(null)), JSON.stringify([]), 'null → []');
  });

  // Cambio 2 (pure) — precedencia por voz: voz > BASE > none, orden-independiente
  await test('Cambio2·pure selectCompatRule — voz gana, base, none, orden-independiente', () => {
    const rows = [
      { content_type: 'editorial_post', voice_id: null, allowed_aggro: ['AGGRO_1'] },              // BASE
      { content_type: 'editorial_post', voice_id: 'lucien_editorial', allowed_aggro: ['AGGRO_3'] }, // voz
      { content_type: 'social_post', voice_id: null, allowed_aggro: ['AGGRO_2'] },                   // otro tipo
    ];
    const voice = PURE.selectCompatRule(rows, 'editorial_post', 'lucien_editorial');
    eq(voice.source, 'voice', 'la fila de la voz gana');
    eq(JSON.stringify(voice.rule.allowed_aggro), JSON.stringify(['AGGRO_3']), 'devuelve la regla de la voz');
    const base = PURE.selectCompatRule(rows, 'editorial_post', 'voz_sin_fila');
    eq(base.source, 'base', 'sin fila de voz → BASE');
    eq(JSON.stringify(base.rule.allowed_aggro), JSON.stringify(['AGGRO_1']), 'devuelve la regla BASE');
    const ui = PURE.selectCompatRule(rows, 'social_post', null);
    eq(ui.source, 'base', 'sin voz declarada (UI) → BASE');
    const none = PURE.selectCompatRule([], 'editorial_post', 'lucien_editorial');
    eq(none.source, 'none', 'array vacío → none'); eq(none.rule, null, 'none → rule null');
    const noneType = PURE.selectCompatRule(rows, 'no_existe', 'lucien_editorial');
    eq(noneType.source, 'none', 'content_type sin filas → none');
    // orden-independiente: no depender del orden en que PostgREST devuelva las filas
    const rev = PURE.selectCompatRule([...rows].reverse(), 'editorial_post', 'lucien_editorial');
    eq(rev.source, 'voice', 'orden invertido: la voz sigue ganando');
    eq(JSON.stringify(rev.rule.allowed_aggro), JSON.stringify(['AGGRO_3']), 'orden invertido: misma regla');
  });

  // A1 (pure) — sustitución de variables: ambas sintaxis; ausente → vacío (no placeholder);
  // valor con caracteres especiales de regex ($&, $1) se inserta literal; unresolved nominal.
  await test('A1·pure applyTemplateVars — {{ }} y { }, ausente→vacío (no placeholder), $& literal', () => {
    const r1 = PURE.applyTemplateVars('Hola {{marca}} en {geo}', { marca: 'ACME', geo: 'Miami' });
    eq(r1.text, 'Hola ACME en Miami', 'ambas sintaxis {{ }} y { }');
    eq(JSON.stringify(r1.unresolved), JSON.stringify([]), 'todo resuelto → unresolved vacío');
    const r2 = PURE.applyTemplateVars('A {{falta}} B {presente}', { presente: 'X' });
    eq(r2.text, 'A  B X', 'clave ausente → cadena vacía, NUNCA el placeholder');
    assert(!r2.text.includes('{{') && !r2.text.includes('}}') && !r2.text.includes('{falta'), 'sin placeholder crudo');
    eq(JSON.stringify(r2.unresolved), JSON.stringify(['falta']), 'unresolved nombra la clave');
    // valor vacío = sin valor → unresolved + vacío
    const r3 = PURE.applyTemplateVars('[{{cta_base}}]', { cta_base: '' });
    eq(r3.text, '[]', 'valor vacío → cadena vacía');
    eq(JSON.stringify(r3.unresolved), JSON.stringify(['cta_base']), 'valor vacío cuenta como no resuelto');
    // un valor con patrones especiales de String.replace ($&, $1, $`) va LITERAL
    const r4 = PURE.applyTemplateVars('{{v}}', { v: 'precio $& $1 $` fin' });
    eq(r4.text, 'precio $& $1 $` fin', 'el valor con $&/$1/$` se inserta literal, no se interpola');
  });

  // A2·a (pure) — puente plataforma → canal_block_id
  await test('A2a·pure resolveCanalBlockId — match, email, inexistente, active:false, traffic_type', () => {
    const rows = [
      { platform: 'meta_ig', traffic_type: 'organic', canal_block_id: 'INSTAGRAM_ORGANICO', content_type: null, active: true },
      { platform: 'email_propietarios', traffic_type: 'organic', canal_block_id: 'EMAIL', content_type: null, active: true },
      { platform: 'tiktok', traffic_type: 'organic', canal_block_id: 'TIKTOK_ORGANICO', content_type: null, active: false }, // inactiva
    ];
    const ig = PURE.resolveCanalBlockId(rows, 'meta_ig', 'organic');
    eq(ig.canal_block_id, 'INSTAGRAM_ORGANICO', 'meta_ig + organic → INSTAGRAM_ORGANICO'); eq(ig.source, 'map', 'source map');
    eq(ig.forced_content_type, null, 'forced_content_type null en organic (gancho ADS)');
    eq(PURE.resolveCanalBlockId(rows, 'email_propietarios').canal_block_id, 'EMAIL', 'email_propietarios → EMAIL (organic por defecto)');
    eq(PURE.resolveCanalBlockId(rows, 'no_existe').source, 'none', 'plataforma inexistente → none, sin excepción');
    eq(PURE.resolveCanalBlockId(rows, 'tiktok', 'organic').source, 'none', 'fila active:false no matchea');
    // traffic_type distinto: el set actual no tiene paid → none (impide que ADS se cuele antes de tiempo)
    eq(PURE.resolveCanalBlockId(rows, 'meta_ig', 'paid').source, 'none', "meta_ig + 'paid' → none sobre el set organic");
  });

  // Case 2 (pure) — precedencia de idioma sin literal 'ES'; empty = absence
  await test('2·pure resolveLanguage nunca inventa ES; sliceOf trata [] como ausencia', () => {
    eq(PURE.resolveLanguage(null, undefined, undefined, 'en/FL'), 'en/FL', 'cae a brands.language_primary');
    eq(PURE.resolveLanguage('EN', undefined, 'ES', 'en/FL'), 'EN', 'builder gana');
    eq(PURE.resolveLanguage(null, undefined, undefined, null), null, 'sin fuente → null (el caller lanza)');
    const nc = PURE.normalizeCache({ brands: [], brand_voice_genome: [GENOME_V1] }).cache;
    eq(PURE.sliceOf(nc, 'brands'), null, 'brands [] es ausencia');
    assert(PURE.sliceOf(nc, 'brand_voice_genome')?.length === 1, 'genome presente');
    eq(PURE.normalizeCache({ foo: 1 }).cache, null, 'forma desconocida → cache null (se ignora, se consulta)');
  });

  console.log('\n[integración · buildPrompt / handler con fetch mockeado]');

  // Case 1 — golden UI (A2·b). Tras el trasplante, el golden ES la nueva referencia
  // (gramática buildCopyPrompt). El prompt del modo UI debe reproducirlo BYTE A BYTE.
  // (Antes de A2·b esto era un test de "deltas vs da182aa"; el reformat lo vuelve equidad
  // estricta — el mecanismo de lista blanca clasificar/DELTA queda obsoleto y se retira.)
  // Cualquier drift falla con el diff impreso; el golden sólo se recongela con Sam mirándolo.
  await test('1·golden UI: buildPrompt(FULL_SNAPSHOT) reproduce el golden byte a byte', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const actual = (await buildPrompt(reqWith({ brandContext: FULL_SNAPSHOT }))).system;
      const golden = stripGoldenHeader(readFileSync(new URL('./__fixtures__/golden_ui_main.txt', import.meta.url), 'utf8'));
      const diffs = diffLines(golden, actual);
      assert(diffs.length === 0, `el prompt UI difiere del golden (${diffs.length} renglones) — revisar y recongelar con Sam:\n${diffs.map(fmtDiff).join('\n')}`);
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // Case 1-prod — golden UI sobre la forma REAL de PRODUCCIÓN (PROD_SNAPSHOT: registro
  // `brand` singular v2.1, dos genomas hermanos, humanize [DEFAULT×5 + marca(text)], idioma
  // en/FL). Byte a byte contra su golden — cubre que la forma de producción arma el prompt
  // esperado (idioma real, humanize de la marca, etc., ahora horneados en la referencia A2·b).
  await test('1-prod·golden UI PROD: buildPrompt(PROD_SNAPSHOT) reproduce el golden byte a byte', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const actual = (await buildPrompt(reqWith({ brandContext: PROD_SNAPSHOT }, { brandId: 'LucienSael' }))).system;
      const golden = stripGoldenHeader(readFileSync(new URL('./__fixtures__/golden_ui_prod.txt', import.meta.url), 'utf8'));
      const diffs = diffLines(golden, actual);
      assert(diffs.length === 0, `el prompt UI PROD difiere del golden (${diffs.length} renglones) — revisar y recongelar con Sam:\n${diffs.map(fmtDiff).join('\n')}`);
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // Case 1b — determinismo + ausencia de fugas de carril en modo UI
  await test('1b·determinismo + sin fugas de carril (UI sin builder_input)', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const a = await buildPrompt(reqWith({ brandContext: FULL_SNAPSHOT }));
      const b = await buildPrompt(reqWith({ brandContext: FULL_SNAPSHOT }));
      eq(a.system, b.system, 'determinista con Math.random fijo');
      // A2·b — gramática nueva (buildCopyPrompt) + orden nuevo: contexto → restricciones →
      // ángulo creativo → forma de salida. El template cierra (último bloque).
      assert(a.system.startsWith('Eres CopyLab v9.7, el motor de copy de UNRLVL Studio. Content Pipeline v2.6.\n\n## MARCA: BrandX'), 'preámbulo + ## MARCA exactos');
      assertOrdered(a.system, [
        '## MARCA: BrandX',
        '## OBJETIVOS ESTRATÉGICOS DE LA MARCA', '## SEGMENTOS OBJETIVO (ICP)',
        '## IDIOMA DE OUTPUT', '## CANAL: INSTAGRAM',
        'VOZ DE MARCA — BASE (L1):', '## GEOMIX — US', '## KEYWORDS', '## CTA ACTIVO',
        '## COMPLIANCE — REGLAS OBLIGATORIAS', '## VOZ DE MARCA — BP_COPY_1.0',
        '## L1.5 VOICE GENOME INJECTION',
        '## L14 CREATIVE VECTOR [VEC1', '## L15 TENSION ARCHITECTURE [TEN1', '## L16 AGGRO DIAL [AGGRO_2',
        '## TEMPLATE DE OUTPUT [TPL]',
      ]);
      // genoma DESPUÉS del copy profile; template DESPUÉS de los creativos (cierra)
      assert(a.system.indexOf('## VOZ DE MARCA — BP_COPY_1.0') < a.system.indexOf('## L1.5 VOICE GENOME'), 'genoma tras copy profile');
      assert(a.system.indexOf('## L16 AGGRO DIAL') < a.system.indexOf('## TEMPLATE DE OUTPUT [TPL]'), 'template tras el ángulo creativo (forma de salida al final)');
      for (const leak of ['EJE ESTRUCTURAL', 'REGLAS DEL WATCHER', 'PSICO-ESTÍMULO', 'MATERIA PRIMA', 'FORMATO (']) {
        assert(!a.system.includes(leak) && !a.user.includes(leak), `fuga de carril en modo UI: ${leak}`);
      }
      eq(fx.calls.length, 0, 'cache completo ⇒ CERO queries directas');
      eq(a.max_tokens, 1600, 'techo UI');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // Case 2 — colisión: bc sin `brands` → la query de brands SÍ se ejecuta, idioma real, sin 'ES'
  await test('2·colisión: bc sin brands ⇒ query brands se ejecuta, language real, sin ES', async () => {
    const fx = installFetch({ tables: { brands: [{ id: 'UnrealvilleStudio', display_name: 'UNRLVL', market: 'Miami', language_primary: 'en/FL' }] } });
    try {
      const built = await buildPrompt(reqWith({ brandContext: { brand_voice_genome: [GENOME_V1] } }, { brandId: 'UnrealvilleStudio' }));
      assert(fx.calls.some(u => u.includes('/rest/v1/brands?id=eq.UnrealvilleStudio')), 'la query directa de brands debe ejecutarse');
      eq(built.language, 'en/FL', 'idioma real de brands.language_primary');
      assert(built.system.includes('Idioma: en/FL') && built.system.includes('**en/FL**'), 'system con idioma real (## MARCA + ## IDIOMA DE OUTPUT)');
      assert(!/(?:en|exclusivamente en): \*\*Español/.test(built.system) && !built.system.includes('IDIOMA: ES'), "el literal 'ES' no aparece por ningún camino");
    } finally { fx.restore(); }
  });

  // Case 2b — la forma REAL de producción: bc.brand (singular, objeto) que
  // escribe brand-cache.js v2.1 (línea 201), no solo bc.brands[] (plural).
  // Cache completo en ambas formas ⇒ el registro se resuelve del cache y NO se
  // consulta nada (fx.calls === 0): la forma singular alcanza el modo cero-query.
  await test('2b·clave normalizada: bc.brand (v2.1) ≡ bc.brands[0] (v2.0)', async () => {
    const rec = { id: 'B', display_name: 'UNRLVL', market: 'Miami', language_primary: 'en/FL' };
    const { brands: _b, ...rest } = FULL_SNAPSHOT;
    const fx = installFetch({});
    try {
      const singular = await buildPrompt(reqWith({ brandContext: { ...rest, brand: rec } }, { brandId: 'B' }));
      const plural   = await buildPrompt(reqWith({ brandContext: { ...rest, brands: [rec] } }, { brandId: 'B' }));
      eq(singular.language, 'en/FL', 'la forma singular resuelve el idioma');
      eq(singular.language, plural.language, 'ambas formas dan el mismo idioma');
      assert(singular.system.includes('## MARCA: UNRLVL') && singular.system.includes('Mercado: Miami'), 'display_name y market desde la forma singular');
      eq(singular.system, plural.system, 'system byte-idéntico entre ambas formas');
      eq(fx.calls.length, 0, 'con el registro resuelto y el cache completo: CERO queries');
    } finally { fx.restore(); }
  });

  await test('2b-neg·brand null es ausencia, no cobertura', async () => {
    const fx = installFetch({ tables: { brands: [{ id: 'X', display_name: 'X', market: 'US', language_primary: 'en-US' }] } });
    try {
      await buildPrompt(reqWith({ brandContext: { brand: null, brand_voice_genome: [GENOME_V1] } }, { brandId: 'X' }));
      assert(fx.calls.some(u => u.includes('/rest/v1/brands?id=eq.X')), 'brand:null NO puede cancelar la query');
    } finally { fx.restore(); }
  });

  // Case 2c — precedencia de humanize: la fila de la marca gana al DEFAULT, sea
  // cual sea el orden del array (buildSnapshot mergea DEFAULT primero, línea 204
  // — orden adverso por construcción). Es el tercer delta de §3.6, ya resuelto
  // por selectHumanize (A2).
  await test('2c·humanize: la fila de la marca gana al DEFAULT, orden-independiente', async () => {
    const DEF   = { id: 'd', brand_id: 'DEFAULT', medium: 'copy', tone: 'neutro', personality: 'p0', authenticity_rules: 'a0', anti_patterns: ['x0'] };
    const BRAND = { id: 'b', brand_id: 'B', medium: 'copy', tone: 'seco', personality: 'p1', authenticity_rules: 'a1', anti_patterns: ['x1'] };
    const base  = { brands: [{ id: 'B', language_primary: 'en-US' }], brand_voice_genome: [GENOME_V1] };
    const fx = installFetch({});
    try {
      const adverso = await buildPrompt(reqWith({ brandContext: { ...base, humanize_profiles: [DEF, BRAND] } }));
      const favor   = await buildPrompt(reqWith({ brandContext: { ...base, humanize_profiles: [BRAND, DEF] } }));
      assert(adverso.system.includes('seco') && !adverso.system.includes('neutro'), 'orden adverso: gana la marca');
      eq(adverso.system, favor.system, 'orden-independiente');
      const solo = await buildPrompt(reqWith({ brandContext: { ...base, humanize_profiles: [DEF] } }));
      assert(solo.system.includes('neutro'), 'sin fila de marca, DEFAULT es lo correcto');
    } finally { fx.restore(); }
  });

  // A2-a..d — selectHumanize (bloque puro): los dos ejes (marca>DEFAULT,
  // medium copy>text) + fallback a DEFAULT + determinismo.
  await test('A2-a·humanize: [DEFAULT×5 desordenado, marca(copy)] → gana la marca', () => {
    const rows = [
      { id: '1', brand_id: 'DEFAULT', medium: 'image' }, { id: '2', brand_id: 'DEFAULT', medium: 'voice' },
      { id: '3', brand_id: 'DEFAULT', medium: 'copy' },  { id: '4', brand_id: 'DEFAULT', medium: 'video' },
      { id: '5', brand_id: 'DEFAULT', medium: 'web' },   { id: '6', brand_id: 'LucienSael', medium: 'copy' },
    ];
    eq(PURE.selectHumanize(rows, 'LucienSael').id, '6', 'gana la fila de la marca aunque venga última');
  });
  await test('A2-b·humanize: marca con único perfil medium=text (LucienSael) → ese', () => {
    const rows = [
      { id: 'd-copy', brand_id: 'DEFAULT', medium: 'copy' },
      { id: 'lucien', brand_id: 'LucienSael', medium: 'text' },
    ];
    eq(PURE.selectHumanize(rows, 'LucienSael').id, 'lucien', 'medium=text de la marca gana al copy de DEFAULT');
  });
  await test('A2-c·humanize: marca sin fila → DEFAULT de medium=copy, nunca null ni video', () => {
    const rows = [
      { id: 'v', brand_id: 'DEFAULT', medium: 'video' }, { id: 'c', brand_id: 'DEFAULT', medium: 'copy' },
      { id: 'i', brand_id: 'DEFAULT', medium: 'image' },
    ];
    const got = PURE.selectHumanize(rows, 'MarcaSinFila');
    assert(got !== null, 'nunca null cuando hay DEFAULT');
    eq(got.id, 'c', 'cae al DEFAULT de copy, no a video');
  });
  await test('A2-d·humanize: determinista ante el mismo conjunto desordenado', () => {
    const a = [
      { id: '3', brand_id: 'DEFAULT', medium: 'copy' }, { id: '1', brand_id: 'DEFAULT', medium: 'web' },
      { id: '2', brand_id: 'B', medium: 'text' },       { id: '4', brand_id: 'B', medium: 'copy' },
    ];
    const b = [...a].reverse();
    eq(PURE.selectHumanize(a, 'B').id, PURE.selectHumanize(b, 'B').id, 'mismo id sin importar el orden');
    eq(PURE.selectHumanize(a, 'B').id, '4', 'marca + copy gana');
  });

  // A3 — el modo literal (teasers/announcements del Orchestrator) elegía el
  // genoma por `[0]`: el mismo bug que §5.4 corrigió en buildPrompt, intacto en
  // el otro camino. LucienSael tiene dos genomas activos.
  await test('A3-a·literal: selecciona el genoma por voice_id (no [0])', async () => {
    const cache = { brand_voice_genome: [
      { voice_id: 'lucien_editorial', identity_anchors: 'ANCHOR_EDITORIAL' },
      { voice_id: 'lucien_social', identity_anchors: 'ANCHOR_SOCIAL' },
    ] };
    const fx = installFetch({ snapshot: [{ cache_data: cache }], claude: { content: [{ text: '{"caption":"x","hashtags":[]}' }], usage: {} } });
    try {
      await runLiteralCopy('hola', 'EN', 'LucienSael', 'lucien_social');
      const sys = String(fx.claudeBodies[0]?.system ?? '');
      assert(sys.includes('ANCHOR_SOCIAL') && !sys.includes('ANCHOR_EDITORIAL'), 'usa el genoma social, no el [0] del array');
    } finally { fx.restore(); }
  });
  await test('A3-a-warn·literal: sin voice_id y >1 genoma → warn nominal, no silencio', async () => {
    const warns: string[] = [];
    const realWarn = console.warn; console.warn = (...a: any[]) => { warns.push(a.join(' ')); };
    const cache = { brand_voice_genome: [{ voice_id: 'lucien_editorial' }, { voice_id: 'lucien_social' }] };
    const fx = installFetch({ snapshot: [{ cache_data: cache }], claude: { content: [{ text: '{"caption":"x","hashtags":[]}' }], usage: {} } });
    try {
      await runLiteralCopy('hola', 'EN', 'LucienSael', null);
      assert(warns.some(w => w.includes('LucienSael') && w.includes('lucien_editorial') && w.includes('lucien_social')), 'warn nominal listando las voces');
    } finally { fx.restore(); console.warn = realWarn; }
  });

  // Case 5 — cache vacío (NeuroneSCF): creative_vectors [] → query directa, no vector=null mudo
  await test('5·cache vacío: creative_vectors [] ⇒ query directa, vector_id NO es null', async () => {
    const fx = installFetch({
      tables: {
        creative_vectors: [{ id: 'V', category: 'c', label: 'L', instruction: 'i', aggro_min: 1, aggro_max: 5 }],
        tension_architectures: [{ id: 'T', label: 'L', instruction: 'i', curve: 'c' }],
        aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' }],
      },
    });
    try {
      const built = await buildPrompt(reqWith({ brandContext: { brands: [{ id: 'NeuroneSCF', language_primary: 'es-FL' }], creative_vectors: [] } }, { brandId: 'NeuroneSCF' }));
      assert(fx.calls.some(u => u.includes('/rest/v1/creative_vectors?active=eq.true')), 'creative_vectors [] debe caer a query directa');
      assert(built.creative_seed.vector_id !== null, 'el motor creativo se restaura (vector_id no null)');
    } finally { fx.restore(); }
  });

  // Case 6 + 7 — usage real + firma sin estampar (respuesta de modo carril, end-to-end)
  await test('6+7·carril handler: usage real, signature devuelta, body no termina con la firma', async () => {
    const fx = installFetch({ claude: { content: [{ text: 'Cuerpo de la pieza social lista.' }], usage: { input_tokens: 11, output_tokens: 22 } } });
    try {
      const r = makeRes();
      const body = reqWith(
        { brandContext: { brands: [{ id: 'B', language_primary: 'en-US' }], brand_voice_genome: [GENOME_V1] } },
        // B2 — la regla 'firma' se SURFACEA como signature (deriveSignature), NO se inyecta como orden; la
        // 'prohibition' SÍ se inyecta. Por eso rules_count = 1 (sólo la imperativa), y la firma va aparte.
        { builder_input: { domain: 'd', voice_id: 'v1', destination: 'social', platform: 'meta_ig', language: 'en-US', psycho_preset: null, rules: [{ code: 'SIG-1', kind: 'firma', statement: '— Lucien Sael' }, { code: 'HR-9', kind: 'prohibition', statement: 'No prometer resultados.' }], iid_brief: 'Algo pasó hoy', angle: null, audience_frame: 'general' } },
      );
      await handler({ method: 'POST', body } as any, r as any);
      const o = r._out;
      eq(o._status, 200, 'HTTP 200');
      eq(o._json.status, 'ok', 'status ok');
      eq(o._json.usage.input_tokens, 11, 'usage.input_tokens de la API');   // case 6
      eq(o._json.usage.output_tokens, 22, 'usage.output_tokens de la API'); // case 6
      eq(o._json.signature.text, '— Lucien Sael', 'signature.text');        // case 7
      eq(o._json.signature.rule, 'SIG-1', 'signature.rule');
      eq(o._json.title, null, 'social → sin título');
      eq(o._json.body, 'Cuerpo de la pieza social lista.', 'body limpio');
      assert(!o._json.body.endsWith(o._json.signature.text), 'body NO termina con signature.text (sin estampar)');
      eq(o._json.meta.voice_id, 'v1', 'meta.voice_id');
      eq(o._json.meta.rules_count, 1, 'meta.rules_count — sólo la imperativa (la firma se surfacea, no se inyecta)');
      assert(!(o._json.meta.rules_injected ?? []).includes('SIG-1'), 'la regla firma NO entra en rules_injected');
    } finally { fx.restore(); }
  });

  // Case 8 — falla: 4xx de PostgREST → throw con el cuerpo; 200 + [] → degrada con warn nominal
  await test('8a·falla: 4xx de PostgREST → throw con el cuerpo de la respuesta', async () => {
    const fx = installFetch({ tables: { brands: (_u: string) => res('column "foo" does not exist', 400) } });
    try {
      await assertThrows(() => buildPrompt(reqWith({}, { brandId: 'Z' })), 'column "foo" does not exist');
    } finally { fx.restore(); }
  });
  await test('8b·falla: 200 + [] → degrada con warn nominal (no throw, no vector=null mudo)', async () => {
    const warns: string[] = [];
    const realWarn = console.warn; console.warn = (...a: any[]) => { warns.push(a.join(' ')); };
    const fx = installFetch({ tables: { creative_vectors: [] } });
    try {
      const built = await buildPrompt(reqWith({ brandContext: { brands: [{ id: 'B', language_primary: 'en-US' }], creative_vectors: [] } }));
      eq(built.creative_seed.vector_id, null, 'degrada a vector null (no throw)');
      assert(warns.some(w => w.includes('creative_vectors') && w.includes('B')), 'warn nominal (marca + fuente)');
    } finally { fx.restore(); console.warn = realWarn; }
  });

  // Case 9 — techo por destino a través de buildPrompt
  await test('9·techo: buildPrompt editorial 4000 · social 640 · UI 1600', async () => {
    const fx = installFetch({});
    try {
      const bctx = { brandContext: { brands: [{ id: 'B', language_primary: 'en-US' }], brand_voice_genome: [GENOME_V1] } };
      const ed = await buildPrompt(reqWith(bctx, { builder_input: { domain: 'd', voice_id: 'v1', destination: 'editorial', platform: 'blog', language: 'en-US', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null } }));
      const so = await buildPrompt(reqWith(bctx, { builder_input: { domain: 'd', voice_id: 'v1', destination: 'social', platform: 'x', language: 'en-US', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null } }));
      const ui = await buildPrompt(reqWith(bctx));
      eq(ed.max_tokens, 4000, 'editorial'); eq(so.max_tokens, 640, 'social'); eq(ui.max_tokens, 1600, 'UI');
    } finally { fx.restore(); }
  });

  // ── Cambio 1 + 2 · integración del registro y la precedencia por voz ────────

  // Base para los tres tests de registro: catálogo creativo con AGGRO_1/2/3 para
  // distinguir de qué fila salió el aggro (voz vs BASE).
  const REG_BASE = {
    brands: [{ id: 'B', display_name: 'BrandX', market: 'US', language_primary: 'en-US' }],
    brand_voice_genome: [
      { voice_id: 'lucien_editorial', version: '1', maturity: 'stable', identity_anchors: 'ia', lexicon_signature: {}, lexicon_forbidden: [], syntactic_signatures: {}, argumentative_architecture: {}, relational_stance: {}, emotional_register: 'er', prohibited_registers: [] },
      { voice_id: 'lucien_social', version: '1', maturity: 'stable', identity_anchors: 'ia', lexicon_signature: {}, lexicon_forbidden: [], syntactic_signatures: {}, argumentative_architecture: {}, relational_stance: {}, emotional_register: 'er', prohibited_registers: [] },
    ],
    creative_vectors: [{ id: 'VEC1', category: 'c', label: 'L', instruction: 'i', aggro_min: 1, aggro_max: 5 }],
    tension_architectures: [{ id: 'TEN1', label: 'L', instruction: 'i', curve: 'c' }],
    aggro_presets: [
      { id: 'AGGRO_1', level: 1, label: 'L', instruction: 'i', anti_hedging: 'h' },
      { id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' },
      { id: 'AGGRO_3', level: 3, label: 'L', instruction: 'i', anti_hedging: 'h' },
    ],
  };
  const carrilBI = (extra: any) => ({ domain: 'd', voice_id: 'v', destination: 'social', platform: 'x', language: 'en-US', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null, ...extra });

  // INT-1 — editorial_post + lucien_editorial: gana la fila de la voz; el aggro sale
  // de SU allowed_aggro (AGGRO_3), no del de la BASE (AGGRO_1) ni del aggro_default del
  // registro (2). Prueba el registro (editorial_post→blog) y la precedencia por voz juntos.
  await test('INT-1·registro+voz: editorial_post + lucien_editorial → fila de voz, aggro_id=AGGRO_3', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        content_type_registry: [{ content_type: 'editorial_post', pipeline_family: 'blog', output_template_id: null, aggro_default: 2, active: true }],
        creative_compatibility_rules: [
          { content_type: 'editorial_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_1'] },
          { content_type: 'editorial_post', voice_id: 'lucien_editorial', allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_3'] },
        ],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ voice_id: 'lucien_editorial', destination: 'editorial', platform: 'blog' }) }));
      eq(built.creative_seed.aggro_id, 'AGGRO_3', 'el aggro sale de la fila de la voz, no de la BASE (AGGRO_1) ni del aggro_default (2)');
      eq(built.max_tokens, 4000, 'techo editorial (confirma que resolvió editorial_post)');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // INT-2 — social_post + lucien_social: no hay fila de voz → cae a BASE, y como HAY
  // voz declarada el warn es el específico ("usando fila BASE — <voz> no tiene la suya").
  await test('INT-2·registro+voz: social_post + lucien_social → BASE con warn nominal de voz', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const warns: string[] = [];
    const realWarn = console.warn; console.warn = (...a: any[]) => { warns.push(a.join(' ')); };
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
        creative_compatibility_rules: [
          { content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] },
        ],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ voice_id: 'lucien_social', destination: 'social', platform: 'x' }) }));
      eq(built.creative_seed.aggro_id, 'AGGRO_2', 'aggro de la fila BASE');
      assert(warns.some(w => w.includes('fila BASE') && w.includes('lucien_social')), 'warn nominal: BASE + la voz que no tiene la suya');
      assert(!warns.some(w => w.includes('ni fila de voz ni BASE')), 'NO es el warn de degradación total (sí hay BASE)');
    } finally { fx.restore(); Math.random = realRandom; console.warn = realWarn; }
  });

  // INT-3 — un content_type sin fila en el registro: degrada con warn nominal
  // (pipeline_family = el content_type, aggro ?? 2, template por category) y NO rompe.
  await test('INT-3·registro: content_type sin fila → warn nominal + degrada, no throw', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const warns: string[] = [];
    const realWarn = console.warn; console.warn = (...a: any[]) => { warns.push(a.join(' ')); };
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        // el registro NO tiene social_post (sólo editorial_post) → la fila pedida falta
        content_type_registry: [{ content_type: 'editorial_post', pipeline_family: 'blog', output_template_id: null, aggro_default: 2, active: true }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache })); // UI mode, pack default → social_post
      assert(warns.some(w => w.includes('sin content_type_registry') && w.includes('social_post')), 'warn nominal nombrando el content_type');
      eq(built.creative_seed.aggro_id, 'AGGRO_2', 'degrada: aggro ?? 2 → BASE permite AGGRO_2');
      assert(built.system.length > 0, 'no rompe: sigue armando el prompt');
    } finally { fx.restore(); Math.random = realRandom; console.warn = realWarn; }
  });

  // INT-4 — la DOBLE lectura del registro (corrección de Sam al brief). Un email_sequence
  // en position 2 (creativeContentType='abandoned_cart_2', pipelineContentType='email_sequence'):
  //   • aggro sale del EJE CREATIVO (abandoned_cart_2 → 4), no del pipeline (2).
  //   • output_template sale del EJE PIPELINE (email_sequence → prompt_Email_Sequence),
  //     no del creativo (Email_Campaign).
  // Aplastar los dos ejes en uno rompería uno u otro (bajaría el aggro a 2 o borraría el
  // template de la secuencia — el bug gemelo).
  await test('INT-4·registro doble eje: email_sequence + abandoned_cart_2 → aggro AGGRO_4 (creativo) + template del pipeline', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        brand_voice_genome: [{ voice_id: 'v1', version: '1', maturity: 'stable', identity_anchors: 'ia', lexicon_signature: {}, lexicon_forbidden: [], syntactic_signatures: {}, argumentative_architecture: {}, relational_stance: {}, emotional_register: 'er', prohibited_registers: [] }],
        aggro_presets: [
          { id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' },
          { id: 'AGGRO_4', level: 4, label: 'L', instruction: 'i', anti_hedging: 'h' },
        ],
        content_type_registry: [
          { content_type: 'abandoned_cart_2', pipeline_family: 'email', output_template_id: 'Email_Campaign', aggro_default: 4, active: true },
          { content_type: 'email_sequence', pipeline_family: 'email_sequence', output_template_id: 'prompt_Email_Sequence', aggro_default: 2, active: true },
        ],
        output_templates: [
          { id: 'Email_Campaign', name: 'CAMP', category: 'email', template_text: 'camp', active: true },
          { id: 'prompt_Email_Sequence', name: 'SEQ', category: 'email_sequence', template_text: 'seqtmpl', active: true },
        ],
        // sin creative_compatibility_rules para abandoned_cart_2 → el aggro_id cae al
        // AGGRO_<aggroLevel> (4), probando que aggroLevel salió del eje creativo.
      };
      const built = await buildPrompt(reqWith(
        { brandContext: cache },
        { params: { pack: 'email_sequence_cart' }, meta: { sequence_type: 'abandoned_cart', position: 2, language: 'en-US' } },
      ));
      eq(built.creative_seed.aggro_id, 'AGGRO_4', 'aggro del EJE CREATIVO (abandoned_cart_2 → 4), no del pipeline (2)');
      eq(built.output_template_id, 'prompt_Email_Sequence', 'template del EJE PIPELINE (email_sequence), no del creativo (Email_Campaign)');
      assert(built.system.includes('TEMPLATE DE OUTPUT [SEQ]') && !built.system.includes('[CAMP]'), 'el system lleva el template de la secuencia, no el del carrito');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // INT-5 — el hueco: modo UI en CACHE MISS de compat → query directa. El filtro
  // top-level sin voz debe ser `voice_id=is.null` (no la forma con punto, que es un
  // filtro sobre columna inexistente → 400 → sbArray lanza). Los otros tests van por
  // fixture (slice presente) y nunca ejercen esta rama. El mock devuelve 400 si el
  // filtro NO es la forma correcta, reproduciendo el fallo real de PostgREST.
  await test('INT-5·UI cache-miss: compat por query directa usa voice_id=is.null (no rompe con 400)', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({
      tables: {
        creative_vectors: [{ id: 'V', category: 'c', label: 'L', instruction: 'i', aggro_min: 1, aggro_max: 5 }],
        tension_architectures: [{ id: 'T', label: 'L', instruction: 'i', curve: 'c' }],
        aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' }],
        creative_compatibility_rules: (u: string) =>
          u.includes('voice_id=is.null')
            ? res([{ content_type: 'social_post', voice_id: null, allowed_vectors: ['V'], excluded_vectors: [], allowed_tensions: ['T'], allowed_aggro: ['AGGRO_2'] }])
            : res('column creative_compatibility_rules.voice_id.is does not exist', 400),
      },
    });
    try {
      // modo UI (sin builder_input), cache sin slice de creative_compatibility_rules → query directa
      const built = await buildPrompt(reqWith({ brandContext: { brands: [{ id: 'B', language_primary: 'en-US' }] } }));
      assert(fx.calls.some(u => u.includes('/rest/v1/creative_compatibility_rules') && u.includes('voice_id=is.null')), 'la query directa usa voice_id=is.null (forma top-level correcta)');
      eq(built.creative_seed.aggro_id, 'AGGRO_2', 'resuelve BASE por query directa sin romper (400)');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // A1-int-1 — email_sequence + prompt_Email_Sequence: los {{...}} del template se
  // sustituyen; el system no lleva ningún placeholder crudo. (position=1 para no arrastrar
  // los {{ item.* }} de Klaviyo que las CART B RULES meten en position=2 — esos son Liquid
  // del proveedor de email, no variables de template.)
  await test('A1-int-1: email_sequence + prompt_Email_Sequence → el system no contiene {{ ni }}', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        brand_voice_genome: [],
        brands: [{ id: 'B', display_name: 'ACME', market: 'US', language_primary: 'en-US', cta_base: 'Comprá ya', geo_principal: 'Miami' }],
        content_type_registry: [
          { content_type: 'email_sequence', pipeline_family: 'email_sequence', output_template_id: 'prompt_Email_Sequence', aggro_default: 2, active: true },
        ],
        output_templates: [
          { id: 'prompt_Email_Sequence', name: 'SEQ', category: 'email_sequence', template_text: 'Hola {{marca}} — {{cta_base}} en {geo_principal}. {{disclaimer_base}}', active: true },
        ],
      };
      const built = await buildPrompt(reqWith(
        { brandContext: cache },
        { params: { pack: 'email_sequence_welcome' }, meta: { sequence_type: 'welcome', position: 1, language: 'en-US' } },
      ));
      assert(!built.system.includes('{{') && !built.system.includes('}}'), 'ningún placeholder {{ }} crudo llega al modelo');
      assert(built.system.includes('Hola ACME — Comprá ya en Miami'), 'las variables con valor se sustituyen');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // A1-int-2 — un template con una variable inexistente: se sustituye por vacío, se nombra
  // en template_vars_unresolved, y NUNCA llega cruda al system.
  await test('A1-int-2: variable inexistente → template_vars_unresolved la nombra, no va cruda al system', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        brand_voice_genome: [],
        brands: [{ id: 'B', display_name: 'ACME', language_primary: 'en-US' }],
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: 'tX', aggro_default: 2, active: true }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
        aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' }],
        output_templates: [{ id: 'tX', name: 'TX', category: 'social_post', template_text: 'Foo {{no_existe_var}} bar', active: true }],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache })); // UI mode, pack default → social_post
      assert(built.template_vars_unresolved.includes('no_existe_var'), 'template_vars_unresolved nombra la variable inexistente');
      assert(!built.system.includes('{{') && !built.system.includes('no_existe_var'), 'la variable no llega cruda al system');
      assert(built.system.includes('## TEMPLATE DE OUTPUT [TX]\nFoo  bar'), 'sustituida por vacío (Foo  bar)');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // A1-int-3 — disclaimer_base es variable de CUMPLIMIENTO: si el template la pide y la
  // marca no la tiene, va vacía (NUNCA '[DISCLAIMER]'), entra en template_vars_unresolved
  // Y además se marca aparte en template_vars_unresolved_compliance (el Watcher la lee).
  await test('A1-int-3: disclaimer_base ausente → vacío (no [DISCLAIMER]) + template_vars_unresolved_compliance', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const errs: string[] = [];
    const realErr = console.error; console.error = (...a: any[]) => { errs.push(a.join(' ')); };
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        brand_voice_genome: [],
        brands: [{ id: 'B', display_name: 'ACME', language_primary: 'en-US' }], // sin disclaimer_base
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: 'tD', aggro_default: 2, active: true }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
        aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' }],
        output_templates: [{ id: 'tD', name: 'TD', category: 'social_post', template_text: 'Legal: {{disclaimer_base}} fin', active: true }],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache }));
      assert(built.template_vars_unresolved.includes('disclaimer_base'), 'entra en el unresolved general');
      assert(built.template_vars_unresolved_compliance.includes('disclaimer_base'), 'marcada aparte como compliance');
      assert(!built.system.includes('[DISCLAIMER]'), "NUNCA el literal '[DISCLAIMER]'");
      assert(built.system.includes('Legal:  fin'), 'sustituida por vacío');
      assert(errs.some(e => e.includes('COMPLIANCE') && e.includes('disclaimer_base')), 'warn de severidad distinta (error) nombrando la variable');
    } finally { fx.restore(); Math.random = realRandom; console.error = realErr; }
  });

  // A2a-int-1 — carril blog_forumphs: platform_canal_map lo mapea a BLOG y se emite el
  // block_text real (## CANAL: BLOG), no la línea genérica.
  await test('A2a-int-1: carril blog_forumphs → ## CANAL: BLOG con block_text real, sin layer genérico', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        content_type_registry: [{ content_type: 'editorial_post', pipeline_family: 'blog', output_template_id: null, aggro_default: 2, active: true }],
        creative_compatibility_rules: [{ content_type: 'editorial_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
        platform_canal_map: [{ platform: 'blog_forumphs', traffic_type: 'organic', canal_block_id: 'BLOG', content_type: null, active: true }],
        canal_blocks: [{ id: 'BLOG', block_text: 'BLOQUE DE BLOG: estructura editorial larga.', active: true }],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ voice_id: 'lucien_editorial', destination: 'editorial', platform: 'blog_forumphs' }) }));
      assert(built.system.includes('## CANAL: BLOG\nBLOQUE DE BLOG: estructura editorial larga.'), 'emite el bloque de canal real por id');
      assert(!built.system.includes('Adapta longitud, tono y formato al canal.'), 'ya no está el layer genérico');
      assert(!built.system.includes('CANAL: BLOG_FORUMPHS'), 'nunca el literal con la plataforma cruda');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // A2a-int-2 — carril con plataforma sin mapeo: warn nominal + layer genérico, sin romper.
  await test('A2a-int-2: carril plataforma sin mapeo → warn nominal + layer genérico, no rompe', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const warns: string[] = [];
    const realWarn = console.warn; console.warn = (...a: any[]) => { warns.push(a.join(' ')); };
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
        platform_canal_map: [{ platform: 'meta_ig', traffic_type: 'organic', canal_block_id: 'INSTAGRAM_ORGANICO', content_type: null, active: true }],
        canal_blocks: [{ id: 'INSTAGRAM_ORGANICO', block_text: 'IG block', active: true }],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ voice_id: 'lucien_social', destination: 'social', platform: 'threads' }) }));
      assert(warns.some(w => w.includes('platform_canal_map') && w.includes('threads')), 'warn nominal nombra la plataforma sin mapeo');
      assert(built.system.includes('## CANAL: THREADS') && built.system.includes('Adapta longitud, tono y formato al canal.'), 'cae al layer genérico (unificado ## CANAL)');
      assert(built.system.length > 0, 'no rompe (success)');
    } finally { fx.restore(); Math.random = realRandom; console.warn = realWarn; }
  });

  // A2a-int-3 — UI sin builder_input: canal genérico, ahora con gramática unificada
  // (## CANAL: <canal> + 'Adapta...'), NO un block_text real de canal_blocks.
  await test('A2a-int-3: UI sin builder_input → ## CANAL genérico (Adapta…), no block_text real', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const built = await buildPrompt(reqWith({ brandContext: FULL_SNAPSHOT }));
      assert(built.system.includes('## CANAL: INSTAGRAM\nAdapta longitud, tono y formato al canal.'), 'canal genérico unificado (UI)');
      assert(!built.system.includes('IG block text'), 'la UI NO inyecta el block_text real de canal_blocks');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // ── A2·b · PURE por función trasplantada ────────────────────────────────────
  await test('A2b·pure getCTAFieldForCanal — ads/seo/story/default por canal_block_id', () => {
    eq(PURE.getCTAFieldForCanal('META_ADS'), 'cta_ads', 'ads');
    eq(PURE.getCTAFieldForCanal('BLOG'), 'cta_seo', 'seo');
    eq(PURE.getCTAFieldForCanal('INSTAGRAM_ORGANICO'), 'cta_story', 'story');
    eq(PURE.getCTAFieldForCanal('cualquier_otro'), 'cta_smpc', 'default');
    eq(PURE.getCTAFieldForCanal(''), 'cta_smpc', 'sin canal → default (UI)');
  });
  await test('A2b·pure getActiveCTA — campo elegido, fallback a cta_smpc y a brand.cta_base', () => {
    eq(PURE.getActiveCTA([{ cta_ads: 'A', cta_smpc: 'S' }], 'cta_ads', 'base'), 'A', 'campo pedido');
    eq(PURE.getActiveCTA([{ cta_smpc: 'S' }], 'cta_ads', 'base'), 'S', 'fallback a cta_smpc');
    eq(PURE.getActiveCTA([], 'cta_ads', 'base'), 'base', 'sin ctas → brand.cta_base');
    eq(PURE.getActiveCTA([], 'cta_ads', ''), '', 'sin ctas ni cta_base → vacío (no bloque)');
  });
  await test('A2b·pure getTopKeywords/getGrupo3 — filtra prioridad≤3, grupo_3', () => {
    const kws = [{ keyword: 'a', prioridad: 1, grupo_3: 'G' }, { keyword: 'b', prioridad: 3 }, { keyword: 'c', prioridad: 5 }, { keyword: 'd' }];
    eq(JSON.stringify(PURE.getTopKeywords(kws, 10)), JSON.stringify(['a', 'b']), 'sólo prioridad≤3 (excluye 5 y sin prioridad)');
    eq(PURE.getGrupo3(kws), 'G', 'grupo_3 de la keyword prioridad 1');
    eq(JSON.stringify(PURE.getTopKeywords([], 10)), JSON.stringify([]), 'vacío → []');
  });
  await test('A2b·pure getComplianceRules — severity hard primero', () => {
    const rows = [{ severity: 'soft', rule_text: 'S1' }, { severity: 'hard', rule_text: 'H1' }, { severity: 'medium', rule_text: 'M1' }, { severity: 'hard', rule_text: 'H2' }];
    eq(JSON.stringify(PURE.getComplianceRules(rows)), JSON.stringify(['H1', 'H2', 'S1', 'M1']), 'hard primero, resto después, orden estable');
    eq(JSON.stringify(PURE.getComplianceRules([])), JSON.stringify([]), 'vacío → []');
  });
  await test('A2b·pure buildBrandBlock — ## MARCA + campos ampliados, omite ausentes', () => {
    const b = PURE.buildBrandBlock({ display_name: 'ACME', brand_context: 'ctx', geo_principal: 'Miami', tono_base: 'seco', diferenciador_base: 'dif', disclaimer_base: 'disc', market: 'US', language_primary: 'en-US' });
    assert(b.startsWith('## MARCA: ACME'), 'header ## MARCA');
    for (const s of ['Contexto: ctx', 'Geo principal: Miami', 'Tono base: seco', 'Diferenciador: dif', 'Disclaimer: disc', 'Mercado: US', 'Idioma: en-US']) assert(b.includes(s), `incluye ${s}`);
    assert(!PURE.buildBrandBlock({ display_name: 'X' }).includes('Contexto:'), 'omite campos ausentes (sin línea vacía)');
  });
  await test('A2b·pure buildGoalsBlock — agrupa por horizon, KPI+target, 3/horizonte', () => {
    const goals = [
      { horizon: '6m', category: 'growth', goal: 'g1', kpi: 'MRR', target: '10k' },
      { horizon: '6m', category: 'brand', goal: 'g2' }, { horizon: '6m', goal: 'g3' }, { horizon: '6m', goal: 'g4' },
      { horizon: '12m', category: 'growth', goal: 'g5', kpi: 'ARR', target: '120k' },
    ];
    const out = PURE.buildGoalsBlock(goals);
    assert(out.startsWith('## OBJETIVOS ESTRATÉGICOS DE LA MARCA'), 'header');
    assert(out.includes('**Horizonte 6 meses:**') && out.includes('**Horizonte 12 meses (año 1):**'), 'agrupa por horizonte');
    assert(out.includes('→ KPI: MRR 10k'), 'KPI+target');
    assert(!out.includes('g4'), 'tope 3 por horizonte (g4 fuera)');
    eq(PURE.buildGoalsBlock([]), '', 'sin goals → vacío');
  });
  await test('A2b·pure buildPersonasBlock — motivations/objections/buying_trigger, orden priority, top 3', () => {
    const ps = [
      { label: 'P3', priority: 3, segment_type: 'b2c' }, { label: 'P1', priority: 1, segment_type: 'b2b', motivations: ['m1'], objections: ['o1'], buying_trigger: 'bt1' },
      { label: 'P2', priority: 2 }, { label: 'P4', priority: 4 },
    ];
    const out = PURE.buildPersonasBlock(ps);
    assert(out.startsWith('## SEGMENTOS OBJETIVO (ICP)'), 'header');
    assert(out.indexOf('**P1**') < out.indexOf('**P2**') && out.indexOf('**P2**') < out.indexOf('**P3**'), 'orden por priority');
    assert(!out.includes('**P4**'), 'top 3 (P4 fuera)');
    for (const s of ['Motivaciones: m1', 'Objeciones a superar: o1', 'Trigger de compra: bt1']) assert(out.includes(s), `incluye ${s}`);
    eq(PURE.buildPersonasBlock([]), '', 'sin personas → vacío');
  });
  await test('A2b·pure buildIdiomaBlock — ## IDIOMA DE OUTPUT + LANGUAGE_LABELS (es-FL/es-PA)', () => {
    assert(PURE.buildIdiomaBlock('es-FL').includes('Español — mercado Florida/Miami (es-FL)'), 'label es-FL');
    assert(PURE.buildIdiomaBlock('es-PA').includes('Español de Panamá'), 'label es-PA');
    const b = PURE.buildIdiomaBlock('en-US');
    assert(b.startsWith('## IDIOMA DE OUTPUT') && b.includes('prioridad absoluta') && b.includes('No mezcles idiomas'), 'bloque completo, no sólo el header');
    assert(PURE.buildIdiomaBlock('zz-ZZ').includes('**zz-ZZ**'), 'idioma sin label → el código crudo');
  });
  await test('A2b·pure buildGeomixBlock — ## GEOMIX, omite si null', () => {
    const out = PURE.buildGeomixBlock({ geo: 'Miami', servicios: ['s1', 's2'], combos: ['c1'], local_slang: 'ls', cultural_refs: 'cr' });
    assert(out.startsWith('## GEOMIX — Miami'), 'header con geo');
    for (const s of ['Servicios en esta zona: s1, s2', 'Combos SEO: c1', 'Lenguaje local: ls', 'Referencias culturales: cr']) assert(out.includes(s), `incluye ${s}`);
    eq(PURE.buildGeomixBlock(null), '', 'null → vacío (bloque omitido)');
  });
  await test('A2b·pure buildKeywordsBlock — ## KEYWORDS filtrado; 0 relevantes → vacío', () => {
    const out = PURE.buildKeywordsBlock([{ keyword: 'a', prioridad: 1, grupo_3: 'G' }, { keyword: 'b', prioridad: 2 }]);
    assert(out.startsWith('## KEYWORDS') && out.includes('Principales: a, b') && out.includes('Grupo SEO (grupo_3): G'), 'bloque con top + grupo_3');
    eq(PURE.buildKeywordsBlock([{ keyword: 'x', prioridad: 9 }]), '', 'sin keywords prioridad≤3 → vacío (no bloque)');
    eq(PURE.buildKeywordsBlock([]), '', '[] → vacío');
  });

  // ── B0 · renderGenomeSection (pure) — los 4 tipos + vacío ───────────────────
  await test('B0·pure renderGenomeSection — string, array, objeto plano, objeto anidado, vacío', () => {
    eq(PURE.renderGenomeSection('REGISTRO EMOCIONAL', 'seco y preciso'), 'REGISTRO EMOCIONAL: seco y preciso', 'string → LABEL: value');
    eq(PURE.renderGenomeSection('LÉXICO PROHIBIDO', ['a', 'b', 'c']), 'LÉXICO PROHIBIDO: a, b, c', 'array → LABEL: a, b, c');
    // objeto plano → una línea por clave, CLAVE en mayúsculas
    eq(
      PURE.renderGenomeSection('IDENTITY ANCHORS', { tagline: 'I build worlds', thematic_gravity: 'la crítica psicológica' }),
      'IDENTITY ANCHORS:\nTAGLINE: I build worlds\nTHEMATIC_GRAVITY: la crítica psicológica',
      'objeto plano → una línea por clave (recursivo)',
    );
    // objeto anidado → un nivel: pares "clave: valor" en línea, sin [object Object]
    const nested = PURE.renderGenomeSection('FIRMAS SINTÁCTICAS', { emphatic_triplication: { example: 'a, b, c' }, structures: ['x', 'y'] });
    assert(nested.includes('EMPHATIC_TRIPLICATION: example: a, b, c'), 'objeto anidado → un nivel inline');
    assert(nested.includes('STRUCTURES: x, y'), 'array dentro de objeto → joined');
    assert(!nested.includes('[object Object]'), 'nunca [object Object]');
    // vacío → cadena vacía (bloque omitido)
    eq(PURE.renderGenomeSection('X', ''), '', 'string vacío → ""');
    eq(PURE.renderGenomeSection('X', []), '', 'array vacío → ""');
    eq(PURE.renderGenomeSection('X', {}), '', 'objeto vacío → ""');
    eq(PURE.renderGenomeSection('X', null), '', 'null → ""');
    eq(PURE.renderGenomeSection('X', { a: '', b: null }), '', 'objeto con sólo claves vacías → ""');
  });

  // B0·integración — un genoma con la forma REAL de lucien_editorial (identity_anchors y
  // argumentative_architecture como objetos jsonb). El system debe expandir las claves reales
  // (thematic_gravity, core_move, ending_discipline, financial_lens) y NO contener [object Object].
  await test('B0-int: genoma forma-lucien → system expande claves reales, sin [object Object]', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const genomeLucien = {
        voice_id: 'lucien_editorial', version: '1', maturity: 'stable',
        identity_anchors: {
          tagline: 'I build worlds. Some of them survive.',
          thematic_gravity: 'la crítica psicológica del comportamiento humano',
        },
        argumentative_architecture: {
          core_move: 'observa el patrón y lo NOMBRA con precisión',
          financial_lens: 'la inteligencia financiera como criterio de lectura',
          ending_discipline: 'No call to action. No summary. No lesson.',
        },
        lexicon_signature: {}, lexicon_forbidden: [], syntactic_signatures: {},
        relational_stance: {}, emotional_register: {}, prohibited_registers: [], application_constraints: {},
      };
      const cache = {
        brands: [{ id: 'LucienSael', display_name: 'Lucien Sael', language_primary: 'en-US' }],
        brand_voice_genome: [genomeLucien],
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache }, { brandId: 'LucienSael' }));
      const s = built.system.toLowerCase();
      for (const key of ['thematic_gravity', 'core_move', 'ending_discipline', 'financial_lens']) {
        assert(s.includes(key), `el system expande la clave real: ${key}`);
      }
      assert(built.system.includes('No call to action'), 'el VALOR de ending_discipline llega al prompt');
      assert(!built.system.includes('[object Object]'), 'NUNCA [object Object] — el assert que impide la regresión');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // ── A2·b · integración: NeuroneSCF (todo poblado) y LucienSael (0 en geomix/ctas/keywords) ──
  await test('A2b-int-NeuroneSCF: cada bloque trasplantado aparece', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      // Cache representativo de NeuroneSCF (prod: geomix 5, ctas 12, personas 9, goals 12).
      const cache = {
        brands: [{ id: 'NeuroneSCF', display_name: 'NeuroneSCF', market: 'Panamá', language_primary: 'es-PA', brand_context: 'neuro', geo_principal: 'PA', tono_base: 'clínico', diferenciador_base: 'ciencia', disclaimer_base: 'no es consejo médico' }],
        brand_voice_genome: [], humanize_profiles: [{ tone: 't', personality: 'p', authenticity_rules: 'a', anti_patterns: ['x'] }],
        brand_goals: [{ horizon: '6m', category: 'growth', goal: 'crecer', kpi: 'MRR', target: '10k' }, { horizon: '12m', category: 'brand', goal: 'marca' }],
        brand_personas: [{ label: 'Doctor', priority: 1, segment_type: 'b2b', pain_points: ['pp'], motivations: ['mot'], objections: ['obj'], buying_trigger: 'trig', copy_hooks: ['h'] }],
        compliance_rules: [{ severity: 'soft', rule_text: 'blando' }, { severity: 'hard', rule_text: 'DURO' }],
        keywords: [{ keyword: 'neuro', prioridad: 1, grupo_3: 'g3' }],
        ctas: [{ cta_smpc: 'Agendá', cta_ads: 'Comprá' }],
        brand_copy_profiles: [{ id: 'cp', voice_tone_primary: 'vtp', style_hooks: ['sh'] }],
        creative_vectors: [{ id: 'VEC1', category: 'c', label: 'L', instruction: 'i', aggro_min: 1, aggro_max: 5 }],
        tension_architectures: [{ id: 'TEN1', label: 'L', instruction: 'i', curve: 'c' }],
        aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
        geomix: [{ geo: 'Panamá', servicios: ['neurofeedback'], combos: ['combo1'] }],
      };
      const s = (await buildPrompt(reqWith({ brandContext: cache }, { brandId: 'NeuroneSCF' }))).system;
      for (const block of ['## MARCA: NeuroneSCF', '## OBJETIVOS ESTRATÉGICOS DE LA MARCA', '## SEGMENTOS OBJETIVO (ICP)', '## IDIOMA DE OUTPUT', '## GEOMIX — Panamá', '## KEYWORDS', '## CTA ACTIVO', '## COMPLIANCE — REGLAS OBLIGATORIAS', '## VOZ DE MARCA — BP_COPY_1.0']) {
        assert(s.includes(block), `falta el bloque: ${block}`);
      }
      assert(s.includes('Motivaciones: mot') && s.includes('Objeciones a superar: obj') && s.includes('Trigger de compra: trig'), 'campos nuevos de persona');
      assert(s.includes('→ KPI: MRR 10k') && s.includes('**Horizonte 6 meses:**'), 'goals por horizonte con KPI');
      assert(s.indexOf('1. DURO') < s.indexOf('2. blando'), 'compliance hard primero, numerado');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  await test('A2b-int-LucienSael: geomix/ctas/keywords en 0 → sin bloque vacío', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        brands: [{ id: 'LucienSael', display_name: 'Lucien Sael', market: 'Miami', language_primary: 'en/FL' }], // sin cta_base
        brand_voice_genome: [], humanize_profiles: [{ tone: 't', personality: 'p', authenticity_rules: 'a', anti_patterns: ['x'] }],
        brand_goals: [{ horizon: '12m', category: 'brand', goal: 'autoridad editorial' }],
        brand_personas: [{ label: 'Lector', priority: 1 }],
        compliance_rules: [{ severity: 'hard', rule_text: 'H' }],
        keywords: [], ctas: [], geomix: [],   // los tres en 0
        brand_copy_profiles: [{ id: 'cp', voice_tone_primary: 'vtp' }],
        creative_vectors: [{ id: 'VEC1', category: 'c', label: 'L', instruction: 'i', aggro_min: 1, aggro_max: 5 }],
        tension_architectures: [{ id: 'TEN1', label: 'L', instruction: 'i', curve: 'c' }],
        aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
      };
      const s = (await buildPrompt(reqWith({ brandContext: cache }, { brandId: 'LucienSael' }))).system;
      assert(!s.includes('## GEOMIX'), 'geomix 0 → sin bloque');
      assert(!s.includes('## CTA ACTIVO'), 'ctas 0 y sin cta_base → sin bloque de CTA');
      assert(!s.includes('## KEYWORDS'), 'keywords 0 → sin bloque');
      assert(s.includes('## MARCA: Lucien Sael') && s.includes('## OBJETIVOS ESTRATÉGICOS'), 'los bloques con datos sí aparecen');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  const total = passed + xfails.length + failures.length;
  console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed, ${xfails.length} xfail (defecto de main), ${failures.length} failed — ${total} tests`);
  if (xfails.length) {
    console.log('\n⊘ xfail — defectos vivos en main que estos tests atrapan (fuera de alcance de este PR, §7):');
    for (const x of xfails) console.log(`  - ${x}`);
  }
  if (failures.length) { console.log('\n✗ failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}

void callClaude; // referenced to keep the import meaningful for future usage tests
run();
