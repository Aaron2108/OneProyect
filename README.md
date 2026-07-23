# WhatsFlow AI

> Estado: **Sprint 1 — MVP en desarrollo** (rama `sprint-1-mvp`)

Plataforma SaaS con IA para PyMEs que centraliza la comunicación por WhatsApp: un agente inteligente que responde con contexto del negocio, agenda citas, genera recordatorios y colabora con el equipo humano. Ver la visión completa en [`docs/VISION.md`](docs/VISION.md).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + TypeScript + **NestJS** (monolito modular) |
| Panel web | **React 18 + TypeScript + Vite**, Tailwind, Radix UI, Framer Motion, Recharts (`/frontend`) |
| Base de datos | PostgreSQL (ORM **Prisma**) |
| Colas / async | Redis + BullMQ |
| Canal | WhatsApp vía **Meta Cloud API** oficial |
| IA | Claude (Anthropic) con tool-calling |

Decisiones y su justificación en [`docs/DECISIONS.md`](docs/DECISIONS.md). Arquitectura en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Puesta en marcha (desarrollo local)

Requisitos: Node.js ≥ 22, Docker + Docker Compose.

```bash
# 1. Instalar dependencias del backend
npm install

# 2. Configurar entorno (rellenar credenciales de Meta/Anthropic cuando las tengas)
cp .env.example .env

# 3. Levantar PostgreSQL + Redis
npm run db:up

# 4. Crear las tablas (migración inicial de Prisma)
npm run prisma:migrate       # la primera vez: --name init

# 5. Arrancar el backend en modo desarrollo
npm run start:dev
```

Comprobación: `GET http://localhost:3000/health` responde el estado del servicio y la base de datos.

**Panel web** (`/frontend`, React + Vite): para desarrollo con recarga en caliente, en otra terminal:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 — proxya /auth, /conversations, etc. al backend en :3000
```

Para producción (o para probar el build real servido por Nest en `:3000`): `npm run build` en la **raíz** compila backend y frontend (`frontend/dist`) y Nest sirve ese build estático — una sola app, sin servidor adicional. Todo el equipo del negocio se maneja ahí: registro/login, bandeja con búsqueda y estado de sin leer, hilo tri-voz (cliente/IA/agente) con notas internas y respuestas rápidas, métricas con filtro de fechas, contactos, equipo y modo claro/oscuro.

**Probar la IA sin gastar créditos** (desarrollo local): arranca el backend con `AI_PROVIDER=mock npm run start`. El agente devuelve respuestas simuladas y ejecuta el tool-calling real contra la BD (crear cita, etc.). Para usar Claude real, deja `AI_PROVIDER` sin definir (o `anthropic`) y pon una `ANTHROPIC_API_KEY` con saldo.

**`TOKEN_ENCRYPTION_KEY` (obligatoria)**: cifra en reposo el contenido de conversaciones (mensajes, notas — ver `SECURITY.md` §10) y, si están configuradas, las credenciales de Google. Sin ella la app **no arranca** (`env.validation.ts`).

```bash
TOKEN_ENCRYPTION_KEY=...    # clave AES-256 en base64: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Si ya tenías datos guardados antes de configurar esta clave, cífralos una vez con `npm run prisma:encrypt-pii` (script idempotente).

**Google Calendar** (Fase 3, opcional): sin configurar, la integración queda deshabilitada sin afectar el resto del panel. Para activarla, añade a `.env`:

```bash
GOOGLE_CLIENT_ID=...        # de una app OAuth en Google Cloud Console (tipo "Web application")
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/integrations/google-calendar/callback  # debe coincidir exactamente con el registrado en Google
FRONTEND_BASE_URL=http://localhost:5173  # solo en dev, para que los callbacks de Google redirijan a Vite y no a :3000
```

**"Continuar con Google"** (login/registro, opcional — independiente de lo anterior): reusa `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (mismo cliente OAuth) más una segunda URI de redirección, registrada también en Google Cloud Console:

```bash
GOOGLE_LOGIN_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

Scripts útiles (raíz): `npm test` (tests del backend), `npm run build` (compila backend + frontend), `npm run prisma:studio` (explorar la BD), `npm run db:down` (apagar contenedores). Dentro de `frontend/`: `npm run build` (build de producción), `npm run lint`.

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
