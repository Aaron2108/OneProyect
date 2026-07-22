# Análisis del Repositorio — OneProyect (Ruflo V3 Scaffolding)

> Generado por auditoría de solo lectura. Fecha de análisis: 2026-07-22.

## 1. Resumen ejecutivo

`OneProyect` es, en su estado actual, **el andamiaje (scaffolding) de configuración generado por `ruflo init --full`**, no una aplicación con código propio. No existe `package.json` en la raíz ni carpeta `node_modules`: no hay build, no hay dependencias de aplicación, no hay tests. Todo el contenido versionado (350 archivos, ~85k líneas, casi todo Markdown/YAML/JSON) es configuración e instrucciones para que **Claude Code** actúe como orquestador de un framework multi-agente llamado Ruflo/Claude-Flow V3 (paquete npm `ruflo`, instalado globalmente v3.32.9; internamente sigue usando el nombre de paquete `@claude-flow/cli` y GitHub `ruvnet/claude-flow` en su documentación).

El repo define: 89 archivos de definición de "agentes" (roles/prompts), 32 "skills" (guías de uso empaquetadas), 166 archivos de "comandos" (documentación de subcomandos CLI, no código ejecutable), ~30 helpers (scripts .sh/.js/.cjs/.mjs) que implementan hooks de Claude Code, y un runtime local (`.claude-flow/`, `.swarm/`) para memoria vectorial, métricas y sesiones. Un servidor MCP (`.mcp.json`) expone ~210 herramientas adicionales a Claude Code cuando se arranca (`autoStart: false`, no arranca solo).

**Conclusión clave**: este repositorio no ejecuta nada por sí mismo. Es una capa de *configuración y convención* sobre Claude Code (agentes, hooks, memoria, comandos) más un runtime opcional (`ruflo start`/`ruflo daemon start`) que aún no se ha iniciado. El código de negocio del proyecto real (lo que se vaya a construir) todavía no existe.

## 2. Arquitectura

Cinco capas, todas generadas por `ruflo init --full`, ninguna con código de aplicación aún:

```
CLAUDE.md              ← instrucciones de comportamiento para Claude Code (leído siempre)
.claude/                ← integración con Claude Code
  ├── settings.json     ← hooks, permisos, modelo, config de "claudeFlow"
  ├── agents/           ← 89 definiciones de rol (frontmatter + prompt)
  ├── commands/         ← 166 documentos de subcomandos (referencia, no ejecutable)
  ├── skills/           ← 32 SKILL.md (guías activables por Claude Code)
  └── helpers/          ← ~30 scripts que los hooks invocan (.cjs/.js/.mjs/.sh)
.claude-flow/            ← runtime V3 (config, métricas, seguridad, datos)
  ├── config.yaml       ← config de swarm/memoria/neural que LEE el CLI `ruflo`
  ├── CAPABILITIES.md   ← referencia generada de todo lo que el CLI puede hacer
  ├── metrics/          ← JSON de actividad/aprendizaje (semilla, casi vacíos)
  ├── security/         ← estado de auditoría de seguridad (pendiente)
  └── data/ logs/ sessions/ neural/  ← VACÍOS, excluidos de git (runtime puro)
.swarm/                  ← base de datos de memoria del swarm
  ├── schema.sql         ← esquema SQLite versionado (memoria, patrones, grafo, sesiones)
  └── memory.db          ← base de datos real, EXCLUIDA de git (binaria, runtime)
.mcp.json                ← registra el servidor MCP "claude-flow" (no arranca solo)
```

Relación entre capas: `CLAUDE.md` es la única pieza que Claude Code carga siempre y que le dice *cómo comportarse* (cuándo usar swarms, qué agentes invocar, convenciones). `.claude/settings.json` conecta eventos del ciclo de vida de Claude Code (hooks) con los scripts de `.claude/helpers/`. Esos scripts, a su vez, leen/escriben en `.claude-flow/` (config y métricas) y en `.swarm/memory.db` (persistencia real vía SQLite/HNSW). El `.mcp.json` es un canal alterno: si se arranca (`ruflo mcp start`), expone las mismas capacidades como herramientas MCP en vez de subcomandos de CLI. Los `agents/` y `skills/` no ejecutan nada por sí mismos: son texto (prompts/instrucciones) que Claude Code interpreta cuando se le pide adoptar ese rol o esa guía.

