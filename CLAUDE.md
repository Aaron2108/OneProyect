# WhatsFlow AI — Claude Code Configuration

Plataforma SaaS con IA para PyMEs que centraliza la comunicación por WhatsApp
(agente inteligente que responde con contexto del negocio, agenda citas, genera
recordatorios y colabora con el equipo humano). Visión completa en
[`docs/VISION.md`](docs/VISION.md).

## Reglas

- Hacer solo lo que se pide; ni más ni menos.
- Preferir editar un archivo existente antes que crear uno nuevo.
- No crear documentación nueva salvo que se pida explícitamente.
- No guardar archivos de trabajo/tests en la raíz — usar `/src`, `/tests`, `/docs`, `/prisma`, `/public`.
- Leer siempre un archivo antes de editarlo.
- Nunca commitear secretos, credenciales ni `.env`.
- No añadir trailer `Co-Authored-By` a los commits salvo que este repo lo configure explícitamente en `.claude/settings.json` (`attribution.commit`).
- Mantener los archivos bajo 500 líneas.
- Validar la entrada en los límites del sistema (DTOs con `class-validator`, verificación de firma en webhooks, etc.).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + TypeScript + **NestJS** (monolito modular por feature) |
| Base de datos | PostgreSQL (ORM **Prisma**), multi-tenant por `tenantId` |
| Colas / async | Redis + BullMQ (procesamiento de webhooks fuera del ciclo de respuesta) |
| Canal | WhatsApp vía **Meta Cloud API** oficial |
| IA | Claude (Anthropic) con tool-calling · modelo por defecto `claude-haiku-4-5` |

Decisiones y su justificación en [`docs/DECISIONS.md`](docs/DECISIONS.md).
Arquitectura en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estructura del código

`/src` organizado en **módulos de NestJS por feature** (controlador → servicio → Prisma):

- `auth/` — registro/login JWT con scope de tenant (guard sin passport, hashing scrypt).
- `contacts/` · `conversations/` · `appointments/` · `reminders/` — CRUD con aislamiento por tenant.
- `whatsapp/` — webhook (verificación + firma HMAC), cola BullMQ, worker de entrada, envío saliente (Meta Cloud API), ventana de 24h.
- `ai/` — motor de IA (Claude + tool-calling), guarda de costo, proveedor `mock` para pruebas.
- `prisma/` · `config/` · `health/` — infraestructura transversal.

**Principio de seguridad transversal**: el `tenantId` (y en la IA, también el `contactId`)
proviene SIEMPRE del contexto de confianza (el token JWT o el contexto de la conversación),
nunca de la entrada del cliente. Ningún endpoint ni herramienta de IA puede operar sobre
datos de otro tenant.

## Build & Test

```bash
npm run build && npm test     # compilar y correr los tests (Jest)
npm run start:dev             # desarrollo con recarga
npm run db:up                 # levantar Postgres + Redis (Docker)
```

- Correr los tests después de cambios de código.
- Verificar que el build compila antes de commitear.

**Pruebas de la IA sin gastar créditos**: `AI_PROVIDER=mock npm run start` — el agente
devuelve respuestas simuladas y ejecuta el tool-calling real contra la BD.

## Convenciones

- Código y comentarios en español (coherente con el resto del repo).
- Cada tarea del Sprint 1 y su estado están en [`docs/TASKS.md`](docs/TASKS.md).
- Las decisiones de arquitectura se **registran** en `docs/DECISIONS.md`, no se sobreescriben:
  un cambio que reemplaza algo documentado se añade como entrada nueva.
- El contenido de negocio (VISION, REQUIREMENTS, etc.) no se inventa; se completa solo con
  información proporcionada por el propietario.
