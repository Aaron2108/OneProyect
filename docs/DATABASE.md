# DATABASE.md

> Creado: 2026-07-22

## 1. Base de datos de infraestructura del framework (definida)

El framework `ruflo` mantiene su propia base de datos SQLite en `.swarm/memory.db` (runtime, excluida de git), con esquema versionado en `.swarm/schema.sql` (schema_version 3.0.0, backend "hybrid", WAL mode). **Esta base de datos es del framework, no del negocio** — almacena memoria, patrones aprendidos y estado de sesiones del propio sistema multi-agente, no datos de la aplicación futura.

Tablas principales:

| Tabla | Propósito |
|---|---|
| `memory_entries` | Almacén principal de memoria (semantic/episodic/procedural/working/pattern), con embedding vectorial (384 dim, modelo `Xenova/all-MiniLM-L6-v2`) para búsqueda semántica. |
| `patterns` | Patrones aprendidos con scoring de confianza (0–1), decaimiento temporal (half-life 30 días) y versionado. |
| `pattern_history` | Historial de evolución de cada patrón (creado/actualizado/éxito/fallo/decay/merge/split). |
| `trajectories` / `trajectory_steps` | Trayectorias de aprendizaje (integración SONA): pasos, recompensas, veredicto final. |
| `migration_state` | Seguimiento de migraciones (p. ej. v2→v3) con soporte de resume. |
| `sessions` | Persistencia de sesiones de Claude Code/swarm (estado, rama, tareas completadas). |
| `vector_indexes` | Metadatos de índices HNSW (dimensiones, parámetros, cuantización). Preconfigurados: `default` y `patterns`, ambos a 384 dimensiones — **cualquier embedding con otra dimensión rompe las inserciones** (issue conocido #1947 referenciado en el propio schema). |
| `graph_edges` | Grafo de conocimiento unificado (ADR-130): nodos con prefijo de dominio (`mem:`, `agent:`, `task:`, `entity:`, `span:`, `pattern:`), aristas con confianza y decaimiento temporal. |
| `metadata` | Clave/valor de estado del esquema (versión, flags de features habilitadas). |

**Esta base de datos no se modifica manualmente.** El propio esquema es gestionado por `ruflo`; cambios deben venir de actualizaciones del framework, no de ediciones directas.

## 2. Modelo de datos de negocio — WhatsFlow AI (Fase 1 / MVP)

**Motor**: PostgreSQL. **Sin `pgvector` en el MVP** — la memoria de contexto del agente de IA se resuelve pasando el historial reciente de la conversación dentro de la ventana de contexto de Claude, sin embeddings ni búsqueda vectorial. La memoria vectorial (embeddings, recuerdo entre conversaciones, aprendizaje de patrones del negocio) se difiere a **Fase 4** (ver `ROADMAP.md` y `DECISIONS.md`). Ver justificación en `ARCHITECTURE.md` §2.

**Multi-tenancy (MVP)**: esquema compartido — todas las tablas de negocio llevan `tenant_id`, con índice y con todo acceso filtrado por tenant a nivel de aplicación (y, si NestJS/TypeORM lo permite sin fricción, también a nivel de row-level security en Postgres). Decisión de arquitecto, revisable en Fase 2 si el volumen justifica esquema-por-tenant (ver `DECISIONS.md`).

**Entidades mínimas del MVP:**

| Entidad | Propósito | Relaciones clave |
|---|---|---|
| `tenants` | Una fila por empresa cliente (PyME) | Raíz de todo el aislamiento multi-tenant |
| `users` | Miembros del equipo de un tenant que usan el panel | `tenant_id` → `tenants` |
| `contacts` | Clientes finales de la PyME (quienes escriben por WhatsApp) | `tenant_id` → `tenants` |
| `conversations` | Una conversación activa por contacto | `tenant_id`, `contact_id` |
| `messages` | Cada mensaje individual (entrante/saliente) de una conversación | `conversation_id` |
| `appointments` | Citas programadas | `tenant_id`, `contact_id`, fecha/hora |
| `reminders` | Recordatorios (de seguimiento o ligados a una cita) | `tenant_id`, `contact_id`, `appointment_id` (nullable) |
| `interaction_log` | Historial consolidado de eventos por contacto (mensajes, citas creadas, recordatorios disparados) — puede derivarse por consulta en vez de tabla propia; decidir en Sprint 1 según necesidad real de rendimiento | `tenant_id`, `contact_id` |
| `contact_consent` | Estado de opt-in del contacto para recibir mensajes (requisito de Meta, ver `REQUIREMENTS.md` RF-12) — fecha y origen del consentimiento | `tenant_id`, `contact_id` |

> **Diferido a Fase 4 (no en el MVP)**: `ai_context_memory` (resumen + embedding `pgvector` por conversación, para recuerdo más allá de la ventana de mensajes recientes). En el MVP el contexto se arma con el historial reciente directamente, sin tabla de embeddings.

**Relaciones básicas**: `tenants 1—N users`, `tenants 1—N contacts`, `contacts 1—N conversations`, `conversations 1—N messages`, `contacts 1—N appointments`, `contacts 1—N reminders`, `appointments 1—N reminders` (opcional), `contacts 1—1 contact_consent`.

**Migraciones de aplicación**: gestionadas por el ORM/herramienta que se adopte con NestJS (p. ej. TypeORM o Prisma — a confirmar en Sprint 1, no bloquea el resto del diseño).

**Retención/privacidad**: los datos en `contacts`/`messages` son PII de clientes finales de terceros (las PyMEs), no del propio tenant que opera el software — ver `SECURITY.md` para controles de acceso y retención.

## 3. Relación entre ambas bases de datos

La base de datos de negocio (sección 2) es independiente de `.swarm/memory.db`. No se debe reutilizar el esquema del framework para almacenar datos de producto; son capas separadas con propósitos distintos (orquestación de agentes vs. dominio de negocio).
