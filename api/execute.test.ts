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
import handler, { buildPrompt, callClaude } from './execute.ts';

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
// Clasifica un renglón de diff por CONTENIDO (no por número de línea — un cambio
// de longitud desplazaría todo el resto). La lista es CERRADA: lo que no encaje
// en los tres deltas declarados hace fallar el test con el diff impreso.
function clasificar(d: DiffLine): string | null {
  const l = d.line;
  if (/\bIDIOMA\b|IDIOMA DE GENERACIÓN/.test(l)) return 'DELTA_IDIOMA';
  if (/VOICE GENOME INJECTION|^VOICE ID:|\bvoice_id\b/.test(l)) return 'DELTA_GENOMA';
  if (/VOZ DE MARCA — BASE|^Personalidad:|^Reglas de autenticidad:|^Anti-patterns:/.test(l)) return 'DELTA_HUMANIZE';
  return null;
}
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
    `${js}\nreturn { normalizeCache, sliceOf, resolveLanguage, selectGenome, maxTokensFor, parsePiece, deriveSignature };`,
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
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('api.anthropic.com')) return res(opts.claude ?? { content: [{ text: '' }], usage: { input_tokens: 0, output_tokens: 0 } });
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
  return { calls, restore: () => { globalThis.fetch = REAL_FETCH; } };
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const GENOME_V1 = {
  voice_id: 'v1', version: '1', maturity: 'stable', identity_anchors: 'ia',
  lexicon_signature: {}, lexicon_forbidden: [], syntactic_signatures: {},
  argumentative_architecture: {}, relational_stance: {}, emotional_register: 'seco',
  prohibited_registers: [], application_constraints: {},
};
const FULL_SNAPSHOT = {
  brands: [{ id: 'B', display_name: 'BrandX', market: 'US', language_primary: 'en-US' }],
  humanize_profiles: [{ tone: 't', personality: 'p', authenticity_rules: 'a', anti_patterns: ['x'] }],
  brand_goals: [{ goal_text: 'g1', priority: 1 }],
  brand_personas: [{ label: 'P', pain_points: ['pp'], copy_hooks: ['ch'], tone_for_segment: 'ts', avoid: ['av'] }],
  compliance_rules: [{ rule_text: 'must comply' }],
  keywords: [{ keyword: 'k1' }],
  ctas: [{ cta_smpc: 'Buy now' }],
  brand_copy_profiles: [{ id: 'cp1', voice_tone_primary: 'vtp', voice_writing_style: 'vws', style_hooks: ['sh'], style_avoid_phrases: ['sap'] }],
  brand_voice_genome: [GENOME_V1],
  creative_vectors: [{ id: 'VEC1', category: 'c', label: 'L', instruction: 'inst', aggro_min: 1, aggro_max: 5 }],
  tension_architectures: [{ id: 'TEN1', label: 'TL', instruction: 'ti', curve: 'cu' }],
  aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'AL', instruction: 'ai', anti_hedging: 'ah' }],
  creative_compatibility_rules: [{ content_type: 'social_post', allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
  pipeline_skills: [{ layer_code: 'LX', layer_order: 1, applies_to: ['social_post'] }],
  output_templates: [{ id: 't1', name: 'TPL', category: 'social_post', template_text: 'tmpl', active: true }],
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

  // Case 1 — golden: la UI solo puede diferir del código PRE-contratos en los
  // tres deltas declarados (§3.6). El golden se generó desde api/execute.ts
  // @ da182aa (43056 b), no desde main — comparar main contra sí mismo sería el
  // defecto que este caso repara. Lista blanca CERRADA: cualquier otra
  // diferencia falla con el diff impreso.
  await test('1·golden: la UI solo difiere del pre-contratos en los 3 deltas declarados', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const actual = (await buildPrompt(reqWith({ brandContext: FULL_SNAPSHOT }))).system;
      const golden = stripGoldenHeader(readFileSync(new URL('./__fixtures__/golden_ui_main.txt', import.meta.url), 'utf8'));
      const diffs = diffLines(golden, actual);
      const sinClasificar = diffs.filter(d => !clasificar(d));
      assert(
        sinClasificar.length === 0,
        `delta NO declarado (${sinClasificar.length} de ${diffs.length} renglones de diff):\n${sinClasificar.map(fmtDiff).join('\n')}`,
      );
      // los renglones que sí cambiaron deben pertenecer a la lista blanca
      for (const d of diffs) {
        const k = clasificar(d);
        assert(k === 'DELTA_IDIOMA' || k === 'DELTA_GENOMA' || k === 'DELTA_HUMANIZE', `delta fuera de lista: ${fmtDiff(d)}`);
      }
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
      assert(a.system.startsWith('Eres CopyLab v9.7, el motor de copy de UNRLVL Studio. Content Pipeline v2.6.\n\nMARCA: BrandX | MERCADO: US | IDIOMA: en-US'), 'preámbulo + MARCA exactos');
      assertOrdered(a.system, [
        'MARCA: BrandX | MERCADO: US | IDIOMA: en-US',
        'OBJETIVOS:', 'AUDIENCIA OBJETIVO:',
        'IDIOMA OBLIGATORIO: en-US', 'CANAL: INSTAGRAM',
        'VOZ DE MARCA — BASE (L1):', 'PERFIL DE COPY BP_COPY_1.0:',
        '## L1.5 VOICE GENOME INJECTION', 'KEYWORDS: k1', 'CTAs APROBADOS: "Buy now"',
        'COMPLIANCE — REGLAS OBLIGATORIAS:', 'TEMPLATE DE OUTPUT [TPL]:',
        '## L14 CREATIVE VECTOR [VEC1', '## L15 TENSION ARCHITECTURE [TEN1', '## L16 AGGRO DIAL [AGGRO_2',
      ]);
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
      assert(built.system.includes('IDIOMA: en/FL'), 'system con idioma real');
      assert(!/IDIOMA(?: OBLIGATORIO)?: ES\b/.test(built.system), "el literal 'ES' no aparece por ningún camino");
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
      assert(singular.system.includes('MARCA: UNRLVL | MERCADO: Miami'), 'display_name y market desde la forma singular');
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
  // — orden adverso por construcción). Es el tercer delta de §3.6.
  await xfail('2c·humanize: la fila de la marca gana al DEFAULT, orden-independiente',
    'DEFECTO main: la resolución de humanize toma `[0]` del array; brand-cache.js mergea [DEFAULT, brand] (línea 204, DEFAULT primero) ⇒ en la ruta de cache gana DEFAULT, nunca la marca. El DELTA_HUMANIZE declarado no está implementado. Fuera de alcance (§7).',
    async () => {
    const DEF   = { brand_id: 'DEFAULT', tone: 'neutro', personality: 'p0', authenticity_rules: 'a0', anti_patterns: ['x0'] };
    const BRAND = { brand_id: 'B',       tone: 'seco',   personality: 'p1', authenticity_rules: 'a1', anti_patterns: ['x1'] };
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
        { builder_input: { domain: 'd', voice_id: 'v1', destination: 'social', platform: 'meta_ig', language: 'en-US', psycho_preset: null, rules: [{ code: 'SIG-1', kind: 'firma', statement: '— Lucien Sael' }], iid_brief: 'Algo pasó hoy', angle: null, audience_frame: 'general' } },
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
      eq(o._json.meta.rules_count, 1, 'meta.rules_count');
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
