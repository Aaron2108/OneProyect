# WhatsFlow AI — Backend (Claude Code Configuration)

Esta carpeta contiene **únicamente el backend** de WhatsFlow AI: la API NestJS que
centraliza la comunicación por WhatsApp (agente IA, citas, recordatorios, equipo).
Es un repositorio independiente del frontend — ver `/CLAUDE.md` (raíz del monorepo,
mientras ambas carpetas conviven aquí) para el panorama completo del producto.

**Regla explícita: si el usuario pide un cambio de frontend (UI, componentes, páginas,
estilos, rutas de navegación, hooks de React), no modifiques nada dentro de esta
carpeta. Ese trabajo se hace en `/frontend`.**

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Node.js + TypeScript + **NestJS** (monolito modular por feature) |
| Base de datos | PostgreSQL (ORM **Prisma**, extensión `pgvector`), multi-tenant por `tenantId` |
| Colas / async | Redis + BullMQ |
| Canal | WhatsApp vía **Meta Cloud API** oficial |
| IA | Claude (Anthropic) con tool-calling · modelo por defecto `claude-haiku-4-5` |

## Instalación y ejecución

```bash
npm install
cp .env.example .env        # completar credenciales (ver docs/ en la raíz)
npm run start:dev           # http://localhost:3000, recarga en caliente
```

`db:up` / `db:down` levantan Postgres+Redis desde el `docker-compose.yml` de la raíz
(`../docker-compose.yml` — un nivel por encima de esta carpeta).

## Build, tests y Prisma

```bash
npm run build                # compila a dist/
npm test                     # Jest (tests/**/*.spec.ts)
npm run test:e2e
npm run prisma:migrate        # crea/aplica migraciones
npm run prisma:studio         # explorar la BD
npm run prisma:encrypt-pii    # cifra en reposo datos existentes (una vez, tras configurar TOKEN_ENCRYPTION_KEY)
```

**Probar la IA sin gastar créditos**: `AI_PROVIDER=mock npm run start:dev` — el agente
responde de forma simulada y ejecuta el tool-calling real contra la BD.

## Estructura

`/src` organizado en **módulos de NestJS por feature** (controlador → servicio → Prisma):

- `auth/` — registro/login JWT con scope de tenant (guard sin passport, hashing scrypt).
- `contacts/` · `conversations/` · `appointments/` · `reminders/` — CRUD con aislamiento por tenant.
- `whatsapp/` — webhook (verificación + firma HMAC), cola BullMQ, worker de entrada, envío saliente.
- `ai/` — motor de IA (Claude + tool-calling), guarda de costo, proveedor `mock` para pruebas.
- `business-profile/` — contexto de negocio que la IA usa para responder.
- `google-calendar/` — sincronización de citas (OAuth, reintentos con backoff).
- `metrics/` · `users/` · `prisma/` · `config/` · `common/` · `health/` — infraestructura y features transversales.
- `prisma/schema.prisma` y `prisma/migrations/` — modelo de datos y su historial.
- `tests/` — specs de Jest, misma estructura por feature que `src/`.

## Independencia de despliegue

Este backend **no sirve el frontend**: expone solo la API REST + webhook, con CORS
habilitado (`main.ts`) hacia el origen configurado en `FRONTEND_BASE_URL`. El panel
React se despliega por separado y le habla a esta API por HTTP. Si alguna vez se
necesita volver a servir el frontend desde aquí, sería un cambio explícito y deliberado,
no el estado por defecto.

## Reglas

- Hacer solo lo que se pide; ni más ni menos.
- Preferir editar un archivo existente antes que crear uno nuevo.
- No crear documentación nueva salvo que se pida explícitamente.
- No guardar archivos de trabajo/tests fuera de `/src`, `/tests`, `/prisma`.
- Leer siempre un archivo antes de editarlo.
- Nunca commitear secretos, credenciales ni `.env`.
- Mantener los archivos bajo 500 líneas.
- Validar la entrada en los límites del sistema (DTOs con `class-validator`, verificación de firma en webhooks, etc.).
- **Principio de seguridad transversal**: el `tenantId` (y en la IA, también el `contactId`)
  proviene SIEMPRE del contexto de confianza (token JWT o contexto de la conversación),
  nunca de la entrada del cliente. Ningún endpoint ni herramienta de IA puede operar sobre
  datos de otro tenant.
