# CLAUDE.md — CopyLab
_Contexto persistente para Claude Code. No editar manualmente._

---

## ⚠️ GOBERNANZA CC — NIVEL ALTA COMPLEJIDAD (leer ANTES de tocar nada)

Antes de cualquier acción en este repositorio, Claude Code DEBE cargar y obedecer el protocolo central:
**`https://unrlvl-context.vercel.app/protocols/CC_PROTOCOL.md`** (cargar con `Vercel:web_fetch_vercel_url` o `curl`).

**Este repo es parte del pipeline de contenido — un error rompe el flujo de varias marcas. Reglas:**

1. **CONTEXT FILES NUNCA SE REEMPLAZAN.** Se actualizan preservando historia: lo nuevo al tope, lo anterior archivado debajo, nunca borrado. Aplica a todo `.json`/`.md` de contexto. Antes de commitear: verificar que el diff no BORRA historia.

2. **PUSH:** `unrlvl-context` → nunca push directo, nunca por CC (solo Sam vía GitHub Desktop). Este repo y demás repos de código → branch + PR, nunca merge propio. CC nunca mergea por su cuenta. CC limpia sus worktrees al cerrar un PR.

3. **VERIFICACIÓN REFORZADA POR COMPLEJIDAD:** cambios que afecten `lab_jobs`, `lab_configs`, Edge Functions, o el flujo del pipeline requieren mensaje de verificación EXPLÍCITO a Sam antes de commitear (objetivo, pasos, archivos, repos y EFs afectados), porque un error se propaga aguas abajo a CopyLab/ImageLab/Meta y a todas las marcas. Reportar al final con el formato de CC_PROTOCOL (incluida PRESERVACIÓN DE CONTEXTO).

Ante cualquier duda → preguntar a Sam, no asumir.

---

## Qué es este repo
CopyLab es el motor de generación de copy del ecosistema UNRLVL. Recibe requests (vía `copylab-processor` EF o directo del Orchestrator), arma un prompt por capas con contexto de marca + un motor creativo, llama a **Claude Sonnet**, y devuelve copy estructurado.

**URL producción:** https://unrlvl-copy-lab.vercel.app
**Vercel project:** prj_5FebBMfTpo4aP5I7iJ98libUkTTe
**Framework:** Vite + React (UI) + Vercel Function Node (`api/execute.ts`)
**Versión actual:** v9.7 (verificado en código 2026-06-08)

---

## Stack técnico (verificado en `api/execute.ts`, 43KB)

### API principal
- **`api/execute.ts`** — endpoint `POST /api/execute`. Handler Node (`VercelRequest/VercelResponse`, NO Edge). `export const maxDuration = 300` (5 min).
- **`api/process-job.ts`** v1.1 — procesador async (Node). Lee `copylab_jobs` queued, marca processing (attempt_count++), llama `/api/execute` con `async:false`, guarda output+output_parsed, estados queued→processing→done/error. Idempotente.
- Modelo Claude: `claude-sonnet-4-20250514` (constante `CLAUDE_MODEL`). `callClaude()` usa `max_tokens: 1200`, `anthropic-version: 2023-06-01`.

### Variables de entorno (Vercel) — verificadas
```
ANTHROPIC_API_KEY    <- API key Anthropic
SUPABASE_URL         <- normalizeSupabaseUrl() tolera 3 formatos (ref / hostname / url)
SUPABASE_ANON_KEY    <- CopyLab usa ANON, NO service_role. Crítico — no confundir.
```

---

## Tres modos de operación (verificados en el handler)

