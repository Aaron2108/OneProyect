# ARCHITECTURE.md

> Creado: 2026-07-22 · Arquitectura de la aplicación WhatsFlow AI.

## Arquitectura de la aplicación — WhatsFlow AI (Fase 1 / MVP)

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

**Estructura de código en `/src`**: **módulos de NestJS por feature** con separación ligera controlador → servicio → repositorio (Prisma). La estructura hexagonal estricta (domain/application/infrastructure/presentation en capas separadas) se difiere: para el MVP añade boilerplate sin valor de validación (mismo criterio que llevó a diferir `pgvector`, ver `DECISIONS.md`). Módulos implementados: `config/` (configuración tipada + validación de entorno), `prisma/` (cliente global), `health/` (health check), `auth/` (JWT con scope de tenant), `whatsapp/` (webhook + firma HMAC + cola + worker + envío Meta), `ai/` (agente Claude + tool-calling + proveedor mock), `contacts/`, `conversations/`, `appointments/`, `reminders/`. El panel web mínimo se sirve como estático desde `public/`.

**Seguridad transversal**: el `tenantId` (y en la IA también el `contactId`) proviene siempre del contexto de confianza (token JWT / contexto de la conversación), nunca de la entrada del cliente — ningún endpoint ni herramienta de IA puede operar sobre datos de otro tenant.

Cualquier decisión de arquitectura se registra en [`DECISIONS.md`](DECISIONS.md).