## 3. Tecnologías

| Componente | Tecnología |
|---|---|
| CLI / runtime | Node.js (paquete npm `ruflo`, alias interno `@claude-flow/cli`) |
| Memoria vectorial | SQLite (`sql.js`), índice HNSW, embeddings ONNX (`Xenova/all-MiniLM-L6-v2`, 384 dim) |
| Aprendizaje/neural | SONA, ReasoningBank, EWC++, Flash Attention, MoE routing (paquetes `@ruvector/attention`, `@ruvector/sona`, `agentdb`, `agentic-flow`) |
| Integración | Model Context Protocol (MCP), hooks de Claude Code (`PreToolUse`, `PostToolUse`, `SessionStart`, etc.) |
| Scripts | Bash (`.sh`), Node CommonJS/ESM (`.cjs`/`.mjs`/`.js`) |
| Config | YAML (`config.yaml`), JSON (`settings.json`, `.mcp.json`), Markdown con frontmatter YAML (agentes/skills) |
| Plataforma detectada | Windows / PowerShell (registrado explícitamente en `settings.json.claudeFlow.platform`) |

No hay stack de aplicación (sin framework web, sin lenguaje de negocio definido) porque el proyecto todavía no tiene código propio.

## 4. Dependencias

No existe `package.json` en la raíz del repo, por lo que **no hay dependencias declaradas a nivel de proyecto**. Las dependencias reales viven en la instalación global de `ruflo` (fuera del repo, en `node_modules` del paquete global), referenciadas indirectamente en `.claude-flow/memory-package.json`:

```json
"distPath": "...\\node_modules\\ruflo\\node_modules\\@claude-flow\\memory\\dist\\index.js"
```

Según `CAPABILITIES.md`, el ecosistema integrado incluye:

| Paquete | Versión | Propósito |
|---|---|---|
| `agentic-flow` | 3.0.0-alpha.1 | Coordinación central + ReasoningBank + Router |
| `agentdb` | 3.0.0-alpha.10 | Base de datos vectorial + 8 controladores |
| `@ruvector/attention` | 0.1.3 | Flash Attention |
| `@ruvector/sona` | 0.1.5 | Aprendizaje neuronal (SONA) |

Integraciones opcionales no instaladas (requieren `claude mcp add ...` explícito): `ruv-swarm`, `flow-nexus`, `agentic-jujutsu`.

**Riesgo asociado**: como no hay lockfile ni `package.json` de proyecto, cualquier `npx ruflo@latest ...` o `npx @claude-flow/cli@latest ...` (patrón usado en TODOS los hooks de agentes) puede resolver una versión distinta en el futuro — no hay pin de versión.

## 5. Flujo de trabajo

Flujo end-to-end tal como está diseñado por el framework (ninguno de estos pasos posteriores a `init` se ha ejecutado todavía en este repo):

1. **`ruflo init [--full|--minimal|wizard]`** → genera `.claude/`, `.claude-flow/`, `.swarm/`, `.mcp.json`, `CLAUDE.md`. (Ya ejecutado.)
2. **`ruflo daemon start`** (opcional) → arranca workers en background (`map`, `audit`, `optimize`) que according to `CLAUDE.md` disparan sesiones headless de `claude` y consumen tokens continuamente. Se autodetiene a las 12h por defecto. **No iniciado.**
3. **`ruflo swarm init --topology hierarchical-mesh --max-agents 15`** → inicializa la topología de coordinación de agentes. **No iniciado.**
4. **`ruflo agent spawn -t <tipo>`** o, desde Claude Code, el propio `Agent`/`Task` tool → instancia un agente con el rol definido en `.claude/agents/**/*.md`.
5. **Hooks automáticos** (vía `.claude/settings.json`) se disparan en cada operación de Claude Code (antes/después de Bash, Write/Edit, al iniciar/terminar sesión, al compactar contexto, al iniciar/terminar subagentes) y llaman a `.claude/helpers/hook-handler.cjs`, que enruta a lógica de: enrutamiento de tareas (`route`), validación de comandos peligrosos (`pre-bash`), aprendizaje post-edición (`post-edit`), restauración/persistencia de sesión (`session-restore`/`session-end`).
6. **Memoria** — los hooks leen/escriben en `.swarm/memory.db` (patrones, trayectorias de aprendizaje, grafo de conocimiento) usando el esquema de `.swarm/schema.sql`.
7. **MCP** (opcional, `autoStart: false`) — si se registra (`claude mcp add ruflo -- npx ruflo@latest mcp start`), expone ~210 herramientas MCP equivalentes a los subcomandos del CLI, para que Claude Code las llame directamente sin pasar por Bash.

