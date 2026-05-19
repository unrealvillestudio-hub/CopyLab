export const maxDuration = 300;

/**
 * CopyLab – POST /api/execute  v9.1
 *
 * v9.1 fix (2026-05-19):
 * - brandContext mapping corregido para coincidir con la estructura real de brand-cache:
 *   bc.humanize_profiles[0] (no bc.humanize[0])
 *   bc.brand_personas (no bc.personas)
 *   bc.brand_copy_profiles[0] (no bc.copy_profile)
 *   bc.compliance_rules (no bc.compliance)
 *   bc.brand_goals (no bc.goals)
 * - Esto elimina las 24 queries a Supabase cuando el cache está disponible → ~50% menos tiempo
 *
 * v9.0 changelog (2026-05-18):
 * - Layer 14: CREATIVE_VECTOR — 44 vectores de entrada, rotación aleatoria por pool compatible
 * - Layer 15: TENSION_ARCHITECTURE — 10 arquitecturas de tensión, selección por compatibilidad
 * - Layer 16: AGGRO_DIAL — 5 niveles de convicción, desde WHISPER hasta FULL_AGGRO
 * - email_sequence handling: sequence awareness, SEQUENCE RULE, previous_mechanism check
 *
 * Env vars: ANTHROPIC_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 */

declare const process: { env: Record<string, string | undefined> };

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const SB_URL  = () => process.env.VITE_SUPABASE_URL ?? '';
const SB_KEY  = () => process.env.VITE_SUPABASE_ANON_KEY ?? '';
const ANT_KEY = () => process.env.ANTHROPIC_API_KEY ?? '';

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

