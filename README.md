# CopyLab — Unreal>ille Studio

Generador de copy para ads, emails y captions del ecosistema Unreal>ille Studio.

**Deploy:** Google AI Studio
**Contexto completo del ecosistema:** [`CoreProject/CONTEXT.md`](https://github.com/unrealvillestudio-hub/CoreProject/blob/main/CONTEXT.md)

---

## Rol en el ecosistema

CopyLab produce la capa textual de activación: copies para anuncios pagados, secuencias de email, captions para redes sociales, y CTAs. Integra BP_COPY_1.0 para mantener consistencia de voz por marca.

```
BluePrints (BP_PERSON voz + tono) ──→ CopyLab (copy activación)
DB_VARIABLES (brand tokens)              ↓
                                  Ads / Email / Captions
```

---

## Stack

- React 18 + TypeScript + Vite + Tailwind
- AI: Gemini 2.0 Flash (Gemini API)
- Deploy: Google AI Studio

---

## Estado

✅ v1.1 — BP_COPY_1.0 integrado

---

## Dependencias

| Consume | Provee |
|---------|--------|
| BP_PERSON (voz, tono, compliance) | Copy listo para activación |
| DB_VARIABLES (brand voice tokens) | — |
| Humanize Layer | Copy con autenticidad humana |

---

## Changelog

| Fecha | Cambio |
|---|---|
| 2026-03-20 | README actualizado con arquitectura de ecosistema |
| — | v1.1 — BP_COPY_1.0 integrado |

---

## Desarrollo local

```bash
npm install
cp .env.example .env.local  # añade GEMINI_API_KEY
npm run dev
```
