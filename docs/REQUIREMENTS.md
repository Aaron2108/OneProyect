# REQUIREMENTS.md

> Creado: 2026-07-22

## 1. Requisitos técnicos transversales (definidos — aplican sin importar el negocio)

Derivados de las reglas duras de `CLAUDE.md` y de `.claude/settings.json`, ya vigentes para cualquier código que se escriba en este repo:

- **Tamaño de archivo**: mantener archivos de código/documentación bajo 500 líneas; dividir si se excede.
- **Validación en límites del sistema**: toda entrada de usuario, API externa o archivo de configuración debe validarse en el punto donde entra al sistema, no asumir datos limpios internamente.
- **Sin secretos en el repo**: nunca commitear `.env`, credenciales, API keys o tokens. `.claude/settings.json` ya deniega `Read(./.env)` y `Read(./.env.*)` a nivel de Claude Code.
- **Estructura de carpetas**: código y artefactos van en `/src`, `/tests`, `/config`, `/scripts`; documentación en `/docs`; nada de eso se guarda en la raíz salvo excepciones ya establecidas (`README.md`, `CLAUDE.md`).
- **Tests obligatorios**: tras cualquier cambio de código, correr la suite de tests antes de considerar la tarea terminada; verificar que el build compila antes de commitear.
- **Preferir editar sobre crear**: no generar archivos nuevos si se puede lograr el mismo resultado editando uno existente.
- **Reutilización de agentes/skills**: antes de definir un agente o skill de proyecto nuevo, revisar el catálogo existente en [`AGENTS.md`](AGENTS.md) y en `.claude/skills/`; no duplicar responsabilidades.
- **Cuándo usar swarm**: coordinación multi-agente (swarm) se reserva para cambios de 3+ archivos, features nuevas, refactors cross-módulo, cambios de API, seguridad o performance — no para ediciones triviales.

## 2. Requisitos funcionales de negocio — MVP (WhatsFlow AI, Fase 1)

| # | Requisito | Usuario | Criterio de aceptación |
|---|---|---|---|
| RF-1 | Conexión de un número de WhatsApp de la empresa vía Meta Cloud API | Admin de la empresa cliente | El número queda verificado y recibe/envía mensajes reales a través del sistema. |
| RF-2 | Bandeja de conversaciones (una por contacto/número final) | Equipo comercial/soporte | Los mensajes entrantes de un mismo contacto se agrupan en una sola conversación visible, ordenada por actividad reciente. |
| RF-3 | CRM básico de contactos (nombre, teléfono, notas, historial) | Equipo comercial/soporte | Cada conversación está asociada a un contacto con datos editables y consultables. |
| RF-4 | Agente de IA que responde con contexto del negocio | Cliente final (vía WhatsApp) | La respuesta generada considera el historial de la conversación y datos del contacto, no solo el último mensaje. |
| RF-5 | Agente de IA con ejecución de acciones (tool-calling), no solo texto | Equipo comercial/soporte | El agente puede, dentro de la conversación, crear/actualizar una cita o un recordatorio sin intervención manual del equipo. |
| RF-6 | Programación de citas | Equipo comercial/soporte y cliente final | Una cita creada queda asociada a un contacto y una fecha/hora, y es consultable desde el panel. |
| RF-7 | Recordatorios (de seguimiento o de cita) | Equipo comercial/soporte | El sistema genera un recordatorio visible antes de la fecha asociada. |
| RF-8 | Historial de interacciones por contacto | Equipo comercial/soporte y dueño del negocio | Se puede ver, para un contacto dado, la secuencia completa de mensajes y eventos (citas, recordatorios) pasados. |
| RF-9 | Asistencia en tareas repetitivas (respuestas frecuentes, datos solicitados a menudo) | Equipo comercial/soporte | El agente de IA puede resolver sin intervención humana al menos las consultas repetitivas más comunes definidas por la empresa. |
| RF-10 | Gestión de la ventana de 24h y plantillas de mensaje de Meta | Sistema / equipo comercial | Todo mensaje **proactivo** enviado fuera de la ventana de 24h desde el último mensaje del contacto (p. ej. recordatorios de RF-7, seguimientos) usa una **plantilla pre-aprobada** por Meta; dentro de la ventana se permite mensaje libre. El sistema distingue ambos casos y nunca intenta enviar texto libre fuera de la ventana. |
| RF-11 | Handoff / escalación a un humano | Equipo comercial/soporte y cliente final | El agente de IA puede **dejar de responder automáticamente** y transferir la conversación a una persona ante disparadores definidos (petición explícita del cliente, baja confianza de la IA, o marca manual del equipo). Mientras una conversación está "en manos de un humano", la IA no responde por su cuenta. |
| RF-12 | Opt-in / consentimiento del contacto | Admin de la empresa / sistema | Antes de enviar mensajes proactivos a un contacto, existe un registro de consentimiento (opt-in) conforme a las políticas de Meta; el estado de consentimiento es consultable por contacto (ver `DATABASE.md`, tabla `contact_consent`). |

## 3. Requisitos no funcionales de negocio — MVP

- **Multi-tenant**: cada empresa cliente (tenant) solo puede ver/operar sus propios contactos, conversaciones, citas y recordatorios — aislamiento de datos entre tenants es no negociable (ver `DATABASE.md` §2).
- **Cumplimiento con Meta**: el uso de la Cloud API debe respetar las políticas de mensajería de WhatsApp Business (plantillas para mensajes fuera de la ventana de 24h, opt-in del usuario final, límites de tasa por número) — ver `SECURITY.md` para el detalle de riesgo asociado.
- **Protección de datos de clientes/PII**: las conversaciones contienen datos personales de clientes finales de cada PyME; se manejan con los mismos controles de `SECURITY.md` (sin loguear contenido de mensajes en texto plano fuera de la base de datos de aplicación, acceso restringido por tenant).
- **Disponibilidad razonable para SaaS**: el webhook de recepción de mensajes debe responder rápido (Meta reintenta y puede deshabilitar el webhook si falla reiteradamente) — de ahí la cola asíncrona en `ARCHITECTURE.md` §2, para no bloquear la respuesta HTTP al webhook con el procesamiento del agente de IA.
- **Idioma**: español como idioma principal de la interfaz y de las respuestas del agente de IA (mercado LATAM); no se requiere internacionalización en el MVP.
- **Volumen esperado (MVP)**: validación con un número reducido de empresas piloto — no se diseña para escala masiva todavía (eso es Fase 2, ver `ROADMAP.md`).
- **Guarda de costo/latencia de IA**: cada mensaje entrante que dispara una llamada a Claude tiene costo y latencia reales, sobre márgenes delgados de PyME. El MVP debe incluir al menos: un límite configurable de llamadas de IA por conversación/tenant en una ventana de tiempo, y un mecanismo para no reprocesar con IA mensajes duplicados/de estado (entregas, lecturas) que Meta reenvía. El detalle de umbrales se define en Sprint 1, pero el requisito de tener alguna guarda es del MVP, no diferible.

## 4. Trazabilidad

Cuando se complete la sección 2/3, cada requisito debe poder trazarse a una fase concreta de [`ROADMAP.md`](ROADMAP.md) y, si implica una decisión de arquitectura, a una entrada en [`DECISIONS.md`](DECISIONS.md).
