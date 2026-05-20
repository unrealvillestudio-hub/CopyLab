export const maxDuration = 300;

/**
 * CopyLab – POST /api/execute  v9.4
 *
 * v9.4 (2026-05-20) — Dual mode async/sync:
 * - async: true  → INSERT copylab_jobs + fire-and-forget /api/process-job → { job_id, status: 'queued' }
 * - async: false → flujo sync v9.3 intacto (browser path, sin cambios)
 *
 * v9.3 (2026-05-20) — UNRLVL Content Pipeline v2.6 sync:
 * - L1.5 VOICE_GENOME_INJECTION
 * - layers_applied, creative_seed en respuesta
 * - product_description_b2c, output_templates
 *
 * Env vars: ANTHROPIC_API_KEY · SUPABASE_URL · SUPABASE_ANON_KEY
 */

declare const process: { env: Record<string, string | undefined> };

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const SB_URL  = () => process.env.SUPABASE_URL ?? '';
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

function fireProcessor(jobId: string): void {
  // Job 2 — fire-and-forget. Sin await, sin timeout.
  fetch('https://unrlvl-copy-lab.vercel.app/api/process-job', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ job_id: jobId }),
  }).catch(() => {});
}

// ── INTERFACES ────────────────────────────────────────────────────────────

interface ExecuteRequest {
  brandId: string | null;
  stage: { labId: string; label: string; description: string; order: number };
  params: { pack?: string; canal?: string; idioma?: string; extra_instructions?: string; };
  previousOutputs: Record<string, string>;
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

// ── SUPABASE FETCH ─────────────────────────────────────────────────────────

async function sb<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
      headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data[0] ?? null) : data;
  } catch { return null; }
}

async function sbArray<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
      headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// ── PIPELINE LAYER RESOLVER ────────────────────────────────────────────────

async function resolveAppliedLayers(contentType: string): Promise<string[]> {
  const layers = await sbArray<{ layer_code: string; layer_order: number }>(
    `pipeline_skills?applies_to=cs.%7B${encodeURIComponent(contentType)}%7D&active=eq.true&select=layer_code,layer_order&order=layer_order`
  );
  return layers.map(l => l.layer_code);
}

