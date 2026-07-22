# PROJECT.md

> Creado: 2026-07-22 · Actualizado: 2026-07-21.

## Qué es

**WhatsFlow AI** — plataforma SaaS con IA para PyMEs de LATAM que centraliza la comunicación
por WhatsApp: un agente inteligente que responde con contexto del negocio, agenda citas,
genera recordatorios y colabora con el equipo humano. Visión y problema en
[`VISION.md`](VISION.md).

## Estado actual

- ✅ Producto definido; documentación de negocio completa (VISION, REQUIREMENTS, ARCHITECTURE, DATABASE, API, ROADMAP, SECURITY).
- ✅ Repositorio en GitHub (`Aaron2108/OneProyect`).
- ✅ **Sprint 1 (MVP) en desarrollo**, rama `sprint-1-mvp`. Backend NestJS con: webhook de WhatsApp (firma HMAC + cola + worker), motor de IA (Claude + tool-calling + proveedor mock), envío saliente (Meta Cloud API + ventana 24h), auth JWT con scope de tenant, CRUD de contactos/citas/recordatorios, bandeja de conversaciones con handoff humano (RF-11) y un panel web mínimo. Todo con tests (Jest) verdes.
- ⏳ Pendiente: registro de la app en Meta (credenciales del propietario), plantillas de Meta, worker de recordatorios programados, y prueba en vivo con Claude real (a la espera de créditos de API).

## Cómo se organiza el trabajo

- **Fases**: 5 fases (MVP → Escalabilidad → Integraciones → IA/automatización → Expansión). Ver [`ROADMAP.md`](ROADMAP.md).
- **Sprints**: dentro de cada fase, el trabajo se desglosa en tareas concretas. Backlog y estado del Sprint 1 en [`TASKS.md`](TASKS.md).
- **Decisiones**: cualquier decisión de arquitectura, stack o alcance que cambie lo ya documentado se **registra** en [`DECISIONS.md`](DECISIONS.md), no se sobreescribe silenciosamente.

## Principio rector

**No se inventa contenido de negocio.** Toda sección que dependa de información del propietario
se completa solo con lo que él proporciona, nunca con supuestos, para mantener la documentación
confiable.
