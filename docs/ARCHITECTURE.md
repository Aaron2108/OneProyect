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

**Estructura de código en `/src`**: **módulos de NestJS por feature** con separación ligera controlador → servicio → repositorio (Prisma). La estructura hexagonal estricta (domain/application/infrastructure/presentation en capas separadas) se difiere: para el MVP añade boilerplate sin valor de validación (mismo criterio que llevó a diferir `pgvector`, ver `DECISIONS.md`). Módulos implementados: `config/` (configuración tipada + validación de entorno), `prisma/` (cliente global), `health/` (health check), `auth/` (JWT con scope de tenant), `whatsapp/` (webhook + firma HMAC + cola + worker + envío Meta), `ai/` (agente Claude + tool-calling + proveedor mock), `contacts/`, `conversations/`, `appointments/`, `reminders/`, `metrics/`, `quick-replies/`, `users/`, `google-calendar/` (OAuth2 + sincronización de citas, Fase 3), `common/` (utilidades transversales, p. ej. cifrado de secretos en reposo).

**Seguridad transversal**: el `tenantId` (y en la IA también el `contactId`) proviene siempre del contexto de confianza (token JWT / contexto de la conversación), nunca de la entrada del cliente — ningún endpoint ni herramienta de IA puede operar sobre datos de otro tenant.

## Memoria de contexto de la IA (`ai/ai-context-memory.service.ts`, Fase 4)

Primera pieza de Fase 4 en implementarse — no dependía de las credenciales de Meta/Anthropic que sí bloquean el resto del roadmap (ver `ROADMAP.md`). Recuerdo entre conversaciones, por contacto, más allá de la ventana de contexto de la conversación en curso:

- Al **cerrar** una conversación (`ConversationsService.setStatus`), se resume con la IA (`AiService.summarize`) y el resumen se guarda junto con su embedding (`AiContextMemoryService.remember`) — best-effort, nunca hace fallar el cierre.
- Al **responder**, la IA recupera (`AiContextMemoryService.recall`) los recuerdos más similares al último mensaje del contacto (siempre `tenantId` + `contactId` exactos) y los añade al `system` prompt.
- `EmbeddingsService` genera los embeddings: Voyage AI en producción (Anthropic no ofrece API de embeddings propia), con proveedor `mock` determinístico para desarrollo local sin gastar créditos — mismo patrón que `AI_PROVIDER=mock` en `AiService`.
- Postgres necesita la extensión `pgvector` (imagen `pgvector/pgvector:pg16` en `docker-compose.yml`, compatible con los datos existentes de `postgres:16`). La columna `embedding` es `Unsupported("vector(512)")` en el esquema de Prisma — no representable en el Client, se accede solo con SQL parametrizado (`$executeRaw`/`$queryRaw`) en `AiContextMemoryService`.
- Detalle y motivo en `docs/DECISIONS.md` (2026-07-23); seguridad de esta pieza en `SECURITY.md` §12.

## Integraciones — Google Calendar (`google-calendar/`, Fase 3)

Primer módulo de la Fase 3 (`docs/ROADMAP.md`): sincroniza citas del panel con Google Calendar. Alcance deliberadamente acotado, revisable si el negocio pide más:

- **Una sola vía** (WhatsFlow → Google): crear/editar/cancelar una cita en el panel refleja el evento en Google; no hay importación en sentido inverso (evita webhooks push de Google y resolución de conflictos, mucho más complejos y frágiles).
- **Conexión por tenant**, no por usuario: el OWNER conecta una vez la cuenta de Google del negocio (`GoogleCalendarOauthService`); todas las citas del tenant van a ese calendario.
- OAuth2 y llamadas a la API de Calendar vía `fetch` nativo, sin el SDK `googleapis` (pesado para 3 endpoints) — mismo criterio que `WhatsappSenderService`.
- Tokens cifrados en reposo (`common/crypto.util.ts`, AES-256-GCM) — ver `SECURITY.md` §11.
- `GoogleCalendarSyncService` nunca hace fallar la operación de la cita que la origina: si Google no responde o el tenant no conectó la integración, se registra el error y se continúa — WhatsFlow es la fuente de verdad.
- Si la llamada a Google falla, el intento se agenda con backoff exponencial (`GoogleCalendarSyncJob`, un job por cita) y un worker periódico (`GoogleCalendarSyncProcessor`, BullMQ) lo reintenta — mismo patrón de claim atómico que `reminders/`. Evita que un fallo transitorio deje una cita desincronizada para siempre; ver `DECISIONS.md` (2026-07-23).

Detalle de la decisión (alcance, alternativas descartadas) en `DECISIONS.md`.

## "Continuar con Google" (`auth/google-*`, opcional)