async function buildPrompt(req: ExecuteRequest): Promise<{ system: string; user: string; temperature: number; }> {
  const brandId = req.brandId ?? 'DEFAULT';
  const pack    = req.params.pack ?? 'social_post_pack';
  const canal   = req.params.canal ?? 'instagram';
  const meta    = req.meta ?? {};

  const isEmailSeq = pack.startsWith('email_sequence');
  const sequenceSubType = meta.sequence_type ?? 'generic';
  const position = meta.position ?? 1;
  const creativeContentType = isEmailSeq
    ? `${sequenceSubType}_${position}`
    : pack.replace('_pack', '');

  const aggroByType: Record<string, number> = {
    abandoned_cart_1: 2, abandoned_cart_2: 4,
    welcome: 1, post_purchase: 1, review_request: 2, win_back: 3,
    ad_copy: 3, social_post: 2, landing_page: 3,
  };
  const aggroLevel = aggroByType[creativeContentType] ?? 2;

  // ── Brand context: cache first, then Supabase ──
  const bc = (req.previousOutputs as any)?.brandContext;

  const [brandData, humanize, goals, personas, compliance, keywords, ctas, copyProfile, seqContext] =
    await Promise.all([
      bc ? Promise.resolve(null) : sb<any>(`brands?id=eq.${brandId}&select=id,name,market,language_primary`),
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
    // ── v9.1 FIX: correct field names from brand-cache API ──
    // brand-cache returns: brand_personas, brand_copy_profiles, humanize_profiles,
    //                      compliance_rules, brand_goals, geomix, psycho_presets
    brand        = { id: brandId, name: brandId, market: '', language_primary: 'ES' };
    hum          = bc.humanize_profiles?.[0]    ?? null;
    goalsList    = bc.brand_goals               ?? [];
    personasList = bc.brand_personas            ?? [];
    comp         = bc.compliance_rules?.length
                     ? { rule_text: bc.compliance_rules.map((c: any) => c.rule_text).join('\n') }
                     : null;
    kwList       = [];
    ctaList      = [];
    cp           = bc.brand_copy_profiles?.[0]  ?? null;
  } else {
    brand = brandData; hum = humanize; goalsList = goals; personasList = personas;
    comp = compliance; kwList = keywords; ctaList = ctas; cp = copyProfile;
  }

  const idioma    = meta.language ?? req.params.idioma ?? brand?.language_primary ?? 'ES';
  const market    = brand?.market ?? '';
  const brandName = brand?.name ?? brandId;

  // ── Creative Engine ──
  const previousVectorId = (req.previousOutputs as any)?.last_creative_vector;
  const { vector, tension, aggro } = await selectCreativeCombo(creativeContentType, aggroLevel, previousVectorId);

  // ── SMPC Layers ──
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
    layers.push(`VOZ DE MARCA (Humanize F2.5):\nTono: ${hum.tone ?? ''}\nPersonalidad: ${hum.personality ?? ''}\nReglas de autenticidad: ${hum.authenticity_rules ?? ''}\nAnti-patterns: ${Array.isArray(hum.anti_patterns) ? (hum.anti_patterns as string[]).join(', ') : hum.anti_patterns ?? ''}`);
  }

  if (kwList.length) layers.push(`KEYWORDS: ${kwList.map((k: any) => k.keyword).join(', ')}`);

  if (ctaList.length) {
    const ctaText = ctaList.map((c: any) => `"${c.cta_smpc ?? c.cta_text ?? c.cta_ads ?? ''}"`).filter(Boolean).join(' | ');
    if (ctaText) layers.push(`CTAs APROBADOS: ${ctaText}`);
  }

  if (comp?.rule_text) layers.push(`COMPLIANCE — REGLAS OBLIGATORIAS:\n${comp.rule_text}`);

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

  if (vector) layers.push(`## VECTOR CREATIVO [${vector.id} · ${vector.label}]\nAplica este vector de apertura. No lo nombres — ejecútalo.\n${vector.instruction}`);
  if (tension) layers.push(`## ARQUITECTURA DE TENSIÓN [${tension.id} · ${tension.label}]\nCurva: ${tension.curve}\n${tension.instruction}`);
  if (aggro)  layers.push(`## NIVEL DE CONVICCIÓN [${aggro.id} · ${aggro.label}]\n${aggro.instruction}\n\nANTI-HEDGING:\n${aggro.anti_hedging}\n\nEl objetivo es la conversión. El copy sirve a ese objetivo sin disculparse por ello.`);

  const system = `Eres CopyLab v9.1, el motor de copy de UNRLVL Studio.\n\n${layers.join('\n\n---\n\n')}`;

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
    };
    userInstruction = `PACK: ${pack}\n\n${packInstructions[pack] ?? 'Genera el copy apropiado para este pack.'}\n\nGenera ahora. Sin preámbulos.`;
  }

  const temperatureMap: Record<string, number> = {
    social_post_pack: 0.9, ad_copy_pack: 0.7, email_pack: 0.6,
    blog_pack: 0.7, seo_meta_pack: 0.5, video_podcast_script: 0.8, landing_page_pack: 0.7,
    email_sequence_abandoned_cart: 0.75, email_sequence_welcome: 0.8,
    email_sequence_post_purchase: 0.7, email_sequence_review_request: 0.7,
  };

  return { system, user: userInstruction, temperature: temperatureMap[pack] ?? 0.7 };
}

// ── CLAUDE CALL ────────────────────────────────────────────────────────────

async function callClaude(system: string, user: string, temperature: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANT_KEY(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1200, temperature, system, messages: [{ role: 'user', content: user }] }),
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
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });

  let body: ExecuteRequest;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS }); }

  if (!body.brandId) return new Response(JSON.stringify({ error: 'brandId is required' }), { status: 400, headers: CORS });

  try {
    const pack = body.params?.pack ?? 'social_post_pack';
    console.log(`[CopyLab v9.1] brand=${body.brandId} pack=${pack} position=${body.meta?.position ?? 1} cache=${!!(body.previousOutputs as any)?.brandContext}`);

    const { system, user, temperature } = await buildPrompt(body);
    const output = await callClaude(system, user, temperature);

    return new Response(JSON.stringify({ output, status: 'ok' }), { status: 200, headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CopyLab /api/execute v9.1]', msg);
    return new Response(JSON.stringify({ error: msg, status: 'error' }), { status: 500, headers: CORS });
  }
}