### 1. Async — `POST /api/execute { ...body, async: true }`
`createJob()` → INSERT `copylab_jobs` (status queued, Prefer return=representation) → retorna 202 `{ job_id, status:'queued' }`. Lo procesa `copylab-processor` EF (pg_cron #30 cada 1 min).

### 2. Literal — `POST /api/execute { params:{ mode:'literal', literal_text }, meta:{ language } }`
Para teasers/announcements del Orchestrator. `runLiteralCopy()`: el `literal_text` es **inmutable y aparece VERBATIM**; Claude solo arma caption + hashtags alrededor, a temperatura 0.4, respetando idioma (EN | ES | EN+ES). v9.7: `buildLiteralBrandBlock()` inyecta identidad de marca (voice genome + hashtag style + compliance + emoji policy) — ya no es genérico. Salida JSON estricta `{caption, hashtags[]}`.

### 3. Sync — `POST /api/execute { brandId, stage, params:{pack,canal}, meta, previousOutputs }`
`buildPrompt()` arma el sistema por capas → `callClaude()` → retorna output + meta (cache_mode, layers_applied, voice_genome, creative_seed).

---

## El motor de capas (corazón de CopyLab — de `buildPrompt`)
El prompt del sync mode se ensambla con estas capas, en orden:
- **L1 — Voz base:** `humanize_profiles` (tono, personalidad, authenticity_rules, anti_patterns).
- **BP_COPY_1.0:** `brand_copy_profiles` (voice_tone_primary, writing_style, style_hooks, style_avoid_phrases).
- **L1.5 — Voice Genome injection:** si la marca tiene `brand_voice_genome` activo, `assembleVoiceGenomeLayer()` inyecta identity_anchors, lexicon_signature (signature_words, trademark_word, signature_phrases), lexicon_forbidden, syntactic_signatures, argumentative_architecture, relational_stance, emotional_register, prohibited_registers. Regla embebida: la firma es FIRMA, no FÓRMULA (no repetir en cada pieza).
- **L14 — Creative Vector / L15 — Tension Architecture / L16 — Aggro Dial:** el motor creativo (`selectCreativeCombo`) elige vector de apertura + curva de tensión + nivel de agresividad, filtrando por `creative_compatibility_rules` del content_type y un `aggroLevel` mapeado por tipo (ej. abandoned_cart_2=4, welcome=1). Regla de conflicto: el vector gana en arquitectura, el voice gana en superficie léxica.
- Capas adicionales: objetivos (brand_goals), audiencia (brand_personas con pain_points/hooks), keywords, CTAs aprobados, compliance_rules (obligatorias), output_templates, contexto de secuencia de email.

---

## Packs y temperatura (de `temperatureMap` + `packInstructions`)
| Pack | Temp | |
|---|---|---|
| social_post_pack | 0.9 | Hook + cuerpo + CTA + hashtags |
| ad_copy_pack | 0.7 | Headline + desc + CTA (A y B) |
| email_pack | 0.6 | Asunto + preview + cuerpo + CTA |
| blog_pack | 0.7 | Título SEO + intro + 3 H2 + conclusión + meta |
| seo_meta_pack | 0.5 | Title + meta desc + H1 + alts |
| video_podcast_script | 0.8 | Intro + bloques HOST/GUEST + outro |
| landing_page_pack | 0.7 | Hero + subhead + 3 beneficios + CTA |
| product_description_pack | 0.7 | Título + desc corta/larga + bullets + HOW_TO_USE (+ bloque KIT si product_type=kit) |
| email_sequence_* | 0.7-0.8 | Secuencias con contexto de pieza anterior |

---

## Brand cache (zero-query v9.5/v2.0)
`fetchBrandCache()` resuelve en cadena: (1) `brand_cache_snapshots.cache_data` → **0 queries** ("snapshot v2.0 hit"); (2) fallback `https://unrlvl-context.vercel.app/api/brand-cache?brand_id=`; (3) fallback final queries directas (40+/job). `isV2` tolerante: detecta v2 si el cache trae `creative_vectors` O `brand_voice_genome` O `brand_copy_profiles` (marcas viejas pueden no tener vectors aún).

---

## Conexiones (verificadas: código + ecosystem_graph + access_map)
- **Recibe de:** `copylab-processor` EF (pg_cron) + Orchestrator directo.
- **Lee de Supabase (anon):** brand_cache_snapshots, copylab_jobs, brands, humanize_profiles, brand_goals, brand_personas, compliance_rules, keywords, ctas, brand_copy_profiles, creative_vectors, tension_architectures, aggro_presets, creative_compatibility_rules, pipeline_skills, output_templates, brand_voice_genome, content_sequence_pieces.
- **access_map:** `copylab_jobs` anon insert/select/update (policies USING(true) — intencional dual-mode, NO restringir); `upsert_brand_cache` RPC SECURITY DEFINER llamado con anon desde el browser (intencional — comentario en queries.ts).
- **Escribe en:** copylab_jobs (async queue).
- **Llama a:** Claude API (`claude-sonnet-4-20250514`).
- **Fallback cache:** unrlvl-context `/api/brand-cache`.

---

## Reglas de trabajo (del código)
1. **`SUPABASE_ANON_KEY`, no service_role** — confirmado. Las policies anon de copylab_jobs son intencionales (dual-mode); no restringir sin rediseñar.
2. **`normalizeSupabaseUrl()`** siempre aplicado — no remover.
3. Nuevo pack: agregarlo en `packInstructions`, `temperatureMap`, y `aggroByType`.
4. **Literal mode** requiere `params.mode==='literal'` AND `params.literal_text` — el texto va verbatim, no parafrasear.
5. La firma del voice genome es firma, no fórmula — no forzar trademark_word/triplicación en cada pieza.
6. `isV2` es tolerante — si se cambia el schema del cache, verificar que sigue detectando v2.
7. ANON key nunca en el repo — solo env var.

---

## Estado actual (verificado 2026-06-08)
- OPERACIONAL — v9.7 en producción.
- Literal mode v9.7 con brand context activo (teasers/announcements).
- Voice genome injection L1.5 operacional.
- Zero-query v2.0 para UnrealvilleStudio y NeuroneSCF.
- async + copylab-processor (pg_cron #30) operacional.
