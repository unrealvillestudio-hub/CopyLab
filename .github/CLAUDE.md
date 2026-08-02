# Claude Code — reglas para este repo

La fuente de verdad de cómo debe comportarse CC en TODOS los repos del ecosistema es:
**`unrlvl-context/protocols/CC_PROTOCOL.md`**
https://unrlvl-context.vercel.app/protocols/CC_PROTOCOL.md

CC lo carga y lo obedece antes de tocar nada. Este archivo NO duplica reglas: si algo
parece contradecirlo, manda el protocolo.

Recordatorios operativos (no sustituyen al protocolo):
- Siempre rama, nunca `main`. `git checkout -b fix/... | feat/... | ctx/...`
- El build local (`tsc --noEmit` o `vite build`) pasa antes de commitear.
- CC publica la rama y abre el PR. **CC nunca mergea. El merge es de Sam.**
- No commitear `tsconfig.tsbuildinfo`, `.next/`, `dist/`, `node_modules/`, ni secretos.
