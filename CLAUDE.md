# CLAUDE.md — CopyLab
_Contexto persistente para Claude Code. No editar manualmente._

## Qué es este repo
CopyLab es el motor de generación de copy del ecosistema UNRLVL. Recibe requests del pipeline (vía `copylab-processor` EF o directamente del Orchestrator), llama a **Claude Sonnet** con capas de contexto de marca, y devuelve copy estructurado para publicación.

**URL producción:** https://unrlvl-copy-lab.vercel.app  
**Vercel project:** prj_5FebBMfTpo4aP5I7iJ98libUkTTe  
**Framework:** Vite + React (UI) + Vercel Node.js Functions (API)  
**Versión actual:** v9.7

---

## Stack técnico

### API principal
- **`api/execute.ts`** — único endpoint real: `POST /api/execute`
- `export const maxDuration = 300` (5 min — necesario para async mode)
- Handler: `VercelRequest/VercelResponse` (Node.js nativo — NO Edge Function)
- Modelo Claude: `claude-sonnet-4-20250514`

### Variables de entorno (Vercel)
```
ANTHROPIC_API_KEY        ← API key Anthropic
SUPABASE_URL             ← https://amlvyycfepwhiindxgzw.supabase.co
SUPABASE_ANON_KEY        ← anon key (NO service_role — CopyLab usa anon)
```
> ⚠️ CopyLab usa `SUPABASE_ANON_KEY`, no `SUPABASE_SERVICE_ROLE_KEY`. Crítico — no confundir.

### Supabase (proyecto amlvyycfepwhiindxgzw)
Tablas que lee (en zero-query mode v2.0, todo llega via `brand_cache_snapshots`):
- **`brand_cache_snapshots`** — snapshot completo de contexto de marca (zero-query mode)
- **`copylab_jobs`** — queue de jobs async
- `brands`, `humanize_profiles`, `brand_goals`, `brand_personas`, `compliance_rules`
- `keywords`, `ctas`, `brand_copy_profiles`, `brand_voice_genome`
- `creative_vectors`, `tension_architectures`, `aggro_presets`, `creative_compatibility_rules`
- `pipeline_skills`, `output_templates`, `content_sequence_pieces`

---

## Tres modos de operación

### 1. Async mode (pipeline normal)
```
POST /api/execute { ...body, async: true }
  → INSERT copylab_jobs (status: 'queued')
  → Return { job_id, status: 'queued' }
  → copylab-processor EF (pg_cron cada 1min) lo procesa
```

### 2. Literal mode (teasers/announcements — v9.7)
```
POST /api/execute { params: { mode: 'literal', literal_text: '...' }, meta: { language: 'EN' } }
  → fetchBrandCache(brandId) → buildLiteralBrandBlock()
  → Claude genera caption + hashtags respetando el texto VERBATIM
  → Return { output, caption, hashtags[], cache_mode }
```
> Activado por Orchestrator cuando `job_type ∈ {teaser, announcement}`

### 3. Sync mode (directo)
```
POST /api/execute { brandId, stage, params: { pack, canal }, previousOutputs }
  → buildPrompt() → fetchBrandCache() → selectCreativeCombo() → assembleVoiceGenomeLayer()
  → callClaude(system, user, temperature)
  → Return { output, meta: { layers_applied, voice_genome, creative_seed, cache_mode } }
```

---

## Packs disponibles
| Pack | Temperatura | Descripción |
|---|---|---|
| `social_post_pack` | 0.9 | Hook + Cuerpo + CTA + hashtags |
| `ad_copy_pack` | 0.7 | Headline + Descripción + CTA (versión A y B) |
| `email_pack` | 0.6 | Asunto + Preview + Cuerpo + CTA |
| `email_sequence_*` | 0.75 | Secuencias email (abandoned_cart, welcome, etc.) |
| `product_description_pack` | 0.7 | Título SEO + desc corta + larga + bullets + HOW_TO_USE |
| `blog_pack` | 0.7 | Título + Intro + 3 H2 + Conclusión + Meta |

---

## Brand cache (zero-query mode v2.0)
Cuando existe `brand_cache_snapshots` para el `brandId`:
- **0 queries adicionales** a Supabase
- El snapshot incluye: `brands`, `humanize_profiles`, `brand_goals`, `brand_personas`, `compliance_rules`, `keywords`, `ctas`, `brand_copy_profiles`, `brand_voice_genome`, `creative_vectors`, `tension_architectures`, `aggro_presets`, `creative_compatibility_rules`, `pipeline_skills`, `output_templates`
- Detección v2: `isV2 = !!bc && (Array.isArray(bc.creative_vectors) || Array.isArray(bc.brand_voice_genome) || Array.isArray(bc.brand_copy_profiles))`
- Fallback: `https://unrlvl-context.vercel.app/api/brand-cache?brand_id=...` (v1.x)
- Fallback final: queries directas a Supabase (40+ queries/job — lento)

---

## Voice Genome (L1.5)
Cuando la marca tiene `brand_voice_genome` activo, se inyecta como capa L1.5:
- `identity_anchors`, `lexicon_signature` (signature_words, trademark_word, signature_phrases)
- `lexicon_forbidden` (nunca usar)
- `syntactic_signatures`, `argumentative_architecture`, `relational_stance`
- `emotional_register`, `prohibited_registers`

---

## Estructura del repo
```
api/
  execute.ts          ← Handler principal (Node.js, maxDuration:300)
  process-job.ts      ← Procesador de jobs async (usado por EF)
  brand-cache.js      ← Cache builder fallback
  claude.ts           ← Helper Claude directo
src/
  lib/
    buildCopyPrompt.ts ← Constructor de prompts (lógica principal)
    db/types.ts       ← Tipos de base de datos
    queries.ts        ← Queries Supabase
  modules/
    customize/CopyCustomizeModule.tsx ← UI principal
  config/
    packs.ts          ← Definición de packs disponibles
```

---

## Conexiones con el ecosistema
- **Recibe requests de:** `copylab-processor` EF (pg_cron) + Orchestrator directo
- **Lee datos de:** `brand_cache_snapshots` (zero-query) o queries directas
- **Escribe en:** `copylab_jobs` (async queue)
- **Llama a:** Claude API (`claude-sonnet-4-20250514`)
- **Fallback cache:** `https://unrlvl-context.vercel.app/api/brand-cache`

---

## Reglas de trabajo
1. **`SUPABASE_ANON_KEY`** — CopyLab usa anon, no service_role. No cambiar.
2. **`normalizeSupabaseUrl()`** debe aplicarse siempre — ya está implementado, no remover
3. Al agregar un nuevo pack: agregarlo en `packInstructions`, `temperatureMap`, y `aggroByType`
4. **Literal mode** requiere `params.mode === 'literal'` AND `params.literal_text` — ambos obligatorios
5. El `isV2` check es tolerante — verificar que sigue detectando v2 correctamente si se cambia el schema del cache

---

## Estado actual (2026-05-29)
- ✅ OPERACIONAL — pipeline end-to-end funcionando
- ✅ Literal mode v9.7 activo para teasers/announcements
- ✅ Voice genome injection operacional para UnrealvilleStudio
- ✅ Zero-query mode v2.0 activo para UnrealvilleStudio y NeuroneSCF
- ✅ `async mode` + `copylab-processor` cron operacional
