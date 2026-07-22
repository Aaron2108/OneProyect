# TASKS.md

> Creado: 2026-07-22

## Sprint 0 — Bootstrap (actual)

Tareas reales y accionables ahora, sin depender de la descripción del producto:

- [x] Instalar y auditar el framework `ruflo` (`REPOSITORY_ANALYSIS.md`).
- [x] Generar documentación de bootstrap (`PROJECT.md`, `VISION.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `SECURITY.md`, `ROADMAP.md`, `DECISIONS.md`, `AI_RULES.md`, `AGENTS.md`, `README.md`).
- [ ] Ejecutar `ruflo doctor --fix` y revisar cualquier problema de instalación.
- [ ] Ejecutar `ruflo security scan` para resolver el estado `PENDING` de `.claude-flow/security/audit-status.json`.
- [x] Recibir del propietario la **descripción completa del proyecto** (WhatsFlow AI).

## Sprint 1 — MVP de WhatsFlow AI

Backlog concreto para arrancar el desarrollo. Cada bloque indica qué agente(s) existentes de `.claude/agents/` conviene usar (ver `AGENTS.md`) en vez de definir roles nuevos.

- [x] Recibir descripción completa del proyecto (WhatsFlow AI) y confirmar decisión crítica de arquitectura (Meta Cloud API oficial).
- [x] Completar `VISION.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md` §2, `DATABASE.md` §2, `API.md` §2, `ROADMAP.md` con el negocio real.
- [x] Crear esqueleto NestJS + TypeScript (`package.json`, tsconfig, `nest-cli.json`, `src/` con config/prisma/health, `tests/`), ORM Prisma con el esquema de las 8 entidades, `docker-compose.yml` (Postgres + Redis) y `.env.example`. Verificado: `npm install`, `prisma generate`, `prisma validate`, `nest build` y `npm test` pasan (2026-07-22).
- [ ] Registrar la app en Meta for Developers, configurar el número de WhatsApp Business y el endpoint de verificación del webhook. — tarea de configuración externa, sin agente asociado (requiere cuenta/credenciales del propietario).
- [~] Levantar PostgreSQL + Redis (local/dev) y crear las migraciones iniciales del modelo de datos (`tenants`, `users`, `contacts`, `conversations`, `messages`, `appointments`, `reminders`, `contact_consent`). **Sin `pgvector`/`ai_context_memory` en el MVP** (diferido a Fase 4). — `docker-compose.yml` y `prisma/schema.prisma` ya definidos y validados; **falta correr la migración real** (`npm run prisma:migrate`), bloqueado porque el engine de Docker Desktop no estaba disponible en la última verificación — reintentar cuando Docker esté arriba. — agente: `dev-backend-api`.
- [x] Implementar el endpoint de webhook (`GET`/`POST /webhooks/whatsapp`) con verificación de firma HMAC (X-Hub-Signature-256), encolado async vía BullMQ y worker que persiste contacto/conversación/mensaje con dedup. Verificado end-to-end (GET verify, POST firmado → persistencia real en BD) + 10 tests (2026-07-22). — agente: `dev-backend-api`. Mapeo tenant↔número vía `tenant.whatsappPhoneNumberId`.
- [x] Integrar Claude con tool-calling básico (responder con contexto + crear cita/recordatorio/actualizar contacto). Módulo `ai/` con bucle de tool-calling, guarda de costo (RF-NFR: máx. llamadas por conversación/hora) y respuesta conectada al worker (solo si `handledBy=AI`, RF-11). **Seguridad**: las herramientas NO exponen `tenantId`/`contactId` — se inyectan desde el contexto de confianza, así el texto no confiable del cliente no puede redirigir acciones a otro contacto/tenant (mitiga la preocupación de `injection-analyst`). Modelo por defecto: Haiku (barato). 20 tests. Falta el envío real de la respuesta vía Meta (módulo de envío). — agente: `dev-backend-api`.
- [ ] CRUD de contactos y bandeja de conversaciones (API + panel mínimo). — agente: `dev-backend-api`; documentación de los endpoints con `docs-api-openapi` (`documentation/docs-api-openapi`).
- [ ] Manejo de la ventana de 24h + plantillas de Meta (RF-10): detectar si un mensaje proactivo cae dentro/fuera de la ventana y usar plantilla pre-aprobada cuando corresponda; incluye dar de alta al menos una plantilla en Meta para los recordatorios. — agente: `dev-backend-api`; validar cumplimiento con `security-architect`.
- [ ] Handoff / escalación a humano (RF-11): estado "en manos de un humano" por conversación que silencia la respuesta automática de la IA, con disparadores (petición del cliente, baja confianza, marca manual). — agente: `dev-backend-api`.
- [~] Opt-in del contacto (RF-12): tabla `contact_consent` creada; el worker registra consentimiento `GRANTED` al recibir el primer mensaje entrante. Falta la lógica de verificación de consentimiento *antes* de enviar mensajes proactivos (se conecta con el módulo de envío/recordatorios). — agente: `dev-backend-api`.
- [ ] Guarda de costo/latencia de IA (NFR): límite configurable de llamadas a Claude por conversación/tenant en una ventana de tiempo, y deduplicación de eventos de estado (entregas/lecturas) que Meta reenvía para no reprocesarlos con IA. — agente: `dev-backend-api`; revisar umbrales con `performance-engineer` (`v3/performance-engineer`).
- [ ] Autenticación JWT con scope de tenant. — agente: `dev-backend-api`; revisión con `security-architect`.
- [ ] Escribir tests de los flujos críticos (recepción de webhook, tool-calling del agente, aislamiento multi-tenant). — agentes: `tdd-london-swarm` (`testing/tdd-london-swarm`) y `production-validator` (`testing/production-validator`).
- [ ] Revisión de código antes de cada merge relevante. — usar el tipo genérico `reviewer` (ver `CLAUDE.md`/`CAPABILITIES.md`; no tiene archivo `.md` propio en el catálogo, es un tipo base soportado directamente por `ruflo agent spawn -t reviewer`).
- [ ] Decidir si se activa `daemon`, modo `pair` o el servidor MCP para el propio desarrollo, y con qué guardas (ver `SECURITY.md`) — no confundir con infraestructura de producto (ver `ARCHITECTURE.md` §2, nota final).
- [x] Deduplicar los 7 pares de agentes repetidos identificados en `AGENTS.md` (eliminadas las rutas anidadas, conservada la plana como canónica — 2026-07-22).
- [ ] Ejecutar `ruflo doctor --fix` y `ruflo security scan` antes de considerar el entorno de desarrollo estable.

## Backlog no priorizado (fases 2-5)

Ver `docs/ROADMAP.md` para el desglose por fase. No se convierten en tareas concretas hasta que la fase correspondiente esté confirmada con el negocio.
