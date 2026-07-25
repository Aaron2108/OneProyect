# WhatsFlow AI — Claude Code Configuration (raíz)

Plataforma SaaS con IA para PyMEs que centraliza la comunicación por WhatsApp
(agente inteligente que responde con contexto del negocio, agenda citas, genera
recordatorios y colabora con el equipo humano). Visión completa en
[`docs/VISION.md`](docs/VISION.md).

## Dos aplicaciones independientes

El proyecto son **dos aplicaciones separadas**, pensadas para vivir en repositorios
de GitHub distintos:

```
/
├── frontend/     # React + Vite — panel web. Ver frontend/CLAUDE.md
└── backend/      # NestJS — API + IA + WhatsApp. Ver backend/CLAUDE.md
```

**Nunca mezclar archivos entre ambas.** El backend ya no sirve el frontend como
build estático: son procesos separados que se comunican por HTTP (CORS habilitado
en el backend hacia el origen del frontend).

### Dónde trabajar según la solicitud

- Si la solicitud menciona UI, diseño, componentes, páginas, estilos, Tailwind,
  React, Vite, navegación o formularios del panel → trabajar en `/frontend`
  (leer primero `frontend/CLAUDE.md`).
- Si la solicitud menciona API, endpoints, NestJS, controladores, servicios, base
  de datos, Prisma, autenticación, JWT o lógica de servidor → trabajar en `/backend`
  (leer primero `backend/CLAUDE.md`).
- Si afecta a ambos lados (p. ej. un campo nuevo que la API expone y el panel
  muestra), analizar primero el impacto y modificar solo los archivos necesarios
  de cada proyecto, cada uno siguiendo las reglas de su propio `CLAUDE.md`.

## Qué queda en la raíz

`docs/` (documentación de producto, válida para ambos lados), `docker-compose.yml`
(Postgres + Redis — infraestructura compartida, no pertenece exclusivamente a
ninguno de los dos), `README.md`, este `CLAUDE.md`.

## Reglas generales

- Hacer solo lo que se pide; ni más ni menos.
- Preferir editar un archivo existente antes que crear uno nuevo.
- No crear documentación nueva salvo que se pida explícitamente.
- Leer siempre un archivo antes de editarlo.
- Nunca commitear secretos, credenciales ni `.env` (ninguno de los dos: `backend/.env` ni `frontend/.env`).
- No añadir trailer `Co-Authored-By` a los commits salvo que este repo lo configure explícitamente en `.claude/settings.json` (`attribution.commit`).
- Mantener los archivos bajo 500 líneas.

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

- Las decisiones de arquitectura se **registran** en `docs/DECISIONS.md`, no se sobreescriben:
  un cambio que reemplaza algo documentado se añade como entrada nueva.
- El contenido de negocio (VISION, REQUIREMENTS, etc.) no se inventa; se completa solo con
  información proporcionada por el propietario.
- Código y comentarios en español (coherente con el resto del repo), en ambos proyectos.
