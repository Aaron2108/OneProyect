# API.md

> Creado: 2026-07-22

## API de producto — WhatsFlow AI (Fase 1 / MVP)

**Tipo**: API REST (NestJS), consumida por el panel web del equipo de cada tenant. No se expone GraphQL en el MVP.

**Webhook de entrada (Meta Cloud API)**:

| Endpoint | Método | Propósito |
|---|---|---|
| `/webhooks/whatsapp` | `GET` | Verificación del webhook exigida por Meta al registrar la integración (challenge token). |
| `/webhooks/whatsapp` | `POST` | Recepción de eventos entrantes (mensajes, estados de entrega). Responde 200 de inmediato y encola el procesamiento real (ver `ARCHITECTURE.md` §2) — nunca hacer el trabajo de IA de forma síncrona aquí. |

**Autenticación (implementado ✅):**

| Endpoint | Método | Propósito |
|---|---|---|
| `/auth/register` | `POST` | Alta de empresa (tenant) + usuario propietario (OWNER). Devuelve JWT. |
| `/auth/login` | `POST` | Inicio de sesión con email + contraseña. Devuelve JWT. |
| `/auth/me` | `GET` | Datos del usuario autenticado (requiere Bearer token). |

**Endpoints REST de producto (todos con scope de tenant; ✅ implementado / ⏳ planificado):**

| Recurso | Endpoints | Estado · Notas |
|---|---|---|
| Contactos | `GET/POST /contacts`, `GET/PATCH /contacts/:id` | ✅ CRUD con aislamiento por tenant (teléfono único por tenant). |
| Conversaciones (bandeja) | `GET /conversations`, `GET /conversations/:id` | ✅ Lista ordenada por actividad, filtros `status`/`handledBy`; detalle con hilo de mensajes. Creación interna vía webhooks, no por POST del panel. |
| Handoff humano (RF-11) | `POST /conversations/:id/handoff` · `/handback` · `/close` · `/reopen` | ✅ `handoff`→HUMAN (silencia la IA), `handback`→AI. |
| Mensajes salientes manuales | `POST /conversations/:id/messages` | ✅ El humano responde directo; persiste OUTBOUND/HUMAN, pasa la conversación a HUMAN y envía por Meta (ventana 24h). |
| Citas | `GET/POST /appointments`, `GET/PATCH /appointments/:id` | ✅ CRUD con scope de tenant (la IA también las crea vía tool-calling). |
| Recordatorios | `GET/POST /reminders`, `GET/PATCH /reminders/:id` | ✅ CRUD con scope de tenant. Envío programado (worker por `remindAt`) ⏳. |
| Métricas | `GET /metrics/overview` | ✅ Resumen agregado por tenant (conversaciones, mensajes, tasa de automatización IA vs humano, citas, recordatorios, actividad de 7 días). |
| Panel web | `GET /` | ✅ SPA mínima (HTML/JS, `public/index.html`) servida por Nest: login, bandeja, hilo, responder, handoff, contactos, **dashboard de métricas**. |

**Autenticación/autorización (implementado ✅)**: JWT por sesión de usuario del panel; cada token incluye `tenantId`, `sub` (userId), `email` y `role`. El `JwtAuthGuard` valida el Bearer token y adjunta el contexto a la request; el `tenantId` usado en las consultas viene SIEMPRE del token, nunca del cliente, así ningún endpoint puede leer o tocar datos de otro tenant (ver `DATABASE.md`). Contraseñas con `scrypt` (nativo de Node). Roles vía `@Roles()` + `RolesGuard`. Detalle de amenazas y controles en `SECURITY.md`.

**Integración interna con el motor de IA**: el motor de IA (Claude + tool-calling, ver `ARCHITECTURE.md`) invoca internamente las mismas operaciones de dominio que exponen los endpoints de contactos/citas/recordatorios (a través de la capa `application/`, no llamando a la API HTTP de sí mismo) — así una acción decidida por la IA dentro de una conversación (p. ej. "crear una cita") queda sujeta a las mismas reglas de negocio y persistencia que si la creara un humano desde el panel.

**Versionado/rate limiting/paginación**: no se diseñan todavía en el MVP (bajo volumen esperado con las empresas piloto); revisar antes de Fase 2 si el uso real lo requiere.
