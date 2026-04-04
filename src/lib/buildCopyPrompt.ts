// src/lib/buildCopyPrompt.ts
// CopyLab v8.0 — SMPC 13 capas
// Modificación 2026-04-04: Layer 13 BP_COPY_1.0 (brand_copy_profiles) añadido

import { fetchBrandContext, BrandContext } from './queries';

// ─── Temperature map ─────────────────────────────────────────────────────────
const TEMPERATURE_BY_TEMPLATE: Record<string, number> = {
  Ads_FullPro:         0.5,
  Ads_Short:           0.5,
  Google_Search_RSA:   0.5,
  Email_Campaign:      0.6,
  Product_Description: 0.6,
  Landing_Page_Full:   0.6,
  SEO_FullPro:         0.7,
  BLOG:                0.8,
  YouTube_Script:      0.9,
  Blog_Article:        0.9,
  Social_Post:         1.0,
  Instagram_Caption:   1.0,
  TikTok_Hook:         1.0,
  Brand_Kit_Copy:      1.0,
  Storytelling:        1.0,
  SMPC_full:           1.0,
  Organic_FullPro:     1.0,
};
const DEFAULT_TEMPERATURE = 0.9;

// ─── Language labels ─────────────────────────────────────────────────────────
const LANGUAGE_LABELS: Record<string, string> = {
  ES:       'Español (neutro)',
  'es-ES':  'Español de España',
  'es-FL':  'Español — mercado Florida/Miami (es-FL)',
  'es-PA':  'Español de Panamá',
  'es-MX':  'Español de México',
  EN:       'English (neutral)',
  'en-US':  'English — US market',
  'en-FL':  'English — Florida market',
  PT:       'Português',
  FR:       'Français',
};

// ─── CTA field selector by canal ─────────────────────────────────────────────
function getCTAFieldForCanal(canalId: string): string {
  const adsCanals    = ['META_ADS','META_FEED','META_STORY','META_REEL','TIKTOK_ADS','GOOGLE_SEARCH_(RSA)','GOOGLE_PMAX'];
  const seoCanals    = ['BLOG','BLOG_HTML','WEB','WEB_HTML','LANDING_PAGE','LANDING_HTML'];
  const storyCanals  = ['INSTAGRAM_ORGANICO','TIKTOK_ORGANICO'];
  if (adsCanals.includes(canalId))    return 'cta_ads';
  if (seoCanals.includes(canalId))    return 'cta_seo';
  if (storyCanals.includes(canalId))  return 'cta_story';
  return 'cta_smpc';
}

// ─── Context helpers ──────────────────────────────────────────────────────────
function getHumanizeBlock(ctx: BrandContext, medium = 'copy') {
  const brandSpecific = ctx.humanize.find(
    (p: any) => p.brand_id !== 'DEFAULT' && p.medium === medium && p.parameter === 'humanize_instructions',
  );
  return brandSpecific ?? (ctx.humanize.find(
    (p: any) => p.brand_id === 'DEFAULT' && p.medium === medium && p.parameter === 'humanize_instructions',
  ) ?? null);
}

function findTemplate(ctx: BrandContext, templateId: string) {
  return ctx.outputTemplates.find((t: any) => t.id === templateId) ?? null;
}

function findCanalBlock(ctx: BrandContext, canalId: string) {
  return ctx.canalBlocks.find((c: any) => c.id === canalId) ?? null;
}

function getTopKeywords(ctx: BrandContext, limit = 10): string[] {
  return ctx.keywords.filter((k: any) => (k.prioridad ?? 99) <= 3).slice(0, limit).map((k: any) => k.keyword);
}

function getGrupo3(ctx: BrandContext): string {
  const kw1 = ctx.keywords.find((k: any) => (k.prioridad ?? 99) === 1);
  return kw1?.grupo_3 ?? getTopKeywords(ctx, 3).join(', ');
}

function getActiveCTA(ctx: BrandContext, ctaField = 'cta_smpc', servicio?: string): string {
  const filtered = servicio ? ctx.ctas.filter((c: any) => c.servicio === servicio) : ctx.ctas;
  const cta = filtered[0] ?? ctx.ctas[0];
  return cta ? cta[ctaField] ?? cta.cta_smpc ?? ctx.brand?.cta_base ?? '' : ctx.brand?.cta_base ?? '';
}

function getComplianceRules(ctx: BrandContext): string[] {
  const hard = ctx.compliance.filter((r: any) => r.severity === 'hard').map((r: any) => r.rule_text);
  const soft = ctx.compliance.filter((r: any) => r.severity !== 'hard').map((r: any) => r.rule_text);
  return [...hard, ...soft];
}