Alternativa opcional al login por email+contraseña para entrar a WhatsFlow — **independiente** de la integración de Google Calendar de arriba, aunque ambas hablan OAuth2 con Google:

- Scope mínimo (`openid email profile`, sin `calendar.events`): esto es solo identidad, no pide acceso de escritura a nada.
- Por **usuario**, no por tenant: cada persona conecta su propia cuenta de Google si quiere.
- Alta en dos pasos si el email es nuevo: Google no sabe el nombre de la empresa, así que `GoogleAuthService.handleCallback` devuelve un token de alta pendiente (firmado, ~15 min) y el panel pide un solo campo antes de crear el tenant (`completeSignup`). Si el email ya existe, es un login normal y se vincula el `googleId` a esa cuenta.
- `src/common/google-oauth.util.ts` reúne las primitivas de bajo nivel (canjear código, leer perfil) compartidas por este flujo y por `google-calendar/` — la única parte que de verdad se repetía entre los dos.
- Un usuario puede tener contraseña, Google, o ambos; `User.passwordHash` es nulo para cuentas creadas solo con Google.

Un cliente que se registra por el flujo normal (email+contraseña) **igual necesita conectar su cuenta de Google por separado** si quiere usar Google Calendar — son dos concesiones de acceso distintas (identidad vs. calendario), no una implica la otra.

## Frontend — panel web (`/frontend`)

**Stack**: React 18 + TypeScript + Vite (sin Next.js — no hay necesidad de SSR/routing de servidor para un dashboard autenticado). Tailwind CSS para utilidades, con los tokens del sistema de diseño (color/tipografía/radios/sombras, claro + oscuro) como variables CSS en `src/styles/tokens.css` — Tailwind solo las referencia, una única fuente de verdad. Radix UI para primitivos accesibles (Dialog, Popover, DropdownMenu, Tabs, Toast), Framer Motion para animaciones con intención (springs, count-up, transiciones de layout), Recharts para el gráfico de actividad, `@formkit/auto-animate` para altas/bajas en listas.

**Por qué React y no seguir en vanilla**: el panel había crecido a un solo archivo HTML/JS de ~1200 líneas con manipulación imperativa del DOM y estado disperso — el punto donde un vanilla-JS SPA empieza a pelear consigo mismo. El nivel visual pedido (profundidad, glass, modo oscuro, componentes accesibles) es más rápido y consistente de lograr con un framework de componentes. Se descartó Next.js explícitamente: no hay SSR, no hay rutas públicas que indexar, es un dashboard tras login — Vite + React SPA es la opción más simple que cubre el requisito (ver `DECISIONS.md`).

**Estructura** (`frontend/src/`):
```
lib/            → cliente API (fetch + auth header), tipos compartidos, contexts (auth/theme/toast)
components/ui/   → primitivos de UI reutilizables (Button, Input, Dialog, Pill, Avatar, KpiCard, RadialGauge…)
components/layout/ → AppShell (topbar + tabs + tema + menú de perfil)
features/        → un directorio por dominio: auth, inbox, metrics, contacts, calendar, integrations, team, account
styles/          → tokens.css (sistema de diseño) + components.css (bubbles, glass, mesh, gauge…)
```

**Despliegue**: `frontend/` es un proyecto npm independiente (su propio `package.json`, sin monorepo/workspaces). `npm run build` en la raíz compila el backend (`nest build`) y luego el frontend (`cd frontend && npm install && npm run build`), generando `frontend/dist`. NestJS sirve ese build estático (`useStaticAssets`, ver `main.ts`) — sigue siendo **una sola app desplegable**, sin servidor adicional. En desarrollo, `npm run dev:frontend` levanta Vite en `:5173` con un proxy hacia el backend real en `:3000` para las rutas de la API.

**Sobre el futuro panel de administración**: el propietario planea construir un panel admin (probablemente cross-tenant, para operar el SaaS) más adelante. Se decidió **no** crear un monorepo con workspaces todavía — solo existe una app frontend hoy, y las herramientas de monorepo (Turborepo, pnpm workspaces, etc.) son complejidad sin beneficio mientras no haya un segundo consumidor real de un paquete compartido (mismo criterio anti-sobre-ingeniería que evitó `pgvector` y la arquitectura hexagonal). La estructura por *features* + tokens de diseño centralizados en `styles/tokens.css` hace que extraer un paquete de diseño compartido, cuando el admin exista, sea un refactor acotado, no una reescritura. Esta decisión se revisará explícitamente cuando se inicie el admin (ver `DECISIONS.md`).

Cualquier decisión de arquitectura se registra en [`DECISIONS.md`](DECISIONS.md).
