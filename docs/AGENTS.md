# AGENTS.md

> Creado: 2026-07-22 · Catálogo de responsabilidades de los 89 archivos de agentes existentes en `.claude/agents/`, agrupados por categoría. Basado en `REPOSITORY_ANALYSIS.md` sección 6, re-elaborado como catálogo de responsabilidades y con verificación directa de los duplicados (no solo por nombre de archivo).

## Regla de uso

**Antes de spawnear un agente con un rol personalizado, verificar en esta lista si ya existe uno equivalente.** Evitar que dos agentes cubran la misma responsabilidad dentro de un mismo swarm — genera trabajo redundante y respuestas inconsistentes.

## Catálogo por categoría

### `core/` (1)
- `planner` — planificación de tareas antes de ejecutar trabajo.

### `swarm/` (3)
- `adaptive-coordinator` — ajusta topología según carga de trabajo.
- `hierarchical-coordinator` — control tipo "queen → workers", anti-drift.
- `mesh-coordinator` — coordinación de red completamente conectada, para tareas distribuidas.

### `consensus/` (7)
- `byzantine-coordinator` — consenso tolerante a fallos adversariales (f < n/3).
- `raft-manager` — consenso basado en líder (f < n/2).
- `gossip-coordinator` — propagación eventualmente consistente, para escala grande.
- `crdt-synchronizer` — resolución de conflictos sin coordinación central.
- `quorum-manager` — consenso configurable por quórum.
- `security-manager` — políticas de seguridad dentro de mecanismos de consenso.
- `performance-benchmarker` — medición de rendimiento de los mecanismos de consenso.

### `github/` (12)
- `pr-manager` — gestión del ciclo de vida de pull requests.
- `code-review-swarm` — revisión de código coordinada por varios agentes.
- `issue-tracker` — seguimiento y triage de issues.
- `release-manager` — gestión de releases.
- `release-swarm` — coordinación multi-agente de un release.
- `repo-architect` — decisiones de estructura de repositorio.
- `multi-repo-swarm` — coordinación a través de varios repositorios.
- `sync-coordinator` — sincronización entre ramas/repos.
- `workflow-automation` — automatización de flujos de GitHub Actions.
- `github-modes` — definición de modos de operación sobre GitHub.
- `swarm-issue` / `swarm-pr` — variantes de swarm enfocadas en issues o PRs específicos.
- `project-board-sync` — sincronización con project boards.

### `sparc/` (4)
- `specification` — fase de especificación de la metodología SPARC.
- `pseudocode` — fase de diseño en pseudocódigo.
- `architecture` — fase de diseño arquitectónico dentro de SPARC.
- `refinement` — fase de refinamiento/optimización final.

### `v3/` (12)
- `security-architect` / `security-architect-aidefence` — diseño de seguridad a nivel arquitectónico.
- `aidefence-guardian` — defensa activa contra prompts/entradas maliciosas.
- `injection-analyst` — análisis de vulnerabilidades de inyección.
- `pii-detector` — detección de información personal identificable.
- `claims-authorizer` — autorización basada en claims/permisos.
- `ddd-domain-expert` — modelado de dominio (Domain-Driven Design).
- `performance-engineer` — optimización de rendimiento a nivel de sistema.
- `reasoningbank-learner` — aprendizaje de patrones vía ReasoningBank.
- `swarm-memory-manager` — gestión de memoria compartida del swarm.
- `collective-intelligence-coordinator` — coordinación de inteligencia colectiva entre agentes.
- `v3-integration-architect` — integración de componentes V3 del framework.

### `flow-nexus/` (9) — agentes de la integración opcional Flow-Nexus (no instalada por defecto)
- `swarm`, `sandbox`, `authentication`, `payments`, `neural-network`, `app-store`, `challenges`, `workflow`, `user-tools` — cada uno cubre esa funcionalidad dentro de la plataforma Flow-Nexus si se activa esa integración.

### `sublinear/` (5)
- `matrix-optimizer` — optimización de operaciones matriciales.
- `pagerank-analyzer` — análisis de grafos vía PageRank.
- `performance-optimizer` — optimización general de rendimiento.
- `trading-predictor` — modelos predictivos (dominio financiero/trading).
- `consensus-coordinator` — coordinación de consenso con algoritmos sublineales.

### `optimization/` (5)
- `benchmark-suite` — suite de benchmarking.
- `load-balancer` — balanceo de carga entre agentes/recursos.
- `performance-monitor` — monitoreo continuo de rendimiento.
- `resource-allocator` — asignación de recursos.
- `topology-optimizer` — optimización de la topología del swarm.

