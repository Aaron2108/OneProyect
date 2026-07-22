# DECISIONS.md

> Creado: 2026-07-22 · Log simple de decisiones. El framework soporta un formato ADR más formal (plantilla MADR, directorio `/docs/adr`, según `.claude/settings.json.claudeFlow.adr`) — no se ha creado `/docs/adr/` todavía; esta lista es el registro mínimo mientras tanto.

## 2026-07-21 — Adopción de `ruflo` como framework base

**Decisión**: usar `ruflo` v3.32.9 (Claude-Flow V3) como capa de orquestación multi-agente para este proyecto, instalado vía `npm install -g ruflo@latest` + `ruflo init --full`.
**Motivo**: framework de coordinación de agentes para Claude Code, con memoria vectorial, hooks y swarm ya integrados.
**Alcance**: capa de tooling/orquestación, no de negocio.

## 2026-07-21 — Repositorio público en GitHub

**Decisión**: el código vive en `https://github.com/Aaron2108/OneProyect`, repositorio público.
**Motivo**: solicitado explícitamente por el propietario.

## 2026-07-22 — Ubicación de la documentación

**Decisión**: toda la documentación de negocio y proceso vive en `/docs/`; la raíz del repo solo contiene `README.md` (portada) y `CLAUDE.md` (gestionado por el framework).
**Motivo**: regla explícita de `CLAUDE.md` — "NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`".

## 2026-07-22 — Documentación de negocio como plantillas pendientes

**Decisión**: `VISION.md`, la sección de negocio de `REQUIREMENTS.md`, la sección de aplicación de `ARCHITECTURE.md`/`DATABASE.md`/`API.md`, y las funcionalidades de `ROADMAP.md` se dejan como plantillas marcadas `PENDIENTE`, sin contenido de producto inventado.
**Motivo**: el propietario aún no ha entregado la descripción completa del proyecto; documentar sin esa información produciría contenido incorrecto o engañoso que luego habría que revertir.
**Revisión**: se actualizará esta decisión (no se sobreescribirá silenciosamente) en cuanto se reciba la descripción del proyecto.

## 2026-07-22 — No modificar archivos gestionados por el framework

**Decisión**: `.claude/`, `.claude-flow/`, `.swarm/`, `.mcp.json`, `CLAUDE.md` y `.gitignore` se tratan como gestionados por `ruflo` (regenerables vía `ruflo init upgrade`/`--force`); no se editan manualmente durante el bootstrap de documentación.
**Motivo**: evitar romper compatibilidad con futuras actualizaciones del CLI y mantener separada la capa de framework de la capa de proyecto.

## 2026-07-22 — Producto definido: WhatsFlow AI

**Decisión**: el propietario entregó la descripción completa del proyecto. `VISION.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md` §2, `DATABASE.md` §2, `API.md` §2 y `ROADMAP.md` quedan completos con contenido real (ver esos archivos). Reemplaza la decisión de "2026-07-22 — Documentación de negocio como plantillas pendientes" de arriba.
**Motivo**: información de negocio ya disponible; ya no aplica el riesgo de fabricar contenido.
**Estado**: confirmada.

## 2026-07-22 — Integración con WhatsApp vía Meta Cloud API oficial

**Decisión**: WhatsFlow AI se conecta a WhatsApp usando la Meta Cloud API oficial, descartando explícitamente un BSP externo (Twilio/360dialog) y librerías no oficiales (Baileys/whatsapp-web.js).
**Motivo**: es la única opción viable para un SaaS que cobrará a clientes reales sin riesgo de bloqueo del número ni violación de los Términos de Servicio de Meta. El propietario confirmó esta opción explícitamente entre las alternativas presentadas.
**Estado**: **confirmada por el propietario** (no revisable sin una nueva conversación explícita sobre el tema).

## 2026-07-22 — Stack técnico de la aplicación (decisiones de arquitecto)

**Decisión**: Node.js + TypeScript, framework NestJS, PostgreSQL (**sin `pgvector` en el MVP**, ver decisión siguiente), Redis + BullMQ para colas, Claude (Anthropic) como motor de IA con tool-calling, hosting en contenedor Docker sobre un PaaS (proveedor concreto sin decidir).
**Motivo** (por elemento):
- *NestJS*: arquitectura modular por diseño, coincide con el requisito explícito de la visión ("arquitectura modular y escalable"); TypeScript-first, buen soporte multi-tenant. *Nota de trade-off: es un framework más pesado (curva + boilerplate) que lo estrictamente necesario para pura velocidad de validación; se mantiene porque la modularidad paga cuando el producto crece, que es lo que pide la visión.*
- *PostgreSQL*: relacional maduro para el modelo de datos (tenants/contactos/conversaciones/citas).
- *Redis + BullMQ*: necesario para no bloquear la respuesta al webhook de Meta con el procesamiento del agente de IA (ver `ARCHITECTURE.md` §2).
- *Claude + tool-calling*: coherente con el entorno de desarrollo actual y con el requisito de que la IA "comprenda el contexto" y "colabore activamente" (acciones reales, no solo texto).
- *Hosting PaaS en contenedor*: mínimo compromiso para el MVP; es la decisión más abierta a cambio de todo este bloque.
**Estado**: **propuesta del arquitecto, revisable** — el propietario puede objetar cualquiera de estos elementos; a diferencia de la decisión de Meta Cloud API, ninguno de estos fue confirmado explícitamente punto por punto.

