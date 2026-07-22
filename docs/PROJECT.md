# PROJECT.md

> Creado: 2026-07-22

## Objetivo de este bootstrap

Preparar el repositorio `OneProyect` como base para un proyecto de software cuyo dominio de negocio **todavía no ha sido definido por el propietario**. El objetivo de esta fase no es construir el producto, sino:

1. Comprender por completo el framework de orquestación (`ruflo`/Claude-Flow V3) ya instalado — hecho en [`REPOSITORY_ANALYSIS.md`](REPOSITORY_ANALYSIS.md).
2. Dejar lista toda la documentación de gestión y técnica que no depende del negocio.
3. Dejar plantillas claramente marcadas para la documentación que sí depende del negocio.
4. Definir cómo se van a organizar fases, tareas, decisiones y responsabilidades de agentes para cuando el desarrollo real comience.

## Estado actual

- ✅ Framework `ruflo` v3.32.9 instalado y auditado.
- ✅ Repositorio en GitHub (`Aaron2108/OneProyect`, público).
- ✅ Documentación de bootstrap generada (este conjunto de archivos).
- ⏳ **Pendiente: descripción completa del producto** por parte del propietario.
- ⛔ Sin código de aplicación, sin stack elegido, sin modelo de datos de negocio.

## Qué falta para empezar el Sprint 1

Una descripción del proyecto que permita completar como mínimo:

- `docs/VISION.md` — problema, usuarios, propuesta de valor.
- `docs/REQUIREMENTS.md` (sección de negocio) — funcionalidades esperadas del MVP.
- `docs/ROADMAP.md` (sección de negocio de Fase 1) — qué funcionalidades concretas entran en el MVP.
- `docs/ARCHITECTURE.md` (sección de aplicación) — stack técnico elegido para el producto.

Ver el detalle de la información requerida en cada uno de esos documentos.

## Cómo se organiza el trabajo

- **Fases**: el proyecto se organiza en 5 fases (MVP → Escalabilidad → Integraciones → IA/automatización → Expansión). Ver [`ROADMAP.md`](ROADMAP.md).
- **Sprints**: dentro de cada fase, el trabajo se desglosa en sprints con tareas concretas. Ver [`TASKS.md`](TASKS.md) para el Sprint 0/1 actual (bootstrap).
- **Agentes**: cada tarea de desarrollo se asigna a agentes existentes del catálogo de `ruflo` según su responsabilidad — nunca se crea un agente nuevo sin revisar primero si ya existe uno equivalente. Ver [`AGENTS.md`](AGENTS.md).
- **Decisiones**: cualquier decisión de arquitectura, stack o alcance que cambie lo ya documentado se registra en [`DECISIONS.md`](DECISIONS.md), no se sobreescribe silenciosamente la documentación anterior.

## Principio rector de esta fase

**No se inventa contenido de negocio.** Toda sección de un documento que depende de la descripción del producto queda explícitamente marcada como `PENDIENTE` hasta que el propietario la proporcione. Esto evita construir sobre supuestos incorrectos y mantiene la documentación confiable.
