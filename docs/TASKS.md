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
- [ ] Crear estructura `/src`, `/tests`, `/config`, `/scripts` (esqueleto NestJS). — agentes: `system-architect` (o `architecture/arch-system-design` del catálogo) para la estructura inicial; `dev-backend-api` (`development/dev-backend-api`) para el scaffolding del proyecto NestJS.
- [ ] Registrar la app en Meta for Developers, configurar el número de WhatsApp Business y el endpoint de verificación del webhook. — tarea de configuración externa, sin agente asociado (requiere cuenta/credenciales del propietario).
- [ ] Levantar PostgreSQL + Redis (local/dev) y crear las migraciones iniciales del modelo de datos (`tenants`, `users`, `contacts`, `conversations`, `messages`, `appointments`, `reminders`, `contact_consent`). **Sin `pgvector`/`ai_context_memory` en el MVP** (diferido a Fase 4, ver `DECISIONS.md`). — agente: `dev-backend-api`; revisar modelado con `ddd-domain-expert` (`v3/ddd-domain-expert`) dado que el framework ya trackea dominios (`claudeFlow.ddd` en `settings.json`).
- [ ] Implementar el endpoint de webhook (`GET`/`POST /webhooks/whatsapp`) con encolado async vía BullMQ. — agente: `dev-backend-api`.
- [ ] Integrar Claude con tool-calling básico (responder con contexto + poder crear cita/recordatorio/actualizar contacto). — agente: `dev-backend-api`; revisión de seguridad de las herramientas expuestas al LLM con `security-architect` (`v3/security-architect`) y `injection-analyst` (`v3/injection-analyst`), dado que el agente de IA recibe texto de usuarios externos no confiables.
- [ ] CRUD de contactos y bandeja de conversaciones (API + panel mínimo). — agente: `dev-backend-api`; documentación de los endpoints con `docs-api-openapi` (`documentation/docs-api-openapi`).
- [ ] Manejo de la ventana de 24h + plantillas de Meta (RF-10): detectar si un mensaje proactivo cae dentro/fuera de la ventana y usar plantilla pre-aprobada cuando corresponda; incluye dar de alta al menos una plantilla en Meta para los recordatorios. — agente: `dev-backend-api`; validar cumplimiento con `security-architect`.
- [ ] Handoff / escalación a humano (RF-11): estado "en manos de un humano" por conversación que silencia la respuesta automática de la IA, con disparadores (petición del cliente, baja confianza, marca manual). — agente: `dev-backend-api`.
- [ ] Opt-in del contacto (RF-12): tabla `contact_consent` + lógica de registro/consulta de consentimiento antes de mensajes proactivos. — agente: `dev-backend-api`.
- [ ] Guarda de costo/latencia de IA (NFR): límite configurable de llamadas a Claude por conversación/tenant en una ventana de tiempo, y deduplicación de eventos de estado (entregas/lecturas) que Meta reenvía para no reprocesarlos con IA. — agente: `dev-backend-api`; revisar umbrales con `performance-engineer` (`v3/performance-engineer`).
- [ ] Autenticación JWT con scope de tenant. — agente: `dev-backend-api`; revisión con `security-architect`.
- [ ] Escribir tests de los flujos críticos (recepción de webhook, tool-calling del agente, aislamiento multi-tenant). — agentes: `tdd-london-swarm` (`testing/tdd-london-swarm`) y `production-validator` (`testing/production-validator`).
- [ ] Revisión de código antes de cada merge relevante. — usar el tipo genérico `reviewer` (ver `CLAUDE.md`/`CAPABILITIES.md`; no tiene archivo `.md` propio en el catálogo, es un tipo base soportado directamente por `ruflo agent spawn -t reviewer`).
- [ ] Decidir si se activa `daemon`, modo `pair` o el servidor MCP para el propio desarrollo, y con qué guardas (ver `SECURITY.md`) — no confundir con infraestructura de producto (ver `ARCHITECTURE.md` §2, nota final).
- [x] Deduplicar los 7 pares de agentes repetidos identificados en `AGENTS.md` (eliminadas las rutas anidadas, conservada la plana como canónica — 2026-07-22).
- [ ] Ejecutar `ruflo doctor --fix` y `ruflo security scan` antes de considerar el entorno de desarrollo estable.

## Backlog no priorizado (fases 2-5)

Ver `docs/ROADMAP.md` para el desglose por fase. No se convierten en tareas concretas hasta que la fase correspondiente esté confirmada con el negocio.
