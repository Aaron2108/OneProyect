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

## 2026-07-22 — No usar la suscripción Pro para la API del producto; modo mock para pruebas

**Decisión**: el motor de IA del producto **no** se autentica con las credenciales de la suscripción Claude Pro/Claude Code. Para probar el pipeline sin créditos de API se añadió un proveedor **`AI_PROVIDER=mock`** que devuelve respuestas simuladas y ejecuta el tool-calling real contra la BD.
**Motivo**: el plan Pro es para uso interactivo, no para acceso programático a la API (Anthropic factura la API aparte, con créditos del Console); enrutar el backend de un SaaS por el token de login sería un mal uso de la suscripción y de su ToS. El modo mock permite validar toda la cadena (webhook → cola → worker → respuesta → persistencia → acciones) sin gastar créditos, y es además una práctica sana de desarrollo local.
**Estado**: confirmada. En producción/pruebas reales se usa `AI_PROVIDER=anthropic` (por defecto) con una `ANTHROPIC_API_KEY` con saldo.

## 2026-07-21 — Módulo de envío saliente: texto libre dentro de la ventana de 24h; token global en el MVP

**Decisión**: `WhatsappSenderService` envía las respuestas al cliente vía la Meta Cloud API (`POST /{phone_number_id}/messages`). En el MVP: (a) solo se envía **texto libre**, y únicamente **dentro de la ventana de servicio de 24h** (RF-10) — fuera de ella el envío se omite y se registra, dejando el uso de **plantillas pre-aprobadas** para una iteración posterior; (b) cada tenant envía desde **su propio `phone_number_id`** (`tenant.whatsappPhoneNumberId`), pero el **access token es global** (`WHATSAPP_ACCESS_TOKEN`, un único número de pruebas); (c) sin access token la respuesta se **persiste pero no se envía** (arranque local / modo mock), igual que `AiService.isEnabled()`.
**Motivo**: enviar plantillas exige darlas de alta y aprobarlas en Meta —un paso de configuración externa aún no disponible—; el texto libre cubre el caso central del MVP (responder a quien acaba de escribir, siempre dentro de la ventana). El token por tenant (onboarding multi-número vía Embedded Signup, con almacenamiento cifrado) se difiere hasta tener más de un número real en producción.
**Estado**: propuesta del arquitecto, revisable. La respuesta siempre queda persistida aunque el envío falle, para que sea visible en la bandeja; al enviarse con éxito se guarda el `wamid` devuelto por Meta (futuro seguimiento de entregas/lecturas).

## 2026-07-21 — Autenticación: JWT sin passport, scrypt para contraseñas, email único global en el MVP

**Decisión**: (a) autenticación con **JWT** verificado por un `JwtAuthGuard` propio (usando `@nestjs/jwt`), **sin passport/passport-jwt** —una dependencia menos, el guard es ~30 líneas—; (b) hashing de contraseñas con **`scrypt` del módulo `crypto` nativo de Node** (formato `salt:hash`, comparación en tiempo constante), **sin `bcrypt`** —evita compilación nativa en Windows y no añade dependencias—; (c) el **email se exige único a nivel global** en el registro, aunque el esquema lo restringe por tenant (`@@unique([tenantId, email])`).
**Motivo**: passport añade abstracción e indirecta que no aporta en un MVP con una sola estrategia (JWT). `scrypt` es un KDF recomendado y suficiente, sin el dolor de instalar `bcrypt` en Windows. El email único global evita que el login por email (que no pide tenant) sea ambiguo entre tenants; es una restricción más estricta a propósito, revisable si en el futuro un mismo email debe pertenecer a varias empresas (entonces el login pediría identificar el tenant).
**Estado**: propuesta del arquitecto, revisable. El `tenantId` viaja en el token y es la única fuente del scope de tenant en las consultas (nunca el cliente) — mismo principio de aislamiento que las herramientas de la IA.

## 2026-07-21 — Eliminación de `ruflo`/Claude-Flow del repositorio (revierte la adopción)

**Decisión**: se elimina por completo el framework `ruflo`/Claude-Flow del repo: carpetas `.claude/agents/`, `.claude/commands/`, `.claude/skills/`, `.claude/helpers/`, `.claude-flow/`, `.swarm/`, el archivo `.mcp.json` y la configuración `claudeFlow` de `.claude/settings.json`. También se borran los documentos que solo describían ese framework (`REPOSITORY_ANALYSIS.md`, `AGENTS.md`, `AI_RULES.md`) y se reescribe `CLAUDE.md` enfocado en WhatsFlow AI. **Revierte** la decisión "2026-07-21 — Adopción de `ruflo` como framework base" y deja sin efecto "2026-07-22 — No modificar archivos gestionados por el framework".
**Motivo**: el desarrollo del MVP se hizo con Claude Code directamente, sin usar la capa de orquestación multi-agente de `ruflo` (los "agentes especializados" son el mismo modelo con un prompt de rol, no capacidades distintas; para trabajo secuencial con contexto ya cargado no aportaban valor y sí sobrecoste). El framework quedaba como andamiaje sin uso: se retira para dejar el repositorio limpio y 100% enfocado en el producto. Se conserva `.claude/settings.json` reducido a la regla que impide leer `.env`.
**Estado**: confirmada por el propietario. Si en el futuro se quisiera una coordinación multi-agente, se re-evaluaría como decisión nueva.

---

Próxima decisión pendiente de registrar: proveedor definitivo de hosting/PaaS antes de pasar a producción real con las primeras empresas piloto.