function getGeomix(ctx: BrandContext, geo?: string) {
  return geo ? ctx.geomix.find((g: any) => g.geo === geo) ?? null : ctx.geomix[0] ?? null;
}

// ─── Block builders ───────────────────────────────────────────────────────────

function buildBrandBlock(brand: any): string {
  const lines = [`## MARCA: ${brand.display_name}`];
  if (brand.brand_context)     lines.push(`Contexto: ${brand.brand_context}`);
  if (brand.geo_principal)     lines.push(`Geo principal: ${brand.geo_principal}`);
  if (brand.tono_base)         lines.push(`Tono base: ${brand.tono_base}`);
  if (brand.canales_activos)   lines.push(`Canales activos: ${brand.canales_activos}`);
  if (brand.formatos_activos)  lines.push(`Formatos: ${brand.formatos_activos}`);
  if (brand.cta_base)          lines.push(`CTA base: ${brand.cta_base}`);
  if (brand.diferenciador_base) lines.push(`Diferenciador: ${brand.diferenciador_base}`);
  if (brand.disclaimer_base)   lines.push(`Disclaimer: ${brand.disclaimer_base}`);
  if (brand.market)            lines.push(`Mercado: ${brand.market}`);
  if (brand.language_primary)  lines.push(`Idioma: ${brand.language_primary}`);
  return lines.join('\n');
}

function buildGoalsBlock(goals: any[]): string {
  const horizonLabels: Record<string, string> = {
    '6m':  '6 meses',
    '12m': '12 meses (año 1)',
    '24m': '24 meses (año 2)',
  };
  const lines = ['## OBJETIVOS ESTRATÉGICOS DE LA MARCA'];
  lines.push('Estos objetivos deben guiar el enfoque del copy — priorizar mensajes que acerquen al lector a estos resultados.');

  const grouped = goals.reduce((acc: Record<string, any[]>, goal: any) => {
    const h = goal.horizon ?? 'general';
    (acc[h] = acc[h] ?? []).push(goal);
    return acc;
  }, {});

  for (const [horizon, items] of Object.entries(grouped)) {
    const label = horizonLabels[horizon] ?? horizon;
    lines.push(`\n**Horizonte ${label}:**`);
    for (const item of (items as any[]).slice(0, 3)) {
      const kpiStr = item.kpi && item.target ? ` → KPI: ${item.kpi} ${item.target}` : '';
      lines.push(`- [${item.category?.toUpperCase() ?? 'GENERAL'}] ${item.goal}${kpiStr}`);
    }
  }
  return lines.join('\n');
}

function buildPersonasBlock(personas: any[]): string {
  const lines = ['## SEGMENTOS OBJETIVO (ICP)'];
  lines.push('Escribe para estas personas. Sus dolores, motivaciones y objeciones deben resonar en el copy.');

  const sorted = [...personas].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2)).slice(0, 3);
  for (const p of sorted) {
    lines.push(`\n**${p.label}** (${p.segment_type?.toUpperCase() ?? 'B2C'})`);
    if (p.age_range || p.gender || p.location) {
      const profile = [p.age_range, p.gender, p.location].filter(Boolean).join(' · ');
      lines.push(`  Perfil: ${profile}`);
    }
    if (p.pain_points?.length)    lines.push(`  Dolores: ${p.pain_points.slice(0,2).join(' | ')}`);
    if (p.motivations?.length)    lines.push(`  Motivaciones: ${p.motivations.slice(0,2).join(' | ')}`);
    if (p.objections?.length)     lines.push(`  Objeciones a superar: ${p.objections.slice(0,2).join(' | ')}`);
    if (p.copy_hooks?.length)     lines.push(`  Hooks que convierten: ${p.copy_hooks.slice(0,2).join(' | ')}`);
    if (p.tone_for_segment)       lines.push(`  Tono recomendado: ${p.tone_for_segment}`);
    if (p.avoid?.length)          lines.push(`  Evitar: ${p.avoid.slice(0,2).join(' | ')}`);
    if (p.buying_trigger)         lines.push(`  Trigger de compra: ${p.buying_trigger}`);
  }
  return lines.join('\n');
}

function buildIdiomaBlock(language: string | undefined, ctx: BrandContext): string {
  const lang = language ?? ctx.brand?.language_primary ?? 'ES';
  return [
    '## IDIOMA DE OUTPUT',
    `Genera TODO el contenido exclusivamente en: **${LANGUAGE_LABELS[lang] ?? lang}**`,
    'Esta instrucción tiene prioridad absoluta sobre cualquier idioma implícito en el contexto.',
    'No mezcles idiomas. Si algún término técnico no tiene traducción natural, mantenlo en su idioma original.',
  ].join('\n');
}

