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
- [x] Panel web mínimo: SPA servida por Nest. Login/registro, bandeja con filtros, hilo, responder, handoff/close, contactos. *(Superseded — ver migración a React en Fase 2.)*
- [~] Ventana de 24h + plantillas de Meta (RF-10): la comprobación de la ventana para **texto libre** ya está (`isWithinServiceWindow`). **Falta** el envío con **plantilla pre-aprobada** fuera de la ventana (requiere dar de alta plantillas en Meta).
- [x] Opt-in del contacto (RF-12): tabla `contact_consent` creada; el worker registra `GRANTED` al primer mensaje entrante. Verificación de consentimiento *antes* de enviar mensajes proactivos ya implementada en `ReminderDispatchService.dispatchOne` (sin `GRANTED` → se cancela el recordatorio, no se envía).
- [x] Worker de recordatorios programados: `src/reminders/reminder.processor.ts` (BullMQ, job repetible) + `reminder-dispatch.service.ts` — claim atómico, backoff exponencial, respeta RF-12 (consentimiento) y RF-10 (ventana de 24h, difiere si hace falta plantilla).
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
- [x] **Migración del panel a React** (`/frontend`: Vite + TypeScript + Tailwind + Radix UI + Framer Motion + Recharts + `@formkit/auto-animate`), sin Next.js ni monorepo (ver `DECISIONS.md`). Sistema de diseño con tokens claro/oscuro (modo oscuro cinematográfico en auth, toggle en la app), glassmorphism en superficies clave, tri-voz reforzada (bubbles con glow, gauge radial de automatización, bento en métricas). Servido por Nest como build estático (`npm run build` en la raíz). Verificado: build de producción, Lighthouse accesibilidad 100 / buenas prácticas 100, responsive sin overflow, funcional end-to-end (login, envío de mensajes, handoff, notas, respuestas rápidas, export).
- [x] **Cifrado en reposo del contenido de conversaciones**: `Message.content`, `ConversationNote.body` y `Contact.notes` (AES-256-GCM, `PiiCryptoService`). `Contact.phone`/`name` quedan en claro a propósito (se buscan por `contains` y `phone` tiene índice único — cifrarlos exige un índice ciego, ver `SECURITY.md` §10 y `DECISIONS.md` 2026-07-23). Migración de datos preexistentes: `npm run prisma:encrypt-pii`.
- [ ] Migrar a esquema-por-tenant si el volumen lo justifica; versionado de API; cifrado de `Contact.phone`/`name` si se decide construir el índice ciego (ver `ROADMAP.md` Fase 2 y `SECURITY.md` §10).

## Fase 3 — Integraciones (en curso)

Iniciada antes de tener credenciales de Meta (RF de WhatsApp) porque no depende de ellas — ver `docs/ROADMAP.md`.

- [x] **Google Calendar**: conexión OAuth2 por tenant (solo OWNER, un calendario por negocio) y sincronización de una sola vía WhatsFlow→Google al crear/editar/cancelar una cita (`src/google-calendar/`). Tokens cifrados en reposo. Ver `docs/DECISIONS.md` (2026-07-23) y `SECURITY.md` §11. Probada end-to-end con credenciales reales del propietario.
- [x] **Reintentos de sincronización con Google Calendar**: si la llamada a Google falla (red, token, rate limit), se agenda con backoff exponencial (`GoogleCalendarSyncJob`) en vez de abandonarse en silencio; worker periódico (`GoogleCalendarSyncProcessor`) la reintenta, mismo patrón de claim atómico que los recordatorios. Ver `docs/DECISIONS.md` (2026-07-23).
- [x] **"Continuar con Google"** (login/registro, opcional): alternativa por usuario al email+contraseña, independiente de la integración de Calendar. Alta en dos pasos si el email es nuevo (falta el nombre de la empresa). `src/auth/google-auth.service.ts`. Ver `docs/DECISIONS.md` (2026-07-23) y `SECURITY.md` §9. Requiere `GOOGLE_LOGIN_REDIRECT_URI` además de las credenciales ya usadas por Calendar. Navegación de página completa (no popup) — ver `DECISIONS.md` (2026-07-23, "sin popup").
- [x] **Pestaña "Calendario" en el panel** (`frontend/src/features/calendar/`): vista de mes (sin librería externa) con las citas del tenant, alta/edición/cancelación desde el panel (antes solo la creaba la IA o la API directo) y la tarjeta de conexión a Google Calendar (movida aquí desde "Equipo"). Backend: `GET /appointments` ahora admite `from`/`to` e incluye el contacto. Verificado end-to-end en navegador (crear, editar, cancelar, contador de citas por día).
- [ ] Otros canales (Instagram, Messenger, email) — bloqueado por las mismas credenciales de Meta que WhatsApp (RF-1..RF-12). Decisión explícita del propietario (2026-07-23): se dejan para el final, después de que WhatsApp funcione completo — aunque email en particular no dependa de Meta, no se adelanta.

## Fase 4 — IA y automatizaciones (iniciada)

Adelantada mientras se espera la aprobación de Meta y los créditos de Anthropic — la memoria de contexto no depende de ninguna de las dos (ver `docs/ROADMAP.md`).

- [x] **Memoria de contexto entre conversaciones** (`ai_context_memory`, `pgvector`): al cerrar una conversación se genera un resumen con la IA (`AiService.summarize`) y se guarda cifrado junto con su embedding (`AiContextMemoryService`); al responder, se recuperan los recuerdos más similares del mismo contacto y se añaden al `system` prompt. Proveedor de embeddings Voyage AI con modo `mock` para desarrollo sin créditos. Ver `docs/DECISIONS.md` (2026-07-23), `ARCHITECTURE.md` y `SECURITY.md` §12. Probada con unitarios + una verificación manual contra Postgres/pgvector real.
- [x] **Apartado "Agente IA"**: perfil de negocio configurable (`business-profile/`) — horarios, servicios, políticas, tono, instrucciones adicionales. `GET` para todo el equipo, `PUT` solo OWNER. Pestaña propia en el panel (`frontend/src/features/ai-agent/`). Se inyecta en el `system` prompt (`BusinessProfileService.describe`). Ver `docs/DECISIONS.md` (2026-07-23). Probado con unitarios + verificación manual end-to-end (OWNER lee/escribe, AGENT solo lee).
- [ ] Subida de documentos / catálogos largos con búsqueda semántica — el propietario lo pedirá explícitamente cuando se empiece esa tarea.
- [ ] Resúmenes automáticos de conversación para el dueño del negocio (distinto del resumen interno de memoria: uno es para la IA, este sería para que el dueño vea de un vistazo qué pasó).
- [ ] Automatización de seguimiento sin intervención humana (secuencias de recordatorios más allá de una cita puntual).
- [ ] Análisis predictivo de oportunidades de venta y aprendizaje de patrones del negocio — necesitan volumen real de conversaciones, no se puede avanzar de forma útil todavía.

## Backlog no priorizado (fases 3-5)

Ver `docs/ROADMAP.md` para el desglose por fase. No se convierten en tareas concretas hasta que la fase correspondiente esté confirmada con el negocio.