Patrón de coordinación multi-agente documentado en `CLAUDE.md`: agentes con `name` explícito se comunican vía `SendMessage` (no polling), en tres patrones — Pipeline (A→B→C→D, para dependencias secuenciales), Fan-out (Lead→[A,B,C]→Lead, para trabajo paralelo independiente) y Supervisor (Lead↔workers, para coordinación continua).

## 6. Agentes existentes

89 archivos bajo `.claude/agents/**`, organizados en 22 categorías de carpeta. Nota: varios agentes están **duplicados** en dos rutas (p. ej. `analysis/analyze-code-quality.md` y `analysis/code-review/analyze-code-quality.md`; `development/dev-backend-api.md` y `development/backend/dev-backend-api.md`) — parecen variantes de organización jerárquica vs. plana del mismo agente generadas por el instalador.

| Categoría | Agentes (ejemplos) | Cant. aprox. |
|---|---|---|
| `core/` | planner | 1 |
| `swarm/` | adaptive-coordinator, hierarchical-coordinator, mesh-coordinator | 3 |
| `consensus/` | byzantine-coordinator, raft-manager, gossip-coordinator, crdt-synchronizer, quorum-manager, security-manager, performance-benchmarker | 7 |
| `github/` | pr-manager, code-review-swarm, issue-tracker, release-manager, repo-architect, multi-repo-swarm, sync-coordinator, workflow-automation, github-modes, swarm-issue, swarm-pr, project-board-sync | 12 |
| `sparc/` | specification, pseudocode, architecture, refinement | 4 |
| `v3/` | security-architect, security-architect-aidefence, aidefence-guardian, injection-analyst, pii-detector, claims-authorizer, ddd-domain-expert, performance-engineer, reasoningbank-learner, swarm-memory-manager, collective-intelligence-coordinator, v3-integration-architect | 12 |
| `flow-nexus/` | swarm, sandbox, authentication, payments, neural-network, app-store, challenges, workflow, user-tools | 9 |
| `sublinear/` | matrix-optimizer, pagerank-analyzer, performance-optimizer, trading-predictor, consensus-coordinator | 5 |
| `optimization/` | benchmark-suite, load-balancer, performance-monitor, resource-allocator, topology-optimizer | 5 |
| `templates/` | coordinator-swarm-init, memory-coordinator, orchestrator-task, sparc-coordinator, implementer-sparc-coder, performance-analyzer, base-template-generator, automation-smart-agent, github-pr-manager | 9 |
| `testing/` | tdd-london-swarm, production-validator | 2 |
| `architecture/`, `development/`, `documentation/`, `devops/`, `data/`, `specialized/`, `analysis/` | arch-system-design, dev-backend-api, docs-api-openapi, ops-cicd-github, data-ml-model, spec-mobile-react-native, analyze-code-quality, code-analyzer | ~10 (con duplicados) |
| `goal/`, `payments/`, `sona/`, `custom/`, `browser/` | agent, agentic-payments, sona-learning-optimizer, test-long-runner, browser-agent (YAML, no MD) | 5 |

**Formato de un agente** (ver `.claude/agents/core/planner.md`): frontmatter YAML con `name`, `type`, `color`, `description`, `capabilities` (lista), `priority`, y bloques `hooks.pre`/`hooks.post` en Bash que llaman al CLI (`npx claude-flow@v3alpha ...`) para buscar patrones aprendidos antes de actuar y guardar el resultado después. El cuerpo Markdown es el prompt de rol/system-prompt del agente. **Importante**: estos hooks embebidos en el frontmatter de los agentes son documentación/plantilla — no se ejecutan automáticamente por Claude Code; solo los hooks declarados en `.claude/settings.json` se disparan de verdad.

