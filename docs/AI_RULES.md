# AI_RULES.md

> Creado: 2026-07-22 · Capa human-readable de las reglas de colaboración con IA en este proyecto. No duplica `CLAUDE.md` palabra por palabra: ese archivo lo lee automáticamente Claude Code y puede ser sobrescrito por `ruflo init upgrade`; este documento es el resumen de referencia para personas.

## Reglas duras heredadas de `CLAUDE.md`

- Hacer solo lo que se pide, ni más ni menos.
- Preferir editar un archivo existente antes que crear uno nuevo.
- No crear documentación nueva sin pedido explícito (los documentos de este bootstrap sí fueron pedidos explícitamente).
- No guardar archivos de trabajo/tests en la raíz — usar `/src`, `/tests`, `/docs`, `/config`, `/scripts`.
- Leer siempre un archivo antes de editarlo.
- Nunca commitear secretos, credenciales o `.env`.
- No añadir trailer `Co-Authored-By` a commits del usuario salvo que `.claude/settings.json` tenga `attribution.commit` configurado (no está configurado en este repo).
- Mantener archivos bajo 500 líneas.
- Validar entradas en los límites del sistema.

## Reglas específicas de este proyecto (añadidas en el bootstrap)

1. **Reutilización antes que creación de agentes/skills**: antes de definir un agente o skill de proyecto nuevo, revisar [`AGENTS.md`](AGENTS.md) (89 agentes existentes) y `.claude/skills/` (32 skills existentes). Solo crear uno nuevo si ninguno cubre la responsabilidad necesaria.
2. **Sin duplicación de responsabilidad en un mismo swarm**: si dos agentes existentes cubren la misma función, usar uno solo por tarea; no invocar ambos "por si acaso".
3. **Documentación bajo pedido**: no generar nuevos documentos de negocio o de proceso sin que el propietario lo solicite explícitamente (regla ya vigente en `CLAUDE.md`, reafirmada aquí para el conjunto de docs de este bootstrap).
4. **Decisiones se registran, no se sobreescriben**: cualquier cambio de arquitectura, alcance o stack que reemplace algo ya documentado se añade como entrada nueva en [`DECISIONS.md`](DECISIONS.md); no se borra silenciosamente el razonamiento anterior.
5. **El contenido de negocio nunca se inventa**: secciones marcadas `PENDIENTE` en `VISION.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md` y `ROADMAP.md` se completan únicamente con información proporcionada por el propietario, nunca con supuestos o contenido de relleno.
6. **No tocar la capa de framework**: `.claude/`, `.claude-flow/`, `.swarm/`, `.mcp.json`, `CLAUDE.md` se modifican solo a través de comandos propios de `ruflo` (`init upgrade`, etc.), no a mano.

## Dónde viven las demás reglas

- Convenciones de swarm (cuándo sí/no coordinar múltiples agentes), routing de modelos y patrones de comunicación entre agentes: `CLAUDE.md` (secciones "Swarm & Routing" y "Agent Comms").
- Catálogo completo de comandos/hooks/workers del framework: `.claude-flow/CAPABILITIES.md`.
- Riesgos de seguridad y mitigaciones: [`SECURITY.md`](SECURITY.md).