### `templates/` (9) — plantillas base para crear nuevos agentes/coordinadores
- `coordinator-swarm-init`, `memory-coordinator`, `orchestrator-task`, `sparc-coordinator`, `implementer-sparc-coder`, `performance-analyzer`, `base-template-generator`, `automation-smart-agent`, `github-pr-manager`.
- **Nota**: antes de crear un agente nuevo desde cero, revisar si una de estas plantillas ya cubre el patrón necesario.

### `testing/` (2)
- `tdd-london-swarm` — TDD con enfoque "London school" (mocks/interacciones).
- `production-validator` — validación de código antes/después de producción.

### `architecture/`, `development/`, `documentation/`, `devops/`, `data/`, `specialized/`, `analysis/` (con duplicados — ver sección siguiente)
- `arch-system-design` — diseño de arquitectura de sistema de alto nivel.
- `dev-backend-api` — desarrollo de APIs backend (REST/GraphQL).
- `docs-api-openapi` — documentación de API en formato OpenAPI.
- `ops-cicd-github` — pipelines CI/CD sobre GitHub Actions.
- `data-ml-model` — desarrollo de modelos de machine learning.
- `spec-mobile-react-native` — desarrollo móvil con React Native.
- `analyze-code-quality` / `code-analyzer` — análisis de calidad de código.

### `goal/`, `payments/`, `sona/`, `custom/`, `browser/` (5)
- `goal/agent` — agente orientado a objetivos.
- `payments/agentic-payments` — flujos de pago gestionados por agentes.
- `sona/sona-learning-optimizer` — optimización del aprendizaje neuronal SONA.
- `custom/test-long-runner` — pruebas de larga duración.
- `browser/browser-agent` (YAML, no Markdown) — automatización de navegador.

## Agentes duplicados (verificado con diff, no solo por nombre)

Se encontraron 7 pares de archivos que definen el mismo agente en dos rutas distintas (una "plana" por categoría, otra anidada en una subcarpeta). Se comparó el contenido real de cada par:

| Par | Resultado de la comparación | Ruta recomendada como canónica |
|---|---|---|
| `analysis/analyze-code-quality.md` vs `analysis/code-review/analyze-code-quality.md` | **Idénticos** byte a byte. | Cualquiera; se recomienda `analysis/analyze-code-quality.md` (ruta plana, consistente con el resto del catálogo). |
| `development/dev-backend-api.md` vs `development/backend/dev-backend-api.md` | Distintos: la ruta plana es v2.0.0-alpha (344 líneas, incluye capacidades de self-learning/pattern recognition); la anidada es v1.0.0 (141 líneas, sin esas capacidades). | **`development/dev-backend-api.md`** (más completa y más nueva). |
| `data/data-ml-model.md` vs `data/ml/data-ml-model.md` | Distintos: plana v2.0.0-alpha (444 líneas) vs anidada v1.0.0 (192 líneas). | **`data/data-ml-model.md`**. |
| `documentation/docs-api-openapi.md` vs `documentation/api-docs/docs-api-openapi.md` | Distintos: plana v2.0.0-alpha (354 líneas) vs anidada v1.0.0 (173 líneas). | **`documentation/docs-api-openapi.md`**. |
| `architecture/arch-system-design.md` vs `architecture/system-design/arch-system-design.md` | Casi idénticos (ambos v1.0.0); la plana tiene un campo `description` adicional en el frontmatter que la anidada no tiene. | **`architecture/arch-system-design.md`** (superconjunto). |
| `devops/ops-cicd-github.md` vs `devops/ci-cd/ops-cicd-github.md` | Casi idénticos (ambos v1.0.0); la plana tiene un campo `description` adicional. | **`devops/ops-cicd-github.md`** (superconjunto). |
| `specialized/spec-mobile-react-native.md` vs `specialized/mobile/spec-mobile-react-native.md` | Casi idénticos (ambos v1.0.0); la plana tiene un campo `description` adicional. | **`specialized/spec-mobile-react-native.md`** (superconjunto). |

**Conclusión verificada**: en los 7 pares, la ruta "plana" (nombre de categoría directo, sin subcarpeta anidada) es siempre igual o más completa que la ruta anidada — nunca al revés.

**Estado (2026-07-22): deduplicación aplicada.** Se eliminaron los 7 archivos anidados duplicados y se conservó la ruta plana como canónica en todos los casos. Al referenciar estos agentes, usar siempre la ruta plana. Nota: `.claude/agents/` es territorio gestionado por `ruflo`; si en el futuro se corre `ruflo init upgrade`/`--force`, el framework podría regenerar las rutas anidadas — en ese caso, volver a aplicar esta limpieza.

## Regla de cierre

Antes de spawnear un agente con un rol custom para una tarea nueva, revisar esta lista (o `.claude/agents/**` directamente) para confirmar que no existe ya un agente equivalente. Si dos agentes de este catálogo parecen cubrir la misma responsabilidad para una tarea concreta, elegir uno solo y documentarlo si la elección no es obvia.