## 7. Skills existentes

32 `SKILL.md` bajo `.claude/skills/*/`, agrupables en:

- **AgentDB / memoria** (5): `agentdb-advanced`, `agentdb-learning`, `agentdb-memory-patterns`, `agentdb-optimization`, `agentdb-vector-search`, más `reasoningbank-agentdb`, `reasoningbank-intelligence`, `v3-memory-unification`.
- **Swarm/coordinación** (4): `swarm-advanced`, `swarm-orchestration`, `v3-swarm-coordination`, `v3-mcp-optimization`.
- **GitHub** (5): `github-code-review`, `github-multi-repo`, `github-project-management`, `github-release-management`, `github-workflow-automation`.
- **V3 internals** (7): `v3-cli-modernization`, `v3-core-implementation`, `v3-ddd-architecture`, `v3-integration-deep`, `v3-performance-optimization`, `v3-security-overhaul`, `v3-mcp-optimization`.
- **Flujo de trabajo/metodología** (4): `sparc-methodology`, `pair-programming`, `stream-chain`, `hooks-automation`.
- **Otros** (4): `browser`, `flow-nexus-neural`, `flow-nexus-platform`, `flow-nexus-swarm`, `skill-builder`, `verification-quality`.

**Formato**: frontmatter mínimo (`name`, `description`) + Markdown con secciones "What This Skill Does", "Prerequisites", "Quick Start", ejemplos de comandos. A diferencia de los `agents/`, las skills no tienen bloques de hooks — son guías de referencia que Claude Code puede invocar bajo demanda (vía el mecanismo de Skill tool) cuando la tarea coincide con su descripción. Su relación con `commands/` es 1-a-muchos: cada skill referencia varios subcomandos CLI documentados en `.claude/commands/`.

## 8. Scripts importantes

Todos en `.claude/helpers/` (ninguno se corre solo; los invoca `.claude/settings.json` vía hooks, o se documentan para uso manual):

| Script | Rol |
|---|---|
| `hook-handler.cjs` | Dispatcher central de hooks (route, pre-bash, post-edit, session-restore, session-end, pre-task, post-task, status, notify, compact-*). Lee JSON por stdin desde Claude Code, normaliza el payload, y despacha. Tiene timeout de seguridad global (5s) para nunca colgar una sesión. |
| `auto-memory-hook.mjs` | Import/sync de memoria en `SessionStart`/`Stop`. |
| `statusline.cjs` / `statusline.js` / `statusline-hook.sh` | Generan la línea de estado (statusLine) que ve el usuario en Claude Code. |
| `security-scanner.sh` | Escanea secretos (password/api_key/secret/token/private_key vía regex) y CVEs; se autolimita a ejecutarse cada 30 min (`.scanner-last-run`), guarda resultados en `.claude-flow/security/scan-results.json`. |
| `auto-commit.sh` | Helper de `git add`+`commit`+`push` robusto. **`AUTO_PUSH` por defecto es `true`.** Solo se referencia desde el modo opcional `pair` (`ruflo pair start`), no desde los hooks automáticos de `settings.json` — pero si se activa ese modo, puede pushear a `origin` sin confirmación por commit. |
| `github-safe.js` / `github-setup.sh` | Utilidades para operaciones GitHub "seguras" (wrappers) y setup inicial de integración. |
| `health-monitor.sh`, `daemon-manager.sh`, `worker-manager.sh` | Gestión de procesos en background del daemon (`ruflo daemon start`). |
| `router.js`, `session.js`, `memory.js`, `intelligence.cjs` | Módulos internos que `hook-handler.cjs` importa: enrutamiento de tareas a agentes, gestión de sesión, acceso a memoria, e "inteligencia" (patrones/aprendizaje) con límite de tamaño de archivo al leer JSON (protección adicional contra colgados). |
| `pre-commit`, `post-commit` | Hooks de **git** (no de Claude Code) — se instalarían en `.git/hooks/` si el proyecto los activa; no están activados automáticamente por este análisis. |
| `adr-compliance.sh`, `ddd-tracker.sh` | Verificación de cumplimiento de Architecture Decision Records / Domain-Driven Design, alineado con `settings.json.claudeFlow.adr`/`ddd`. |

