# DATABASE.md

> Creado: 2026-07-22

## Modelo de datos de negocio — WhatsFlow AI (Fase 1 / MVP)

**Motor**: PostgreSQL. **Sin `pgvector` en el MVP** — la memoria de contexto del agente de IA se resuelve pasando el historial reciente de la conversación dentro de la ventana de contexto de Claude, sin embeddings ni búsqueda vectorial. La memoria vectorial entre conversaciones ya se implementó en **Fase 4** (`ai_context_memory`, ver más abajo); el análisis predictivo y el aprendizaje de patrones del negocio siguen diferidos — necesitan volumen real de conversaciones para tener valor (ver `ROADMAP.md` y `DECISIONS.md`). Ver justificación original en `ARCHITECTURE.md`.

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

**Fase 4 — memoria de contexto:**

| Entidad | Propósito | Relaciones clave |
|---|---|---|
| `ai_context_memory` | Resumen (cifrado) + embedding `vector(512)` por contacto, generado al cerrar una conversación; la IA recupera los más similares al responder | `tenant_id`, `contact_id`, `conversation_id` (nullable) |
| `business_profiles` | Perfil de negocio configurable por el OWNER (apartado "Agente IA"): horarios, servicios, políticas, tono, instrucciones adicionales — texto libre, sin cifrar (no es PII de clientes finales) | `tenant_id` (1—1 con `tenants`) |

> **Aún diferido a Fase 4**: análisis predictivo de oportunidades de venta y aprendizaje de patrones específicos del negocio — necesitan volumen real de datos históricos por tenant, no solo la infraestructura de memoria (ver `ROADMAP.md`). Subida de documentos/catálogos largos con búsqueda semántica también queda para cuando el propietario la pida explícitamente.

**Relaciones básicas**: `tenants 1—N users`, `tenants 1—N contacts`, `contacts 1—N conversations`, `conversations 1—N messages`, `contacts 1—N appointments`, `contacts 1—N reminders`, `appointments 1—N reminders` (opcional), `contacts 1—1 contact_consent`, `tenants 1—1 business_profiles`.

**Migraciones de aplicación**: gestionadas por **Prisma** (ORM adoptado en Sprint 1, ver `DECISIONS.md`). El esquema vive en `prisma/schema.prisma` y las migraciones se generan con `npm run prisma:migrate`. Los nombres de tabla del esquema Prisma coinciden con los de esta sección (`tenants`, `users`, `contacts`, `conversations`, `messages`, `appointments`, `reminders`, `contact_consent`).

**Retención/privacidad**: los datos en `contacts`/`messages` son PII de clientes finales de terceros (las PyMEs), no del propio tenant que opera el software — ver `SECURITY.md` para controles de acceso y retención.
