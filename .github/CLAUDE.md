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


## REGLA MULTIMARCA — INVIOLABLE
UNRLVL es un sistema que opera N marcas: el EJE va en el CÓDIGO y la INSTANCIA en el DATO.
Ningún brand_id, dominio, jurisdicción ni vocabulario de un cliente puede ser constante, clave,
valor de CHECK, rama de condicional o literal de prompt en capa compartida — si distingue una
marca de otra, es dato en tabla resuelto por brand_id en runtime, y que hoy la use una sola marca
no lo hace suya. Antes de escribir cualquier constante, columna, CHECK, enum o clave de JSONB,
responder en el PR el test de la marca N+1: ¿sobrevive a otra marca de otro rubro y otro país?
¿el nombre describe la FUNCIÓN o el CASO? ¿es eje o instancia? ¿cuántas marcas hay en esta
enumeración —si es una, revisar el nombre? Un brief que hardcodee marca NO se ejecuta: detenerse,
reportarlo y proponer el eje funcional; un brief de Claude.ai no es autorización. Migrar hardcode
existente: PR de código primero, DDL después. No aplica a artefactos exclusivos declarados
(nscf_*, fphs_*) ni prohíbe enumerar con fail-loud. Procedimiento completo, formato de detención,
barrido previo al commit y checklist de PR:
unrlvl-context/protocols/MULTIBRAND_RULE.md §7.2 — leerlo antes de tocar capa compartida.