## 9. Configuración

- **`.claude/settings.json`**: define 11 tipos de hooks (`PreToolUse` para Bash y Write/Edit/MultiEdit; `PostToolUse` para los mismos; `UserPromptSubmit`; `SessionStart`; `SessionEnd`; `Stop`; `PreCompact` ×2 variantes; `SubagentStart`; `SubagentStop`; `Notification`), todos apuntando a `hook-handler.cjs` (o a `auto-memory-hook.mjs` para import/sync de memoria) con timeouts individuales (3s–15s) y fallback a `%USERPROFILE%\.claude\helpers\` si el helper local no existe. Define `permissions.allow` (`Bash(npx @claude-flow*)`, `Bash(npx claude-flow*)`, `Bash(node .claude/*)`, `mcp__claude-flow__*`) y `permissions.deny` (`Read(./.env)`, `Read(./.env.*)`). Fija `model: claude-sonnet-5` y un bloque `claudeFlow` extenso con topología de swarm (`hierarchical-mesh`, 15 agentes), memoria (`hybrid`, HNSW, learning bridge, memory graph, agent scopes), daemon (workers `map`/`audit`/`optimize`, `autoStart: false`), aprendizaje (retención 24h corto plazo / 30d largo plazo), y seguridad (`autoScan: true`, `scanOnEdit: true`, `cveCheck: true`).
- **`.mcp.json`**: registra un único servidor MCP `claude-flow` que se arranca con `cmd /c npx -y ruflo@latest mcp start`, variables de entorno (`CLAUDE_FLOW_MODE=v3`, `CLAUDE_FLOW_TOPOLOGY=hierarchical-mesh`, `CLAUDE_FLOW_MAX_AGENTS=15`, `CLAUDE_FLOW_MEMORY_BACKEND=hybrid`), `autoStart: false` (no se conecta solo).
- **`.claude-flow/config.yaml`**: espejo del bloque `claudeFlow` de `settings.json` pero en YAML, leído por el runtime CLI directamente (no por Claude Code). Incluye parámetros finos: `confidenceDecayRate: 0.005`, `accessBoostAmount: 0.03`, `pageRankDamping: 0.85`, `maxNodes: 5000`, puerto MCP `3000`.
- **`.claude-flow/security/audit-status.json`**: estado inicial `PENDING`, 0 CVEs revisados — **la auditoría de seguridad del propio framework nunca se ha corrido**.
- **`.gitignore` (raíz, creado en la sesión previa)**: excluye `node_modules/`, `.claude-flow/{data,logs,sessions,neural}/`, `*.log`, `*.tmp`, `.swarm/memory.db`. Coincide con el `.claude-flow/.gitignore` interno (que cubre lo mismo dentro de esa carpeta).

## 10. Convenciones

- **Nomenclatura de archivos**: kebab-case en todas las carpetas (`hierarchical-coordinator.md`, `security-scanner.sh`).
- **Frontmatter de agentes**: YAML con `name`, `type`, `color` (hex), `description`, `capabilities` (array), `priority` (`low|medium|high|critical`), `hooks.pre`/`hooks.post` (bloques Bash de ejemplo).
- **Frontmatter de skills**: solo `name` + `description` (sin capacidades ni hooks).
- **Commits**: `CLAUDE.md` prohíbe explícitamente añadir un trailer `Co-Authored-By` a los commits del usuario salvo que `settings.json` tenga `attribution.commit` configurado (no está configurado en este repo) — es decir, la convención activa hoy es **no** añadir esa firma.
- **Reglas generales de `CLAUDE.md`** (aplican a cualquier trabajo futuro en este repo): no crear archivos salvo necesidad real; preferir editar sobre crear; no crear documentación salvo pedido explícito; nunca guardar archivos de trabajo/tests en la raíz (usar `/src`, `/tests`, `/docs`, `/config`, `/scripts`); leer siempre un archivo antes de editarlo; nunca commitear secretos/`.env`; mantener archivos bajo 500 líneas; validar entradas en los límites del sistema.
- **Convención de swarming**: `CLAUDE.md` indica cuándo SÍ conviene levantar un swarm (3+ archivos, features nuevas, refactors cross-módulo, cambios de API, seguridad, performance) y cuándo NO (ediciones de un archivo, fixes de 1-2 líneas, docs, config, preguntas).

## 11. Riesgos

1. **Sin código de aplicación ni tests**: todo lo generado es configuración/orquestación; no hay nada que "funcione" todavía como producto. Cualquier expectativa de tener una app corriendo es prematura.
2. **`AUTO_PUSH=true` por defecto en `auto-commit.sh`**: si en algún momento se activa el modo `pair` (`ruflo pair start`) sin revisar esta variable, el framework puede hacer `git push` automático a `origin/main` sin pedir confirmación por commit — contradice el hábito de confirmar antes de acciones que afectan el repo remoto.
3. **Llamadas de red no solicitadas en `hook-handler.cjs`**: la función `spawnDetachedFunnelRefresh()`/`spawnDetachedAdvisorRefresh()` lanza procesos `npx`/`node` desprendidos (detached) en cada `SessionStart` para refrescar un "funnel" de mensajes promocionales y un "advisor" — con timeout de red de ~4s y caché local. Además, `firstRunAutoEnableIfEligible()` **activa automáticamente "spinner verbs" (texto promocional en el spinner) en el primer uso**, sin pedir consentimiento explícito (solo avisa por stderr después de activarlo), y escribe un marcador en `~/.ruflo/first-run-enabled.json` fuera del repo. Los "announcements" sí son opt-in (requieren `RUFLO_AUTO_ENABLE_ANNOUNCEMENTS=1`). Esto es telemetría/marketing de terceros ejecutándose en segundo plano dentro del entorno de Claude Code.
4. **Validación de comandos peligrosos muy limitada**: el hook `pre-bash` solo bloquea 4 patrones literales (`rm -rf /`, `format c:`, `del /s /q c:\`, fork bomb). No es una sandbox real; cualquier otro comando destructivo pasa sin aviso del propio framework (la responsabilidad de confirmar sigue recayendo en Claude Code/el usuario, no en este hook).
5. **Sin pineo de versión**: todos los hooks y helpers invocan `npx claude-flow@v3alpha` o `npx ruflo@latest`/`@claude-flow/cli@latest` — sin lockfile de proyecto, una actualización del paquete aguas arriba puede cambiar comportamiento sin que el repo lo refleje.
6. **Auditoría de seguridad propia pendiente**: `.claude-flow/security/audit-status.json` está en `PENDING` con 0 CVEs revisados — el propio framework no se ha auditado a sí mismo todavía en este entorno.
7. **Duplicación de agentes**: varios `.md` de agentes existen dos veces en rutas distintas (plana y jerárquica) con — hay que verificar en el futuro — contenido idéntico o divergente; si divergen, Claude Code podría recibir definiciones inconsistentes según qué ruta se referencie.
8. **Daemon consume tokens si se activa**: `CLAUDE.md` advierte que `ruflo daemon start` lanza sesiones headless de `claude` en intervalos, consumiendo tokens de forma continua (autolímite de 12h salvo `--ttl 0`) — riesgo de costo si se activa sin supervisión.
9. **Permisos amplios pre-aprobados**: `settings.json.permissions.allow` autoriza sin preguntar cualquier `Bash(npx @claude-flow*)`, `Bash(npx claude-flow*)`, `Bash(node .claude/*)` y toda herramienta `mcp__claude-flow__*` — es una superficie amplia de auto-aprobación para un framework de terceros.

## 12. Recomendaciones

- Antes de construir la aplicación real, decidir explícitamente **qué stack de negocio** va sobre este andamiaje (el repo hoy es 100% tooling de Claude Code, cero producto).
- Revisar/pinear versión de `ruflo` usada en hooks (o vendorizar el CLI) para evitar drift de comportamiento por actualizaciones silenciosas de `npx ...@latest`.
- Si se va a usar el modo `pair`, exportar `AUTO_PUSH=false` explícitamente antes de activarlo, salvo que se quiera push automático consciente.
- Considerar `RUFLO_NO_AUTO_ENABLE=1` (o al menos `RUFLO_NO_AUTO_ENABLE_SPINNER=1`) como variable de entorno si no se desea la activación automática de contenido promocional en el primer uso.
- Ejecutar `ruflo security scan` / `ruflo doctor --fix` antes de empezar a construir, para resolver el estado `PENDING` de auditoría y detectar problemas de instalación temprano.
- Deduplicar los archivos de agentes repetidos (plano vs. jerárquico) o documentar cuál ruta es la canónica.
- Mantener `.gitignore` sincronizado si se cambian rutas de runtime (`.claude-flow/data`, `logs`, `sessions`, `neural`, `.swarm/memory.db` ya están cubiertos).
- No activar `ruflo daemon start` salvo que se entienda y acepte el consumo continuo de tokens que implica.

## 13. Archivos críticos

| Archivo | Por qué es crítico |
|---|---|
| `CLAUDE.md` | Único archivo que Claude Code carga siempre; define reglas de comportamiento, convenciones y patrones de swarm para todo el repo. |
| `.claude/settings.json` | Controla qué hooks se disparan, qué permisos están pre-aprobados/denegados, y toda la config de `claudeFlow` (swarm, memoria, daemon, seguridad). Un error aquí puede romper hooks silenciosamente o abrir permisos no deseados. |
| `.mcp.json` | Define qué servidor MCP se registra y con qué variables de entorno; controla la superficie de herramientas MCP disponibles. |
| `.claude-flow/config.yaml` | Config real que lee el runtime del CLI `ruflo` (topología, memoria, rutas de persistencia, puerto MCP). |
| `.swarm/schema.sql` | Esquema de la base de memoria; cualquier cambio manual puede romper la compatibilidad con `memory.db` existente o con futuras versiones del CLI. |
| `.claude/helpers/hook-handler.cjs` | Dispatcher central de todos los hooks; si falla o se corrompe, los hooks de sesión/edición dejan de funcionar (aunque tiene timeouts de seguridad para no colgar Claude Code). |
| `.gitignore` (raíz y `.claude-flow/.gitignore`) | Evita commitear runtime binario (`memory.db`) y datos volátiles (`data/`, `logs/`, `sessions/`, `neural/`). |

## 14. Carpetas críticas

| Carpeta | Gestión |
|---|---|
| `.claude-flow/data/`, `.claude-flow/logs/`, `.claude-flow/sessions/`, `.claude-flow/neural/` | **100% runtime, gestionadas automáticamente por `ruflo`.** Vacías hoy, excluidas de git. No editar a mano. |
| `.claude-flow/metrics/`, `.claude-flow/security/` | Generadas/actualizadas por los workers del CLI (`audit`, `optimize`, etc.); versionadas como semilla inicial pero se espera que el CLI las sobrescriba. |
| `.swarm/` (excepto `schema.sql`) | `memory.db` es runtime puro (SQLite), regenerable, excluido de git. |
| `.claude/helpers/` | Generada/actualizada por `ruflo init`/`ruflo init upgrade`; se puede editar pero un `upgrade` futuro puede sobrescribirla — mejor tratarla como gestionada por la herramienta salvo necesidad puntual. |
| `.claude/agents/`, `.claude/commands/`, `.claude/skills/` | Generadas por `ruflo init --full`; son plantillas del framework, no contenido del proyecto. Personalizarlas es válido pero hay que asumir que un `init --force`/`upgrade` las puede regenerar. |

## 15. Buenas prácticas

- El propio `.claude-flow/.gitignore` y el `.gitignore` raíz ya separan correctamente config versionable (schema, config.yaml, settings) de runtime volátil (data, logs, sessions, memory.db) — mantener ese patrón al añadir nuevas carpetas de runtime.
- `CLAUDE.md` fija límites sanos por defecto (archivos <500 líneas, no crear docs sin pedido explícito, validar en límites del sistema) — seguirlos también para el código de aplicación que se añada.
- El hook `pre-bash` y el `security-scanner.sh` son una primera línea de defensa razonable, pero no sustituyen revisión humana antes de comandos destructivos o pushes — tratarlos como complemento, no como garantía.
- Antes de activar `daemon`, `pair` (auto-commit/auto-push) o el registro MCP, entender explícitamente qué proceso en background queda corriendo y su costo (tokens, red, escritura en el repo).
- Ejecutar `ruflo doctor --fix` y `ruflo security scan` como parte del "primer arranque real" del proyecto, antes de construir sobre el andamiaje.