function buildHumanizeBlock(humanize: any): string {
  return ['## HUMANIZE F2.5 — VOZ AUTÉNTICA', humanize.value, humanize.notes ? `Nota: ${humanize.notes}` : null]
    .filter(Boolean)
    .join('\n');
}

function buildGeomixBlock(geo: any): string {
  const lines = [`## GEOMIX — ${geo.geo}`];
  if (geo.servicios?.length)    lines.push(`Servicios en esta zona: ${geo.servicios.join(', ')}`);
  if (geo.combos?.length)       lines.push(`Combos SEO: ${geo.combos.slice(0,3).join(' | ')}`);
  lines.push(`Integrar la geo "${geo.geo}" de forma natural en el copy.`);
  if (geo.local_slang)          lines.push(`Lenguaje local: ${geo.local_slang}`);
  if (geo.cultural_refs)        lines.push(`Referencias culturales: ${geo.cultural_refs}`);
  return lines.join('\n');
}

// ─── Layer 13: BP_COPY_1.0 ────────────────────────────────────────────────────
// NUEVA FUNCIÓN — añadida 2026-04-04

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

  const hooks: string[] = profile.style_hooks ?? [];
  if (hooks.length)                  lines.push(`HOOKS RECOMENDADOS: ${hooks.join(' | ')}`);

  const signatures: string[] = profile.style_signature_phrases ?? [];
  if (signatures.length)             lines.push(`FRASES FIRMA: "${signatures.join('" | "')}"`);

  const avoid: string[] = profile.style_avoid_phrases ?? [];
  if (avoid.length)                  lines.push(`FRASES A EVITAR: ${avoid.join(', ')}`);

  const prohibited: string[] = profile.compliance_prohibited_words ?? [];
  if (prohibited.length)             lines.push(`PALABRAS PROHIBIDAS: ${prohibited.join(', ')}`);

  const disclaimers: string[] = profile.compliance_required_disclaimers ?? [];
  if (disclaimers.length)            lines.push(`DISCLAIMERS REQUERIDOS: ${disclaimers.join(' | ')}`);

  if (profile.compliance_rules)      lines.push(`COMPLIANCE ADICIONAL: ${profile.compliance_rules}`);

  return lines.join('\n');
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function applyTemplateVars(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{{${key}}}`)
    .replace(/\{(\w+)\}/g,     (_, key) => vars[key] !== undefined ? vars[key] : `{${key}}`);
}

function buildTemplateVars(brand: any, cta: string, keywords: string[], grupo3: string, input: any): Record<string, string> {
  return {
    marca:              brand.display_name,
    contexto_marca:     brand.brand_context ?? '',
    geo_principal:      brand.geo_principal ?? '',
    tono_base:          brand.tono_base ?? '',
    canal_base:         brand.canal_base ?? '',
    canales_activos:    brand.canales_activos ?? '',
    formatos_activos:   brand.formatos_activos ?? '',
    cta_base:           brand.cta_base ?? '',
    cta_ads:            brand.cta_ads ?? cta,
    diferenciador_base: brand.diferenciador_base ?? '',
    disclaimer_base:    brand.disclaimer_base ?? '[DISCLAIMER]',
    url_base:           brand.url_base ?? '',
    cta_url_base:       brand.cta_url_base ?? '',
    keywords_top:       keywords.slice(0, 5).join(', '),
    grupo_3:            grupo3,
    servicio:           input.servicio ?? '',
    language:           input.language ?? brand.language_primary ?? 'ES',
    extra_notes:        input.extraNotes ?? '',
  };
}

// ─── Main prompt assembler ───────────────────────────────────────────────────

interface BuildPromptParams {
  ctx:            BrandContext;
  template:       string;
  canal:          any;
  humanize:       any;
  geomix:         any;
  keywords:       string[];
  grupo3:         string;
  cta:            string;
  complianceRules: string[];
  input:          any;
}

function buildPrompt(params: BuildPromptParams): string {
  const { ctx, template, canal, humanize, geomix, keywords, grupo3, cta, complianceRules, input } = params;
  const brand = ctx.brand;
  const sections: string[] = [];

  // Layer 1: Brand
  sections.push(buildBrandBlock(brand));

  // Layer 2: Goals
  if (ctx.brandGoals && ctx.brandGoals.length > 0) {
    sections.push(buildGoalsBlock(ctx.brandGoals));
  }

  // Layer 3: Personas (ICP)
  if (ctx.brandPersonas && ctx.brandPersonas.length > 0) {
    sections.push(buildPersonasBlock(ctx.brandPersonas));
  }

  // Layer 4: Idioma
  sections.push(buildIdiomaBlock(input.language, ctx));

  // Layer 5: Canal
  if (canal?.block_text) {
    sections.push(`## CANAL: ${canal.id}\n${canal.block_text}`);
  }

  // Layer 6: Humanize F2.5
  if (humanize) sections.push(buildHumanizeBlock(humanize));

  // Layer 7: GeoMix
  if (geomix) sections.push(buildGeomixBlock(geomix));

  // Layer 8: Keywords
  if (keywords.length > 0) {
    sections.push(`## KEYWORDS\nPrincipales: ${keywords.slice(0, 5).join(', ')}` + (grupo3 ? `\nGrupo SEO (grupo_3): ${grupo3}` : ''));
  }

  // Layer 9: CTA
  if (cta) sections.push(`## CTA ACTIVO\n${cta}`);

  // Layer 10: Compliance
  if (complianceRules.length > 0) {
    sections.push(`## COMPLIANCE — REGLAS OBLIGATORIAS\n` + complianceRules.map((r, i) => `${i + 1}. ${r}`).join('\n'));
  }

  // Layer 13: BP_COPY_1.0 — VOZ DE MARCA  ← NUEVO
  if (ctx.copyProfile) {
    sections.push(buildCopyProfileLayer(ctx.copyProfile));
  }

  // Layer 11: Extra context
  if (input.extraNotes) {
    sections.push(`## CONTEXTO ADICIONAL\n${input.extraNotes}`);
  }

  // Layer 12: Template / Instrucción (siempre al final)
  const templateVars = buildTemplateVars(brand, cta, keywords, grupo3, input);
  const instruction  = applyTemplateVars(template, templateVars);
  sections.push(`## INSTRUCCIÓN\n${instruction}`);

  return sections.join('\n\n---\n\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface BuildCopyPromptInput {
  brandId:      string;
  templateId:   string;
  canalId:      string;
  servicio?:    string;
  language?:    string;
  geo?:         string;
  extraNotes?:  string;
  medium?:      string;
}

