# ARCHITECTURE.md

> Creado: 2026-07-22

## 1. Arquitectura del framework (definida)

El repositorio hoy es 100% infraestructura de orquestación provista por `ruflo` v3.32.9 (Claude-Flow V3). Detalle completo en [`REPOSITORY_ANALYSIS.md`](REPOSITORY_ANALYSIS.md#2-arquitectura) — aquí solo el resumen operativo:

```
CLAUDE.md        → reglas de comportamiento que Claude Code carga siempre
.claude/          → integración: settings.json (hooks/permisos), agents/, commands/, skills/, helpers/
.claude-flow/     → runtime V3: config.yaml, métricas, estado de seguridad
.swarm/           → persistencia: schema.sql (versionado) + memory.db (runtime, SQLite+HNSW)
.mcp.json         → servidor MCP opcional (~210 herramientas), autoStart: false
```

Principio de capas: `CLAUDE.md` define comportamiento → `.claude/settings.json` conecta eventos de Claude Code con scripts en `.claude/helpers/` → esos scripts leen/escriben `.claude-flow/` (config/métricas) y `.swarm/memory.db` (memoria real) → `.mcp.json` expone las mismas capacidades como herramientas MCP si se activa.

**Esta capa no se modifica en el bootstrap** (regla explícita del usuario) y no debe alterarse salvo mediante los comandos propios del framework (`ruflo init upgrade`, etc.).

## 2. Arquitectura de la aplicación — WhatsFlow AI (Fase 1 / MVP)

**Tipo de aplicación**: API backend + panel web para el equipo de cada empresa cliente (multi-tenant SaaS). El canal de comunicación con el cliente final es WhatsApp, no una app propia.

**Estilo arquitectónico**: monolito modular (no microservicios) para el MVP — módulos separados por dominio dentro de un mismo servicio desplegable, para minimizar complejidad operativa mientras se valida el negocio. Revisar en Fase 2 si algún módulo (p. ej. el motor de IA) justifica extraerse como servicio independiente.

**Stack decidido** (decisiones de arquitecto, revisables — ver `DECISIONS.md`):

| Capa | Elección |
|---|---|
| Lenguaje/runtime | Node.js + TypeScript |
| Framework backend | NestJS (arquitectura modular por diseño) |
| Base de datos | PostgreSQL — **sin `pgvector` en el MVP** (memoria de conversación vía historial reciente en la ventana de contexto de Claude; embeddings/memoria vectorial se difieren a Fase 4, ver `DECISIONS.md`) |
| Colas/async | Redis + BullMQ |
| Canal de mensajería | Meta Cloud API (WhatsApp Business), oficial — **confirmado por el propietario** |
| Motor de IA | Claude (Anthropic), con tool-calling para ejecutar acciones (citas, recordatorios, actualización de contactos) |
| Hosting (MVP) | Contenedor Docker sobre un PaaS (Railway/Render/Fly.io — proveedor concreto sin decidir aún) |

**Diagrama de componentes (MVP):**

```
Meta Cloud API (WhatsApp) ⇄ Webhook receiver (NestJS)
                                     │
                                     ▼
                         Cola Redis/BullMQ (procesamiento async)
                                     │
                                     ▼
                     Servicio de Conversación (NestJS)
                        │                        │
                        ▼                        ▼
          Motor de Agente IA (Claude          PostgreSQL
          + tool-calling)  ────────────────►  (tenants, contactos,
                                               conversaciones, citas,
                                               recordatorios)
                                     │
                                     ▼
                     API REST (autenticación por tenant)
                                     │
                                     ▼
                    Panel web para el equipo humano
```

El webhook responde de inmediato a Meta y encola el mensaje; el procesamiento real (contexto + IA + tool-calling + persistencia) ocurre de forma asíncrona vía BullMQ, para no arriesgar timeouts/reintentos de Meta.

**Estructura de código en `/src`** (adoptada en Sprint 1): **módulos de NestJS por feature** con separación ligera controlador → servicio → repositorio (Prisma). La estructura hexagonal estricta (domain/application/infrastructure/presentation en capas separadas) se difiere: para el MVP añade boilerplate sin valor de validación (mismo criterio que llevó a diferir `pgvector`, ver `DECISIONS.md`). Base ya creada: `src/config/` (configuración tipada + validación de entorno), `src/prisma/` (cliente global), `src/health/` (health check). Módulos de negocio a crear: `whatsapp/` (webhook + cliente Meta), `ai/` (agente Claude + tool-calling), `contacts/`, `conversations/`, `appointments/`, `reminders/`, `auth/`, `tenants/`.

**Importante — no confundir dos capas distintas**: el framework `ruflo`/Claude-Flow (sección 1 de este documento) es la capa que **orquesta el desarrollo** de WhatsFlow AI dentro de Claude Code (agentes, memoria, swarm) — **no forma parte del runtime de producción** del SaaS. En producción, WhatsFlow AI corre como el stack descrito arriba, sin dependencia de `ruflo`/`.claude-flow`/`.swarm`. Esta distinción evita activar por error infraestructura de desarrollo (daemon, MCP, swarm) como si fuera infraestructura de producto.

## 3. Relación entre ambas capas

La arquitectura de aplicación (sección 2) se construirá **dentro de** `/src`, `/tests`, `/config`, `/scripts`, dejando intacta la capa de orquestación de la sección 1. Los agentes de `.claude/agents/` (ver [`AGENTS.md`](AGENTS.md)) actuarán sobre el código de `/src` según las convenciones que se definan aquí una vez elegido el stack.

Cualquier decisión de arquitectura de aplicación se registra en [`DECISIONS.md`](DECISIONS.md).
