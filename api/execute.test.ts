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
    `${js}\nreturn { readImageTitleMode, buildImageDialogueBlock, IMAGE_TITLE_MODES, readTitleBudgetChars, buildTitleBlock, buildCarrilFormatBlock, titleCharCount, normalizeCache, sliceOf, resolveLanguage, selectGenome, selectHumanize, maxTokensFor, readDeclaredMaxTokens, lengthBudgetCharsFor, buildLengthBudgetBlock, apiMaxTokensFor, parsePiece, deriveSignature, resolveCarrilContentType, filterCarrilImperativeRules, CARRIL_IMPERATIVE_KINDS, buildClaimsBlock, buildWritingMaterialBlock, buildOfferBlock, resolveAudienceCta, AUDIENCE_CTA, normalizeRepair, buildRepairInstruction, selectCompatRule, applyTemplateVars, buildTemplateVars, resolveCanalBlockId, ensureArray, getCTAFieldForCanal, getActiveCTA, getTopKeywords, getGrupo3, getComplianceRules, buildBrandBlock, buildGoalsBlock, buildPersonasBlock, buildIdiomaBlock, normalizeLanguageCode, resolveLanguageDirective, buildGeomixBlock, buildKeywordsBlock, buildCopyProfileLayer, renderGenomeSection };`,
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
  brands: [{ id: 'B', display_name: 'BrandX', market: 'US', language_primary: 'en' }],
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
  brand: { id: 'LucienSael', display_name: 'Lucien Sael', market: 'Miami', language_primary: 'es' },
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

  // Case 9 (pure) — techo de tokens. Sin `max_tokens` declarado el default por destino manda:
  // ESTA es la retrocompatibilidad de G1-C, y es lo que corría antes de que el carril transportara
  // el techo. Un emisor anterior a F1 no cambia de comportamiento.
  await test('9·pure maxTokensFor: sin declaración, editorial 4000 · social 640 · UI 1600', () => {
    eq(PURE.maxTokensFor({ destination: 'editorial' }), 4000, 'editorial');
    eq(PURE.maxTokensFor({ destination: 'social' }), 640, 'social');
    eq(PURE.maxTokensFor(null), 1600, 'UI');
    eq(PURE.maxTokensFor(undefined), 1600, 'UI/undefined');
    eq(PURE.maxTokensFor({ destination: 'social', max_tokens: null }), 640, 'null explícito = nadie lo declaró');
    eq(PURE.maxTokensFor({ destination: 'editorial', max_tokens: undefined }), 4000, 'undefined = nadie lo declaró');
  });

  // G1-C — el techo DECLARADO gana. El carril lo resuelve contra content_type_registry y lo manda en
  // builder_input.max_tokens; CopyLab lo recibía y no lo aplicaba, y el adaptador recortaba después
  // (medido: SocialLab entregó 809 de los 1.839 caracteres que CopyLab escribió en meta_fb, −56%).
  await test('G1-C·pure maxTokensFor: builder_input.max_tokens declarado GANA al default por destino', () => {
    eq(PURE.maxTokensFor({ destination: 'social', max_tokens: 1400 }), 1400, 'social con techo declarado');
    eq(PURE.maxTokensFor({ destination: 'editorial', max_tokens: 900 }), 900, 'declarado por DEBAJO del default también gana');
    eq(PURE.maxTokensFor({ destination: 'social', max_tokens: 4096 }), 4096, 'declarado por ENCIMA del default también gana');
    // El techo es dato de tabla: el valor no vive en el código y el test no lo fija. Lo que se fija
    // es que el declarado se APLIQUE — eje, no instancia.
    for (const n of [1, 250, 640, 3000, 8192]) {
      eq(PURE.maxTokensFor({ destination: 'social', max_tokens: n }), n, `techo ${n}`);
    }
  });

  await test('G1-C·pure maxTokensFor: una declaración ROTA no es una declaración', () => {
    // Un techo ilegible que se aplicara tal cual rompería la generación en silencio — el modo de
    // fallo que este cambio viene a cerrar. Cae al default por destino y avisa.
    for (const bad of [0, -1, NaN, Infinity, -Infinity, 'mil', '', {}, [], true, false]) {
      eq(PURE.maxTokensFor({ destination: 'social', max_tokens: bad as any }), 640, `basura: ${JSON.stringify(bad)}`);
    }
    // Un string numérico SÍ es un número declarado: la columna es integer, pero el transporte es JSON
    // y un emisor que serialice de más no merece perder el techo.
    eq(PURE.maxTokensFor({ destination: 'social', max_tokens: '1400' as any }), 1400, 'string numérico');
    eq(PURE.maxTokensFor({ destination: 'social', max_tokens: 1400.7 as any }), 1400, 'fraccional se trunca: max_tokens es entero');
  });

  await test('G1-C·pure maxTokensFor: el modo UI no ve el techo del carril', () => {
    // Sin builder_input no hay carril y no hay techo declarado que aplicar: el 1600 histórico intacto.
    eq(PURE.maxTokensFor(null), 1600, 'UI/null');
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
  // A2 (2026-08-18) — `platform_canal_map` tal cual las 9 filas de producción, leídas en vivo.
  // El canal editorial sale de ACÁ, no de un objeto literal con el nombre de una marca dentro.
  const CANAL_MAP = [
    { platform: 'blog',               traffic_type: 'organic', canal_block_id: 'BLOG',               content_type: null, active: true },
    { platform: 'blog_forumphs',      traffic_type: 'organic', canal_block_id: 'BLOG',               content_type: null, active: true },
    { platform: 'email',              traffic_type: 'organic', canal_block_id: 'EMAIL',              content_type: null, active: true },
    { platform: 'email_propietarios', traffic_type: 'organic', canal_block_id: 'EMAIL',              content_type: null, active: true },
    { platform: 'linkedin',           traffic_type: 'organic', canal_block_id: 'WEB',                content_type: null, active: true },
    { platform: 'meta_fb',            traffic_type: 'organic', canal_block_id: 'INSTAGRAM_ORGANICO', content_type: null, active: true },
    { platform: 'meta_ig',            traffic_type: 'organic', canal_block_id: 'INSTAGRAM_ORGANICO', content_type: null, active: true },
    { platform: 'tiktok',             traffic_type: 'organic', canal_block_id: 'TIKTOK_ORGANICO',    content_type: null, active: true },
    { platform: 'x',                  traffic_type: 'organic', canal_block_id: 'INSTAGRAM_ORGANICO', content_type: null, active: true },
  ];

  await test('B2·pure resolveCarrilContentType — el mapa (las 5 filas)', () => {
    for (const p of ['x', 'meta_fb', 'meta_ig', 'tiktok'])
      eq(JSON.stringify(PURE.resolveCarrilContentType('social', p, CANAL_MAP)), JSON.stringify({ content_type: 'social_post', canal: p }), `social/${p}`);
    eq(JSON.stringify(PURE.resolveCarrilContentType('social', 'linkedin', CANAL_MAP)), JSON.stringify({ content_type: 'social_post', canal: 'linkedin' }), 'social/linkedin');
    // A2 — el canal editorial es ahora el canal_blocks.id del puente, no un valor cableado.
    eq(JSON.stringify(PURE.resolveCarrilContentType('editorial', 'blog', CANAL_MAP)), JSON.stringify({ content_type: 'editorial_post', canal: 'BLOG' }), 'editorial/blog');
    eq(JSON.stringify(PURE.resolveCarrilContentType('editorial', 'linkedin', CANAL_MAP)), JSON.stringify({ content_type: 'editorial_post', canal: 'WEB' }), 'editorial/linkedin');
    for (const d of ['social', 'editorial'])
      eq(JSON.stringify(PURE.resolveCarrilContentType(d, 'email_propietarios', CANAL_MAP)), JSON.stringify({ content_type: 'email_divulgacion', canal: 'email' }), `${d}/email_propietarios`);
  });


  // ── BRIEF-04 · LA IMAGEN ABRE, EL TÍTULO RESPONDE ───────────────────────────
  //
  // Lo que estas pruebas protegen no es el texto del prompt: es que el modo que REPITE quede
  // BYTE-IDÉNTICO al de antes del brief. Si el modo por defecto cambiara aunque fuera un carácter,
  // este cambio dejaría de ser inerte y las piezas vigentes cambiarían sin que nadie lo pidiera.

  await test('BRIEF-04·pure readImageTitleMode: ausente o desconocido degrada al modo vigente', () => {
    eq(PURE.readImageTitleMode(undefined), 'echo', 'ausente → echo');
    eq(PURE.readImageTitleMode(null), 'echo', 'null → echo');
    eq(PURE.readImageTitleMode('dialogue'), 'dialogue', 'el modo que responde se lee');
    eq(PURE.readImageTitleMode('DIALOGUE'), 'dialogue', 'insensible a mayúsculas');
    eq(PURE.readImageTitleMode('  echo '), 'echo', 'con espacios');
    // Un modo que el código no conoce NO se obedece a medias: degrada al vigente. Inventar a
    // partir de un valor que no se entiende es peor que ignorarlo.
    eq(PURE.readImageTitleMode('conversacion'), 'echo', 'desconocido → echo, nunca a medias');
    eq(PURE.readImageTitleMode(7), 'echo', 'basura → echo');
  });

  await test('BRIEF-04·pure el modo por defecto deja el prompt IDÉNTICO al de antes del brief', () => {
    // La prueba que hace inerte a este PR: sin modo, los dos bloques son los de siempre.
    for (const destino of ['social', 'editorial']) {
      eq(String(PURE.buildTitleBlock(72, destino)), String(PURE.buildTitleBlock(72, destino, 'echo')),
        `## TÍTULO sin modo === modo echo (${destino})`);
      eq(String(PURE.buildCarrilFormatBlock(destino)), String(PURE.buildCarrilFormatBlock(destino, 'echo')),
        `FORMATO sin modo === modo echo (${destino})`);
    }
    // Y en echo el formato sigue pidiendo UNA sola cadena.
    const fmt = String(PURE.buildCarrilFormatBlock('social', 'echo'));
    assert(fmt.includes('TÍTULO:'), 'echo conserva el centinela del título');
    assert(!fmt.includes('GANCHO:'), 'echo NO pide gancho');
    assert(!fmt.includes('APOYO:'), 'echo NO pide apoyo');
  });

  await test('BRIEF-04·pure en diálogo el formato pide TRES cadenas y el apoyo es omitible', () => {
    const fmt = String(PURE.buildCarrilFormatBlock('social', 'dialogue'));
    assert(fmt.includes('GANCHO:'), 'pide el gancho');
    assert(fmt.includes('APOYO:'), 'pide el apoyo');
    assert(fmt.includes('TÍTULO:'), 'sigue pidiendo el título');
    assert(/OMITE/i.test(fmt), 'el apoyo se declara omitible: una línea vacía no es un apoyo');
    // El orden importa: el gancho abre y el título responde. Si el título viniera primero, el
    // escritor lo redactaría sin haber escrito aún aquello a lo que responde.
    assert(fmt.indexOf('GANCHO:') < fmt.indexOf('TÍTULO:'), 'el gancho va antes que el título');
  });

  await test('BRIEF-04·pure el presupuesto se lo lleva el GANCHO, que es quien ocupa la ranura', () => {
    const dialogo = String(PURE.buildTitleBlock(72, 'social', 'dialogue'));
    assert(!dialogo.includes('72'), 'el título deja de estar limitado por un espacio que ya no ocupa');
    const gancho = String(PURE.buildImageDialogueBlock(72));
    assert(gancho.includes('72'), 'la cifra pasa al gancho');
    // Sin cifra declarada no se inventa ninguna, igual que en ## TÍTULO.
    assert(!/\d/.test(String(PURE.buildImageDialogueBlock(null)).replace(/[^0-9]/g, '')),
      'sin presupuesto, ninguna cifra inventada');
  });

  await test('BRIEF-04·pure la regla que hace el modo seguro: la respuesta contiene su premisa', () => {
    const b = String(PURE.buildImageDialogueBlock(72));
    assert(/PREMISA/i.test(b), 'la regla se enuncia');
    assert(/lector de pantalla/i.test(b), 'el motivo se declara: el texto en imagen no viaja');
    assert(/únicamente el título/i.test(b), 'la pieza se entiende sin ver la imagen');
    // Y el título, en diálogo, dice que responde.
    assert(/RESPONDE/i.test(String(PURE.buildTitleBlock(72, 'social', 'dialogue'))), 'el título responde');
  });

  await test('BRIEF-04·pure parsePiece: tres centinelas, y sin ellos el resultado de siempre', () => {
    const tres = PURE.parsePiece('GANCHO: El pozo no se rellena\nAPOYO: Nunca hubo intención\nTÍTULO: No deberías sorprenderte\n\nEl cuerpo.');
    eq(tres.image_hook, 'El pozo no se rellena', 'gancho');
    eq(tres.image_support, 'Nunca hubo intención', 'apoyo');
    eq(tres.title, 'No deberías sorprenderte', 'título');
    eq(tres.body, 'El cuerpo.', 'cuerpo limpio de los tres centinelas');

    // El apoyo es omitible y su ausencia NO arrastra al título.
    const sinApoyo = PURE.parsePiece('GANCHO: Un gancho\nTÍTULO: Un título\n\nCuerpo.');
    eq(sinApoyo.image_hook, 'Un gancho', 'gancho sin apoyo');
    eq(sinApoyo.image_support, null, 'apoyo ausente → null');
    eq(sinApoyo.title, 'Un título', 'el título no se pierde');
    eq(sinApoyo.body, 'Cuerpo.', 'cuerpo');

    // Modo que repite: byte-idéntico a antes del brief.
    const soloTitulo = PURE.parsePiece('TÍTULO: Un título\n\nEste es el cuerpo.');
    eq(soloTitulo.title, 'Un título', 'título');
    eq(soloTitulo.image_hook, null, 'sin gancho');
    eq(soloTitulo.image_support, null, 'sin apoyo');
    eq(soloTitulo.body, 'Este es el cuerpo.', 'cuerpo');
    eq(PURE.parsePiece('Solo cuerpo social.').title, null, 'social sin título sigue dando null');
  });

  await test('BRIEF-04·pure la marca N+1: el modo es del CANAL y llega por dato', () => {
    // Ni una marca, ni un canal, ni una jurisdicción en los bloques nuevos. El modo entra por
    // `builder_input`; un canal que el código nunca nombró se comporta según su fila.
    const textos = [
      String(PURE.buildImageDialogueBlock(72)),
      String(PURE.buildTitleBlock(72, 'social', 'dialogue')),
      String(PURE.buildCarrilFormatBlock('social', 'dialogue')),
    ].join('\n');
    for (const prohibido of ['ForumPHs', 'LucienSael', 'NeuroneSCF', 'UnrealvilleStudio',
                             'meta_ig', 'meta_fb', 'tiktok', 'linkedin', 'blog'])
      assert(!textos.includes(prohibido), `sin literal de marca ni canal: ${prohibido}`);
    // La enumeración del eje son sus DOS estados, no una lista de canales.
    eq([...PURE.IMAGE_TITLE_MODES].join(','), 'echo,dialogue', 'el eje tiene dos estados');
  });

  // ── A2 · el test de la marca N+1, ejecutable ────────────────────────────────
  await test('A2·pure el canal editorial NO conoce ninguna marca: blog_forumphs entra por FILA, no por literal', () => {
    // Antes: CARRIL_EDITORIAL_CANAL = { blog, blog_forumphs, linkedin } — una marca dentro de una
    // enumeración de capa compartida. Ahora la fila manda y el código no sabe de quién es.
    eq(PURE.resolveCarrilContentType('editorial', 'blog_forumphs', CANAL_MAP).canal, 'BLOG', 'blog_forumphs sale del puente');
    // La marca N+1: una plataforma que NUNCA se nombró en el código entra sin tocar el código.
    const conNueva = [...CANAL_MAP, { platform: 'blog_nuevamarca', traffic_type: 'organic', canal_block_id: 'BLOG', active: true }];
    eq(PURE.resolveCarrilContentType('editorial', 'blog_nuevamarca', conNueva).canal, 'BLOG', 'alta de plataforma = fila, no deploy');
    // Y sin su fila, la MISMA plataforma cae al par de su destination, nombrada en el warn.
    eq(PURE.resolveCarrilContentType('editorial', 'blog_nuevamarca', CANAL_MAP).canal, 'blog', 'sin fila → par de su destination');
  });
  await test('A2·pure una fila inactiva no resuelve canal (active=false ≠ existe)', () => {
    const off = CANAL_MAP.map((r) => (r.platform === 'blog' ? { ...r, active: false } : r));
    eq(PURE.resolveCarrilContentType('editorial', 'blog', off).canal, 'blog', 'fila inactiva → fallback, no el canal_block');
  });
  await test('A2·pure sin mapa (null/undefined/[]) el editorial cae al par de su destination, sin romper', () => {
    for (const m of [null, undefined, []])
      eq(PURE.resolveCarrilContentType('editorial', 'blog', m as any).canal, 'blog', `mapa=${JSON.stringify(m ?? null)}`);
  });

  await test('B2·pure resolveCarrilContentType — plataforma desconocida: nombra + par de destination, nunca instagram mudo', () => {
    const s = PURE.resolveCarrilContentType('social', 'threads', CANAL_MAP);
    eq(s.content_type, 'social_post', 'social desconocida → social_post'); eq(s.canal, 'threads', 'canal = la plataforma nombrada');
    const e = PURE.resolveCarrilContentType('editorial', 'substack', CANAL_MAP);
    eq(e.content_type, 'editorial_post', 'editorial desconocida → editorial_post'); eq(e.canal, 'blog', 'canal = par de su destination (blog)');
    for (const [d, p] of [['social', 'bluesky'], ['editorial', 'medium']] as const)
      assert(PURE.resolveCarrilContentType(d, p, CANAL_MAP).canal !== 'instagram', `nunca el ?? instagram mudo (${d}/${p})`);
    eq(PURE.resolveCarrilContentType('  SOCIAL ', ' Meta_IG ', CANAL_MAP).canal, 'meta_ig', 'normaliza trim + lowercase');
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

  // ── A1 · CAMBIO 8 · las cifras y su procedencia ─────────────────────────────
  const CLAIM_A = { claim: 'caída interanual del segmento', value: '12%', source_url: 'https://example.org/informe-2026', source_name: 'Informe 2026' };
  const CLAIM_B = { claim: 'tamaño de la muestra', value: '4.312 casos', source_url: 'https://data.example.net/serie/42', source_name: 'Serie 42' };

  await test('A1·pure buildClaimsBlock — la cifra viaja con su fuente y la instrucción cierra el grifo', () => {
    const block = PURE.buildClaimsBlock([CLAIM_A, CLAIM_B])!;
    assert(block !== null, 'con claims hay bloque');
    for (const c of [CLAIM_A, CLAIM_B])
      assertOrdered(block, [c.claim, c.value, c.source_name, c.source_url]);
    assert(/s[oó]lo de esta lista/i.test(block), 'la instrucción dice que las cifras salen sólo de la lista');
    assert(/NO se escribe/.test(block), 'la instrucción dice que una cifra sin claim no se escribe');
    // El orden de la lista es el que mandó el carril: la fila decide, no un re-ordenamiento de acá.
    assertOrdered(block, [CLAIM_A.claim, CLAIM_B.claim]);
  });

  await test('A1·pure buildClaimsBlock — sin claims no hay bloque (aditivo: el prompt de hoy intacto)', () => {
    for (const v of [null, undefined, [], {}, 'x', 0])
      eq(PURE.buildClaimsBlock(v as any), null, `entrada=${JSON.stringify(v ?? null)}`);
  });

  await test('A1·pure buildClaimsBlock — una entrada sin las tres piezas no viaja: cifra sin procedencia no es claim', () => {
    const rotos = [
      { claim: '', value: '12%', source_url: 'https://example.org/a' },
      { claim: 'c', value: '   ', source_url: 'https://example.org/a' },
      { claim: 'c', value: '12%', source_url: '' },
      { claim: 'c', value: '12%' },
      null,
    ];
    eq(PURE.buildClaimsBlock(rotos as any), null, 'todas incompletas → sin bloque');
    const mixto = PURE.buildClaimsBlock([...rotos, CLAIM_A] as any)!;
    eq(mixto.split('\n').filter((l: string) => l.startsWith('- ')).length, 1, 'sólo la entrada completa se lista');
    assert(mixto.includes(CLAIM_A.source_url), 'y es la que trae fuente');
  });

  // El test de la marca N+1 para este bloque: el dato entra por la FILA y el código no lo conoce.
  await test('A1·pure buildClaimsBlock — la marca N+1: ni enumeración ni literal de marca; la fila manda', () => {
    const nueva = { claim: 'métrica que el código nunca nombró', value: '3,4×', source_url: 'https://nuevamarca.example/estudio' };
    const block = PURE.buildClaimsBlock([nueva])!;
    assertOrdered(block, [nueva.claim, nueva.value, nueva.source_url]);
    // La función se llama como el DATO (claims), no como quien lo emite, y no hay lista blanca de
    // claims, dominios ni plataformas: lo único que la fuente aporta es la gramática del bloque.
    const src = readFileSync(new URL('./execute.ts', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('function buildClaimsBlock('));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
    assert(/function buildClaimsBlock\(/.test(body), 'claims nombra la función');
    assert(!/\bnew Set\(|\[['\"][^'\"]+['\"]\s*,/.test(body), 'sin enumeración de valores permitidos');
    assert(!/example\.org|nuevamarca|lucien|forumphs|neurone|unrealville/i.test(body), 'sin literal de marca en el cuerpo');
  });

  // ── C1 · la cifra se escribe con su fuente NOMBRADA, nunca con la URL ───────
  await test('C1·pure buildClaimsBlock — con source_name la instrucción exige atribución nominal en el texto', () => {
    const block = PURE.buildClaimsBlock([CLAIM_A])!;
    assert(/fuente citable/.test(block), 'el nombre citable se lista aparte de la URL');
    assert(/nombrada en el texto|seg[úu]n <fuente citable>/i.test(block), 'la instrucción pide la atribución nominal');
    assert(/[Nn]unca pegues la URL/.test(block), 'y prohíbe explícitamente pegar la URL en el copy');
  });
  await test('C1·pure buildClaimsBlock — claim anterior a C1 (sin source_name) sigue viajando, sin inventarle nombre', () => {
    const viejo = { claim: 'dato heredado', value: '7%', source_url: 'https://example.org/viejo' };
    const block = PURE.buildClaimsBlock([viejo])!;
    assertOrdered(block, [viejo.claim, viejo.value, viejo.source_url]);
    assert(!/fuente citable/.test(block), 'sin nombre no se inventa uno ni se pide atribuir lo inatribuible');
  });

  // ── C1 · el material de escritura: mecanismo y caso ─────────────────────────
  const MECH = 'cuando el inventario baja, el precio sube porque la oferta se contrae antes que la demanda';
  const CASO = { case: 'una plataforma rehízo su checkout y midió el efecto a 90 días', source_url: 'https://example.org/caso', source_name: 'Informe 2026' };
  const CASO_2 = { case: 'un marketplace movió el paso de pago al primer tramo', source_url: 'https://data.example.net/serie/42', source_name: 'Serie 42' };

  await test('C1·pure buildWritingMaterialBlock — mecanismo y caso entran con instrucción CONSTRUCTIVA', () => {
    const block = PURE.buildWritingMaterialBlock(MECH, [CASO])!;
    assertOrdered(block, ['MECANISMO', MECH, 'CASOS PARA ILUSTRAR', CASO.source_name, CASO.case]);
    assert(/[Dd]esarrolla/.test(block) && /ILUSTRAR|[Ii]lustr/.test(block), 'se pide construir, no sólo no-hacer');
  });
  await test('D1·pure con DOS casos: el primero abre, el segundo confirma que el patrón se repite', () => {
    const block = PURE.buildWritingMaterialBlock(MECH, [CASO, CASO_2])!;
    assertOrdered(block, ['CASOS PARA ILUSTRAR (2)', CASO.case, CASO_2.case]);
    assert(/PRIMERO para abrir/.test(block), 'dice cuál abre');
    assert(/SEGUNDO/.test(block) && /patrón se repite/.test(block), 'y para qué sirve el segundo');
    assert(/no ilustra, repite/.test(block), 'y por qué no vale reusar el de apertura');
  });
  await test('D1·pure con UN caso NO se promete ilustración doble ni se pide inventar el segundo', () => {
    const block = PURE.buildWritingMaterialBlock(MECH, [CASO])!;
    assert(/UN solo caso/.test(block), 'lo dice explícito');
    assert(!/PRIMERO para abrir/.test(block), 'no habla de un segundo que no existe');
    assert(/no inventes un segundo caso/.test(block), 'y lo prohíbe: prometer dos empuja a fabricarlo');
  });
  await test('D1·pure retrocompat: el objeto suelto de C1 se lee como lista de uno', () => {
    const block = PURE.buildWritingMaterialBlock(null, CASO)!;
    assertOrdered(block, ['CASOS PARA ILUSTRAR (1)', CASO.case]);
  });
  await test('C1·pure buildWritingMaterialBlock — cada pieza entra sola; sin ninguna, sin bloque', () => {
    assert(/MECANISMO/.test(PURE.buildWritingMaterialBlock(MECH, null)!), 'sólo mecanismo');
    assert(!/CASOS PARA ILUSTRAR/.test(PURE.buildWritingMaterialBlock(MECH, null)!), 'sin caso no se anuncia uno');
    assert(/CASOS PARA ILUSTRAR/.test(PURE.buildWritingMaterialBlock(null, [CASO])!), 'sólo caso');
    for (const [m, c] of [[null, null], [undefined, undefined], ['', []], ['   ', [{ case: '  ' }]], ['', 'nada'], ['', 7]] as any[])
      eq(PURE.buildWritingMaterialBlock(m, c), null, `${JSON.stringify(m ?? null)} / ${JSON.stringify(c ?? null)}`);
  });

  // ── BRIEF-N02 · la oferta disponible ──────────────────────────────────────
  // Lo que estos casos custodian: que la clave 18 se LEA. CopyLab enumera campos con nombre —no
  // itera builder_input— asi que una clave que nadie nombra se ignora EN SILENCIO. Ese es el fallo
  // que N02 vino a cerrar y seria absurdo reproducirlo un piso mas arriba.
  const OFERTA = [
    { ref: 'A1', name: 'Alfa', line: 'L1', summary: 'Resumen A', channel: 'b2c' },
    { ref: 'A2', name: 'Beta', line: 'L2', summary: null, channel: 'b2c' },
  ];
  await test('N02·pure buildOfferBlock — los items entran verbatim y la instruccion pide PESO, no presencia', () => {
    const block = PURE.buildOfferBlock({ selected_by: 'declared_selector', items: OFERTA })!;
    assertOrdered(block, ['OFERTA DISPONIBLE', 'Alfa (L1) [A1]', 'Resumen A', 'Beta (L2) [A2]']);
    assert(/Eleg[ií] UNO y dale TRABAJO/.test(block), 'la instruccion es de peso, no de presencia');
    assert(/No hagas una lista/.test(block), 'una enumeracion es la forma de mencionar sin comprometerse');
    assert(/Primero el diagn[oó]stico, despu[eé]s la soluci[oó]n/.test(block), 'y el orden importa');
    assert(!/Neurone|shampoo|cabello/.test(block), 'cero marcas y cero rubro: los items llegan como dato');
  });
  await test('N02·pure buildOfferBlock — sin oferta no hay bloque, y la ausencia deja el prompt como hoy', () => {
    for (const vacio of [null, undefined, {}, { items: [] }, { items: null }, { selected_by: 'none_declared', items: [] }]) {
      assert(PURE.buildOfferBlock(vacio as any) === null, `deberia ser null con ${JSON.stringify(vacio)}`);
    }
  });
  await test('N02·pure buildOfferBlock — un item sin nombre NO se emite: no se puede nombrar lo que no tiene nombre', () => {
    assert(PURE.buildOfferBlock({ items: [{ ref: 'X', name: '  ', summary: 's' }] } as any) === null, 'un unico item sin nombre deja el bloque en null');
    const block = PURE.buildOfferBlock({ items: [{ name: 'Solo' }, { ref: 'Y', name: '' }] } as any)!;
    assert(/1\. Solo/.test(block), 'el que tiene nombre entra');
    assert(!/\[Y\]/.test(block), 'el que no lo tiene se cae, y el resto sobrevive');
  });
  await test('C1·pure buildWritingMaterialBlock — un caso sin fuente o sin nombre NO se emite', () => {
    for (const c of [
      { case: 'x', source_url: 'https://example.org/a' },
      { case: 'x', source_name: 'N' },
      { case: '', source_url: 'https://example.org/a', source_name: 'N' },
    ]) eq(PURE.buildWritingMaterialBlock(null, [c] as any), null, JSON.stringify(c));
    assert(/MECANISMO/.test(PURE.buildWritingMaterialBlock(MECH, [{ case: 'x' }] as any)!), 'y no arrastra al mecanismo consigo');
    // Y la entrada mala no se lleva puesta a la buena.
    const mixto = PURE.buildWritingMaterialBlock(null, [{ case: 'sin fuente' }, CASO] as any)!;
    assertOrdered(mixto, ['CASOS PARA ILUSTRAR (1)', CASO.case]);
  });
  await test('C1·pure la marca N+1: el material entra por el DATO, sin enumeración ni literal de marca', () => {
    const nuevo = { case: 'un caso de un rubro que el código nunca nombró', source_url: 'https://nuevamarca.example/e', source_name: 'Entidad N+1' };
    assertOrdered(PURE.buildWritingMaterialBlock('otra mecánica', [nuevo])!, [nuevo.source_name, nuevo.case]);
    const src = readFileSync(new URL('./execute.ts', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('function buildWritingMaterialBlock('));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
    assert(!/\bnew Set\(|\[['\"][^'\"]+['\"]\s*,/.test(body), 'sin enumeración de valores permitidos');
    assert(!/lucien|forumphs|neurone|unrealville|nuevamarca/i.test(body), 'sin literal de marca en el cuerpo');
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
    eq(PURE.resolveLanguage(null, undefined, undefined, 'en'), 'en', 'cae a brands.language_primary');
    eq(PURE.resolveLanguage('EN', undefined, 'ES', 'en'), 'EN', 'builder gana');
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
  // 'es' — el valor REAL de LucienSael en public.brands [medido 2026-08-30]. El fixture decía
  // 'en-FL', que nunca existió, y de esa afirmación falsa salió el aparato de variantes
  // regionales. Byte a byte contra su golden — cubre que la forma de producción arma el prompt
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
      // FIX-LANG-01 — el idioma abre el prompt: es la PRIMERA capa, antes de ## MARCA.
      // BrandX declara 'en', así que su bloque de idioma va EN INGLÉS: es el fondo
      // del corte —la directiva se redacta en la lengua que instruye, no se traduce.
      assert(a.system.startsWith('Eres CopyLab v9.7, el motor de copy de UNRLVL Studio. Content Pipeline v2.6.\n\n## OUTPUT LANGUAGE'), 'preámbulo + idioma como primera capa, en inglés');
      assert(!a.system.includes('## IDIOMA DE OUTPUT'), 'una marca EN no recibe el encabezado en español');
      assertOrdered(a.system, [
        '## OUTPUT LANGUAGE',
        '## MARCA: BrandX',
        '## OBJETIVOS ESTRATÉGICOS DE LA MARCA', '## SEGMENTOS OBJETIVO (ICP)',
        '## CANAL: INSTAGRAM',
        'VOZ DE MARCA — BASE (L1):', '## GEOMIX — US', '## KEYWORDS', '## CTA ACTIVO',
        '## COMPLIANCE — REGLAS OBLIGATORIAS', '## VOZ DE MARCA — BP_COPY_1.0',
        '## L1.5 VOICE GENOME INJECTION',
        '## L14 CREATIVE VECTOR [VEC1', '## L15 TENSION ARCHITECTURE [TEN1', '## L16 AGGRO DIAL [AGGRO_2',
        // …y se REPITE al cierre, antes del template de output: dos colocaciones del
        // mismo bloque, porque entre la apertura y el cierre hay ~24 capas en español.
        '## OUTPUT LANGUAGE',
        '## TEMPLATE DE OUTPUT [TPL]',
      ]);
      eq(a.system.split('## OUTPUT LANGUAGE').length - 1, 2, 'la directiva de idioma aparece exactamente DOS veces: apertura y cierre');
      // genoma DESPUÉS del copy profile; template DESPUÉS de los creativos (cierra)
      assert(a.system.indexOf('## VOZ DE MARCA — BP_COPY_1.0') < a.system.indexOf('## L1.5 VOICE GENOME'), 'genoma tras copy profile');
      assert(a.system.indexOf('## L16 AGGRO DIAL') < a.system.indexOf('## TEMPLATE DE OUTPUT [TPL]'), 'template tras el ángulo creativo (forma de salida al final)');
      for (const leak of ['EJE ESTRUCTURAL', 'REGLAS DEL WATCHER', 'PSICO-ESTÍMULO', 'MATERIA PRIMA', 'FORMATO (']) {
        assert(!a.system.includes(leak) && !a.user.includes(leak), `fuga de carril en modo UI: ${leak}`);
      }
      // FIX-LANG-01 — el snapshot todavía no emite `language_directives`, así que su
      // query directa corre. Es UNA, dentro del Promise.all (sin coste de latencia),
      // y es la única: el resto del cache sigue cancelando su viaje.
      eq(fx.calls.length, 2, 'cache completo ⇒ una sola query directa por build (este test arma dos)');
      assert(fx.calls.every(u => u.includes('/rest/v1/language_directives')), `la única query es language_directives — obtenido: ${fx.calls.join(', ')}`);
      eq(a.max_tokens, 1600, 'techo UI');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // Case 2 — colisión: bc sin `brands` → la query de brands SÍ se ejecuta, idioma real, sin 'ES'
  await test('2·colisión: bc sin brands ⇒ query brands se ejecuta, language real, sin ES', async () => {
    const fx = installFetch({ tables: { brands: [{ id: 'UnrealvilleStudio', display_name: 'UNRLVL', market: 'Miami', language_primary: 'en' }] } });
    try {
      const built = await buildPrompt(reqWith({ brandContext: { brand_voice_genome: [GENOME_V1] } }, { brandId: 'UnrealvilleStudio' }));
      assert(fx.calls.some(u => u.includes('/rest/v1/brands?id=eq.UnrealvilleStudio')), 'la query directa de brands debe ejecutarse');
      eq(built.language, 'en', 'idioma real de brands.language_primary');
      assert(built.system.includes('Idioma: en'), 'el ## MARCA conserva el código tal cual viene de brands');
      // FIX-LANG-01 — al escritor ya NO le llega el código crudo. Sin fila sembrada corre el
      // alias legacy, y su bloque va REDACTADO EN INGLÉS, no traducido del español.
      eq(built.language_directive.source, 'legacy_alias', 'sin tabla, la procedencia lo declara');
      eq(built.language_directive.register_type, 'neutral', 'el registro viaja en la meta de la corrida');
      eq(built.language_directive.register_scope, 'international', 'y su alcance también');
      assert(!built.system.includes('**en**'), 'el código crudo ya no se usa como etiqueta de idioma');
      assert(built.system.includes('## OUTPUT LANGUAGE') && built.system.includes('neutral international English'), 'la directiva de una marca EN va en inglés');
      assert(!built.system.includes('Genera TODO el contenido') && !built.system.includes('IDIOMA DE OUTPUT'), 'cero andamiaje en español en el bloque de idioma de una marca EN');
      assert(!built.system.includes('IDIOMA: ES'), "el literal 'ES' no aparece por ningún camino");
    } finally { fx.restore(); }
  });

  // FIX-LANG-01 · integración — la directiva sale de la TABLA y llega redactada en
  // la lengua de salida. Es el efecto observable del corte: una marca con idioma 'en'
  // recibe su instrucción en inglés, en la primera capa y repetida al cierre, en vez
  // de una línea suelta con el código crudo entre dos docenas de bloques en español.
  await test('FIX-LANG-01·int: la fila de language_directives gobierna el bloque de idioma', async () => {
    const fx = installFetch({
      tables: {
        brands: [{ id: 'UnrealvilleStudio', display_name: 'UNRLVL', market: 'Miami', language_primary: 'en' }],
        language_directives: [
          { language_code: 'en', label: 'neutral international English', active: true,
            register_type: 'neutral', register_scope: 'international',
            directive_block: '## OUTPUT LANGUAGE\nWrite EVERYTHING exclusively in neutral international English.',
            register_constraints: 'No regional slang.' },
          { language_code: 'es', label: 'español neutro internacional', active: true,
            register_type: 'neutral', register_scope: 'international',
            directive_block: '## IDIOMA DE OUTPUT\nEscribe TODO en español neutro internacional.',
            register_constraints: 'Sin voseo.' },
        ],
      },
    });
    try {
      const built = await buildPrompt(reqWith({ brandContext: { brand_voice_genome: [GENOME_V1] } }, { brandId: 'UnrealvilleStudio' }));
      eq(built.language, 'en', "el idioma resuelto es el de la marca, en minúscula tal como viaja");
      // la fila gana: ni el alias legacy ni el andamiaje viejo aparecen
      assert(built.system.includes('Write EVERYTHING exclusively in neutral international English.'), 'el cuerpo de la directiva sale de la fila');
      assert(built.system.includes('No regional slang.'), 'register_constraints llega al prompt');
      assert(!built.system.includes('Genera TODO el contenido exclusivamente en'), 'con fila, cero andamiaje del alias legacy');
      // primera capa y repetida al cierre
      assert(built.system.startsWith('Eres CopyLab v9.7, el motor de copy de UNRLVL Studio. Content Pipeline v2.6.\n\n## OUTPUT LANGUAGE'), 'la directiva ABRE el prompt');
      eq(built.system.split('## OUTPUT LANGUAGE').length - 1, 2, 'aparece dos veces: apertura y cierre');
      // y la capa L1.5 nombra la VARIANTE, no el código crudo
      assert(built.system.includes('IDIOMA DE GENERACIÓN: neutral international English.'), 'L1.5 nombra la variante');
      eq(built.language_directive.source, 'table', 'la procedencia declara que gobernó la fila');
      eq(built.language_directive.register_type, 'neutral', 'el eje de registro viaja en la meta');
      eq(built.language_directive.register_scope, 'international', 'y su alcance también');
      assert(!built.system.includes('IDIOMA DE GENERACIÓN: en.'), 'L1.5 ya no imprime el código crudo');
      // la fila de 'es' está en la tabla y NO se filtró al prompt
      assert(!built.system.includes('Sin voseo.'), 'sólo entra la fila del idioma declarado');
    } finally { fx.restore(); }
  });

  // FIX-LANG-01 · la ventana entre el deploy y el DDL — la tabla TODAVÍA NO EXISTE.
  // PostgREST devuelve 404 y `sbArray` lo convierte en throw; sin la tolerancia
  // transitoria, este PR detendría el 100 % de las generaciones en esa ventana.
  // Se retira junto con el alias legacy, en el tercer PR del corte.
  await test('FIX-LANG-01·int: sin la tabla (pre-DDL) degrada al alias legacy y sigue generando', async () => {
    const fx = installFetch({
      tables: {
        brands: [{ id: 'UnrealvilleStudio', display_name: 'UNRLVL', market: 'Miami', language_primary: 'es' }],
        language_directives: () => res({ message: 'relation "public.language_directives" does not exist' }, 404),
      },
    });
    try {
      const built = await buildPrompt(reqWith({ brandContext: { brand_voice_genome: [GENOME_V1] } }, { brandId: 'UnrealvilleStudio' }));
      eq(built.language, 'es', 'la generación NO se detiene por la tabla ausente');
      // y la reparación del defecto de origen ya está viva sin la tabla: 'es' en
      // minúscula encuentra su etiqueta, donde antes imprimía el código crudo.
      assert(built.system.includes('**español neutro internacional**'), "'es' resuelve su directiva — antes salía el código crudo '**es**'");
      assert(built.system.includes('SIN VOSEO'), 'y el respaldo ya prohíbe el voseo, que es el defecto que se quiere cerrar');
      assert(!built.system.includes('**es**'), 'el código crudo ya no llega al escritor');
      eq(built.language_directive.source, 'legacy_alias', 'la degradación queda declarada en la procedencia');
    } finally { fx.restore(); }
  });

  // Case 2b — la forma REAL de producción: bc.brand (singular, objeto) que
  // escribe brand-cache.js v2.1 (línea 201), no solo bc.brands[] (plural).
  // Cache completo en ambas formas ⇒ el registro se resuelve del cache y NO se
  // consulta nada (fx.calls === 0): la forma singular alcanza el modo cero-query.
  await test('2b·clave normalizada: bc.brand (v2.1) ≡ bc.brands[0] (v2.0)', async () => {
    const rec = { id: 'B', display_name: 'UNRLVL', market: 'Miami', language_primary: 'en' };
    const { brands: _b, ...rest } = FULL_SNAPSHOT;
    const fx = installFetch({});
    try {
      const singular = await buildPrompt(reqWith({ brandContext: { ...rest, brand: rec } }, { brandId: 'B' }));
      const plural   = await buildPrompt(reqWith({ brandContext: { ...rest, brands: [rec] } }, { brandId: 'B' }));
      eq(singular.language, 'en', 'la forma singular resuelve el idioma');
      eq(singular.language, plural.language, 'ambas formas dan el mismo idioma');
      assert(singular.system.includes('## MARCA: UNRLVL') && singular.system.includes('Mercado: Miami'), 'display_name y market desde la forma singular');
      eq(singular.system, plural.system, 'system byte-idéntico entre ambas formas');
      // FIX-LANG-01 — una query de `language_directives` por build (dos builds acá);
      // ninguna otra: el cache completo sigue cancelando el resto.
      eq(fx.calls.length, 2, 'con el registro resuelto y el cache completo: sólo la query de idioma, una por build');
      assert(fx.calls.every(u => u.includes('/rest/v1/language_directives')), `sólo language_directives — obtenido: ${fx.calls.join(', ')}`);
    } finally { fx.restore(); }
  });

  await test('2b-neg·brand null es ausencia, no cobertura', async () => {
    const fx = installFetch({ tables: { brands: [{ id: 'X', display_name: 'X', market: 'US', language_primary: 'en' }] } });
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
    const base  = { brands: [{ id: 'B', language_primary: 'en' }], brand_voice_genome: [GENOME_V1] };
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
      const built = await buildPrompt(reqWith({ brandContext: { brands: [{ id: 'NeuroneSCF', language_primary: 'es' }], creative_vectors: [] } }, { brandId: 'NeuroneSCF' }));
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
        { brandContext: { brands: [{ id: 'B', language_primary: 'en' }], brand_voice_genome: [GENOME_V1] } },
        // B2 — la regla 'firma' se SURFACEA como signature (deriveSignature), NO se inyecta como orden; la
        // 'prohibition' SÍ se inyecta. Por eso rules_count = 1 (sólo la imperativa), y la firma va aparte.
        { builder_input: { domain: 'd', voice_id: 'v1', destination: 'social', platform: 'meta_ig', language: 'en', psycho_preset: null, rules: [{ code: 'SIG-1', kind: 'firma', statement: '— Lucien Sael' }, { code: 'HR-9', kind: 'prohibition', statement: 'No prometer resultados.' }], iid_brief: 'Algo pasó hoy', angle: null, audience_frame: 'general' } },
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
      const built = await buildPrompt(reqWith({ brandContext: { brands: [{ id: 'B', language_primary: 'en' }], creative_vectors: [] } }));
      eq(built.creative_seed.vector_id, null, 'degrada a vector null (no throw)');
      assert(warns.some(w => w.includes('creative_vectors') && w.includes('B')), 'warn nominal (marca + fuente)');
    } finally { fx.restore(); console.warn = realWarn; }
  });

  // Case 9 — techo por destino a través de buildPrompt
  await test('9·techo: buildPrompt editorial 4000 · social 640 · UI 1600', async () => {
    const fx = installFetch({});
    try {
      const bctx = { brandContext: { brands: [{ id: 'B', language_primary: 'en' }], brand_voice_genome: [GENOME_V1] } };
      const ed = await buildPrompt(reqWith(bctx, { builder_input: { domain: 'd', voice_id: 'v1', destination: 'editorial', platform: 'blog', language: 'en', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null } }));
      const so = await buildPrompt(reqWith(bctx, { builder_input: { domain: 'd', voice_id: 'v1', destination: 'social', platform: 'x', language: 'en', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null } }));
      const ui = await buildPrompt(reqWith(bctx));
      eq(ed.max_tokens, 4000, 'editorial'); eq(so.max_tokens, 640, 'social'); eq(ui.max_tokens, 1600, 'UI');
    } finally { fx.restore(); }
  });

  // G1-C · CABLEADO. Un bloque puro impecable que nadie llama no gobierna nada (la lección de M-9 y
  // de C1): esto verifica que el techo declarado llegue a `built.max_tokens` —el número con el que se
  // llama a Claude— y que `max_tokens_source` viaje al meta que lee el carril.
  await test('G1-C·techo: buildPrompt aplica builder_input.max_tokens y reporta su procedencia', async () => {
    const fx = installFetch({});
    try {
      const bctx = { brandContext: { brands: [{ id: 'B', language_primary: 'en' }], brand_voice_genome: [GENOME_V1] } };
      const bi = (extra: any) => ({ domain: 'd', voice_id: 'v1', destination: 'social', platform: 'meta_fb', language: 'en', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null, ...extra });

      // G1-D — el techo declarado sigue mandando, pero a la API va CON margen: ceil(1400 × 1,2).
      // La pieza corta la garantiza el PRESUPUESTO del prompt; la API es red de seguridad, no
      // guillotina. Lo que se fija acá es que el declarado gobierne el número, no el default (640).
      const declarado = await buildPrompt(reqWith(bctx, { builder_input: bi({ max_tokens: 1400, max_tokens_source: 'base_platform' }) }));
      eq(declarado.max_tokens, 1680, 'el techo declarado gobierna el número con el que se llama a Claude (con margen G1-D)');
      eq(declarado.max_tokens_source, 'base_platform', 'la procedencia viaja al meta');

      // `internal_default` con techo null es la forma HONESTA de "nadie lo declaró": el default por
      // destino sigue mandando y la ausencia queda DICHA, que es lo único que la vuelve legible.
      const sinDeclarar = await buildPrompt(reqWith(bctx, { builder_input: bi({ max_tokens: null, max_tokens_source: 'internal_default' }) }));
      eq(sinDeclarar.max_tokens, 640, 'sin techo declarado manda el default por destino');
      eq(sinDeclarar.max_tokens_source, 'internal_default', 'la ausencia se declara, no se calla');

      // Emisor anterior a F1: no manda ninguna de las dos claves. Comportamiento intacto.
      const preF1 = await buildPrompt(reqWith(bctx, { builder_input: bi({}) }));
      eq(preF1.max_tokens, 640, 'emisor sin las claves ⇒ comportamiento de antes de G1-C');
      eq(preF1.max_tokens_source, null, 'sin procedencia declarada, null — no se inventa un nivel');
    } finally { fx.restore(); }
  });

  // ── G1-D · el presupuesto de longitud se le DICE al escritor ───────────────
  // El defecto que reparan: G1-C hizo que el techo declarado se aplicara y el escritor siguió sin
  // conocerlo. Medido sobre 48 piezas — meta_fb de 1.839 a 953 caracteres promedio (los 320 tokens
  // exactos) y las truncadas a media frase SUBIENDO de 26/48 a 34/48. El techo actuaba de
  // guillotina. Estos tests fijan las tres mitades: que el presupuesto EXISTA en el prompt, que la
  // API deje de ser el mecanismo de corte, y que los dos números queden registrados.
  const LB_BCTX = { brandContext: { brands: [{ id: 'B', language_primary: 'en' }], brand_voice_genome: [GENOME_V1] } };
  const lbBI = (extra: any) => ({ domain: 'd', voice_id: 'v1', destination: 'social', platform: 'meta_fb', language: 'en', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null, ...extra });

  await test('G1-D·pure lengthBudgetCharsFor: techo × 3, redondeado a la centena; null → null', () => {
    // El ratio es dato del MODELO (≈3,27 medidos: 320 tokens → 1.045 chars), no de una marca, y se
    // usa 3 —por debajo de lo medido— para que el presupuesto entre holgado en el techo.
    eq(PURE.lengthBudgetCharsFor(320), 1000, '320 × 3 = 960 → 1.000');
    eq(PURE.lengthBudgetCharsFor(500), 1500, '500 × 3 = 1.500');
    eq(PURE.lengthBudgetCharsFor(700), 2100, '700 × 3 = 2.100');
    eq(PURE.lengthBudgetCharsFor(4000), 12000, 'editorial');
    eq(PURE.lengthBudgetCharsFor(null), null, 'sin techo declarado no hay presupuesto que comunicar');
    eq(PURE.lengthBudgetCharsFor(undefined), null, 'undefined idem');
    // Un techo diminuto no puede producir una orden imposible (0 caracteres).
    eq(PURE.lengthBudgetCharsFor(1), 100, 'piso de 100 chars');
  });

  await test('G1-D·pure buildLengthBudgetBlock: con techo el bloque trae el número y qué sacrificar; sin techo, null', () => {
    eq(PURE.buildLengthBudgetBlock(null), null, 'sin techo declarado → sin bloque (prompt byte-idéntico)');
    eq(PURE.buildLengthBudgetBlock(undefined), null, 'undefined idem');
    const b = String(PURE.buildLengthBudgetBlock(320));
    assert(b.includes('## PRESUPUESTO DE LONGITUD'), 'encabezado');
    assert(b.includes('1000 caracteres'), 'el número del presupuesto, no el de tokens');
    assert(!b.includes('320'), 'al escritor no se le habla en tokens');
    assert(/CIERRE|cierre/.test(b), 'el cierre entra en el presupuesto');
    assert(/ALCANCE/.test(b), 'lo que se achica es el alcance, no el cierre');
    assert(/media frase/.test(b), 'nombra el fallo que viene a impedir');
    // Motor, no caso: ninguna plataforma ni marca en el bloque.
    for (const nombre of ['meta_fb', 'meta_ig', 'linkedin', 'ForumPHs', 'NeuroneSCF', 'LucienSael']) {
      assert(!b.includes(nombre), `el bloque no nombra ${nombre}`);
    }
  });

  await test('G1-D·pure apiMaxTokensFor: con techo declarado, margen; sin techo, el default exacto', () => {
    eq(PURE.apiMaxTokensFor({ destination: 'social', max_tokens: 320 }), 384, 'ceil(320 × 1,2)');
    eq(PURE.apiMaxTokensFor({ destination: 'social', max_tokens: 500 }), 600, 'ceil(500 × 1,2)');
    eq(PURE.apiMaxTokensFor({ destination: 'social', max_tokens: 700 }), 840, 'ceil(700 × 1,2)');
    eq(PURE.apiMaxTokensFor({ destination: 'social', max_tokens: 1001 }), 1202, 'ceil, no round: 1201,2 → 1202');
    // Sin techo declarado el margen NO aplica: el default por destino y el modo UI, exactos.
    eq(PURE.apiMaxTokensFor({ destination: 'social' }), 640, 'default social exacto');
    eq(PURE.apiMaxTokensFor({ destination: 'editorial', max_tokens: null }), 4000, 'default editorial exacto');
    eq(PURE.apiMaxTokensFor(null), 1600, 'modo UI exacto');
    // Una declaración ROTA tampoco gana margen: cae al default, como en G1-C.
    const realWarn = console.warn; console.warn = () => {};
    try { eq(PURE.apiMaxTokensFor({ destination: 'social', max_tokens: 'mil' }), 640, 'declaración rota → default exacto'); }
    finally { console.warn = realWarn; }
  });

  // CABLEADO. Un bloque puro impecable que nadie llama no gobierna nada: esto verifica que el
  // presupuesto llegue al PROMPT y que los dos números lleguen al meta que lee el carril.
  await test('G1-D·cableado: el prompt trae el presupuesto y el meta trae los dos números', async () => {
    const fx = installFetch({});
    try {
      const conTecho = await buildPrompt(reqWith(LB_BCTX, { builder_input: lbBI({ max_tokens: 320, max_tokens_source: 'base_platform' }) }));
      assert(conTecho.system.includes('## PRESUPUESTO DE LONGITUD'), 'el bloque llega al prompt');
      assert(conTecho.system.includes('1000 caracteres'), 'con el número derivado del techo');
      eq(conTecho.length_budget_chars, 1000, 'el eco del presupuesto');
      eq(conTecho.max_tokens, 384, 'a la API va el techo con margen');

      // Sin techo declarado: ni bloque ni margen. Prompt y número byte-idénticos a antes de G1-D.
      const sinTecho = await buildPrompt(reqWith(LB_BCTX, { builder_input: lbBI({ max_tokens: null, max_tokens_source: 'internal_default' }) }));
      assert(!sinTecho.system.includes('PRESUPUESTO DE LONGITUD'), 'sin techo no se emite bloque');
      eq(sinTecho.length_budget_chars, null, 'sin presupuesto que comunicar, null');
      eq(sinTecho.max_tokens, 640, 'el default por destino, exacto — el margen no aplica');

      // Modo UI: ni se entera.
      const ui = await buildPrompt(reqWith(LB_BCTX));
      assert(!ui.system.includes('PRESUPUESTO DE LONGITUD'), 'el modo UI no ve el presupuesto del carril');
      eq(ui.length_budget_chars, null, 'UI sin presupuesto');
      eq(ui.max_tokens, 1600, 'UI 1600 exacto');
    } finally { fx.restore(); }
  });

  await test('G1-D·cableado: max_tokens de la API y length_budget_chars viajan en el meta del carril', async () => {
    const fx = installFetch({ claude: { content: [{ text: 'Cuerpo.' }], usage: { input_tokens: 1, output_tokens: 2 } } });
    try {
      const r = makeRes();
      await handler({ method: 'POST', body: reqWith(LB_BCTX, { builder_input: lbBI({ max_tokens: 320, max_tokens_source: 'base_platform' }) }) } as any, r as any);
      eq(r._out._status, 200, 'HTTP 200');
      eq(r._out._json.meta.length_budget_chars, 1000, 'meta.length_budget_chars — lo que se le DIJO al escritor');
      eq(r._out._json.meta.max_tokens_applied, 384, 'meta.max_tokens_applied — lo que se le mandó a la API');
      // Y el número que se le mandó a la API es el que la API RECIBIÓ: sin esto, el eco miente.
      eq(fx.claudeBodies[0]?.max_tokens, 384, 'el body de la llamada a Claude lleva el techo con margen');
    } finally { fx.restore(); }
  });

  // ── BRIEF 8 · A · el título es ciudadano de primera ────────────────────────
  // El defecto que reparan, medido contra ESTA fuente y no supuesto: el bloque FORMATO decía, en
  // modo social, «Sin título, sin la etiqueta "TÍTULO:"». Las 9 piezas del lote sin título eran
  // sociales: el título no faltaba por descuido del escritor, estaba PROHIBIDO. Y desde BRIEF 7 el
  // título es el texto que se dibuja sobre la imagen — sin él, el overlay no compone jamás.
  const T8_BCTX = { brandContext: { brands: [{ id: 'B', language_primary: 'en' }], brand_voice_genome: [GENOME_V1] } };
  const t8BI = (extra: any = {}) => ({ domain: 'd', voice_id: 'v1', destination: 'social', platform: 'meta_fb', language: 'en', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null, ...extra });

  await test('BRIEF8·A·pure readTitleBudgetChars: el número es DATO; ilegible no corta, deja rastro', () => {
    eq(PURE.readTitleBudgetChars(72), 72, 'el declarado manda');
    eq(PURE.readTitleBudgetChars('90'), 90, 'numérico en string');
    eq(PURE.readTitleBudgetChars(null), null, 'ausente = emisor anterior a BRIEF 8');
    eq(PURE.readTitleBudgetChars(undefined), null, 'undefined idem');
    eq(PURE.readTitleBudgetChars(5), 20, 'piso: un presupuesto diminuto sería una orden imposible');
    const realWarn = console.warn; const warned: string[] = [];
    console.warn = (m: any) => { warned.push(String(m)); };
    try {
      eq(PURE.readTitleBudgetChars('setenta'), null, 'basura → null, la pieza no muere por su presupuesto');
      eq(PURE.readTitleBudgetChars(-10), null, 'negativo idem');
      assert(warned.length === 2 && /title_budget_chars ilegible/.test(warned[0]), 'y deja rastro');
    } finally { console.warn = realWarn; }
  });

  await test('BRIEF8·A·pure buildTitleBlock: oficio + regla + presupuesto, sin marcas ni plataformas', () => {
    const con = String(PURE.buildTitleBlock(72, 'social'));
    assert(con.includes('## TÍTULO'), 'encabezado');
    assert(/AFIRMACIÓN MÁS FILOSA/.test(con), 'el título AFIRMA, no resume — es el oficio, no una restricción');
    assert(/sostenerse solo/.test(con), 'se lee sin el cuerpo debajo');
    assert(/todas las reglas que gobiernan el cuerpo lo/i.test(con), 'toda regla de marca aplica también al título');
    assert(con.includes('72 caracteres'), 'la cifra declarada');
    assert(/CIERRA dentro/.test(con), 'y que el título CIERRA dentro de ella');
    // Sin cifra: la sección sale IGUAL (el título nunca es opcional), sólo sin número.
    const sin = String(PURE.buildTitleBlock(null, 'social'));
    assert(sin.includes('## TÍTULO'), 'sin presupuesto declarado el título sigue siendo obligatorio');
    assert(!/\d+ caracteres/.test(sin), 'pero no se inventa una cifra');
    // Marca N+1: el bloque es motor. Ni marcas, ni plataformas, ni jurisdicciones.
    for (const nombre of ['meta_fb', 'meta_ig', 'linkedin', 'ForumPHs', 'NeuroneSCF', 'LucienSael', 'Unrealville']) {
      assert(!con.includes(nombre), `el bloque no nombra ${nombre}`);
    }
  });

  await test('BRIEF8·A·pure buildTitleBlock: en social el título NO se publica en el cuerpo', () => {
    const social = String(PURE.buildTitleBlock(72, 'social'));
    const editorial = String(PURE.buildTitleBlock(72, 'editorial'));
    assert(/NO se publica dentro del cuerpo/.test(social), 'en social el título es el texto del overlay');
    assert(!/NO se publica dentro del cuerpo/.test(editorial), 'en editorial encabeza la pieza publicada');
    // Lo que NO cambia entre destinos: que exista y que se juzgue.
    for (const b of [social, editorial]) assert(/AFIRMACIÓN MÁS FILOSA/.test(b), 'el oficio es el mismo');
  });

  await test('BRIEF8·A·pure buildCarrilFormatBlock: TÍTULO obligatorio en los DOS destinos', () => {
    const social = String(PURE.buildCarrilFormatBlock('social'));
    const editorial = String(PURE.buildCarrilFormatBlock('editorial'));
    for (const [nombre, b] of [['social', social], ['editorial', editorial]] as const) {
      assert(b.includes('Primera línea EXACTA: "TÍTULO: <título de la pieza>"'), `${nombre} pide el título`);
    }
    // La regresión que este test fija para siempre: la prohibición vieja no puede volver.
    assert(!/Sin título/.test(social), 'la orden «Sin título» era la causa del lote sin títulos');
    assert(!/sin la etiqueta/.test(social), 'ni su corolario');
    assert(/El cuerpo NO repite el título/.test(social), 'en social el cuerpo se publica sin el título');
    assert(/sin repetir el título, sin H1/.test(editorial), 'editorial conserva su forma');
  });

  await test('BRIEF8·A·pure titleCharCount: mide lo que se emitió, en la unidad del presupuesto', () => {
    eq(PURE.titleCharCount('La cuota no se vota'), 19, 'caracteres, no palabras ni tokens');
    eq(PURE.titleCharCount('  con bordes  '), 10, 'sin contar el espacio de los bordes');
    eq(PURE.titleCharCount(null), 0, 'ausente = 0');
    eq(PURE.titleCharCount(undefined), 0, 'undefined idem');
  });

  await test('BRIEF8·A·cableado: la sección llega al prompt y el trío del título al meta', async () => {
    const fx = installFetch({ claude: { content: [{ text: 'TÍTULO: La cuota no se vota a mano alzada\n\nCuerpo de la pieza.' }], usage: { input_tokens: 1, output_tokens: 2 } } });
    try {
      const built = await buildPrompt(reqWith(T8_BCTX, { builder_input: t8BI({ title_budget_chars: 72, title_budget_source: 'imagelab_overlay_tokens:fit_steps[0]' }) }));
      assert(built.system.includes('## TÍTULO'), 'la sección llega al system');
      assert(built.system.includes('72 caracteres'), 'con el número que resolvió el carril');
      assert(built.user.includes('TÍTULO: <título de la pieza>'), 'y el FORMATO lo exige aunque sea social');
      eq(built.title_budget_chars, 72, 'eco del presupuesto aplicado');
      eq(built.title_budget_source, 'imagelab_overlay_tokens:fit_steps[0]', 'y de qué nivel salió');

      const r = makeRes();
      await handler({ method: 'POST', body: reqWith(T8_BCTX, { builder_input: t8BI({ title_budget_chars: 72, title_budget_source: 'imagelab_overlay_tokens:fit_steps[0]' }) }) } as any, r as any);
      eq(r._out._status, 200, 'HTTP 200');
      eq(r._out._json.title, 'La cuota no se vota a mano alzada', 'el título viaja en el contrato');
      eq(r._out._json.body, 'Cuerpo de la pieza.', 'y el cuerpo sale sin él');
      eq(r._out._json.meta.title_chars, 33, 'eco medible: cuánto midió');
      eq(r._out._json.meta.title_budget_chars, 72, 'contra cuánto se le dio');
      eq(r._out._json.meta.title_missing, false, 'y que no faltó');
    } finally { fx.restore(); }
  });

  await test('BRIEF8·A·cableado: un título ausente es INCUMPLIMIENTO — se marca, no se inventa', async () => {
    const fx = installFetch({ claude: { content: [{ text: 'Cuerpo sin la línea de título.' }], usage: { input_tokens: 1, output_tokens: 2 } } });
    const realErr = console.error; const errs: string[] = [];
    console.error = (m: any) => { errs.push(String(m)); };
    try {
      const r = makeRes();
      await handler({ method: 'POST', body: reqWith(T8_BCTX, { builder_input: t8BI({ title_budget_chars: 72 }) }) } as any, r as any);
      eq(r._out._status, 200, 'la pieza sigue viva: un título ausente no la tira');
      eq(r._out._json.title, null, 'y NO se fabrica uno — el carril decide qué hacer');
      eq(r._out._json.meta.title_missing, true, 'la marca que el carril asienta');
      eq(r._out._json.meta.title_chars, 0, 'medida honesta');
      assert(errs.some(e => /COPYLAB_TITLE_MISSING/.test(e)), 'y grita con nombre propio');
    } finally { console.error = realErr; fx.restore(); }
  });

  await test('BRIEF8·A·cableado: el modo UI no ve nada de esto (prompt byte-idéntico)', async () => {
    const fx = installFetch({});
    try {
      const ui = await buildPrompt(reqWith(T8_BCTX));
      assert(!ui.system.includes('## TÍTULO'), 'la sección es del carril, no del modo UI');
      eq(ui.title_budget_chars, null, 'sin presupuesto');
      eq(ui.title_budget_source, null, 'sin procedencia');
    } finally { fx.restore(); }
  });

  // ── G2-C · la política de CTA por frente, con claves canónicas ─────────────
  // El defecto que reparan: `intel.brand_topics.audience_frame` migró al eje canónico
  // (decide/influye) y el mapa de CopyLab se quedó en el legacy (jd/doliente) resolviendo con
  // `?? ''`. Cada pieza con frente declarado recibía "POLÍTICA DE CTA [audiencia: influye]:" y
  // NADA debajo, mientras gate7 la juzgaba contra la regla completa. Estos tests fijan las dos
  // mitades: que la política tenga CUERPO, y que un frente que el mapa no cubre no vuelva a
  // pasar en silencio.
  const AF_BCTX = { brandContext: { brands: [{ id: 'B', language_primary: 'en' }], brand_voice_genome: [GENOME_V1] } };
  const afBI = (frame: any) => ({ domain: 'd', voice_id: 'v1', destination: 'social', platform: 'meta_fb', language: 'en', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: frame });
  // Devuelve el cuerpo de la política emitida (lo que va DEBAJO del encabezado), o null si no
  // se emitió bloque. Es la aserción que el `?? ''` de main no pasa: el encabezado existía.
  function ctaBody(system: string): string | null {
    const at = system.indexOf('POLÍTICA DE CTA [audiencia: ');
    if (at === -1) return null;
    const nl = system.indexOf('\n', at);
    const end = system.indexOf('\n\n---\n\n', nl);
    return system.slice(nl + 1, end === -1 ? undefined : end).trim();
  }

  await test('G2-C·canónicos: decide/influye/general emiten el bloque CON política debajo', async () => {
    const fx = installFetch({});
    try {
      for (const frame of ['decide', 'influye', 'general']) {
        const built = await buildPrompt(reqWith(AF_BCTX, { builder_input: afBI(frame) }));
        assert(built.system.includes(`POLÍTICA DE CTA [audiencia: ${frame}]:`), `${frame}: falta el encabezado`);
        const body = ctaBody(built.system);
        assert(!!body && body.length > 40, `${frame}: encabezado SIN política debajo (el defecto de main) — obtenido ${JSON.stringify(body)}`);
        eq(built.audience_cta_applied, frame, `${frame}: builder_meta.audience_cta_applied`);
      }
    } finally { fx.restore(); }
  });

  // La semántica NUEVA, no la legacy: 'influye' prohíbe el CTA de contratación (el legado
  // 'doliente' lo PEDÍA, en versión empática). Si alguien repone el alias, esto cae.
  await test('G2-C·semántica: influye PROHÍBE el CTA de contratación; decide lo permite', async () => {
    const fx = installFetch({});
    try {
      const inf = ctaBody((await buildPrompt(reqWith(AF_BCTX, { builder_input: afBI('influye') }))).system) ?? '';
      assert(/PROHIBIDO/.test(inf), 'influye: la política tiene que prohibir, no matizar');
      assert(/EXIGIR|exigencia/.test(inf), 'influye: el cierre válido es una exigencia donde el lector sí tiene poder');
      assert(!/momento sensible|empátic/i.test(inf), 'influye NO puede traer el texto emocional del eje legacy (doliente)');
      const dec = ctaBody((await buildPrompt(reqWith(AF_BCTX, { builder_input: afBI('decide') }))).system) ?? '';
      assert(/PUEDE/.test(dec) && /contrat/i.test(dec), 'decide: el cierre puede pedir que contrate');
    } finally { fx.restore(); }
  });

  await test('G2-C·null: sin frente declarado NO se emite bloque (ausencia declarada)', async () => {
    const fx = installFetch({});
    try {
      const built = await buildPrompt(reqWith(AF_BCTX, { builder_input: afBI(null) }));
      assert(!built.system.includes('POLÍTICA DE CTA'), 'sin frente no se emite el encabezado');
      eq(built.audience_cta_applied, 'none', "el 'none' se DICE: una ausencia muda no se puede leer");
    } finally { fx.restore(); }
  });

  await test('G2-C·desconocido: frente no nulo que no resuelve → AUDIENCE_FRAME_UNKNOWN, no bloque vacío', async () => {
    const fx = installFetch({});
    try {
      await assertThrows(
        () => buildPrompt(reqWith(AF_BCTX, { builder_input: afBI('propietario') })),
        'AUDIENCE_FRAME_UNKNOWN: propietario',
      );
    } finally { fx.restore(); }
  });

  await test('G2-C·legacy: jd y doliente LANZAN — no hay alias que los resuelva en silencio', async () => {
    const fx = installFetch({});
    try {
      await assertThrows(() => buildPrompt(reqWith(AF_BCTX, { builder_input: afBI('jd') })), 'AUDIENCE_FRAME_UNKNOWN: jd');
      await assertThrows(() => buildPrompt(reqWith(AF_BCTX, { builder_input: afBI('doliente') })), 'AUDIENCE_FRAME_UNKNOWN: doliente');
    } finally { fx.restore(); }
  });

  // El eco tiene que LLEGAR al meta que el carril escribe en builder_meta — un campo impecable
  // en buildPrompt que la respuesta no lleva no registra nada (la lección de max_tokens_applied).
  await test('G2-C·cableado: meta.audience_cta_applied viaja en la respuesta del carril', async () => {
    const fx = installFetch({ claude: { content: [{ text: 'Cuerpo.' }], usage: { input_tokens: 1, output_tokens: 2 } } });
    try {
      for (const [frame, esperado] of [['influye', 'influye'], [null, 'none']] as Array<[any, string]>) {
        const r = makeRes();
        await handler({ method: 'POST', body: reqWith(AF_BCTX, { builder_input: afBI(frame) }) } as any, r as any);
        eq(r._out._status, 200, `${esperado}: HTTP 200`);
        eq(r._out._json.meta.audience_cta_applied, esperado, `${esperado}: meta.audience_cta_applied`);
      }
    } finally { fx.restore(); }
  });

  await test('G2-C·pure resolveAudienceCta — 3 frentes + none, y el throw nominal', () => {
    eq(PURE.resolveAudienceCta(null).key, 'none', 'null → none');
    eq(PURE.resolveAudienceCta(null).block, null, 'null → sin bloque');
    eq(PURE.resolveAudienceCta('   ').key, 'none', 'vacío → none');
    for (const frame of ['decide', 'influye', 'general']) {
      const r = PURE.resolveAudienceCta(frame);
      eq(r.key, frame, `${frame}: key`);
      assert(String(r.block).startsWith(`POLÍTICA DE CTA [audiencia: ${frame}]:\n`), `${frame}: encabezado`);
      assert(String(r.block).split('\n').slice(1).join('\n').trim().length > 40, `${frame}: política con cuerpo`);
    }
    // Normaliza como gate7 (trim + lowercase): la frontera no inventa un desconocido por mayúsculas.
    eq(PURE.resolveAudienceCta('  Decide ').key, 'decide', 'trim + lowercase');
    // Y no hay alias legacy: el mapa tiene exactamente los tres frentes canónicos.
    assert(Object.keys(PURE.AUDIENCE_CTA).sort().join(',') === 'decide,general,influye', 'el mapa son los 3 canónicos, sin jd/doliente');
    let lanzo = '';
    try { PURE.resolveAudienceCta('doliente'); } catch (e) { lanzo = e instanceof Error ? e.message : String(e); }
    eq(lanzo, 'AUDIENCE_FRAME_UNKNOWN: doliente', 'error nominal con el valor recibido');
  });

  // ── Cambio 1 + 2 · integración del registro y la precedencia por voz ────────

  // Base para los tres tests de registro: catálogo creativo con AGGRO_1/2/3 para
  // distinguir de qué fila salió el aggro (voz vs BASE).
  const REG_BASE = {
    brands: [{ id: 'B', display_name: 'BrandX', market: 'US', language_primary: 'en' }],
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
  const carrilBI = (extra: any) => ({ domain: 'd', voice_id: 'v', destination: 'social', platform: 'x', language: 'en', psycho_preset: null, rules: [], iid_brief: 'b', angle: null, audience_frame: null, ...extra });

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

  // INT-A1 — el bloque de cifras dentro del prompt real: presente cuando el carril manda claims,
  // AUSENTE (y prompt byte-idéntico) cuando no. Es el contrato de aditividad del CAMBIO 8.
  await test('INT-A1·claims: el bloque citable entra al system; sin claims el prompt no cambia un byte', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
      };
      const claim = { claim: 'caída interanual del segmento', value: '12%', source_url: 'https://example.org/informe-2026' };
      const bi = { voice_id: 'lucien_social', destination: 'social', platform: 'x' };

      const con = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ ...bi, claims: [claim] }) }));
      assertOrdered(con.system, ['CIFRAS CITABLES', claim.claim, claim.value, claim.source_url]);

      const sin   = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI(bi) }));
      const vacio = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ ...bi, claims: [] }) }));
      assert(!sin.system.includes('CIFRAS CITABLES'), 'sin la clave no hay bloque');
      eq(vacio.system, sin.system, 'claims: [] ≡ sin la clave — byte a byte');
      assert(con.system.length > sin.system.length, 'el prompt con cifras es el de hoy MÁS el bloque');
      eq(sin.system, con.system.split('\n\n---\n\n').filter((b: string) => !b.startsWith('CIFRAS CITABLES')).join('\n\n---\n\n'), 'quitando el bloque se recupera el prompt de hoy, byte a byte');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // ── D2 · la regla del ESCRITOR no es la del JUEZ ───────────────────────────
  // `statement` está redactado para juzgar ("Mira el FINAL de la pieza. CUMPLE si…"); pedirle eso a
  // quien todavía está escribiendo la pieza es criterio de auditoría sobre un objeto ausente.
  const R_JUEZ = { code: 'HR-GEN-01', kind: 'requirement',
    statement: 'Mira el FINAL de la pieza. CUMPLE si la última frase termina en signo de cierre.' };
  const R_ESCRITOR = { ...R_JUEZ,
    instruction: 'Cerrá la pieza. Si el espacio se agota, acortá el desarrollo — nunca el cierre.' };

  await test('D2·int el bloque de reglas usa instruction cuando existe, y NO el statement del juez', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
      };
      const bi = { voice_id: 'lucien_social', destination: 'social', platform: 'x' };

      const conInstr = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ ...bi, rules: [R_ESCRITOR] }) }));
      assert(conInstr.system.includes(R_ESCRITOR.instruction), 'la instruction entra al prompt');
      assert(!conInstr.system.includes('Mira el FINAL'), 'el statement del juez NO entra cuando hay instruction');
      eq(JSON.stringify(conInstr.rules_by_instruction), JSON.stringify(['HR-GEN-01']), 'y queda marcada como tal');

      // Fallback: las 58 reglas sin redactar llegan exactamente como hoy.
      const sinInstr = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ ...bi, rules: [R_JUEZ] }) }));
      assert(sinInstr.system.includes('Mira el FINAL'), 'sin instruction cae a statement, como hoy');
      eq(JSON.stringify(sinInstr.rules_by_instruction), JSON.stringify([]), 'y NO se cuenta como redactada');
      eq(JSON.stringify(sinInstr.rules_injected), JSON.stringify(['HR-GEN-01']), 'pero se inyecta igual');

      // instruction vacía o en blanco ≡ ausente: no deja la regla muda.
      for (const v of ['', '   ', null, undefined]) {
        const r = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ ...bi, rules: [{ ...R_JUEZ, instruction: v }] }) }));
        assert(r.system.includes('Mira el FINAL'), `instruction=${JSON.stringify(v ?? null)} cae a statement`);
        eq(JSON.stringify(r.rules_by_instruction), JSON.stringify([]), 'y no se cuenta');
      }

      // Una regla sin NINGUNO de los dos textos se salta, no se inyecta muda.
      const muda = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ ...bi, rules: [{ code: 'HR-MUDA', kind: 'requirement', statement: '  ' }] }) }));
      eq(JSON.stringify(muda.rules_skipped), JSON.stringify(['HR-MUDA']), 'muda ⇒ skipped, no inyectada');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // INT-C1 — el material de escritura dentro del prompt real. Mismo contrato de aditividad que el
  // bloque de cifras: presente cuando el carril lo manda, ausente y byte-idéntico cuando no.
  await test('INT-C1·material: mecanismo y caso entran al system; sin ellos el prompt no cambia un byte', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        ...REG_BASE,
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
      };
      const bi = { voice_id: 'lucien_social', destination: 'social', platform: 'x' };
      const mechanism = 'cuando el inventario baja, el precio sube porque la oferta se contrae';
      const case_examples = [
        { case: 'una plataforma rehízo su checkout', source_url: 'https://example.org/caso', source_name: 'Informe 2026' },
        { case: 'un marketplace movió el paso de pago', source_url: 'https://data.example.net/serie/42', source_name: 'Serie 42' },
      ];

      const con = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ ...bi, mechanism, case_examples }) }));
      assertOrdered(con.system, ['MECANISMO', mechanism, 'CASOS PARA ILUSTRAR (2)', case_examples[0].case, case_examples[1].case]);

      const sin = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI(bi) }));
      assert(!sin.system.includes('MECANISMO') && !sin.system.includes('CASOS PARA ILUSTRAR'), 'sin las claves no hay bloque');
      eq(sin.system, con.system.split('\n\n---\n\n').filter((b: string) => !b.startsWith('MECANISMO')).join('\n\n---\n\n'), 'quitando el bloque se recupera el prompt de hoy, byte a byte');

      // Un caso a medias (sin fuente) no arrastra al mecanismo: entra lo que esté completo.
      const parcial = await buildPrompt(reqWith({ brandContext: cache }, { builder_input: carrilBI({ ...bi, mechanism, case_examples: [{ case: 'sin fuente' }] }) }));
      assert(parcial.system.includes('MECANISMO'), 'el mecanismo entra igual');
      assert(!parcial.system.includes('CASOS PARA ILUSTRAR'), 'el caso incompleto no');
    } finally { fx.restore(); Math.random = realRandom; }
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
        { params: { pack: 'email_sequence_cart' }, meta: { sequence_type: 'abandoned_cart', position: 2, language: 'en' } },
      ));
      eq(built.creative_seed.aggro_id, 'AGGRO_4', 'aggro del EJE CREATIVO (abandoned_cart_2 → 4), no del pipeline (2)');
      eq(built.output_template_id, 'prompt_Email_Sequence', 'template del EJE PIPELINE (email_sequence), no del creativo (Email_Campaign)');
      assert(built.system.includes('TEMPLATE DE OUTPUT [SEQ]') && !built.system.includes('[CAMP]'), 'el system lleva el template de la secuencia, no el del carrito');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // INT-5 — modo UI en CACHE MISS de compat → query directa. B·Fix 1: la query ya NO filtra
  // por voz (la voz de UI sale del genoma, que se resuelve DESPUÉS del fetch) → trae TODAS las
  // filas activas del content_type y selectCompatRule elige. Sin filtro de voz tampoco hay
  // riesgo del 400 de PostgREST (la forma con punto que rompía). El mock devuelve 400 si
  // apareciera cualquier filtro voice_id.* — no debe aparecer.
  await test('INT-5·UI cache-miss: compat por query directa sin filtro de voz (no 400)', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({
      tables: {
        creative_vectors: [{ id: 'V', category: 'c', label: 'L', instruction: 'i', aggro_min: 1, aggro_max: 5 }],
        tension_architectures: [{ id: 'T', label: 'L', instruction: 'i', curve: 'c' }],
        aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' }],
        creative_compatibility_rules: (u: string) =>
          /voice_id[.=]/.test(u.split('creative_compatibility_rules?')[1] ?? '')
            ? res('column creative_compatibility_rules.voice_id.is does not exist', 400)
            : res([{ content_type: 'social_post', voice_id: null, allowed_vectors: ['V'], excluded_vectors: [], allowed_tensions: ['T'], allowed_aggro: ['AGGRO_2'] }]),
      },
    });
    try {
      // modo UI (sin builder_input), cache sin slice de creative_compatibility_rules → query directa
      const built = await buildPrompt(reqWith({ brandContext: { brands: [{ id: 'B', language_primary: 'en' }] } }));
      assert(fx.calls.some(u => u.includes('/rest/v1/creative_compatibility_rules') && u.includes('content_type=eq.social_post') && !u.includes('voice_id')), 'la query directa NO lleva filtro de voz (trae todo el content_type)');
      eq(built.creative_seed.aggro_id, 'AGGRO_2', 'resuelve BASE por query directa sin romper (400)');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // B·Fix 1 — UI SIN builder_input: la voz sale del genoma resuelto (no cae siempre en BASE).
  // Con genoma lucien_editorial y una fila de compat de esa voz (allowed_aggro AGGRO_3),
  // selectCompatRule devuelve source 'voice' y el aggro sale de AGGRO_3, no de la BASE.
  await test('B·Fix1: UI usa la voz del genoma en compat → source voice, aggro_id AGGRO_3', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        brands: [{ id: 'LucienSael', display_name: 'Lucien Sael', language_primary: 'en' }],
        brand_voice_genome: [{ voice_id: 'lucien_editorial', version: '1', maturity: 'stable', identity_anchors: 'ia', lexicon_signature: {}, lexicon_forbidden: [], syntactic_signatures: {}, argumentative_architecture: {}, relational_stance: {}, emotional_register: 'er', prohibited_registers: [] }],
        creative_vectors: [{ id: 'VEC1', category: 'c', label: 'L', instruction: 'i', aggro_min: 1, aggro_max: 5 }],
        tension_architectures: [{ id: 'TEN1', label: 'L', instruction: 'i', curve: 'c' }],
        aggro_presets: [{ id: 'AGGRO_1', level: 1, label: 'L', instruction: 'i', anti_hedging: 'h' }, { id: 'AGGRO_3', level: 3, label: 'L', instruction: 'i', anti_hedging: 'h' }],
        creative_compatibility_rules: [
          { content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_1'] },
          { content_type: 'social_post', voice_id: 'lucien_editorial', allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_3'] },
        ],
        content_type_registry: [{ content_type: 'social_post', pipeline_family: 'post', output_template_id: null, aggro_default: 2, active: true }],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache }, { brandId: 'LucienSael' })); // UI, sin builder_input
      eq(built.creative_seed.aggro_id, 'AGGRO_3', 'la UI usa la voz del genoma (AGGRO_3), no la BASE (AGGRO_1)');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  // B·Fix 2 — eje de voz en content_type_registry: la fila de la voz gana a la BASE para
  // output_template_id. UI con genoma lucien_editorial → template de la fila de voz (TVOICE),
  // no el de la BASE (TBASE).
  await test('B·Fix2: registro con eje de voz → output_template de la voz gana a la BASE', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const cache = {
        brands: [{ id: 'LucienSael', display_name: 'Lucien Sael', language_primary: 'en' }],
        brand_voice_genome: [{ voice_id: 'lucien_editorial', version: '1', maturity: 'stable', identity_anchors: 'ia', lexicon_signature: {}, lexicon_forbidden: [], syntactic_signatures: {}, argumentative_architecture: {}, relational_stance: {}, emotional_register: 'er', prohibited_registers: [] }],
        creative_vectors: [{ id: 'VEC1', category: 'c', label: 'L', instruction: 'i', aggro_min: 1, aggro_max: 5 }],
        tension_architectures: [{ id: 'TEN1', label: 'L', instruction: 'i', curve: 'c' }],
        aggro_presets: [{ id: 'AGGRO_2', level: 2, label: 'L', instruction: 'i', anti_hedging: 'h' }],
        creative_compatibility_rules: [{ content_type: 'social_post', voice_id: null, allowed_vectors: ['VEC1'], excluded_vectors: [], allowed_tensions: ['TEN1'], allowed_aggro: ['AGGRO_2'] }],
        content_type_registry: [
          { content_type: 'social_post', voice_id: null, pipeline_family: 'post', output_template_id: 'TBASE', aggro_default: 2, active: true },
          { content_type: 'social_post', voice_id: 'lucien_editorial', pipeline_family: 'post', output_template_id: 'TVOICE', aggro_default: 2, active: true },
        ],
        output_templates: [
          { id: 'TBASE', name: 'BASE', category: 'social_post', template_text: 'base tmpl', active: true },
          { id: 'TVOICE', name: 'VOICE', category: 'social_post', template_text: 'voice tmpl', active: true },
        ],
      };
      const built = await buildPrompt(reqWith({ brandContext: cache }, { brandId: 'LucienSael' })); // UI
      eq(built.output_template_id, 'TVOICE', 'gana el output_template de la fila de voz, no la BASE');
      assert(built.system.includes('## TEMPLATE DE OUTPUT [VOICE]') && !built.system.includes('[BASE]'), 'el system lleva el template de la voz');
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
        brands: [{ id: 'B', display_name: 'ACME', market: 'US', language_primary: 'en', cta_base: 'Comprá ya', geo_principal: 'Miami' }],
        content_type_registry: [
          { content_type: 'email_sequence', pipeline_family: 'email_sequence', output_template_id: 'prompt_Email_Sequence', aggro_default: 2, active: true },
        ],
        output_templates: [
          { id: 'prompt_Email_Sequence', name: 'SEQ', category: 'email_sequence', template_text: 'Hola {{marca}} — {{cta_base}} en {geo_principal}. {{disclaimer_base}}', active: true },
        ],
      };
      const built = await buildPrompt(reqWith(
        { brandContext: cache },
        { params: { pack: 'email_sequence_welcome' }, meta: { sequence_type: 'welcome', position: 1, language: 'en' } },
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
        brands: [{ id: 'B', display_name: 'ACME', language_primary: 'en' }],
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
        brands: [{ id: 'B', display_name: 'ACME', language_primary: 'en' }], // sin disclaimer_base
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
    const b = PURE.buildBrandBlock({ display_name: 'ACME', brand_context: 'ctx', geo_principal: 'Miami', tono_base: 'seco', diferenciador_base: 'dif', disclaimer_base: 'disc', market: 'US', language_primary: 'en' });
    assert(b.startsWith('## MARCA: ACME'), 'header ## MARCA');
    for (const s of ['Contexto: ctx', 'Geo principal: Miami', 'Tono base: seco', 'Diferenciador: dif', 'Disclaimer: disc', 'Mercado: US', 'Idioma: en']) assert(b.includes(s), `incluye ${s}`);
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
  // FIX-LANG-01 — buildIdiomaBlock ya no busca etiqueta: COLOCA la directiva
  // resuelta. El texto llega redactado en su propia lengua desde la fila de
  // `language_directives`; el bloque no aporta andamiaje en otro idioma.
  await test('FIX-LANG-01·pure buildIdiomaBlock — coloca la directiva, no la redacta', () => {
    const d = {
      language_code: 'en', label: 'neutral international English',
      register_type: 'neutral', register_scope: 'international',
      directive_block: '## OUTPUT LANGUAGE\nWrite EVERYTHING exclusively in neutral international English.',
      register_constraints: 'No regional slang.',
    };
    const out = PURE.buildIdiomaBlock(d);
    assert(out.startsWith('## OUTPUT LANGUAGE'), 'el encabezado sale de la fila, no del código');
    assert(out.includes('Write EVERYTHING exclusively in neutral international English.'), 'el cuerpo de la directiva, literal');
    assert(out.includes('No regional slang.'), 'register_constraints va DENTRO del mismo bloque');
    assert(!/Genera TODO|prioridad absoluta|No mezcles idiomas/.test(out), 'cero andamiaje en español cableado en el código');
    // los tokens de registro NO se renderizan como campos: meter la palabra «neutro»
    // dentro de una directiva en inglés sería el mismo defecto que este corte repara.
    // Son eje de AUDITORÍA y viajan en la meta de la corrida, no en el prompt.
    assert(!/register_type|register_scope/.test(out), 'los tokens de registro no se vuelcan al prompt');
    eq(PURE.buildIdiomaBlock({ ...d, register_constraints: null }),
       '## OUTPUT LANGUAGE\nWrite EVERYTHING exclusively in neutral international English.',
       'sin register_constraints → sólo el bloque, sin separador colgando');
  });

  // FIX-LANG-01 — el defecto de origen: el mapa estaba en MAYÚSCULAS y el código
  // llega en minúsculas ('es' en 14 de 15 marcas, 'en' en la restante — medido
  // 2026-08-30 contra public.brands). La normalización es la reparación.
  await test('FIX-LANG-01·pure normalizeLanguageCode — el código se normaliza antes de buscar', () => {
    for (const raw of ['es', 'ES', ' Es ', 'eS']) eq(PURE.normalizeLanguageCode(raw), 'es', `'${raw}' → 'es'`);
    eq(PURE.normalizeLanguageCode('  EN  '), 'en', 'recorta y baja');
    eq(PURE.normalizeLanguageCode(undefined as any), '', 'ausencia → cadena vacía, nunca "undefined"');
  });

  await test('FIX-LANG-01·pure resolveLanguageDirective — tabla > alias exacto > throw', () => {
    const rows = [
      { language_code: 'es', label: 'español neutro internacional', register_type: 'neutral', register_scope: 'international', directive_block: '## IDIOMA DE OUTPUT\nEscribe TODO en español neutro internacional.', register_constraints: 'Sin voseo.', active: true },
      { language_code: 'en', label: 'neutral international English', register_type: 'neutral', register_scope: 'international', directive_block: '## OUTPUT LANGUAGE\nWrite everything in neutral international English.', register_constraints: null, active: false },
    ];
    // 1 · fila de la tabla, buscada con el código NORMALIZADO — el caso que el defecto rompía
    for (const raw of ['es', 'ES', ' es ']) {
      const r = PURE.resolveLanguageDirective(rows, raw);
      eq(r.source, 'table', `'${raw}' resuelve por tabla`);
      eq(r.directive.label, 'español neutro internacional', 'la etiqueta sale de la fila');
      eq(r.directive.register_type, 'neutral', 'el eje de registro sale de la fila');
      eq(r.directive.register_scope, 'international', 'y su alcance también');
      eq(r.directive.register_constraints, 'Sin voseo.', 'el registro prohibido viaja con la directiva');
    }
    // 2 · fila inactiva no cuenta: cae al alias legacy, y lo declara
    const inactive = PURE.resolveLanguageDirective(rows, 'en');
    eq(inactive.source, 'legacy_alias', 'active=false no es fila utilizable');
    // 3 · sin tabla: alias legacy exacto, y ahora SÍ encuentra 'es' (antes era undefined)
    eq(PURE.resolveLanguageDirective([], 'es').source, 'legacy_alias', 'sin tabla → alias');
    assert(PURE.resolveLanguageDirective([], 'es').directive.directive_block.includes('español neutro internacional'),
      "'es' en minúscula encuentra su directiva — antes salía el código crudo '**es**'");
    // 4 · cada respaldo va REDACTADO en la lengua que instruye, no traducido
    assert(PURE.resolveLanguageDirective(null, 'en').directive.directive_block.startsWith('## OUTPUT LANGUAGE'),
      'el respaldo de EN va en inglés, encabezado incluido');
    assert(!PURE.resolveLanguageDirective(null, 'en').directive.directive_block.includes('Escribe'),
      'ni una palabra de español en la directiva de EN');
    assert(PURE.resolveLanguageDirective(null, 'es').directive.directive_block.includes('SIN VOSEO'),
      'el respaldo de ES ya prohíbe el voseo, con su motivo operativo');
    // 5 · fail-loud: NO hay caída a subetiqueta base. Ninguna marca declara una
    //     variante regional [medido 2026-08-30], así que un regional se para y se dice.
    for (const unknown of ['en-FL', 'es-PA', 'en/FL', 'lt', 'ru', 'zz-ZZ', '']) {
      let threw = '';
      try { PURE.resolveLanguageDirective([], unknown); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
      assert(threw.includes('COPYLAB_LANGUAGE_DIRECTIVE_MISSING'),
        `'${unknown}' sin fila ni alias debe DETENER la generación; obtenido: ${threw || '(no lanzó)'}`);
    }
    // 6 · y con su fila sembrada, un idioma nuevo entra sin tocar código
    const lt = PURE.resolveLanguageDirective(
      [{ language_code: 'lt', label: 'neutrali tarptautinė lietuvių kalba', register_type: 'neutral', register_scope: 'international', directive_block: '## IŠVESTIES KALBA\nVisą turinį rašyk tik neutralia tarptautine lietuvių kalba.', register_constraints: null, active: true }],
      'LT');
    eq(lt.source, 'table', 'una marca lituana entra con un INSERT, sin tocar este archivo');
    assert(lt.directive.directive_block.startsWith('## IŠVESTIES KALBA'), 'y su bloque va en lituano');
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
        brands: [{ id: 'LucienSael', display_name: 'Lucien Sael', language_primary: 'en' }],
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
        brands: [{ id: 'NeuroneSCF', display_name: 'NeuroneSCF', market: 'Panamá', language_primary: 'es', brand_context: 'neuro', geo_principal: 'PA', tono_base: 'clínico', diferenciador_base: 'ciencia', disclaimer_base: 'no es consejo médico' }],
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
        brands: [{ id: 'LucienSael', display_name: 'Lucien Sael', market: 'Miami', language_primary: 'en' }], // sin cta_base
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

  // ── G2-F · el bucle de reparación acotado ──────────────────────────────────
  // El defecto que reparan: con el filtro de aplicabilidad del juez vivo (G2-E, 21-ago), lo que
  // queda es COLA LARGA — 10 reglas distintas, 1–3 disparos cada una, la mayoría de los REJECT con
  // UNA o DOS violaciones sobre ~19 reglas evaluadas. Tirar esa pieza y volver a escribirla desde
  // el brief es tirar las 17 reglas que sí cumplía. Estos tests fijan las tres mitades del
  // mecanismo: que sin `repair` NO cambie un byte, que con `repair` cambie la TAREA y sólo la
  // tarea (la pieza y los códigos en el user, el system intacto), y que el presupuesto de longitud
  // siga vigente en la segunda pasada.
  //
  // Cero marcas: las violaciones son DATO del payload. Los códigos de estos tests son los que
  // dispararon en la corrida, pero el motor no los conoce — lo prueba el test del código inventado.
  const RP_BCTX = { brandContext: { brands: [{ id: 'B', language_primary: 'en' }], brand_voice_genome: [GENOME_V1] } };
  const rpBI = (extra: any) => ({ domain: 'd', voice_id: 'v1', destination: 'social', platform: 'meta_fb', language: 'en', psycho_preset: null, rules: [], iid_brief: 'la materia prima de la primera pasada', angle: null, audience_frame: null, ...extra });
  const PIEZA = 'La primera frase de la pieza que ya está escrita. Y su cierre, entero.';
  const VIOLACIONES = [
    { code: 'HR-GEN-01', instruction: 'Cerrá la pieza: la última frase termina en signo de cierre.' },
    { code: 'HR-UNRLVL-03', instruction: 'La cifra va con su fuente nombrada en el texto.' },
  ];
  const REPARACION = { piece_text: PIEZA, violations: VIOLACIONES };

  await test('G2-F·pure normalizeRepair: ausencia → null; encargo roto CORTA con nombre propio', () => {
    eq(PURE.normalizeRepair(null), null, 'sin la clave → modo generación');
    eq(PURE.normalizeRepair(undefined), null, 'undefined idem');
    const ok = PURE.normalizeRepair(REPARACION);
    eq(ok.piece_text, PIEZA, 'la pieza viaja entera');
    eq(ok.violations.length, 2, 'las dos violaciones');
    // Una violación SIN instruction no se puede reparar: se descarta (el código nombra la regla,
    // la instrucción es lo único que dice QUÉ cambiar).
    const filtrada = PURE.normalizeRepair({ piece_text: PIEZA, violations: [VIOLACIONES[0], { code: 'HR-MUDA', instruction: '  ' }] });
    eq(filtrada.violations.length, 1, 'la muda se descarta');
    eq(filtrada.violations[0].code, 'HR-GEN-01', 'queda la que sí trae instrucción');
    // Un código ausente no tira la instrucción: se nombra ∅, como rules_skipped.
    eq(PURE.normalizeRepair({ piece_text: PIEZA, violations: [{ instruction: 'algo' }] }).violations[0].code, '∅', 'código ausente → ∅');
    // Y los tres cortes nominales: ninguno cae a generación en silencio.
    const lanza = (repair: any, nombre: string) => {
      let msg = '';
      try { PURE.normalizeRepair(repair); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
      assert(msg.startsWith(nombre), `${nombre} — obtenido "${msg || '(no lanzó)'}"`);
    };
    lanza('una pieza', 'COPYLAB_REPAIR_MALFORMED');
    lanza([REPARACION], 'COPYLAB_REPAIR_MALFORMED');
    lanza({ violations: VIOLACIONES }, 'COPYLAB_REPAIR_PIECE_REQUIRED');
    lanza({ piece_text: '   ', violations: VIOLACIONES }, 'COPYLAB_REPAIR_PIECE_REQUIRED');
    lanza({ piece_text: PIEZA }, 'COPYLAB_REPAIR_VIOLATIONS_REQUIRED');
    lanza({ piece_text: PIEZA, violations: [] }, 'COPYLAB_REPAIR_VIOLATIONS_REQUIRED');
    lanza({ piece_text: PIEZA, violations: [{ code: 'HR-MUDA' }] }, 'COPYLAB_REPAIR_VIOLATIONS_REQUIRED');
  });

  await test('G2-F·pure buildRepairInstruction: la orden es corregir lo MÍNIMO, con la pieza y los códigos', () => {
    const fmt = 'FORMATO (social):\n- Solo el cuerpo.';
    const u = String(PURE.buildRepairInstruction(fmt, PURE.normalizeRepair(REPARACION), 1000));
    assertOrdered(u, [fmt, 'REPARACIÓN DIRIGIDA', 'MÍNIMO', 'PIEZA A REPARAR', PIEZA, 'QUÉ INCUMPLE', '[HR-GEN-01]', VIOLACIONES[0].instruction, '[HR-UNRLVL-03]', VIOLACIONES[1].instruction]);
    assert(u.includes('No reescribas lo que ya cumple'), 'la orden que impide que la segunda pasada rompa las 17 que cumplía');
    assert(u.includes('Cerrala completa'), 'y la que impide que vuelva truncada');
    // El presupuesto de G1-D sigue vigente: reparar no puede ser crecer.
    assert(u.includes('~1000 caracteres'), 'el presupuesto viaja también en la instrucción de reparación');
    assert(!String(PURE.buildRepairInstruction(fmt, PURE.normalizeRepair(REPARACION), null)).includes('presupuesto'),
      'sin techo declarado no hay presupuesto que repetir');
    // El título sólo se menciona si la pieza original LO TRAE (editorial). En social no hay título,
    // y nombrarlo sería invitar a inventar uno.
    assert(!u.includes('título'), 'pieza social sin título → no se habla de título');
    const conTitulo = String(PURE.buildRepairInstruction(fmt, PURE.normalizeRepair({ piece_text: `TÍTULO: Un título\n\n${PIEZA}`, violations: VIOLACIONES }), null));
    assert(conTitulo.includes('devolvelo TAL CUAL'), 'pieza con título → se conserva salvo que la violación sea sobre él');
    // Motor, no caso: el bloque no nombra marcas, plataformas ni reglas propias.
    const codigosDelPayload = String(PURE.buildRepairInstruction(fmt, PURE.normalizeRepair({ piece_text: PIEZA, violations: [{ code: 'XX-INVENTADO-99', instruction: 'hacé tal cosa' }] }), null));
    assert(codigosDelPayload.includes('[XX-INVENTADO-99]'), 'el código sale del payload, no de una lista escrita en el motor');
    for (const nombre of ['meta_fb', 'linkedin', 'ForumPHs', 'NeuroneSCF', 'LucienSael', 'HR-GEN-01']) {
      assert(!codigosDelPayload.includes(nombre), `el bloque no nombra ${nombre}`);
    }
  });

  // CABLEADO. Lo que este PR promete es que el system NO cambia: si la reparación tocara la voz o
  // las reglas, la segunda pasada dejaría de ser una corrección y sería otra pieza.
  await test('G2-F·cableado: con repair cambia la TAREA y sólo la tarea; sin repair, byte-idéntico', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const gen = await buildPrompt(reqWith(RP_BCTX, { builder_input: rpBI({}) }));
      const rep = await buildPrompt(reqWith(RP_BCTX, { builder_input: rpBI({ repair: REPARACION }) }));
      eq(rep.system, gen.system, 'el system de la reparación es el de generación, byte a byte (voz, genoma, reglas, presupuesto)');
      assert(rep.user !== gen.user, 'lo que cambia es la instrucción de usuario');
      assertOrdered(rep.user, ['FORMATO (social)', 'REPARACIÓN DIRIGIDA', PIEZA, 'HR-GEN-01', 'HR-UNRLVL-03']);
      assert(!rep.user.includes('MATERIA PRIMA'), 'el brief NO vuelve: el material de esta pasada es la pieza escrita');
      assert(gen.user.includes('MATERIA PRIMA'), 'y en generación sigue exactamente como hoy');
      eq(gen.repair, null, 'sin la clave, nada que ecoar');
      eq(JSON.stringify(rep.repair?.codes), JSON.stringify(['HR-GEN-01', 'HR-UNRLVL-03']), 'los códigos, para el eco del meta');

      // El modo UI ni se entera, y un encargo roto corta ANTES de gastar la llamada a Claude.
      const ui = await buildPrompt(reqWith(RP_BCTX));
      eq(ui.repair, null, 'el modo UI no ve el modo reparación');
      await assertThrows(
        () => buildPrompt(reqWith(RP_BCTX, { builder_input: rpBI({ repair: { piece_text: '', violations: VIOLACIONES } }) })),
        'COPYLAB_REPAIR_PIECE_REQUIRED',
      );
      assert(!fx.calls.some(u => u.includes('api.anthropic.com')), 'buildPrompt no llama a Claude (el corte es previo)');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  await test('G2-F·cableado: el presupuesto de longitud gobierna también la segunda pasada', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const fx = installFetch({});
    try {
      const rep = await buildPrompt(reqWith(RP_BCTX, { builder_input: rpBI({ max_tokens: 320, max_tokens_source: 'base_platform', repair: REPARACION }) }));
      assert(rep.system.includes('## PRESUPUESTO DE LONGITUD') && rep.system.includes('1000 caracteres'), 'el bloque de G1-D sigue en el system');
      assert(rep.user.includes('~1000 caracteres'), 'y la tarea de reparación lo repite: corregir no es crecer');
      eq(rep.length_budget_chars, 1000, 'el eco del presupuesto, igual que en generación');
      eq(rep.max_tokens, 384, 'y el techo con margen, igual que en generación');
    } finally { fx.restore(); Math.random = realRandom; }
  });

  await test('G2-F·respuesta: mismo contrato + meta.repair; el título se conserva del original', async () => {
    const realRandom = Math.random; Math.random = () => 0;
    const PIEZA_ED = 'TÍTULO: El título original\n\nEl cuerpo de la pieza, ya escrito.';
    const edBI = (extra: any) => rpBI({ destination: 'editorial', platform: 'blog', ...extra });
    try {
      // La pieza corregida vuelve SIN título (el caso normal: la violación estaba en el cuerpo).
      let fx = installFetch({ claude: { content: [{ text: 'El cuerpo corregido, cerrado.' }], usage: { input_tokens: 1, output_tokens: 2 } } });
      let r = makeRes();
      await handler({ method: 'POST', body: reqWith(RP_BCTX, { builder_input: edBI({ repair: { piece_text: PIEZA_ED, violations: VIOLACIONES } }) }) } as any, r as any);
      eq(r._out._status, 200, 'HTTP 200');
      eq(r._out._json.title, 'El título original', 'el título se conserva del original');
      eq(r._out._json.body, 'El cuerpo corregido, cerrado.', 'y el cuerpo es el corregido');
      eq(r._out._json.meta.repair, true, 'meta.repair — la marca de la segunda pasada');
      eq(JSON.stringify(r._out._json.meta.repair_codes), JSON.stringify(['HR-GEN-01', 'HR-UNRLVL-03']), 'meta.repair_codes');
      assert(typeof r._out._json.usage === 'object' && r._out._json.usage !== null, 'el contrato de respuesta no cambia: usage sigue viajando');
      assert('signature' in r._out._json && 'meta' in r._out._json, 'ni signature ni meta');
      fx.restore();

      // Si la pieza corregida trae título, ÉSE gana: es una violación que lo afectaba.
      fx = installFetch({ claude: { content: [{ text: 'TÍTULO: El título corregido\n\nCuerpo.' }], usage: {} } });
      r = makeRes();
      await handler({ method: 'POST', body: reqWith(RP_BCTX, { builder_input: edBI({ repair: { piece_text: PIEZA_ED, violations: VIOLACIONES } }) }) } as any, r as any);
      eq(r._out._json.title, 'El título corregido', 'la violación sobre el título gana');
      fx.restore();

      // Sin repair, el meta queda como hoy: la clave no existe (aditividad, no bandera muda).
      fx = installFetch({ claude: { content: [{ text: 'TÍTULO: T\n\nCuerpo.' }], usage: {} } });
      r = makeRes();
      await handler({ method: 'POST', body: reqWith(RP_BCTX, { builder_input: edBI({}) }) } as any, r as any);
      eq('repair' in r._out._json.meta, false, 'sin la clave, el meta no gana una bandera');
      eq('repair_codes' in r._out._json.meta, false, 'ni los códigos');
      fx.restore();

      // Y un encargo roto es 500 con nombre propio, no una pieza nueva devuelta como reparación.
      fx = installFetch({ claude: { content: [{ text: 'Cuerpo.' }], usage: {} } });
      r = makeRes();
      await handler({ method: 'POST', body: reqWith(RP_BCTX, { builder_input: edBI({ repair: { piece_text: PIEZA_ED, violations: [] } }) }) } as any, r as any);
      eq(r._out._status, 500, 'encargo sin violaciones → 500');
      assert(String(r._out._json.error).startsWith('COPYLAB_REPAIR_VIOLATIONS_REQUIRED'), 'con el error nominal');
      assert(!fx.calls.some(u => u.includes('api.anthropic.com')), 'y sin gastar la llamada a Claude');
      fx.restore();
    } finally { Math.random = realRandom; }
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
