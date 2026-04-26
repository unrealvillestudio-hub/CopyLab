// Vercel function timeout — required for Claude API calls (~10-15s)
// Without this, Vercel kills the function at the default (10s Hobby / 15s Pro default)
export const maxDuration = 60;

/**
 * CopyLab – POST /api/execute  v8.1
 * Context Cache integration: if previousOutputs.brandContext exists,
 * skip all Supabase queries and use pre-compiled data instead.
 * Reduces buildPrompt from ~90s (8 network requests) to <100ms.
 * Falls back to Supabase queries if brandContext is absent.
 *
 * Env vars: ANTHROPIC_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 */

declare const process: { env: Record<string, string | undefined> };

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const SB_URL  = () => process.env.VITE_SUPABASE_URL ?? '';
const SB_KEY  = () => process.env.VITE_SUPABASE_ANON_KEY ?? '';
const ANT_KEY = () => process.env.ANTHROPIC_API_KEY ?? '';

// ── TYPES ──────────────────────────────────────────────────────────────────

interface ExecuteRequest {
  brandId: string | null;
  stage: { labId: string; label: string; description: string; order: number };
  params: {
    pack?: string;
    canal?: string;
    idioma?: string;
    extra_instructions?: string;
  };
  previousOutputs: Record<string, string>;
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

// ── BUILD COPY PROMPT ──────────────────────────────────────────────────────

async function buildPrompt(req: ExecuteRequest): Promise<{ system: string; user: string; temperature: number }> {
  const brandId = req.brandId ?? 'DEFAULT';
  const pack    = req.params.pack ?? 'social_post_pack';
  const canal   = req.params.canal ?? 'instagram';

  // ── Context Cache path: use pre-compiled brandContext (~0ms) ──
  const bc = (req.previousOutputs as any)?.brandContext;

  let brand: any, humanize: any, goals: any[], personas: any[],
      compliance: any, keywords: any[], ctas: any[], copyProfile: any;

  if (bc) {
    // Extract from pre-compiled context — no Supabase queries needed
    const identity = bc.identity ?? {};
    brand       = {
      id: brandId,
      name: identity.display_name ?? brandId,
      market: identity.geo_principal ?? '',
      language_primary: identity.language_primary ?? 'es-ES',
    };
    humanize    = bc.humanize?.[0] ? {
      tone:             bc.humanize[0].tone,
      personality:      bc.humanize[0].personality,
      avoid_phrases:    Array.isArray(bc.humanize[0].anti_patterns)
                          ? bc.humanize[0].anti_patterns.join(', ')
                          : bc.humanize[0].anti_patterns ?? '',
      copy_philosophy:  bc.humanize[0].authenticity_rules ?? 'Copy que suena humano, no corporativo.',
    } : null;
    goals       = (bc.goals ?? []).map((g: any) => ({ goal_text: g.goal, priority: g.priority }));
    personas    = (bc.personas ?? []).map((p: any) => ({
      persona_name: p.label ?? p.key,
      description:  p.segment_type ?? '',
      pain_points:  Array.isArray(p.pain_points) ? p.pain_points.join(', ') : p.pain_points ?? '',
      desires:      Array.isArray(p.motivations)  ? p.motivations.join(', ')  : p.motivations ?? '',
    }));
    compliance  = bc.compliance?.length
      ? { rules_text: bc.compliance.map((c: any) => c.rule_text).filter(Boolean).join('\n') }
      : null;
    keywords    = []; // not in cache; IID content relies on extra_instructions instead
    ctas        = (bc.ctas ?? [])
      .map((c: any) => ({ cta_text: c.smpc || c.ads || c.story || c.ultrashort, canal }))
      .filter((c: any) => c.cta_text);
    copyProfile = bc.copy_profile ? {
      voice_tone:          bc.copy_profile.voice_tone_primary,
      writing_style:       bc.copy_profile.voice_writing_style,
      hooks:               Array.isArray(bc.copy_profile.style_hooks)
                             ? bc.copy_profile.style_hooks.join(', ')
                             : bc.copy_profile.style_hooks ?? '',
      signature_phrases:   Array.isArray(bc.copy_profile.style_signature_phrases)
                             ? bc.copy_profile.style_signature_phrases.join(', ')
                             : bc.copy_profile.style_signature_phrases ?? '',
      avoid_phrases:       Array.isArray(bc.copy_profile.style_avoid_phrases)
                             ? bc.copy_profile.style_avoid_phrases.join(', ')
                             : bc.copy_profile.style_avoid_phrases ?? '',
      prohibited_words:    Array.isArray(bc.copy_profile.compliance_prohibited)
                             ? bc.copy_profile.compliance_prohibited.join(', ')
                             : bc.copy_profile.compliance_prohibited ?? '',
    } : null;
  } else {
    // Fallback: original Supabase query path
    [brand, humanize, goals, personas, compliance, keywords, ctas, copyProfile] = await Promise.all([
      sb<any>(`brands?id=eq.${brandId}&select=id,name,market,status,language_primary`),
      sb<any>(`humanize_profiles?brand_id=eq.${brandId}&select=*`),
      sbArray<any>(`brand_goals?brand_id=eq.${brandId}&select=goal_text,priority&order=priority`),
      sbArray<any>(`brand_personas?brand_id=eq.${brandId}&select=persona_name,description,pain_points,desires`),
      sb<any>(`compliance_rules?brand_id=eq.${brandId}&select=rules_text`),
      sbArray<any>(`keywords?brand_id=eq.${brandId}&select=keyword,type&limit=20`),
      sbArray<any>(`ctas?brand_id=eq.${brandId}&select=cta_text,canal&canal=eq.${canal}&limit=5`),
      sb<any>(`brand_copy_profiles?brand_id=eq.${brandId}&select=*`),
    ]);
  }

  const idioma    = req.params.idioma ?? brand?.language_primary ?? 'es-ES';
  const market    = brand?.market ?? '';
  const brandName = brand?.name ?? brandId;

  // ── SMPC LAYERS ────────────────────────────────────────────────────────
  const layers: string[] = [];

  // Layer 1 – Brand
  layers.push(`MARCA: ${brandName} | MERCADO: ${market} | IDIOMA: ${idioma}`);

  // Layer 2 – Goals
  if (goals.length) {
    layers.push(`OBJETIVOS DE CAMPAÑA:\n${goals.map(g => `- ${g.goal_text}`).join('\n')}`);
  }

  // Layer 3 – Personas
  if (personas.length) {
    layers.push(`AUDIENCIA OBJETIVO:\n${personas.map(p =>
      `• ${p.persona_name}: ${p.description}. Pain: ${p.pain_points}. Desea: ${p.desires}`
    ).join('\n')}`);
  }

  // Layer 4 – Idioma
  layers.push(`IDIOMA OBLIGATORIO: ${idioma}. Todo el copy en este idioma. Sin mezcla salvo que sea Spanglish Miami explícito.`);

  // Layer 5 – Canal
  layers.push(`CANAL: ${canal.toUpperCase()}. Adapta longitud, tono y formato al canal.`);

  // Layer 6 – Humanize
  if (humanize) {
    const h = humanize;
    layers.push(`VOZ DE MARCA (Humanize F2.5):\nTono: ${h.tone ?? ''}\nPersonalidad: ${h.personality ?? ''}\nEvitar: ${h.avoid_phrases ?? ''}\nFilosofía: ${h.copy_philosophy ?? 'Copy que suena humano, no corporativo.'}`);
  }

  // Layer 7 – Keywords
  if (keywords.length) {
    layers.push(`KEYWORDS A USAR: ${keywords.map(k => k.keyword).join(', ')}`);
  }

  // Layer 8 – CTAs
  if (ctas.length) {
    layers.push(`CTAs APROBADOS PARA ${canal.toUpperCase()}: ${ctas.map(c => `"${c.cta_text}"`).join(' | ')}`);
  }

  // Layer 9 – Compliance
  if (compliance?.rules_text) {
    layers.push(`COMPLIANCE – REGLAS OBLIGATORIAS:\n${compliance.rules_text}`);
  }

  // Layer 10 – BP_COPY_1.0 (brand_copy_profiles)
  if (copyProfile) {
    const cp = copyProfile;
    const parts = [];
    if (cp.voice_tone)          parts.push(`Tono de voz: ${cp.voice_tone}`);
    if (cp.writing_style)       parts.push(`Estilo: ${cp.writing_style}`);
    if (cp.hooks)               parts.push(`Hooks probados: ${cp.hooks}`);
    if (cp.signature_phrases)   parts.push(`Frases firma: ${cp.signature_phrases}`);
    if (cp.avoid_phrases)       parts.push(`Nunca usar: ${cp.avoid_phrases}`);
    if (cp.prohibited_words)    parts.push(`Palabras prohibidas: ${cp.prohibited_words}`);
    if (parts.length) layers.push(`PERFIL DE COPY BP_COPY_1.0:\n${parts.join('\n')}`);
  }

  // Layer 11 – Extra instructions
  const extra = req.params.extra_instructions ?? req.stage.description;
  if (extra) layers.push(`INSTRUCCIONES ESPECÍFICAS: ${extra}`);

  // Layer 12 – Previous outputs context (exclude brandContext to avoid bloat)
  const prevEntries = Object.entries(req.previousOutputs).filter(([lab]) => lab !== 'brandContext');
  if (prevEntries.length) {
    const ctx = prevEntries
      .map(([lab, out]) => `[${lab.toUpperCase()} output]: ${out.slice(0, 300)}`)
      .join('\n');
    layers.push(`CONTEXTO DE OUTPUTS ANTERIORES:\n${ctx}`);
  }

  const packInstructions: Record<string, string> = {
    social_post_pack:       'Genera un post completo: Hook potente (1 línea) + Cuerpo (3-5 líneas) + CTA. Incluye hashtags relevantes al final.',
    ad_copy_pack:           'Genera copy de ad: Headline (max 40 chars) + Descripción (max 125 chars) + CTA claro. Versión A y versión B.',
    email_pack:             'Genera email completo: Asunto (max 50 chars) + Preview text + Cuerpo (4-6 párrafos) + CTA + Firma.',
    blog_pack:              'Genera artículo de blog: Título SEO + Intro (150 palabras) + 3 secciones con H2 + Conclusión + Meta description.',
    seo_meta:               'Genera: Title tag (max 60 chars) + Meta description (max 155 chars) + H1 + 3 variantes de título alternativo.',
    video_podcast_script:   'Genera guión para video/podcast: Intro hook (15 seg) + Desarrollo por bloques HOST/GUEST + Outro con CTA. Incluye indicaciones de pausa y énfasis.',
    landing_page_pack:      'Genera copy para landing: Hero headline + Subheadline + 3 beneficios clave + Social proof placeholder + CTA principal.',
  };

  const packInstruction = packInstructions[pack] ?? packInstructions.social_post_pack;

  const system = `Eres CopyLab, el motor de copy de UNRLVL Studio. Generas copy profesional para marcas reales basado en su contexto de Supabase.

${layers.join('\n\n')}`;

  const user = `PACK SOLICITADO: ${pack}

${packInstruction}

Genera el copy ahora. Sin preámbulos, sin explicaciones. Solo el copy.`;

  const temperatureMap: Record<string, number> = {
    social_post_pack: 0.9,
    ad_copy_pack: 0.7,
    email_pack: 0.6,
    blog_pack: 0.7,
    seo_meta: 0.5,
    video_podcast_script: 0.8,
    landing_page_pack: 0.7,
  };

  return { system, user, temperature: temperatureMap[pack] ?? 0.7 };
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
      max_tokens: 1500,
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
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed', status: 'error' }), { status: 405, headers: CORS });

  let body: ExecuteRequest;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON', status: 'error' }), { status: 400, headers: CORS }); }

  if (!body.brandId) {
    return new Response(JSON.stringify({ error: 'brandId is required', status: 'error' }), { status: 400, headers: CORS });
  }

  try {
    const usedCache = !!(body.previousOutputs as any)?.brandContext;
    console.log(`[CopyLab v8.1] brand=${body.brandId} pack=${body.params?.pack} cache=${usedCache}`);
    const { system, user, temperature } = await buildPrompt(body);
    const output = await callClaude(system, user, temperature);
    return new Response(JSON.stringify({ output, status: 'ok' }), { status: 200, headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CopyLab /api/execute]', msg);
    return new Response(JSON.stringify({ error: msg, status: 'error' }), { status: 500, headers: CORS });
  }
}
