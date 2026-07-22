# OneProyect

> Creado: 2026-07-22 · Estado: **bootstrap** (sin código de negocio todavía)

## Qué es este repositorio hoy

Este repositorio es, por ahora, el **andamiaje de orquestación** generado por el framework [`ruflo`](https://www.npmjs.com/package/ruflo) v3.32.9 (internamente "Claude-Flow V3"), instalado vía `ruflo init --full`. Todavía **no tiene nombre de producto ni código de aplicación**: no hay `package.json`, ni `/src`, ni tests. Lo que existe es configuración, agentes, skills y hooks para que Claude Code coordine el desarrollo una vez que el producto esté definido.

El desarrollo real arranca cuando el propietario del proyecto entregue la **descripción completa del producto** (ver `docs/VISION.md`). Hasta entonces, este repo solo contiene documentación de bootstrap.

## Mapa de la documentación

Toda la documentación de negocio y proceso vive en `/docs/` (la raíz solo tiene este README, por convención de `CLAUDE.md`):

| Documento | Contenido |
|---|---|
| [`docs/REPOSITORY_ANALYSIS.md`](docs/REPOSITORY_ANALYSIS.md) | Auditoría técnica completa del framework `ruflo` ya instalado (arquitectura, agentes, skills, riesgos). |
| [`docs/PROJECT.md`](docs/PROJECT.md) | Estado del bootstrap, qué falta, cómo se organiza el trabajo. |
| [`docs/VISION.md`](docs/VISION.md) | **Plantilla pendiente** — se completa con la descripción del producto. |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Requisitos técnicos transversales (ya definidos) + requisitos de negocio (pendientes). |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura del framework (completa) + arquitectura de aplicación (pendiente). |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Esquema de memoria del framework (completo) + modelo de datos de negocio (pendiente). |
| [`docs/API.md`](docs/API.md) | Superficie MCP/CLI existente (completa) + API de producto (pendiente). |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Postura de seguridad, riesgos conocidos y mitigaciones. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 5 fases: MVP, Escalabilidad, Integraciones, IA/automatización, Expansión. |
| [`docs/TASKS.md`](docs/TASKS.md) | Tareas concretas del Sprint 0/1 de bootstrap. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Log de decisiones tomadas hasta ahora. |
| [`docs/AI_RULES.md`](docs/AI_RULES.md) | Reglas de colaboración con IA para este proyecto (resumen human-readable de `CLAUDE.md`). |
| [`docs/AGENTS.md`](docs/AGENTS.md) | Catálogo de responsabilidades de los 89 agentes existentes. |

## Quickstart del framework

```bash
# Ya ejecutado en este repo:
ruflo init --full

# Próximos pasos recomendados (ver docs/TASKS.md):
ruflo doctor --fix
ruflo security scan
ruflo swarm init --topology hierarchical-mesh --max-agents 15
```

## Próximo paso

Este bootstrap está preparado para iniciar el Sprint 1 del MVP en cuanto se reciba la **descripción completa del proyecto** (problema, usuarios, alcance). Hasta ese momento no se escribe código de negocio, siguiendo las reglas en `docs/AI_RULES.md`.
