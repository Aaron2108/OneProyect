# WhatsFlow AI

> Estado: **Sprint 1 — MVP en desarrollo** (rama `sprint-1-mvp`)

Plataforma SaaS con IA para PyMEs que centraliza la comunicación por WhatsApp: un agente inteligente que responde con contexto del negocio, agenda citas, genera recordatorios y colabora con el equipo humano. Ver la visión completa en [`docs/VISION.md`](docs/VISION.md).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + TypeScript + **NestJS** (monolito modular) |
| Base de datos | PostgreSQL (ORM **Prisma**) |
| Colas / async | Redis + BullMQ |
| Canal | WhatsApp vía **Meta Cloud API** oficial |
| IA | Claude (Anthropic) con tool-calling |

Decisiones y su justificación en [`docs/DECISIONS.md`](docs/DECISIONS.md). Arquitectura en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Puesta en marcha (desarrollo local)

Requisitos: Node.js ≥ 22, Docker + Docker Compose.

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno (rellenar credenciales de Meta/Anthropic cuando las tengas)
cp .env.example .env

# 3. Levantar PostgreSQL + Redis
npm run db:up

# 4. Crear las tablas (migración inicial de Prisma)
npm run prisma:migrate       # la primera vez: --name init

# 5. Arrancar en modo desarrollo
npm run start:dev
```

Comprobación: `GET http://localhost:3000/health` responde el estado del servicio y la base de datos.

**Panel web**: abre `http://localhost:3000/` en el navegador. Es una SPA mínima (servida desde `public/`) para el equipo del negocio: registro/login, bandeja de conversaciones, hilo de mensajes, responder manualmente, handoff a humano y gestión de contactos.

**Probar la IA sin gastar créditos** (desarrollo local): arranca con `AI_PROVIDER=mock npm run start`. El agente devuelve respuestas simuladas y ejecuta el tool-calling real contra la BD (crear cita, etc.). Para usar Claude real, deja `AI_PROVIDER` sin definir (o `anthropic`) y pon una `ANTHROPIC_API_KEY` con saldo.

Scripts útiles: `npm test` (tests), `npm run build` (compilar), `npm run prisma:studio` (explorar la BD), `npm run db:down` (apagar contenedores).

## Documentación

Toda en [`/docs`](docs/). Claves para el desarrollo del MVP:

| Documento | Contenido |
|---|---|
| [`VISION.md`](docs/VISION.md) | Problema, usuarios, propuesta de valor, métricas. |
| [`REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Requisitos funcionales (RF-1..RF-12) y no funcionales del MVP. |
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura de la aplicación y del framework de desarrollo. |
| [`DATABASE.md`](docs/DATABASE.md) | Modelo de datos del negocio. |
| [`API.md`](docs/API.md) | Webhook de WhatsApp y endpoints REST. |
| [`ROADMAP.md`](docs/ROADMAP.md) | 5 fases: MVP → Escalabilidad → Integraciones → IA → Expansión. |
| [`TASKS.md`](docs/TASKS.md) | Backlog del Sprint 1. |
| [`SECURITY.md`](docs/SECURITY.md) | Postura de seguridad y cumplimiento con Meta. |
| [`DECISIONS.md`](docs/DECISIONS.md) | Log de decisiones de arquitectura. |
| [`AGENTS.md`](docs/AGENTS.md) · [`AI_RULES.md`](docs/AI_RULES.md) | Agentes de desarrollo y reglas de colaboración con IA. |

## Nota sobre el framework de desarrollo

Este repo se apoya en el framework [`ruflo`](https://www.npmjs.com/package/ruflo) (carpetas `.claude/`, `.claude-flow/`, `.swarm/`) **solo como herramienta de orquestación del desarrollo** — no forma parte del runtime de producción de WhatsFlow AI. Ver [`docs/REPOSITORY_ANALYSIS.md`](docs/REPOSITORY_ANALYSIS.md) y la aclaración en `ARCHITECTURE.md` §2.
