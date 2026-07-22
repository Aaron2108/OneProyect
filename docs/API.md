# API.md

> Creado: 2026-07-22

## 1. Superficie de API interna del framework (definida)

### Servidor MCP

`.mcp.json` registra un servidor MCP llamado `claude-flow`, arrancado con `npx ruflo@latest mcp start` (`autoStart: false` — no se conecta solo). Expone del orden de **~210 herramientas MCP** que Claude Code puede invocar directamente (sin pasar por Bash), agrupadas en: memoria (`memory_store`, `memory_search`, `memory_search_unified`), swarm (`swarm_init`, `swarm_status`, `swarm_health`), agentes (`agent_spawn`, `agent_list`, `agent_status`), hooks (`hooks_route`, `hooks_post-task`, `hooks_worker-dispatch`), seguridad (`aidefence_scan`, `aidefence_is_safe`, `aidefence_has_pii`), hive-mind (`hive-mind_init`, `hive-mind_consensus`, `hive-mind_spawn`), entre otras. Variables de entorno del servidor: `CLAUDE_FLOW_MODE=v3`, `CLAUDE_FLOW_TOPOLOGY=hierarchical-mesh`, `CLAUDE_FLOW_MAX_AGENTS=15`, `CLAUDE_FLOW_MEMORY_BACKEND=hybrid`.

### CLI

26 comandos raíz, 140+ subcomandos (catálogo completo en `.claude-flow/CAPABILITIES.md`). Los de uso más frecuente:

| Comando | Subcomandos | Propósito |
|---|---|---|
| `init` | 4 | Inicialización del proyecto |
| `agent` | 8 | Ciclo de vida de agentes |
| `swarm` | 6 | Coordinación multi-agente |
| `memory` | 11 | Memoria vectorial (AgentDB/HNSW) |
| `mcp` | 9 | Gestión del servidor MCP |
| `task` | 6 | Asignación de tareas |
| `session` | 7 | Persistencia de sesión |
| `hooks` | 17 | Sistema de hooks auto-aprendizaje |
| `hive-mind` | 6 | Consenso distribuido |
| `security` | 6 | Escaneo de seguridad |
| `doctor` | 1 | Diagnóstico del sistema |

Esta superficie **ya existe y no requiere desarrollo**; es infraestructura del framework, disponible desde ahora vía CLI (`ruflo <comando>`) o vía MCP si se activa el servidor.

## 2. API de producto — WhatsFlow AI (Fase 1 / MVP)

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
| Panel web | `GET /` | ✅ SPA mínima (HTML/JS, `public/index.html`) servida por Nest: login, bandeja, hilo, responder, handoff, contactos. |

**Autenticación/autorización (implementado ✅)**: JWT por sesión de usuario del panel; cada token incluye `tenantId`, `sub` (userId), `email` y `role`. El `JwtAuthGuard` valida el Bearer token y adjunta el contexto a la request; el `tenantId` usado en las consultas viene SIEMPRE del token, nunca del cliente, así ningún endpoint puede leer o tocar datos de otro tenant (ver `DATABASE.md` §2). Contraseñas con `scrypt` (nativo de Node). Roles vía `@Roles()` + `RolesGuard`. Detalle de amenazas y controles en `SECURITY.md`.

**Integración interna con el motor de IA**: el motor de IA (Claude + tool-calling, ver `ARCHITECTURE.md` §2) invoca internamente las mismas operaciones de dominio que exponen los endpoints de contactos/citas/recordatorios (a través de la capa `application/`, no llamando a la API HTTP de sí mismo) — así una acción decidida por la IA dentro de una conversación (p. ej. "crear una cita") queda sujeta a las mismas reglas de negocio y persistencia que si la creara un humano desde el panel.

**Versionado/rate limiting/paginación**: no se diseñan todavía en el MVP (bajo volumen esperado con las empresas piloto); revisar antes de Fase 2 si el uso real lo requiere.

## 3. Relación entre ambas capas

La API de producto (sección 2) es una capa nueva, construida en `/src`, independiente de la superficie MCP/CLI del framework. El framework puede usarse como *herramienta de desarrollo* (agentes, memoria, swarm) para construir esa API, pero no la sustituye ni la expone directamente.