export async function buildCopyPrompt(input: BuildCopyPromptInput) {
  const { brandId, templateId, canalId, servicio, medium = 'copy' } = input;

  const ctx = await fetchBrandContext(brandId, input.language, servicio);

  if (!ctx.brand) throw new Error(`[buildCopyPrompt] Brand '${brandId}' no encontrado en Supabase`);

  const template = findTemplate(ctx, templateId);
  if (!template)  throw new Error(`[buildCopyPrompt] OutputTemplate '${templateId}' no encontrado. Disponibles: ${ctx.outputTemplates.map((t: any) => t.id).join(', ')}`);

  const canal = findCanalBlock(ctx, canalId);
  if (!canal)     throw new Error(`[buildCopyPrompt] CanalBlock '${canalId}' no encontrado. Disponibles: ${ctx.canalBlocks.map((c: any) => c.id).join(', ')}`);

  const humanize       = getHumanizeBlock(ctx, medium);
  const geomix         = getGeomix(ctx, input.geo);
  const keywords       = getTopKeywords(ctx);
  const grupo3         = getGrupo3(ctx);
  const ctaField       = getCTAFieldForCanal(canalId);
  const cta            = getActiveCTA(ctx, ctaField, servicio);
  const complianceRules = getComplianceRules(ctx);
  const temperature    = Math.min(TEMPERATURE_BY_TEMPLATE[templateId] ?? DEFAULT_TEMPERATURE, 1);

  const prompt = buildPrompt({
    ctx, template: template.template_text, canal,
    humanize, geomix, keywords, grupo3,
    cta, complianceRules, input,
  });

  return {
    prompt,
    templateName: template.name ?? template.id,
    canalName:    canal.name ?? canal.id,
    brandName:    ctx.brand.display_name,
    temperature,
    metadata: {
      keywordsInjected:      keywords.length,
      ctasInjected:          cta ? 1 : 0,
      complianceRulesInjected: complianceRules.length,
      humanizeApplied:       !!humanize,
      geomixApplied:         !!geomix,
      goalsInjected:         ctx.brandGoals?.length ?? 0,
      personasInjected:      ctx.brandPersonas?.length ?? 0,
      copyProfileInjected:   !!ctx.copyProfile,    // ← NUEVO
    },
  };
}
