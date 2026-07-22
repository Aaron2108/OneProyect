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

**Estructura de código en `/src`**: **módulos de NestJS por feature** con separación ligera controlador → servicio → repositorio (Prisma). La estructura hexagonal estricta (domain/application/infrastructure/presentation en capas separadas) se difiere: para el MVP añade boilerplate sin valor de validación (mismo criterio que llevó a diferir `pgvector`, ver `DECISIONS.md`). Módulos implementados: `config/` (configuración tipada + validación de entorno), `prisma/` (cliente global), `health/` (health check), `auth/` (JWT con scope de tenant), `whatsapp/` (webhook + firma HMAC + cola + worker + envío Meta), `ai/` (agente Claude + tool-calling + proveedor mock), `contacts/`, `conversations/`, `appointments/`, `reminders/`, `metrics/`, `quick-replies/`, `users/`.

**Seguridad transversal**: el `tenantId` (y en la IA también el `contactId`) proviene siempre del contexto de confianza (token JWT / contexto de la conversación), nunca de la entrada del cliente — ningún endpoint ni herramienta de IA puede operar sobre datos de otro tenant.

## Frontend — panel web (`/frontend`)

**Stack**: React 18 + TypeScript + Vite (sin Next.js — no hay necesidad de SSR/routing de servidor para un dashboard autenticado). Tailwind CSS para utilidades, con los tokens del sistema de diseño (color/tipografía/radios/sombras, claro + oscuro) como variables CSS en `src/styles/tokens.css` — Tailwind solo las referencia, una única fuente de verdad. Radix UI para primitivos accesibles (Dialog, Popover, DropdownMenu, Tabs, Toast), Framer Motion para animaciones con intención (springs, count-up, transiciones de layout), Recharts para el gráfico de actividad, `@formkit/auto-animate` para altas/bajas en listas.

**Por qué React y no seguir en vanilla**: el panel había crecido a un solo archivo HTML/JS de ~1200 líneas con manipulación imperativa del DOM y estado disperso — el punto donde un vanilla-JS SPA empieza a pelear consigo mismo. El nivel visual pedido (profundidad, glass, modo oscuro, componentes accesibles) es más rápido y consistente de lograr con un framework de componentes. Se descartó Next.js explícitamente: no hay SSR, no hay rutas públicas que indexar, es un dashboard tras login — Vite + React SPA es la opción más simple que cubre el requisito (ver `DECISIONS.md`).

**Estructura** (`frontend/src/`):
```
lib/            → cliente API (fetch + auth header), tipos compartidos, contexts (auth/theme/toast)
components/ui/   → primitivos de UI reutilizables (Button, Input, Dialog, Pill, Avatar, KpiCard, RadialGauge…)
components/layout/ → AppShell (topbar + tabs + tema + menú de perfil)
features/        → un directorio por dominio: auth, inbox, metrics, contacts, team, account
styles/          → tokens.css (sistema de diseño) + components.css (bubbles, glass, mesh, gauge…)
```

**Despliegue**: `frontend/` es un proyecto npm independiente (su propio `package.json`, sin monorepo/workspaces). `npm run build` en la raíz compila el backend (`nest build`) y luego el frontend (`cd frontend && npm install && npm run build`), generando `frontend/dist`. NestJS sirve ese build estático (`useStaticAssets`, ver `main.ts`) — sigue siendo **una sola app desplegable**, sin servidor adicional. En desarrollo, `npm run dev:frontend` levanta Vite en `:5173` con un proxy hacia el backend real en `:3000` para las rutas de la API.

**Sobre el futuro panel de administración**: el propietario planea construir un panel admin (probablemente cross-tenant, para operar el SaaS) más adelante. Se decidió **no** crear un monorepo con workspaces todavía — solo existe una app frontend hoy, y las herramientas de monorepo (Turborepo, pnpm workspaces, etc.) son complejidad sin beneficio mientras no haya un segundo consumidor real de un paquete compartido (mismo criterio anti-sobre-ingeniería que evitó `pgvector` y la arquitectura hexagonal). La estructura por *features* + tokens de diseño centralizados en `styles/tokens.css` hace que extraer un paquete de diseño compartido, cuando el admin exista, sea un refactor acotado, no una reescritura. Esta decisión se revisará explícitamente cuando se inicie el admin (ver `DECISIONS.md`).

Cualquier decisión de arquitectura se registra en [`DECISIONS.md`](DECISIONS.md).
