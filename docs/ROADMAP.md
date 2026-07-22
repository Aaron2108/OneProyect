# ROADMAP.md

> Creado: 2026-07-22 · Actualizado: 2026-07-22 con la descripción real de **WhatsFlow AI**. Fase 1 es concreta y accionable; Fases 2-5 marcan dirección de producto validada por la visión del propietario, a re-confirmar con datos reales antes de comprometerse a su alcance final.

## Fase 1 — MVP

**Objetivos**: validar con empresas piloto reales que un agente de IA sobre WhatsApp resuelve el problema de conversaciones desorganizadas/seguimiento perdido, sin construir más de lo indispensable.

- **Funcionalidades** (= RF-1 a RF-12 de `REQUIREMENTS.md`): conexión de WhatsApp vía Meta Cloud API, bandeja de conversaciones, CRM básico de contactos, agente de IA con respuesta contextual + tool-calling (citas/recordatorios/contactos), programación de citas, recordatorios, historial de interacciones por contacto, asistencia en tareas repetitivas, **gestión de la ventana de 24h + plantillas de Meta (RF-10), handoff a humano (RF-11) y opt-in del contacto (RF-12)** — estos tres últimos son restricciones propias de construir sobre WhatsApp, no opcionales.
- **Dependencias**:
  - Registro de la app en Meta for Developers + verificación del webhook.
  - Stack decidido en `ARCHITECTURE.md` §2 (NestJS/PostgreSQL/Redis/Claude).
  - Estructura `/src`, `/tests`, `/config`, `/scripts` creada (Sprint 1, ver `TASKS.md`).
  - `ruflo doctor --fix` y `ruflo security scan` resueltos antes de tratar el entorno como estable.
- **Riesgos**: dependencia de aprobación/verificación de negocio de Meta para la Cloud API (puede tomar tiempo, no es instantáneo); calidad de las respuestas del agente de IA con contexto real de una PyME (validar con piloto antes de prometer autonomía total); ver `SECURITY.md` para riesgos de cumplimiento con políticas de mensajería de Meta.

## Fase 2 — Escalabilidad

- **Objetivos**: soportar más empresas piloto/clientes reales sin rediseñar la base de datos ni la arquitectura.
- **Funcionalidades**: revisar si el esquema compartido con `tenant_id` (MVP) necesita evolucionar a esquema-por-tenant; paneles de métricas de uso por tenant; mejoras de rendimiento en la cola de procesamiento de mensajes; posible extracción del motor de IA como servicio independiente si el volumen lo justifica.
- **Dependencias**: MVP validado con al menos las primeras empresas piloto; métricas reales de volumen de conversaciones/tenants.
- **Riesgos**: migrar de esquema compartido a esquema-por-tenant en caliente es una migración de datos delicada — planificar con tiempo, no reactivamente.

## Fase 3 — Integraciones

- **Objetivos**: ampliar más allá de WhatsApp como único canal, y conectar con herramientas que las PyMEs ya usan.
- **Funcionalidades**: otros canales digitales (Instagram, Messenger, email); integraciones con CRMs externos y calendarios (Google Calendar, etc.) para que citas/recordatorios se sincronicen con herramientas que la PyME ya usa.
- **Dependencias**: `API.md` §2 estable y con versionado si ya hay clientes usándola activamente; decisión explícita de qué integración aporta valor real por canal/empresa piloto (no activar todas por defecto).
- **Riesgos**: cada canal nuevo repite el mismo riesgo de cumplimiento que WhatsApp (políticas de la plataforma, riesgo de bloqueo si se usa vía no oficial) — aplicar el mismo criterio que llevó a elegir Meta Cloud API oficial (ver `DECISIONS.md`).

## Fase 4 — IA y automatizaciones

- **Objetivos**: que el agente de IA deje de ser solo reactivo (responde cuando el cliente escribe) y empiece a aportar valor proactivo al negocio.
- **Funcionalidades**: **memoria vectorial de conversación** (`pgvector` + tabla `ai_context_memory`, diferida desde el MVP — ver `DATABASE.md` §2 y `DECISIONS.md`) para recuerdo más allá de la ventana de contexto y entre conversaciones; automatizaciones de seguimiento más complejas (secuencias de recordatorios sin intervención humana); resúmenes automáticos de conversaciones para el dueño del negocio; análisis predictivo de oportunidades de venta a partir del historial; aprendizaje de patrones específicos de cada negocio (qué respuestas funcionan, qué horarios tienen más conversión).
- **Dependencias**: MVP e integraciones estables; volumen de datos histórico suficiente por tenant para que el análisis/aprendizaje tenga valor real.
- **Riesgos**: **no confundir la infraestructura de IA del framework `ruflo`** (SONA/ReasoningBank/Hive-Mind — para orquestar el *desarrollo* del producto) **con la IA del producto** (Claude + tool-calling sobre datos de WhatsFlow AI, para el usuario final) — son capas completamente distintas; esta fase es sobre la segunda.

## Fase 5 — Expansión y arquitectura empresarial

- **Objetivos**: convertir a WhatsFlow AI en el asistente de referencia para PyMEs en Latinoamérica (visión de largo plazo del propietario).
- **Funcionalidades**: multi-usuario avanzado con roles/permisos por tenant, opción white-label para revendedores/agencias, expansión regional (más países de LATAM, posibles particularidades regulatorias/de mercado por país).
- **Dependencias**: fases 1-4 completas y validadas con clientes reales; decisión de negocio explícita de expandirse (no asumir automáticamente).
- **Riesgos**: sobre-ingeniería si se adopta esta fase antes de validar el MVP y la Fase 2 con clientes reales — mantener disciplina de fases secuenciales, como pide el propietario.

---

Cada vez que una fase pase de "orientativa" a "confirmada" con el propietario, actualizar esta sección y registrar el cambio en [`DECISIONS.md`](DECISIONS.md).