## 2026-07-22 — Diferir `pgvector`/memoria vectorial fuera del MVP (revisión de decisión previa)

**Decisión**: el MVP usa PostgreSQL sin `pgvector`. La memoria de contexto del agente de IA se resuelve con el historial reciente de la conversación dentro de la ventana de contexto de Claude. Los embeddings, la memoria entre conversaciones y el aprendizaje de patrones del negocio (tabla `ai_context_memory`) se difieren a **Fase 4**.
**Motivo**: revisando la decisión de stack anterior (que incluía `pgvector` en el MVP), se concluyó que es sobre-ingeniería para el objetivo del MVP —validar el negocio—. La respuesta contextual (RF-4) no requiere búsqueda vectorial hasta que las conversaciones sean largas o se necesite recuerdo entre conversaciones; añadirla en Sprint 1 suma complejidad que no ayuda a validar la hipótesis central.
**Estado**: propuesta del arquitecto; **corrige** el elemento `pgvector` de la decisión "Stack técnico de la aplicación" de arriba. Reversible: si aparece una necesidad real de recuerdo semántico antes de Fase 4, se re-evalúa.

## 2026-07-22 — Multi-tenancy del MVP: esquema compartido

**Decisión**: una sola base de datos/esquema PostgreSQL con columna `tenant_id` en todas las tablas de negocio, en vez de una base de datos o esquema por tenant.
**Motivo**: mínima complejidad operativa para el MVP; migrar a esquema-por-tenant más adelante es viable si el volumen lo justifica (ver `ROADMAP.md` Fase 2).
**Estado**: propuesta del arquitecto, revisable en Fase 2.

## 2026-07-22 — ORM: Prisma (Sprint 1)

**Decisión**: usar **Prisma** como ORM/gestor de migraciones sobre PostgreSQL, descartando TypeORM (que quedaba "a confirmar" en el diseño previo).
**Motivo**: mejor experiencia de desarrollo y modelo de migraciones para velocidad de MVP, tipado end-to-end derivado del esquema, y un único archivo de esquema (`prisma/schema.prisma`) como fuente de verdad del modelo de datos. Combo NestJS + Prisma bien soportado.
**Estado**: propuesta del arquitecto, revisable. Trade-off asumido: Prisma es menos "idiomático" con la inyección de dependencias de NestJS que TypeORM, pero se encapsula tras un `PrismaService` global.

## 2026-07-22 — Estructura de código: módulos NestJS por feature (no hexagonal estricto)

**Decisión**: organizar `/src` en módulos de NestJS por feature (controlador → servicio → repositorio Prisma), en lugar de una arquitectura hexagonal estricta con capas domain/application/infrastructure/presentation separadas.
**Motivo**: la hexagonal completa añade boilerplate que no ayuda a validar el negocio en el MVP (mismo criterio anti-sobre-ingeniería que llevó a diferir `pgvector`). La modularidad por feature ya satisface el requisito de "arquitectura modular" de la visión. Se puede refactorizar hacia hexagonal si la complejidad futura lo justifica.
**Estado**: propuesta del arquitecto, revisable. Corrige la descripción de "Capas de negocio" que tenía `ARCHITECTURE.md` §2.

## 2026-07-22 — Modelo de IA por defecto: Haiku (fase de pruebas)

**Decisión**: el motor de IA usa **`claude-haiku-4-5`** por defecto (el modelo más económico de Anthropic, $1/$5 por millón de tokens), configurable con `ANTHROPIC_MODEL`.
**Motivo**: solicitado por el propietario para minimizar el costo durante las pruebas del MVP. El diseño no depende del modelo: subir a `claude-sonnet-5` (o superior) en producción es solo cambiar la variable de entorno, sin tocar código.
**Estado**: propuesta del arquitecto para la fase de pruebas, revisable antes de producción según la calidad de respuesta observada con clientes piloto.
**Nota**: el motor de IA del producto llama a la API de Anthropic con su propia `ANTHROPIC_API_KEY` — es independiente del modelo que se use en Claude Code para desarrollar.

---

Próxima decisión pendiente de registrar: proveedor definitivo de hosting/PaaS antes de pasar a producción real con las primeras empresas piloto.
