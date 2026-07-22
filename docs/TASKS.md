# TASKS.md

> Creado: 2026-07-22 · Backlog y estado del desarrollo de WhatsFlow AI.

## Sprint 0 — Bootstrap (hecho)

- [x] Recibir del propietario la **descripción completa del proyecto** (WhatsFlow AI).
- [x] Generar la documentación de negocio y técnica (`VISION`, `REQUIREMENTS`, `ARCHITECTURE`, `DATABASE`, `API`, `SECURITY`, `ROADMAP`, `DECISIONS`, `PROJECT`, `README`).

## Sprint 1 — MVP de WhatsFlow AI

- [x] Confirmar la decisión crítica de arquitectura (Meta Cloud API oficial) y completar la documentación de negocio con contenido real.
- [x] Crear el esqueleto NestJS + TypeScript, ORM Prisma con las 8 entidades, `docker-compose.yml` (Postgres + Redis) y `.env.example`. Verificado: `npm install`, `prisma generate/validate`, `nest build` y `npm test`.
- [x] Migraciones iniciales del modelo de datos (`tenants`, `users`, `contacts`, `conversations`, `messages`, `appointments`, `reminders`, `contact_consent`). **Sin `pgvector`/`ai_context_memory` en el MVP** (diferido a Fase 4). Aplicadas sobre Postgres en Docker.
- [x] Webhook (`GET`/`POST /webhooks/whatsapp`) con verificación de firma HMAC (X-Hub-Signature-256), encolado async vía BullMQ y worker que persiste contacto/conversación/mensaje con dedup. Mapeo tenant↔número vía `tenant.whatsappPhoneNumberId`. Verificado end-to-end + tests.
- [x] Integrar Claude con tool-calling (responder con contexto + crear cita/recordatorio/actualizar contacto). Módulo `ai/` con bucle de tool-calling, guarda de costo (máx. llamadas por conversación/hora) y respuesta conectada al worker (solo si `handledBy=AI`). **Seguridad**: las herramientas NO exponen `tenantId`/`contactId` — se inyectan desde el contexto de confianza. Modelo por defecto: Haiku. Proveedor `AI_PROVIDER=mock` para probar sin gastar créditos.
- [x] Módulo de envío saliente (Meta Cloud API): `WhatsappSenderService` envía la respuesta al cliente (`POST /{phone_number_id}/messages`) desde el número del tenant, dentro de la ventana de 24h (RF-10); guarda el `wamid`. Sin `WHATSAPP_ACCESS_TOKEN` la respuesta se persiste pero no se envía (local/mock).
- [x] Autenticación JWT con scope de tenant. Módulo `auth/`: `POST /auth/register` (empresa + usuario OWNER), `POST /auth/login`, `GET /auth/me`. Contraseñas con `scrypt` (nativo). `JwtAuthGuard` sin passport; `@CurrentUser()`; `RolesGuard` + `@Roles()`. El `tenantId` viene SIEMPRE del token. Verificado end-to-end + tests.
- [x] CRUD de contactos y bandeja de conversaciones. Módulos `contacts/` y `conversations/` (`GET /conversations` bandeja con filtros, `GET /conversations/:id` con hilo, handoff/close/reopen). Todo protegido por JWT y filtrado por tenant. Verificado end-to-end + tests de aislamiento.
- [x] Mensajes salientes manuales (`POST /conversations/:id/messages`): un humano responde desde la bandeja; persiste OUTBOUND/HUMAN, pasa la conversación a HUMAN y la envía por Meta (ventana 24h). Verificado end-to-end.
- [x] CRUD de citas (`/appointments`) y recordatorios (`/reminders`) con scope de tenant y validación de que el contacto/cita referenciados pertenecen al tenant. Verificado end-to-end + tests.
- [x] Handoff / escalación a humano (RF-11): `handledBy` por conversación (AI/HUMAN). Disparadores: **manual** (`/handoff`, `/handback`) y **automático por palabra clave** (`requestsHumanAgent`). El disparador por baja confianza queda pendiente (requiere confianza del modelo).
- [x] Panel web mínimo (`public/index.html`): SPA de un solo archivo servida por Nest. Login/registro, bandeja con filtros, hilo, responder, handoff/close, contactos.
- [~] Ventana de 24h + plantillas de Meta (RF-10): la comprobación de la ventana para **texto libre** ya está (`isWithinServiceWindow`). **Falta** el envío con **plantilla pre-aprobada** fuera de la ventana (requiere dar de alta plantillas en Meta).
- [~] Opt-in del contacto (RF-12): tabla `contact_consent` creada; el worker registra `GRANTED` al primer mensaje entrante. Falta la verificación de consentimiento *antes* de enviar mensajes proactivos (se conecta con recordatorios).
- [ ] Worker de recordatorios programados: disparar los recordatorios `PENDING` cuando llega `remindAt` (se conecta con el envío por plantilla).
- [ ] Guarda de costo/latencia de IA (NFR): afinar el límite de llamadas por conversación/tenant en ventana de tiempo (base ya implementada) y umbrales.
- [ ] Registrar la app en Meta for Developers y configurar el número de WhatsApp Business + verificación del webhook. — configuración externa (requiere cuenta/credenciales del propietario).
- [ ] Prueba en vivo con Claude real (quitar `AI_PROVIDER=mock`) — a la espera de créditos de API de Anthropic.

## Fase 2 — Escalabilidad (en curso)

Features de escalabilidad y colaboración construidas sobre el MVP (todas con scope de tenant, tests y verificación en navegador):

- [x] **Rate limiting** global (`@nestjs/throttler`, 100/min por IP) + estricto en `/auth` (10/min); webhook exento.
- [x] **Búsqueda + paginación keyset** en bandeja y contactos (`q`/`cursor`/`limit`, respuesta `{items, nextCursor}`).
- [x] **Dashboard de métricas** por tenant con filtro por **rango de fechas** (KPIs, tasa de automatización, actividad diaria). Gráfico SVG con paleta validada (skill `dataviz`).
- [x] **Gestión de equipo** (usuarios): listar e invitar; invitar es solo OWNER (`@Roles(OWNER)` + `RolesGuard`).
- [x] **Estado sin leer** en la bandeja (`unreadCount` denormalizado, incrementado por el worker; `POST /:id/read`).
- [x] **Editar contacto** (nombre + notas) desde el panel.
- [x] **Cambiar contraseña** (`POST /auth/change-password`).
- [x] **Notas internas** por conversación (privadas del equipo).
- [x] **Exportar CSV** de contactos y conversaciones.
- [x] **Respuestas rápidas** (plantillas de mensaje del equipo, insertables en el composer).
- [x] Endurecimiento del worker de recordatorios (claim atómico + backoff) y correcciones de la auditoría de código.
- [ ] Migrar a esquema-por-tenant si el volumen lo justifica; versionado de API; cifrado de PII en reposo (ver `ROADMAP.md` Fase 2 y `SECURITY.md`).

## Backlog no priorizado (fases 3-5)

Ver `docs/ROADMAP.md` para el desglose por fase. No se convierten en tareas concretas hasta que la fase correspondiente esté confirmada con el negocio.