// ── CREATIVE ENGINE ────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function selectCreativeCombo(
  contentType: string,
  aggroLevel: number,
  previousVectorId?: string,
): Promise<{ vector: CreativeVector | null; tension: TensionArchitecture | null; aggro: AggroPreset | null; }> {
  const [allVectors, allTensions, allAggros, rules] = await Promise.all([
    sbArray<CreativeVector>('creative_vectors?active=eq.true&select=id,category,label,instruction,aggro_min,aggro_max'),
    sbArray<TensionArchitecture>('tension_architectures?active=eq.true&select=id,label,instruction,curve'),
    sbArray<AggroPreset>('aggro_presets?active=eq.true&select=id,level,label,instruction,anti_hedging&order=level'),
    sbArray<CompatibilityRule>(`creative_compatibility_rules?content_type=eq.${encodeURIComponent(contentType)}&active=eq.true&select=*`),
  ]);

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

async function buildVoiceGenomeLayer(brandId: string, idioma: string): Promise<{
  layer: string | null;
  voice_id: string | null;
  voice_version: string | null;
}> {
  const genome = await sb<VoiceGenome>(
    `brand_voice_genome?brand_id=eq.${encodeURIComponent(brandId)}&active=eq.true&order=version.desc&limit=1`
  );

  if (!genome) return { layer: null, voice_id: null, voice_version: null };

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

  if (genome.emotional_register) {
    parts.push(`REGISTRO EMOCIONAL: ${genome.emotional_register}`);
  }

  if (genome.prohibited_registers?.length) {
    parts.push(`REGISTROS PROHIBIDOS: ${genome.prohibited_registers.join(', ')}`);
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

async function buildPrompt(req: ExecuteRequest): Promise<{
  system: string;
  user: string;
  temperature: number;
  layers_applied: string[];
  voice_id: string | null;
  voice_version: string | null;
  creative_seed: { vector_id: string | null; tension_id: string | null; aggro_id: string | null; };
}> {
  const brandId = req.brandId ?? 'DEFAULT';
  const pack    = req.params.pack ?? 'social_post_pack';
  const canal   = req.params.canal ?? 'instagram';
  const meta    = req.meta ?? {};

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

  let bc = (req.previousOutputs as any)?.brandContext;

  if (!bc) {
    try {
      const cacheRes = await fetch(
        `https://unrlvl-context.vercel.app/api/brand-cache?brand_id=${encodeURIComponent(brandId)}`
      );
      if (cacheRes.ok) {
        bc = await cacheRes.json();
        console.log(`[CopyLab v9.4] brand-cache hit for ${brandId} — skipping 24 queries`);
      }
    } catch {
      console.log(`[CopyLab v9.4] brand-cache miss for ${brandId} — falling back to direct queries`);
    }
  }

  const [brandData, humanize, goals, personas, compliance, keywords, ctas, copyProfile, seqContext] =
    await Promise.all([
      bc ? Promise.resolve(null) : sb<any>(`brands?id=eq.${brandId}&select=id,display_name,market,language_primary`),
      bc ? Promise.resolve(null) : sb<any>(`humanize_profiles?brand_id=eq.${brandId}&select=*`),
      bc ? Promise.resolve([])   : sbArray<any>(`brand_goals?brand_id=eq.${brandId}&select=goal_text,priority&order=priority`),
      bc ? Promise.resolve([])   : sbArray<any>(`brand_personas?brand_id=eq.${brandId}&active=eq.true&select=*&order=priority`),
      bc ? Promise.resolve(null) : sb<any>(`compliance_rules?brand_id=eq.${brandId}&active=eq.true&select=rule_text`),
      bc ? Promise.resolve([])   : sbArray<any>(`keywords?brand_id=eq.${brandId}&select=keyword,type&limit=20`),
      bc ? Promise.resolve([])   : sbArray<any>(`ctas?brand_id=eq.${brandId}&select=*&active=eq.true&limit=5`),
      bc ? Promise.resolve(null) : sb<any>(`brand_copy_profiles?brand_id=eq.${brandId}&active=eq.true&select=*`),
      isEmailSeq ? buildSequenceContext(req) : Promise.resolve({ previousMechanism: 'none', previousPiece: '', spPool: '' }),
    ]);

  let brand: any, hum: any, goalsList: any[], personasList: any[], comp: any, kwList: any[], ctaList: any[], cp: any;

  if (bc) {
    brand        = { id: brandId, display_name: brandId, market: '', language_primary: 'ES' };
    hum          = bc.humanize_profiles?.[0]   ?? null;
    goalsList    = bc.brand_goals              ?? [];
    personasList = bc.brand_personas           ?? [];
    comp         = bc.compliance_rules?.length
                     ? { rule_text: bc.compliance_rules.map((c: any) => c.rule_text).join('\n') }
                     : null;
    kwList       = [];
    ctaList      = [];
    cp           = bc.brand_copy_profiles?.[0] ?? null;
  } else {
    brand = brandData; hum = humanize; goalsList = goals; personasList = personas;
    comp = compliance; kwList = keywords; ctaList = ctas; cp = copyProfile;
  }

  const idioma    = meta.language ?? req.params.idioma ?? brand?.language_primary ?? 'ES';
  const market    = brand?.market ?? '';
  const brandName = brand?.display_name ?? brand?.name ?? brandId;

  const previousVectorId = (req.previousOutputs as any)?.last_creative_vector;

  const [creativeCombo, voiceGenomeResult, appliedLayers, outputTemplate] = await Promise.all([
    selectCreativeCombo(creativeContentType, aggroLevel, previousVectorId),
    buildVoiceGenomeLayer(brandId, idioma),
    resolveAppliedLayers(pipelineContentType),
    sb<OutputTemplate>(
      `output_templates?category=eq.${encodeURIComponent(pipelineContentType)}&active=eq.true&select=id,name,category,template_text&limit=1`
    ),
  ]);

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

  if (voiceLayer) {
    layers.push(voiceLayer);
  }

  if (kwList.length) layers.push(`KEYWORDS: ${kwList.map((k: any) => k.keyword).join(', ')}`);

  if (ctaList.length) {
    const ctaText = ctaList.map((c: any) => `"${c.cta_smpc ?? c.cta_text ?? c.cta_ads ?? ''}"`).filter(Boolean).join(' | ');
    if (ctaText) layers.push(`CTAs APROBADOS: ${ctaText}`);
  }

  if (comp?.rule_text) layers.push(`COMPLIANCE — REGLAS OBLIGATORIAS:\n${comp.rule_text}`);

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

  if (vector) layers.push(`## L14 CREATIVE VECTOR [${vector.id} · ${vector.label}]\nAplica este vector de apertura. No lo nombres — ejecútalo.\n${vector.instruction}`);
  if (tension) layers.push(`## L15 TENSION ARCHITECTURE [${tension.id} · ${tension.label}]\nCurva: ${tension.curve}\n${tension.instruction}`);
  if (aggro)   layers.push(`## L16 AGGRO DIAL [${aggro.id} · ${aggro.label}]\n${aggro.instruction}\n\nANTI-HEDGING:\n${aggro.anti_hedging}\n\nEl objetivo es la conversión. El copy sirve a ese objetivo sin disculparse por ello.`);

  const system = `Eres CopyLab v9.4, el motor de copy de UNRLVL Studio. Content Pipeline v2.6.\n\n${layers.join('\n\n---\n\n')}`;

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

  const temperatureMap: Record<string, number> = {
    social_post_pack: 0.9, ad_copy_pack: 0.7, email_pack: 0.6,
    blog_pack: 0.7, seo_meta_pack: 0.5, video_podcast_script: 0.8, landing_page_pack: 0.7,
    product_description_pack: 0.7,
    email_sequence_abandoned_cart: 0.75, email_sequence_welcome: 0.8,
    email_sequence_post_purchase: 0.7, email_sequence_review_request: 0.7,
  };

  return {
    system,
    user: userInstruction,
    temperature: temperatureMap[pack] ?? 0.7,
    layers_applied: appliedLayers,
    voice_id,
    voice_version,
    creative_seed: {
      vector_id: vector?.id ?? null,
      tension_id: tension?.id ?? null,
      aggro_id: aggro?.id ?? null,
    },
  };
}

// ── CLAUDE CALL ────────────────────────────────────────────────────────────

async function callClaude(system: string, user: string, temperature: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANT_KEY(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

// ── HANDLER ────────────────────────────────────────────────────────────────

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-vercel-protection-bypass',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });

  let body: ExecuteRequest & { async?: boolean };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS }); }

  if (!body.brandId)
    return new Response(JSON.stringify({ error: 'brandId is required' }), { status: 400, headers: CORS });

  // ── ASYNC MODE v9.4 ───────────────────────────────────────────────────
  if (body.async === true) {
    try {
      const { async: _, ...cleanInput } = body;
      const jobId = await createJob(cleanInput);
      fireProcessor(jobId);
      console.log(`[CopyLab v9.4] async job created: ${jobId}`);
      return new Response(
        JSON.stringify({ job_id: jobId, status: 'queued' }),
        { status: 202, headers: CORS }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[CopyLab v9.4] createJob error:', msg);
      return new Response(JSON.stringify({ error: msg, status: 'error' }), { status: 500, headers: CORS });
    }
  }

  // ── SYNC MODE (v9.3 intacto) ──────────────────────────────────────────
  try {
    const pack     = body.params?.pack ?? 'social_post_pack';
    const position = body.meta?.position ?? 1;
    const cache    = !!(body.previousOutputs as any)?.brandContext;
    console.log(`[CopyLab v9.4] sync brand=${body.brandId} pack=${pack} pos=${position} cache=${cache}`);

    const { system, user, temperature, layers_applied, voice_id, voice_version, creative_seed } =
      await buildPrompt(body);

    const output = await callClaude(system, user, temperature);

    return new Response(
      JSON.stringify({
        output,
        status: 'ok',
        meta: {
          pipeline_version: '2.6',
          layers_applied,
          voice_genome: voice_id ? { voice_id, version: voice_version } : null,
          creative_seed,
        },
      }),
      { status: 200, headers: CORS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CopyLab /api/execute v9.4]', msg);
    return new Response(JSON.stringify({ error: msg, status: 'error' }), { status: 500, headers: CORS });
  }
}