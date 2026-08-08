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

## 2026-07-22 — Migración del panel a React (Vite + TypeScript), sin Next.js ni monorepo

**Decisión**: se retira el panel vanilla (`public/index.html`, HTML/CSS/JS puro sin build) y se reconstruye en `/frontend` como una SPA de **React 18 + TypeScript + Vite**, con **Tailwind CSS** (tokens del sistema de diseño como variables CSS, única fuente de verdad), **Radix UI** (primitivos accesibles: Dialog, Popover, DropdownMenu, Tabs, Toast), **Framer Motion** (animación con intención), **Recharts** (gráfico de actividad) y **`@formkit/auto-animate`** (listas). Explícitamente **no** se adopta Next.js (no hay SSR ni rutas públicas que indexar — es un dashboard tras login; Vite SPA es la opción más simple que cubre el requisito) y explícitamente **no** se crea un monorepo con workspaces todavía (solo existe una app frontend; herramientas de monorepo son complejidad sin beneficio hasta que exista un segundo consumidor real). `frontend/` es un proyecto npm independiente; `npm run build` (raíz) compila backend y frontend y Nest sirve el build estático de `frontend/dist` — sigue siendo una sola app desplegable.
**Motivo**: el panel vanilla había crecido a ~1200 líneas de manipulación imperativa del DOM con estado disperso, el punto donde un vanilla-JS SPA empieza a ser frágil de mantener. El nivel visual pedido por el propietario (profundidad, glassmorphism, modo oscuro cinematográfico, componentes accesibles, tri-voz reforzada) se logra de forma más rápida y consistente con un framework de componentes y las librerías de UI/accesibilidad/animación del ecosistema React, en vez de reconstruirlas a mano. El propietario planea construir un panel de administración (probablemente cross-tenant) más adelante; la estructura por *features* + tokens de diseño centralizados (`frontend/src/styles/tokens.css`) deja ese terreno listo para extraer un paquete de diseño compartido cuando llegue ese segundo consumidor, sin pagar el costo de un monorepo hoy.
**Estado**: confirmada por el propietario. Revisar la decisión de "sin monorepo" explícitamente cuando arranque el desarrollo del panel admin.

## 2026-07-23 — Google Calendar: primera integración de Fase 3, una sola vía y por tenant

**Decisión**: se implementa la sincronización de citas con Google Calendar (`src/google-calendar/`) con tres restricciones deliberadas de alcance: (a) **una sola vía**, WhatsFlow → Google — crear/editar/cancelar una cita en el panel crea/actualiza/borra el evento correspondiente; no se importan cambios hechos directamente en Google Calendar; (b) **conexión a nivel de tenant**, no por usuario individual — el OWNER conecta una vez la cuenta de Google del negocio (OAuth2, scope `calendar.events` + `openid email`) y todas las citas del tenant se reflejan en ese calendario; (c) integración vía **`fetch` nativo** contra la API REST de Google (OAuth token endpoint + Calendar Events API), sin la librería `googleapis` del SDK oficial. Los tokens (`access_token`/`refresh_token`) se cifran en reposo con AES-256-GCM (`src/common/crypto.util.ts`, clave `TOKEN_ENCRYPTION_KEY`).
**Motivo**: (a) la sincronización bidireccional exige webhooks push de Google (`watch`/canales de notificación), tokens de sincronización incremental y lógica de resolución de conflictos cuando el mismo evento cambia en ambos lados — complejidad y superficie de fallo que no se justifican para el primer uso de esta integración; puede añadirse después si el negocio lo necesita. (b) un calendario por negocio es el modelo natural de un calendario de citas de PyME (no cada agente individual necesita su propia cuenta de Google conectada); reduce el estado a mantener (un solo par de tokens por tenant en vez de uno por usuario). (c) `googleapis` es un paquete grande pensado para cubrir toda la superficie de las APIs de Google; aquí se usan 3 endpoints REST bien documentados, y el proyecto ya sigue este criterio con `WhatsappSenderService` (fetch nativo contra la Cloud API de Meta en vez de un SDK). El cifrado en reposo de los tokens se adelanta desde el backlog de "cifrado de PII" (`TASKS.md`) porque un token OAuth de Google es más sensible que un dato de contacto: da acceso de escritura al calendario del negocio si se filtra la base de datos.
**Estado**: confirmada por el propietario ("si avanza" tras elegir explícitamente una sola vía y conexión por tenant en las opciones presentadas). Requiere que el propietario registre una app OAuth en Google Cloud Console y configure `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` — sin esas credenciales la integración queda deshabilitada (`GoogleCalendarOauthService.isConfigured()`) sin romper el resto del panel, mismo patrón que `WHATSAPP_ACCESS_TOKEN`/`ANTHROPIC_API_KEY`.

## 2026-07-23 — "Continuar con Google" para login/registro, independiente de la integración de Google Calendar

**Decisión**: se añade "Continuar con Google" como método alternativo (no exclusivo) de entrar a WhatsFlow, separado por completo de la integración de Google Calendar (misma fecha, ver decisión anterior): (a) scope mínimo `openid email profile` — nunca `calendar.events`, este flujo es solo identidad; (b) es **por usuario**, cualquier miembro del equipo puede conectarlo, no solo el OWNER; (c) alta en dos pasos cuando el email es nuevo — Google no aporta el nombre de la empresa, así que se pide una vez en un paso intermedio (token de alta pendiente, firmado, ~15 min) antes de crear el tenant; (d) si el email ya existe (registrado por el flujo normal), se vincula el `googleId` a esa cuenta y funciona como login; (e) `User.passwordHash` pasa a ser **nulo** para cuentas creadas solo con Google — el login por contraseña las rechaza explícitamente, y `changePassword` permite establecer una contraseña por primera vez sin pedir la "actual" (no existe) porque el JWT de sesión ya es prueba suficiente de identidad. Se extrajo `src/common/google-oauth.util.ts` con las primitivas de bajo nivel (canjear código, leer perfil vía el endpoint `userinfo` de OpenID Connect) compartidas entre este flujo y `google-calendar/`.
**Motivo**: reduce fricción de alta para negocios que ya usan Google Workspace, sin acoplar identidad de WhatsFlow con acceso al calendario — son dos concesiones (*grants*) de naturaleza distinta y no tiene sentido pedir una para conseguir la otra. Un cliente que se registra normal (email+contraseña) sigue necesitando conectar su cuenta de Google por separado si quiere sincronizar citas, exactamente como antes de esta decisión.
**Estado**: confirmada por el propietario. Requiere las mismas credenciales de Google Cloud Console que Calendar (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, un solo cliente OAuth) más un `GOOGLE_LOGIN_REDIRECT_URI` adicional registrado como URI de redirección autorizada de ese mismo cliente. Sin esas variables el botón "Continuar con Google" queda deshabilitado (`GoogleAuthService.isConfigured()`), sin afectar el login por contraseña.

## 2026-07-23 — Cifrado en reposo del contenido de conversaciones; `phone`/`name` quedan en claro

**Decisión**: se cifra en reposo (AES-256-GCM, mismo mecanismo que los tokens de Google — `PiiCryptoService` sobre `common/crypto.util.ts`) el contenido real de las conversaciones: `Message.content`, `ConversationNote.body` y `Contact.notes`. **`Contact.phone` y `Contact.name` quedan sin cifrar, a propósito**: ambos se buscan con `contains` (búsqueda parcial) en la bandeja y en contactos, y `phone` además tiene un índice único por tenant (`@@unique([tenantId, phone])`) usado en cada mensaje entrante para encontrar/crear el contacto — cifrar con AES-GCM (no determinista) rompe las tres cosas, y arreglarlo exige un **índice ciego** (un hash determinista aparte, columna nueva, para el único y la búsqueda) que además degradaría la búsqueda actual a solo-coincidencia-exacta (perdería, por ejemplo, que buscar "Mar" encuentre a "María"). `TOKEN_ENCRYPTION_KEY` pasa a ser una variable de entorno **obligatoria** (antes solo la usaba, opcionalmente, Google Calendar) — no tiene sentido arrancar con parte de las conversaciones cifradas y parte no. Se añadió `prisma/encrypt-existing-pii.ts` (`npm run prisma:encrypt-pii`), un script idempotente que cifra en un solo paso los datos que ya existían en claro antes de esta funcionalidad (se corrió sobre los datos de la demo).
**Motivo**: es el dato más sensible del sistema (el contenido real de lo que un cliente final le escribió a una PyME) y no tiene ningún costo de funcionalidad cifrarlo — a diferencia de `phone`/`name`, nadie busca por el texto de un mensaje. Cifrar `phone`/`name` también es deseable a futuro, pero es una decisión de producto aparte (¿vale la pena perder la búsqueda parcial?) que no se tomó unilateralmente — se presentó explícitamente al propietario, que eligió dejarlos en claro por ahora.
**Estado**: confirmada por el propietario (eligió el alcance "solo mensajes y notas" entre las dos opciones presentadas). Revisar `phone`/`name` como decisión aparte si en el futuro la normativa o un cliente piloto lo exige — ver `SECURITY.md` §10 para el diseño de índice ciego si se retoma.

## 2026-07-23 — "Continuar con Google": navegación de página completa, sin popup

**Decisión**: el botón "Continuar con Google" navega la propia pestaña a Google y de vuelta (`window.location.href`), en vez de abrir una ventana emergente. Se intentó primero un popup (con `window.open`, relevo del resultado a la ventana principal vía `localStorage` y auto-cierre) por pedido explícito del propietario ("no se puede abrir encima como lo hacen otras webs"), pero se revirtió tras encontrar **tres fallos distintos en tres intentos**, todos causados por `Cross-Origin-Opener-Policy` (la cabecera que envían las páginas de accounts.google.com): (1) leer `popup.closed` desde la ventana principal quedó bloqueado por el navegador; (2) `window.name`, que se intentó usar para distinguir "esta ventana es el popup", tampoco sobrevivía de forma fiable el salto a un origen con COOP; (3) aun con las dos correcciones anteriores, el aviso por `localStorage` seguía sin llegarle de forma confiable a la ventana principal (condición de carrera entre el `setItem` y el cierre casi inmediato de la ventana, agravada porque COOP fuerza al popup a un proceso de navegador distinto).
**Motivo**: cada fallo era una manifestación distinta de la misma causa raíz (COOP), no bugs aislados — perseguirlos uno por uno tenía retornos decrecientes. La navegación de página completa no depende de nada de eso: es la misma ventana la que hace la ida y vuelta, sin comunicación entre ventanas ni cierre automático que fallar.
**Estado**: confirmada (implícitamente, al resolver el bug que el propietario reportó tras probarlo). Si más adelante se quiere retomar el popup, considerar la librería/patrón que usa el propio botón "Sign in with Google" de Google (que evita estos problemas con un intermediario bajo su control), en vez de reimplementarlo a mano.

## 2026-07-23 — Pestaña "Calendario" propia; vista de mes sin librería externa

**Decisión**: se agrega "Calendario" como pestaña de primer nivel del panel (`frontend/src/features/calendar/`), con una vista de mes (grilla de 6 semanas, hecha con `Date` nativo y CSS grid, sin `date-fns`/`dayjs` ni un componente de calendario de terceros) que muestra las citas del tenant, permite crear/editar/cancelarlas desde ahí, y aloja la tarjeta de conexión a Google Calendar (antes vivía dentro de "Equipo"). El backend gana filtro `from`/`to` en `GET /appointments` (antes solo filtraba por `contactId`, sin rango de fechas ni paginación) e incluye los datos mínimos del contacto (`id`/`name`/`phone`) en cada cita para no tener que resolverlos aparte.
**Motivo**: hasta ahora el modelo de citas existía en la base de datos y en la API, pero nunca tuvo una pantalla propia en el panel — solo la IA las creaba (tool-calling) o se gestionaban llamando a la API directo; el propio código de `AppointmentsService` ya documentaba la intención de que el equipo humano las gestionara desde el panel. Construir la vista de calendario primero (una grilla propia, ligera) en vez de sumar una librería de calendario de terceros sigue el mismo criterio anti-sobre-ingeniería que el resto del frontend (mismo razonamiento que evitó Lottie o un monorepo prematuro).
**Estado**: confirmada por el propietario. Verificado end-to-end en navegador: crear/editar/cancelar cita, contador de citas por día, orden por hora, búsqueda de contacto al crear.

---

## 2026-07-23 — Reintentos con backoff para la sincronización con Google Calendar

**Decisión**: `GoogleCalendarSyncService` ya no abandona en silencio si la llamada a la API de Google falla (red, token, rate limit): agenda el intento en una tabla nueva, `GoogleCalendarSyncJob` (un job por cita, `@unique` en `appointmentId`), con backoff exponencial (5 min → 6h, tope `MAX_SYNC_ATTEMPTS = 8`). Un worker periódico (`GoogleCalendarSyncProcessor`, BullMQ, mismo patrón que `reminders/reminder.processor.ts`) revisa cada 5 minutos los reintentos vencidos con el mismo claim atómico (`updateMany` con guarda + lease) que ya usan los recordatorios, para que no se procesen dos veces en paralelo. Se aprovechó para unificar `syncOnCreate`/`syncOnUpdate` en un único método interno de reconciliación (`reconcile`) que decide crear/actualizar/borrar el evento según el estado de la cita — ya era, de hecho, la misma lógica repetida dos veces.
**Motivo**: antes, una cita creada mientras Google Calendar tenía un fallo transitorio (o el token estaba en un estado raro) quedaba desincronizada para siempre — WhatsFlow seguía siendo la fuente de verdad para la cita en sí, pero el evento en Google nunca aparecía y nada lo reintentaba. Con empresas piloto reales esto es silencioso y confuso ("¿por qué esta cita no está en mi Google Calendar?"). El límite de reintentos evita que una integración rota (p. ej. token revocado y sin poder refrescarse) reintente indefinidamente; al agotarse se registra un error explícito pidiendo revisión manual, no hay tarea de alerta al usuario todavía (no existe sistema de notificación por email en el producto).
**Estado**: implementada y probada (`tests/google-calendar/google-calendar-sync.service.spec.ts`, incluye reintento exitoso, backoff progresivo y abandono tras agotar intentos).

---

## 2026-07-23 — Memoria de contexto de la IA (Fase 4): `pgvector` + Voyage AI, se guarda al cerrar la conversación

**Decisión**: se adelanta la primera pieza de Fase 4 mientras se espera la aprobación de Meta y los créditos de Anthropic (ninguna de las dos la bloquea). Se agrega `ai_context_memory` (Postgres con `pgvector`, imagen `pgvector/pgvector:pg16`) para recordar, por contacto, resúmenes de conversaciones pasadas más allá de la ventana de contexto de la conversación en curso. Flujo: al **cerrar** una conversación (`ConversationsService.setStatus`), se resume con la IA (`AiService.summarize`, nuevo método, 1-2 frases) y se guarda cifrado junto con su embedding (`AiContextMemoryService.remember`); al **responder**, se recuperan los recuerdos más similares al último mensaje del contacto (`AiContextMemoryService.recall`, siempre `tenantId`+`contactId` exactos) y se añaden al `system` prompt. Los embeddings los genera **Voyage AI** (`voyage-3-lite`, 512 dimensiones) — Anthropic no tiene API de embeddings propia y recomienda Voyage — con un proveedor `mock` determinístico (`EMBEDDINGS_PROVIDER=mock`) para desarrollo local sin gastar créditos, mismo patrón que `AI_PROVIDER=mock`. La columna `embedding` es `Unsupported("vector(512)")` en Prisma (no representable en el Client); `AiContextMemoryService` es la única clase que la toca, siempre con SQL parametrizado.
**Motivo**: RF-4 ("contexto del negocio") en el MVP terminó siendo solo historial de la conversación en curso + datos del contacto — la IA no recordaba nada de conversaciones anteriores con el mismo cliente una vez cerradas. Construir la memoria vectorial ahora (en vez de esperar a Fase 4 completa) tiene sentido porque es infraestructura pura: no necesita datos históricos reales para funcionar correctamente (a diferencia del análisis predictivo o el aprendizaje de patrones, que si se construyeran ahora serían pura especulación sin datos — se dejan para cuando haya volumen real, ver `ROADMAP.md`). El trigger es el cierre explícito de la conversación (no un resumen por cada mensaje, ni automático por inactividad) — el límite más simple que sigue el mismo criterio anti-sobre-ingeniería del resto del proyecto; se puede revisar la cadencia con datos reales de uso.
**Estado**: implementada y probada (unitarios con mocks + una prueba manual contra Postgres/pgvector real confirmando el orden por similitud de coseno). Documentado en `ARCHITECTURE.md`, `DATABASE.md` y `SECURITY.md` §12.

---

## 2026-07-23 — Apartado propio "Agente IA": perfil de negocio configurable por el propietario

**Decisión**: se agrega `BusinessProfile` (1—1 con `Tenant`): campos de texto libre y acotados en longitud (horario de atención, servicios/productos, políticas, tono, instrucciones adicionales) que el propietario completa desde una pestaña nueva del panel, "Agente IA" (`frontend/src/features/ai-agent/`). `GET /business-profile` lo puede ver cualquier miembro del equipo; `PUT /business-profile` (reemplazo completo) es **solo OWNER** — mismo patrón de permisos que invitar al equipo. `BusinessProfileService.describe()` devuelve solo las líneas de los campos que sí tienen contenido (nunca inventa lo que falta) y `AiService.buildSystemPrompt` las añade al `system` prompt en cada respuesta, junto a los recuerdos de `AiContextMemoryService`.
**Motivo**: en el MVP, RF-4 ("contexto del negocio") terminó siendo solo historial de conversación + datos del contacto — la IA nunca tuvo un lugar donde el dueño le contara nada real del negocio (horarios, qué vende, sus reglas). Se construye ahora, con campos de texto simples, en vez de esperar a subir documentos/catálogos con búsqueda semántica (eso sigue en el backlog de Fase 4, el propietario lo pedirá explícitamente cuando llegue el momento) — mismo criterio anti-sobre-ingeniería del resto del proyecto: la versión más simple que resuelve el problema real ("la IA no sabe nada del negocio") antes de construir la versión más compleja ("la IA busca en documentos largos").
**Estado**: implementada y probada (unitarios de `BusinessProfileService` + `AiService`, y una verificación manual end-to-end contra el backend real: OWNER puede leer/escribir, AGENT solo puede leer — `PUT` como AGENT responde 403).

---

## 2026-07-23/24 — Seguimiento automático sin intervención humana (Fase 4)

**Decisión**: si un contacto no responde a un mensaje de la IA, `ConversationFollowUpService` le envía **un único** mensaje de seguimiento automático (`MAX_FOLLOW_UPS = 1`) generado por la IA (`AiService.generateFollowUp`, con el tono del perfil de negocio si está configurado). Un worker periódico (`ConversationFollowUpProcessor`, BullMQ, cada 30 min) revisa las conversaciones `OPEN` atendidas por la IA cuyo último mensaje fue saliente hace más de `FOLLOW_UP_DELAY_MS` (12h — deliberadamente menos que las 24h de RF-10, para que el seguimiento se pueda mandar como texto libre sin depender de una plantilla pre-aprobada, que sigue pendiente). En vez de enviar directo, se crea un `Reminder` (marcado `source: "auto-followup"`) y se deja que `ReminderDispatchService` lo despache — así el seguimiento reutiliza, sin duplicar, el consentimiento (RF-12), la ventana de 24h y el backoff que ya están implementados y probados ahí. `Conversation.followUpCount` (con un claim optimista tipo compare-and-swap, igual de simple que el resto del proyecto) evita duplicados entre ticks/instancias, y se resetea a 0 en cuanto el contacto vuelve a escribir (`InboundMessageProcessor`), rompiendo la racha de silencio.
**Motivo**: es el problema central que menciona la visión del producto — "seguimiento perdido" — y se apoya en infraestructura ya construida (recordatorios) en vez de crear un camino de envío paralelo. El límite de un solo seguimiento automático es deliberado: el objetivo es no perder al cliente, no insistirle: más de uno se siente como spam. Solo aplica a conversaciones que atiende la IA (no las que un humano ya está gestionando activamente) para no interferir con el trabajo del equipo.
**Estado**: implementada y probada (unitarios de `ConversationFollowUpService` + `AiService.generateFollowUp`, y una verificación manual end-to-end contra la base real: conversación vieja sin respuesta → se crea el `Reminder`, `followUpCount` sube a 1, una segunda pasada inmediata no duplica).

---

## 2026-07-24 — Auditoría de endurecimiento: dos correcciones reales (citas de la IA sin sincronizar, condición de carrera en email)

**Contexto**: mientras se espera la aprobación de Meta, el propietario pidió "pulir/asegurar" lo ya construido. Se hizo una auditoría dirigida (aislamiento multi-tenant, condiciones de carrera en los 3 workers periódicos, cifrado en reposo, validación de entrada, guards de rol, límites de consulta, índices) en vez de un refactor genérico. De ~6 hallazgos, dos eran bugs reales (no cosméticos) y se corrigieron; el resto quedan anotados sin acción por ahora (ver abajo).

**Corrección 1 — las citas creadas por la IA nunca sincronizaban con Google Calendar**: `AiToolExecutorService.createAppointment` (tool-calling) llamaba a `prisma.appointment.create(...)` directo, saltándose `AppointmentsService.create()` — que es quien dispara `GoogleCalendarSyncService.syncOnCreate`. Como el canal principal de creación de citas en producción es justo la conversación de WhatsApp, cualquier tenant con Calendar conectado no iba a ver ahí las citas que agenda la IA — contradecía literalmente lo que dice `API.md` sobre que la IA está sujeta "a las mismas reglas... que si la creara un humano desde el panel". Se corrigió inyectando `AppointmentsService` en `AiToolExecutorService` (vía `AppointmentsModule.exports`, importado en `AiModule`) y llamando a `appointments.create(...)` en vez de Prisma directo.
**Corrección 2 — condición de carrera real en la unicidad de email entre tenants**: `AuthService.register`, `UsersService.invite` y `GoogleAuthService.completeSignup` verificaban email único con `findFirst` + `create` por separado (TOCTOU) — el esquema solo restringía `[tenantId, email]`, no `email` global, aunque el propio código ya decía en un comentario que se exigía único a nivel global "para que el login no sea ambiguo". Dos altas concurrentes con el mismo email en tenants distintos podían pasar ambas el `findFirst` antes de que la otra hiciera `create`. Se corrigió con `User.email @unique` en el esquema (migración `user_email_globally_unique`) + un `try/catch` en los tres sitios que traduce el `P2002` de Prisma (`common/prisma-error.util.ts`, `isUniqueConstraintViolation`) al mismo `ConflictException` de siempre. Verificado disparando dos altas concurrentes de verdad contra Postgres: antes del fix ambas habrían tenido éxito (2 filas con el mismo email); después, exactamente una gana y la otra recibe `P2002`.
**Hallazgos anotados sin corregir ahora** (severidad menor o requieren una decisión de producto que no es solo técnica): `Reminder.message` no se cifra en reposo (inconsistente con `Message.content`/`ConversationNote.body`/`Contact.notes`, pero cambiarlo ahora es una decisión de alcance, no un bug); falta un índice para el scan global de `ConversationFollowUpService.scanAndSchedule` (no importa con pocos tenants, sí a escala); ventana de ~60s donde un auto-seguimiento podría enviarse justo después de que el cliente ya respondió (impacto solo de UX, muy baja probabilidad); `RemindersController.list` usa `@Query()` crudo en vez de un DTO validado (inconsistencia de estilo, no vulnerabilidad).
**Estado**: ambas correcciones implementadas y probadas (unitarios actualizados en `ai-tool-executor.service.spec.ts`, `auth.service.spec.ts`, `google-auth.service.spec.ts`, `users.service.spec.ts`, `prisma-error.util.spec.ts`; verificación manual contra la base real para ambas).

---

Próxima decisión pendiente de registrar: proveedor definitivo de hosting/PaaS antes de pasar a producción real con las primeras empresas piloto.

## 2026-07-25 — Separación del repositorio en `/frontend` y `/backend`

**Decisión**: el backend NestJS pasa de la raíz a `/backend`; `/frontend` se mantiene donde estaba. Cada carpeta es una aplicación independiente con su propio `package.json`, `.env` y despliegue, pensadas como repositorios de GitHub separados. `docker-compose.yml` (Postgres + Redis) y `/docs` quedan en la raíz porque son infraestructura y documentación compartidas.
**Motivo**: solicitado por el propietario para publicar frontend y backend como repos independientes.
**Consecuencia**: el backend ya **no sirve** el build de React como estático (se quitó `useStaticAssets` de `main.ts`) y expone solo la API con CORS habilitado hacia `FRONTEND_BASE_URL`. El frontend usa `VITE_API_URL` cuando no hay proxy de desarrollo de por medio.

## 2026-07-25 — Conocimiento del negocio a partir de documentos (RAG por tenant)

**Decisión**: el negocio puede subir documentación (PDF con texto, PDF escaneado, Word `.docx`, texto plano y Markdown) en el apartado "Agente IA". El texto se extrae, se parte en fragmentos con solape, se generan embeddings y se recuperan **solo los fragmentos relevantes** al mensaje del cliente para inyectarlos en el system prompt.

**Motivo**: sin esto la IA solo conocía los campos libres del perfil de negocio, y las PyMEs ya tienen sus políticas y servicios escritos en documentos.

**Tabla propia (`knowledge_documents` + `knowledge_chunks`), no reutilizar `ai_context_memory`**: esa tabla es memoria **por contacto** (`contact_id` obligatorio); el conocimiento del negocio es **del tenant** y aplica a cualquier conversación.

**Por qué recuperación y no inyectar los documentos completos**: el system prompt se paga en **cada** mensaje de WhatsApp. Inyectar 20 páginas por respuesta multiplicaría el costo por conversación y dejaría corta la guarda de costo de `AiService`. Se recuperan 4 fragmentos como máximo.

**Revisión obligatoria antes de activar**: al subir, el documento queda en `PENDING_REVIEW` con su texto extraído a la vista; la IA solo lo usa cuando el dueño confirma. Sin ese paso, el dueño no tendría forma de ver qué entendió el sistema de su PDF antes de que el agente empiece a responderles a sus clientes con eso.

**Aislamiento y cifrado**: el recall filtra siempre por `tenantId` y por estado `ACTIVE`, con SQL parametrizado (nunca interpolado). Los fragmentos se cifran en reposo con `PiiCryptoService`, igual que los mensajes y notas (SECURITY.md §10). No se guarda el archivo original: la IA no lo necesita y no almacenarlo reduce la superficie de datos.

## 2026-07-25 — OCR de PDFs escaneados con la visión nativa de Claude

**Decisión**: cuando un PDF no tiene capa de texto, se transcribe mandándolo como bloque `document` a la API de Anthropic (Claude procesa las páginas también como imagen), en vez de integrar un motor de OCR.

**Motivo**: Tesseract exigiría además renderizar PDF→imagen, lo que en Windows arrastra dependencias nativas (GraphicsMagick/Ghostscript) con calidad variable. El SDK de Anthropic ya está en el proyecto y acepta el PDF directo.

**Cascada, no OCR por defecto**: primero se intenta la extracción nativa (gratis) y **solo si no hay texto** se paga la transcripción. Es un costo de una sola vez al subir —se guarda el texto resultante—, no por cada mensaje.

**El umbral se mide por página, no en total**: un mínimo absoluto confundía "documento corto" con "escaneo" y mandaba a visión una lista de precios de una página, gastando créditos sin necesidad. Una página escaneada devuelve ~0 caracteres; una con texto real, cientos (`MIN_CHARS_PER_PAGE`).

**Límites**: 100 páginas por PDF (el tope de la API con `claude-haiku-4-5`, de 200K de contexto; los modelos de 1M llegan a 600) y 15 MB por archivo (base64 infla ~1.37x sobre el límite de 32 MB por request).

## 2026-07-25 — `EmbeddingsModule` y `AiContextModule` para evitar dependencias circulares

**Decisión**: `EmbeddingsService` se extrae a `EmbeddingsModule`, y el endpoint que compone el contexto de la IA vive en un `AiContextModule` propio (`GET /ai-context`).
**Motivo**: `AiModule` necesita el recall del conocimiento y `KnowledgeModule` necesita los embeddings; dejar `EmbeddingsService` dentro de `AiModule` habría forzado `Knowledge → Ai → Knowledge`. El endpoint de contexto compone perfil + conocimiento + motor de IA, así que ponerlo en cualquiera de esos módulos también cerraba un ciclo: su módulo no lo importa nadie.

## 2026-07-25 — Proveedor de IA de pruebas compatible con OpenAI (NVIDIA NIM)

**Decisión**: se añade `AI_PROVIDER=nvidia`, que enruta las respuestas del agente a NVIDIA NIM (API compatible con OpenAI) en vez de a Anthropic. Vive en `NvidiaChatService`, aparte del camino de producción.

**Es temporal y su alcance es el testeo**: permite ejercitar el agente **real** —incluido el tool-calling contra la BD— mientras no hay API key de Anthropic. El agente de producción sigue siendo Claude; el modo `mock` sigue existiendo para pruebas sin red.

**Por qué un servicio aparte y no un `if` dentro de `AiService`**: los formatos difieren (herramientas bajo `function.parameters` en vez de `input_schema`; resultados como mensajes `role: 'tool'` en vez de bloques `tool_result`). Aislarlo deja el camino de Claude intacto y hace que borrar el proveedor sea quitar un archivo y una rama del `if`.

**Lo que NO se duplica**: el system prompt, la lista de herramientas (`AI_TOOLS`, definida una sola vez y traducida al vuelo), la inyección del contexto de confianza por el ejecutor y el respaldo de texto vacío son los mismos para los dos proveedores. Cambiar de proveedor para probar no cambia lo que la IA sabe ni lo que puede hacer.

**Guardas propias**: límite de espera con `AbortController` (sus modelos arrancan en frío y pueden tardar minutos; sin esto el worker de WhatsApp se quedaría colgado), descarte del razonamiento `<think>` para que nunca llegue al cliente, y argumentos de herramienta ilegibles se le devuelven al modelo como error en vez de ejecutar nada contra la BD.

**Embeddings siguen en `mock`**: los modelos de embedding de NVIDIA devuelven 1024 o 2048 dimensiones y las columnas `vector(512)` (`ai_context_memory`, `knowledge_chunks`) están fijadas a la dimensión de `voyage-3-lite`. Aprovecharlos exigiría una migración de ambas columnas, que no se justifica por una credencial de prueba.

## 2026-07-25 — La IA recibe la fecha de hoy y la zona horaria del negocio

**Decisión**: el system prompt incluye la fecha actual y la zona horaria del negocio (`BUSINESS_TIME_ZONE`, o la del servidor si no está), y las herramientas con fecha exigen ISO 8601 **con desplazamiento**, no en UTC.

**Motivo**: se detectó agendando citas de verdad. El prompt no decía qué día era, así que el modelo **adivinaba el año**; y como el ejemplo de las herramientas usaba `Z`, escribía la hora en UTC: un cliente que pedía "las 4 de la tarde" terminaba con la cita a las 11:00 en un servidor en `America/Lima` (5 horas de corrimiento). Las dos cosas afectaban igual a Claude y al proveedor de pruebas.

**Los identificadores internos no salen en el resultado de la herramienta**: el modelo repite ese texto al cliente, y estaba mandando el UUID de la cita por WhatsApp. Ahora el id va al log del servidor (auditoría) y el resultado confirma la fecha en la zona del negocio, en texto legible.

**La zona es global, no por tenant**: es un límite conocido. Con negocios en husos distintos hay que moverla a una columna de `tenants` y pasarla por `ConversationContext`; se deja como variable de entorno porque hoy no hay forma de que el dueño la configure y un valor global correcto es mejor que la zona del servidor por accidente.

**Zona inválida degrada, no rompe**: una zona mal escrita haría fallar a `Intl` en cada mensaje entrante, así que `resolveTimeZone` valida y cae a la del servidor.

## 2026-07-25 — Chat de prueba del agente en el panel (`POST /ai-context/test-chat`)

**Decisión**: el apartado "Agente IA" incluye un chat donde el dueño conversa con su propio agente desde el panel, sin WhatsApp y sin un cliente real.

**Motivo**: el agente solo responde a mensajes entrantes por el webhook, y escribir desde la bandeja hace lo contrario de probarlo (`sendManualMessage` marca la conversación como `handledBy: HUMAN`, que apaga la IA en ese hilo). Sin esto, la única forma de saber cómo contesta el agente era exponerlo a clientes reales.

**Las herramientas se simulan, no se ejecutan** (`AiService.respond(..., { simulateTools: true })`): probar el agente no puede crear citas ni recordatorios en la agenda del negocio. Lo que habría hecho viaja en `simulatedTools` con sus argumentos y el panel lo muestra — es más informativo que crearlo en silencio, porque el dueño ve la fecha exacta que el modelo interpretó.

**Un único punto de ejecución de herramientas**: los tres proveedores (Anthropic, NVIDIA, mock) reciben el mismo `runTool`, así que la simulación no puede quedar cubierta en un camino y olvidada en otro. El modo `mock` también ejecutaba tool-calling real contra la BD, y sin esto el chat de prueba habría creado citas.

**El texto de confirmación es el mismo simulado que real**: `describeWithoutExecuting` es la única fuente de ese texto y los métodos reales lo reutilizan tras hacer el trabajo. Si divergieran, el dueño probaría una cosa y su cliente leería otra.

**Contacto ficticio y solo OWNER**: el `contactId` es una constante que no existe en la BD, así que la memoria de contexto no devuelve recuerdos de un cliente real. Lleva un límite propio de 15/min: cada mensaje es una llamada pagada al modelo y el límite global de 100/min sería demasiado caro.

## 2026-07-25 — Búsqueda semántica real: embeddings de 1024 dimensiones

**Decisión**: las columnas `knowledge_chunks.embedding` y `ai_context_memory.embedding` pasan de `vector(512)` a `vector(1024)`, y se añade el proveedor `nvidia` a `EmbeddingsService`.

**Motivo, medido**: hasta aquí el único proveedor en uso era el simulado, que suma códigos de carácter y **no representa significado**. Con tres fragmentos reales (cancelaciones, horarios, servicios) y la pregunta *"me surgió un imprevisto y aviso sobre la hora, ¿me cobran algo?"*, el simulado puso el fragmento de cancelaciones **último**, con puntajes de 0.874/0.872/0.820 —indistinguibles entre sí, es ruido—; el proveedor real lo puso **primero** con 0.443 frente a 0.310. La función existía y parecía funcionar porque con un solo documento siempre se devuelve el único fragmento.

**Por qué 1024 y no otra**: es la dimensión de `nv-embedqa-e5-v5` (el proveedor gratuito que se usa mientras no hay créditos) **y** de `voyage-3` (el destino de producción). Migrar a 512 (`voyage-3-lite`) o a 2048 habría obligado a una segunda migración al cambiar de proveedor.

**`query` y `passage` son obligatorios**: los modelos de recuperación son asimétricos —codifican distinto la pregunta y el texto donde se busca— y equivocarse degrada el ranking sin dar ningún error. Por eso `embed()` exige el tipo en vez de asumir uno por defecto.

**Se re-vectoriza, no se vuelve a fragmentar** (`npm run embeddings:reindex`): al activar un documento se borran todos sus fragmentos, incluido el de posición -1 que guardaba el texto completo, y los fragmentos que quedan se solapan. Reconstruir el texto desde ellos para volver a partirlo duplicaría contenido. Cada fila conserva su texto, así que se le recalcula el vector en su sitio.

**La columna pasa a aceptar NULL**: hacía falta para migrar sin borrar el texto, y de paso elimina un apaño — el texto pendiente de revisión se guardaba con un vector de ceros solo para satisfacer `NOT NULL`. Las consultas filtran `embedding IS NOT NULL`: un fragmento sin vector no tiene distancia que ordenar y devolverlo sería dar contexto elegido al azar.

**Se restablece el índice HNSW de `ai_context_memory`**, que la migración `business_profile` había borrado sin recrear (Prisma no conoce los índices de pgvector, creados con SQL crudo). Desde entonces esas búsquedas hacían escaneo secuencial.

## 2026-07-25 — Catálogo de productos con stock (tabla propia + tool-calling)

**Decisión**: el stock vive en una tabla `products` y la IA lo consulta con la herramienta `consultar_producto` (tool-calling contra la BD en vivo). **No** se resuelve subiendo un PDF o un CSV al conocimiento del negocio.

**Motivo**: un archivo es una foto de un momento. Inyectado en el prompt, el agente seguiría prometiendo existencias vendidas hace semanas — y en una tienda eso es una venta perdida y un cliente enfadado. El proyecto ya resuelve bien este patrón con las citas: la IA no "sabe" la agenda, la consulta.

**Solo lectura**: la herramienta informa disponibilidad; nunca reserva ni descuenta. Descontar desde una conversación exigiría bloqueos y una noción de pedido que no existe, y sin eso dos clientes podrían llevarse la misma última unidad.

**Precios en céntimos y como entero**: en dinero, el punto flotante arrastra errores de redondeo. La moneda es opcional y no se inventa — y cuando falta, el resultado de la herramienta se lo dice explícitamente al modelo: en una prueba real, con la moneda vacía, el agente respondió "19.90 COP" a un negocio que nunca declaró pesos colombianos.

**La búsqueda parte la consulta en palabras y recorta el plural**: un cliente pregunta "¿tienen pantalones negros?" y el producto se llama "Pantalon negro". Buscando la frase entera, el agente respondía "no lo encontramos" sobre un producto que sí estaba en el catálogo. Limitación conocida: no ignora tildes; resolverlo bien pide `unaccent`/`pg_trgm`.

**Importación CSV que actualiza por SKU**: volver a subir el archivo del negocio con el stock nuevo es el caso normal, no la excepción — si duplicara, el catálogo se llenaría de copias. Detecta el separador `;` porque es lo que exporta Excel en español, y las filas con error no detienen la importación: se informan con el número de fila tal como se ve en Excel.

**No se distingue "no lo encontré" de "no lo vendemos"**: cuando no hay coincidencias, la herramienta le pide al modelo que ofrezca confirmarlo con el equipo, en vez de afirmar que el negocio no lo vende.

## 2026-07-25 — Búsqueda de productos sin tildes y tolerante a erratas

**Decisión**: `products` gana una columna `search_text` con nombre+SKU+descripción normalizados (minúsculas, sin diacríticos), que `ProductsService` reescribe en cada escritura. La consulta del cliente se normaliza con la misma función. Si aun así no coincide nada, se reintenta por similitud de trigramas (`pg_trgm`, operador `<%` y `word_similarity`) antes de dar el producto por inexistente.

**Motivo**: nadie escribe tildes desde el teclado del móvil. Con el catálogo guardado como "Pantalón", la pregunta "¿tienen pantalones?" no devolvía nada y el agente respondía que no lo vendían — sobre un producto en stock. Era la limitación anotada al cerrar el catálogo, y en WhatsApp no es un caso raro sino el normal.

**Se normaliza al escribir, no al leer**: la alternativa era llamar a `unaccent()` en cada consulta, pero una función sobre la columna impide usar el índice y obliga a envolverla en una función `IMMUTABLE` propia para poder indexarla. Guardar el texto ya normalizado deja la búsqueda como un `LIKE` corriente que el índice GIN de trigramas sí acelera. `unaccent` se usa una sola vez, en el relleno de la migración.

**La ñ se pliega a n**: consecuencia de descomponer en NFD y quitar las marcas combinantes. Es lo buscado — quien escribe "nino" espera encontrar "niño".

**`searchText` se recalcula desde los valores ya fusionados** en las ediciones parciales: hacerlo solo con lo que trae el DTO habría borrado el nombre del texto indexado al editar únicamente la descripción, y el producto habría desaparecido de las búsquedas sin que nadie lo notara.

**El rescate por similitud solo corre si la búsqueda literal falla**, y usa `<%` (parecido contra el *fragmento* más parecido del texto) en vez de `%`: una palabra corta comparada contra una descripción larga nunca supera el umbral de similitud global. Devuelve solo `id` y relee con Prisma, porque `$queryRaw` entrega las columnas tal como están en la base (`price_cents`) sin el mapeo del modelo.

**Prisma vuelve a borrar los índices HNSW**: la migración generada traía otra vez `DROP INDEX` de `ai_context_memory_embedding_idx` y `knowledge_chunks_embedding_idx`. Se quitaron a mano y queda la advertencia dentro del propio archivo. Su motor de diff no ve los índices de pgvector, así que **esto se repetirá en cada migración que se genere**: hay que revisar el SQL antes de aplicarlo.

## 2026-07-25 — Escalado a humano por baja confianza (tercer disparador del RF-11)

**Decisión**: la IA escala mediante una **herramienta** (`escalar_a_humano`), no mediante un clasificador aparte ni una medida de confianza del modelo. Al invocarla, la conversación pasa a `handledBy = HUMAN` y el motivo queda como nota interna.

**Por qué una herramienta y no un puntaje de confianza**: la API de Anthropic no expone probabilidades por token, así que no hay un número que umbralizar. Las alternativas eran una segunda llamada al modelo para juzgar su propia respuesta —duplicando el costo de cada mensaje— o dejar que el propio agente lo declare dentro del bucle que ya existe. Lo segundo no cuesta ninguna llamada extra y encaja con el patrón que el proyecto ya usa para citas y catálogo.

**El resultado de la herramienta le ordena al modelo dejar de intentarlo**: el turno no termina al escalar —el modelo todavía escribe el mensaje que lee el cliente— y sin esa instrucción vuelve a responder la consulta que acaba de admitir que no sabe.

**El prompt lleva contrapeso explícito**: junto a "escala cuando no puedas responder con seguridad" va "no escales por costumbre ni por cortesía; si la información que tienes alcanza, responde tú". Un agente que escala cada mensaje le devuelve al dueño exactamente el trabajo que el producto venía a quitarle. Ambas instrucciones tienen test.

**Motivo como nota interna, no como mensaje**: quien retoma la conversación necesita saber por qué le llegó sin releer el hilo. Va cifrada como el resto de notas, y firmada con un autor propio (`agente-ia` / "Agente IA") en vez de con un usuario real — `ConversationNote.authorId` es texto libre sin clave foránea, así que atribuirla a una persona haría creer que alguien del equipo la escribió.

**La escritura filtra por `tenantId` además de por `id`** (`updateMany`, no `update`): el contexto ya es de confianza, pero es la única herramienta que modifica una conversación entera, y un fallo futuro no puede acabar tocando la de otro negocio. Si no coincide nada, se informa en vez de dejar la nota huérfana.

**En el chat de prueba del panel se simula** (no está en `READ_ONLY_TOOLS`): probar el agente no puede dejar una conversación real esperando a un humano.

**El proveedor simulado también lo ejercita** ante palabras como "reclamo" o "devolución", para poder validar la cadena completa —nota interna incluida— sin gastar créditos de API.

## 2026-07-25 — Zona horaria por negocio (antes global)

**Decisión**: la zona horaria pasa de la variable global `BUSINESS_TIME_ZONE` a una columna `tenants.time_zone` que el propietario elige en el panel. `BUSINESS_TIME_ZONE` sigue existiendo como respaldo, y la del servidor como último recurso.

**Motivo**: con un único valor para toda la plataforma, dos negocios en husos distintos no pueden ambos agendar bien. Es la limitación que quedaba anotada en `ai-datetime.util.ts` desde que se corrigió el desfase de las citas (2026-07-25): el fallo no daba error, solo agendaba a la hora equivocada. Medido con dos negocios reales, el mismo instante se confirma como 16:00 en Lima y 23:00 en Madrid.

**Vive en `tenants`, no en `business_profiles`**: la zona la usan las citas, los recordatorios y la sincronización con Google Calendar, no solo el agente. Guardarla en la tabla de contexto de la IA obligaría al resto del dominio a leer de ahí, que es exactamente el acoplamiento que se quiere evitar. Se **expone** por el endpoint del perfil porque es donde el propietario configura lo del negocio, y ahí el `upsert` es transaccional: no puede quedar guardada la zona y no el perfil, ni al revés.

**Se resuelve una vez por respuesta y viaja en `ConversationContext`**: quien construye el contexto (el worker de WhatsApp, el chat de prueba) no tiene por qué saber de husos horarios, y las herramientas no deberían consultar la base para confirmarle una hora al cliente. `AiService` la rellena antes de ejecutar nada.

**`timeZoneOf` devuelve `null` cuando el negocio no eligió ninguna**, en vez de una por defecto: devolver una haría indistinguible "eligió Lima" de "no eligió nada", y quien llama no podría aplicar su propio respaldo.

**Se valida contra `Intl` antes de guardar**: una zona con un error de tipeo haría fallar el formateo en CADA mensaje, y el propietario no se enteraría hasta que un cliente escribiera. Se rechaza en el panel, donde aún puede corregirlo. Si aun así una inválida llegara a la base, `resolveTimeZone` degrada en cadena en lugar de romper la conversación.

**La migración deja la columna nula para los negocios ya dados de alta**: rellenarla con una zona fija sería inventarle un huso a quien no lo declaró. Siguen cayendo al respaldo global hasta que su propietario elija.

**El desplegable del panel se construye con `Intl.supportedValuesOf('timeZone')`**, no con una lista escrita a mano: así está completa y al día sin mantenimiento. Si el navegador no lo soporta, queda al menos la suya detectada.

## 2026-07-25 — Red de seguridad para los índices de pgvector

**Decisión**: dos comprobaciones automáticas en vez de seguir confiando en revisar el SQL a mano. Un test (`tests/prisma/vector-indexes.spec.ts`) falla si alguna migración borra un índice vectorial sin recrearlo; un script (`npm run prisma:check-indexes`, encadenado tras `prisma migrate dev`) comprueba la base en vivo y puede recrearlos con `--repair`.

**Motivo**: Prisma no modela el tipo `vector`, así que su motor de diff no ve los índices HNSW y emite un `DROP INDEX` de cada uno en **cada** migración que genera. Aplicarlo no da error — las búsquedas siguen devolviendo resultados correctos, solo que recorriendo la tabla entera. La migración `business_profile` (2026-07-23) los borró sin recrearlos y estuvo así hasta `embeddings_1024` (2026-07-25): dos días de escaneo secuencial que nadie notó. Desde entonces reapareció en tres migraciones seguidas, siempre quitado a mano. Un procedimiento que depende de que alguien se acuerde no es un procedimiento.

**Hacen falta las dos comprobaciones**: la del SQL detecta el error antes de aplicarlo, pero no arregla una base ya dañada; la de la base detecta el daño, pero no impide que se repita. La segunda va encadenada a `prisma migrate dev` para que el aviso llegue en el momento, no semanas después.

**Borrar y recrear en la misma migración es legítimo** y ocurre de verdad (`embeddings_1024` los rehace al cambiar la dimensión del vector), así que lo que se persigue es el borrado **huérfano**, no el `DROP` en sí. La detección también ignora los comentarios: las propias advertencias escritas en las migraciones habrían hecho saltar la comprobación.

**La migración histórica queda exenta, no corregida**: una migración ya aplicada es inmutable y editarla dejaría la suma de comprobación de Prisma sin cuadrar en cualquier base donde ya corrió. Por lo mismo no se han quitado los comentarios de advertencia de las migraciones posteriores. La lista de exentas tiene su propio test para que no crezca: una migración nueva con este fallo se corrige en el archivo, no se añade a la lista.

**Reparar es explícito (`--repair`), no automático**: por defecto informa y sale con error. Recrear un índice sobre una tabla grande bloquea escrituras, y esa no es una decisión que deba tomar un script sin que nadie se lo pida.

## 2026-07-25 — Guarda de costo por negocio, y escalar en vez de callarse

**Decisión**: a los techos de gasto se suman dos por negocio (por hora y por día), además del que ya existía por conversación/hora. Y al alcanzarse cualquiera de los tres, la conversación **se escala a una persona** en vez de quedarse sin respuesta.

**Por qué tres y no uno**: el de conversación/hora ataja un bucle o un cliente pesado concreto, pero no ve nada si el gasto se reparte entre muchas conversaciones. El de negocio/hora ataja el pico repentino —una campaña, un número filtrado— que ninguna conversación sola delata. El de negocio/día ataja el goteo sostenido, que por hora nunca llega al techo pero al final del mes está en la factura. Cada uno tapa el hueco que dejan los otros.

**Escalar en vez de callarse** es el cambio de comportamiento que más se nota: hasta ahora, al tocar techo el worker registraba un aviso y no respondía. Desde el lado del cliente eso es indistinguible de que el negocio lo dejó en visto — el peor resultado posible para el problema que el producto viene a resolver. Ahora se reutiliza el mismo camino del escalado por baja confianza: el equipo lo ve en la bandeja con el motivo escrito en una nota interna.

**Un único camino de escalado para las dos causas**: `AiToolExecutorService.escalateToHuman` pasa a ser público y lo usan tanto la herramienta del modelo como la guarda de costo. Si divergieran, una de las dos rutas acabaría dejando la conversación a medias (marcada como humana pero sin nota, o al revés).

**Se cuentan mensajes de la IA, no llamadas a la API**: es un proxy, y **conservador a la baja** — una respuesta con tool-calling gasta hasta `MAX_TOOL_ITERATIONS` llamadas y aquí cuenta como una. Sirve para poner un techo, no para facturar. Medir el gasto real exige registrar los tokens de cada llamada, que es otro trabajo (y el que haría falta para enseñarle al dueño lo que gasta).

**Los dos conteos del negocio van en una transacción**: son dos ventanas del mismo instante, y leerlas por separado podría dar una combinación que nunca existió.

**`tenantId` es opcional en la comprobación**: sin él solo se aplica el techo de la conversación, exactamente como se comportaba antes. Así ningún llamador queda con un cambio de semántica silencioso.

## 2026-07-25 — Medir el gasto real de la IA (tokens por llamada)

**Decisión**: una tabla `ai_usage` con una fila por llamada al proveedor (tokens de entrada y de salida, modelo, proveedor y finalidad), y un endpoint `GET /metrics/ai-usage` que la agrega por negocio y período. Se muestra en el panel de métricas.

**Motivo**: la guarda de costo cuenta **mensajes**, y eso basta para poner un techo pero no dice cuánto se gasta — una respuesta con tool-calling encadena varias llamadas y cuenta como una sola. El test del proveedor de pruebas lo deja a la vista: una única respuesta al cliente costó **dos** llamadas. Además, el gasto **no se puede reconstruir hacia atrás**: lo que pase antes de que exista este registro queda sin medir para siempre, así que tiene que estar antes de que llegue tráfico real.

**Se guardan tokens y no dinero**: el precio por modelo cambia con el tiempo y no se inventa en el código. Con los tokens y la tarifa vigente la cuenta se hace cuando haga falta; al revés no — un importe calculado con una tarifa vieja queda mal para siempre, y sin manera de saberlo. El panel lo dice explícitamente en vez de mostrar una cifra en euros que no podría respaldar.

**Se apunta el modelo que de verdad atendió la llamada** (`activeModel()`), no el configurado para Anthropic: con el proveedor de pruebas activo, registrar el de Anthropic dejaría el histórico sin poder valorarse.

**`record` nunca propaga**: si la escritura falla se pierde una fila del histórico; si propagara, se perdería la conversación. Medir el gasto no puede costarle la respuesta al cliente.

**Sin llamadas no se apunta nada**: el modo simulado no gasta, y una fila de ceros ensuciaría el histórico con actividad que nunca costó dinero.

**La finalidad (`respond` / `summarize` / `follow-up`) se guarda por separado** para poder distinguir qué parte del gasto es atender clientes y qué parte es trabajo de fondo — son dos decisiones distintas si hay que recortar.

**El endpoint va aparte de `/metrics/overview`**: responde a otra pregunta (cuánto cuesta, no cuánto se trabajó) y su tabla crece a otro ritmo; mezclarlas encarecería el resumen que se pide en cada carga del panel. El panel las pide en paralelo.

## 2026-07-25 — Resumen de conversación para el equipo (distinto del de la IA)

**Decisión**: `Conversation.summary` (cifrado) más `POST /conversations/:id/summary`, con un prompt propio y su propia finalidad de gasto (`team-summary`). Se muestra sobre el hilo en la bandeja.

**Por qué no reutilizar el resumen que ya existía**: el de `ai_context_memory` es **memoria para la IA** — una nota que el propio agente leerá en una conversación futura con el mismo cliente. Este lo lee una persona que abre la bandeja y necesita saber en diez segundos qué quería el cliente, qué se le dijo y qué queda pendiente. Mismo material de entrada, lector distinto, así que prompt distinto: este pide explícitamente lo pendiente y avisa de que si la conversación quedó a medias hay que decirlo.

**Bajo demanda y no al cerrar**: resumir cuesta dinero, y pagarlo por cada conversación —incluidas las que nadie va a abrir— es gasto seguro a cambio de valor incierto. Si ya hay un resumen vigente se devuelve el guardado, así que pulsar dos veces no cobra dos veces. Y el endpoint va limitado por minuto: sin tope, mantener pulsado "rehacer" se traduce en factura.

**`summaryStale` en vez de borrar el resumen viejo**: cuando llegan mensajes después de generarlo, el resumen sigue siendo útil pero ya no está completo. Borrarlo perdería información; enseñarlo como válido llevaría al equipo a actuar sobre lo que la conversación decía antes. Se muestra con el aviso de que hay mensajes nuevos sin incluir.

**`summaryAt` se fija al generar, no con `lastMessageAt`**: si entra un mensaje mientras el modelo redacta, el resumen tiene que quedar marcado como desactualizado. Tomando `lastMessageAt` como referencia, ese mensaje quedaría tapado.

**El prompt prohíbe explícitamente rellenar huecos**: en un resumen operativo, inventar es el peor fallo posible — el equipo actuaría sobre algo que ningún cliente dijo.

**Se apunta como `team-summary` y no como `summarize`** en el registro de gasto: son dos usos distintos del modelo y conviene poder mirarlos por separado a la hora de recortar.

## 2026-07-26 — `AiService` se parte: los textos de una sola llamada salen aparte

**Decisión**: los resúmenes (memoria de la IA y resumen para el equipo) y el mensaje de seguimiento se mudan de `AiService` a `AiWriterService`.

**Motivo inmediato**: `ai.service.ts` había llegado a 627 líneas contra el límite de 500 que fija el propio proyecto. Pero el corte no es por tamaño: son dos cosas distintas. `AiService` mantiene una conversación —bucle de tool-calling, historial, guarda de costo, alguien esperando al otro lado de WhatsApp—. `AiWriterService` hace una sola llamada, sin herramientas y sin nadie esperando.

**Se elimina triplicación real**: las tres funciones repetían el mismo esqueleto —armar la transcripción, llamar al modelo, apuntar el gasto, extraer el texto—. Ahora ese esqueleto vive una vez en `oneShot()`, y cada función aporta solo su prompt y su finalidad de gasto.

**Los dos llamadores cambian de dependencia, no de forma**: `ConversationsService` y `ConversationFollowUpService` solo usaban métodos de esta familia, así que se sustituye `AiService` por `AiWriterService` en la misma posición del constructor. Ningún otro código se entera.

**El servicio nuevo construye su propio cliente de Anthropic** en vez de compartir el de `AiService`. Son dos líneas de configuración repetidas; la alternativa —un tercer servicio que solo sostiene el cliente— añadía una indirección que no paga lo que cuesta leerla.

**Resultado**: `ai.service.ts` queda en 468 líneas y ningún archivo del backend supera el límite. La cobertura sube: los resúmenes tenían dos casos y ahora tienen quince, incluidos los que faltaban —que sin origen no se impute el gasto a nadie, y que el modo simulado no apunte consumo que nunca ocurrió.

## 2026-08-07 — Evolution API como puente, detrás de una abstracción de proveedor

**Decisión**: el MVP sale con [Evolution API](https://github.com/evolution-foundation/evolution-api) como transporte de WhatsApp, pero **ningún módulo fuera de `src/whatsapp/providers/` sabe que existe**. Todo el sistema consume la interfaz `WhatsAppProvider`; `EvolutionProvider` y `MetaProvider` la implementan y `WHATSAPP_PROVIDER` elige cuál está activo.

**Motivo**: la Cloud API oficial de Meta exige verificación del negocio y aprobación previa del número, y ese trámite no puede bloquear el arranque del producto. Evolution levanta una sesión contra un WhatsApp normal vinculándola por QR, como WhatsApp Web. Es un puente explícito, no el destino: es no oficial, la sesión se cae y hay que revincularla.

**La abstracción se escribe con dos implementaciones desde el primer día, no con una.** Una interfaz con un solo implementador no está probada, está supuesta. Tener `MetaProvider` desde ya obligó a que la interfaz fuera de verdad neutral — y sacó a la luz que la vinculación por QR no es universal (de ahí `vinculaConQr`) y que la ventana de servicio de 24 h es una regla **de Meta**, no de WhatsApp: aplicarla con Evolution bloquearía envíos perfectamente válidos.

**Qué NO cruza la frontera**: `instanceName`, `apikey`, `remoteJid`, `wamid`, `phone_number_id`. Hacia fuera solo hay `externalId` (identificador opaco de sesión) y `credential` (secreto opaco). El job que se encola dejó de hablar de `phoneNumberId`/`waMessageId` por lo mismo: esa fuga era justo lo que habría obligado a reescribir el worker el día de la migración.

**Lo que sí es irreductiblemente propio de cada proveedor es autenticar su webhook**, y por eso hay un controlador por proveedor: Meta firma el cuerpo con HMAC; Evolution no firma nada y se le configura una cabecera `Authorization` con un secreto compartido (`EVOLUTION_WEBHOOK_TOKEN`), obligatorio — sin él la ruta queda cerrada en vez de abierta. A partir de `interpretarWebhook` los dos caminos son el mismo código.

**Tres consumidores dejan de hablar con Meta directamente**: la bandeja (`ConversationsService`), el worker de entrada y los recordatorios pasan todos por `WhatsappOutboundService`. `WhatsappSenderService` deja de exportarse desde su módulo: era la puerta por la que se colaba el acoplamiento, y cerrarla es el punto del cambio.

**Se procesan también los mensajes que salen del teléfono del negocio** (`fromMe`). Si el dueño contesta desde su móvil, ese mensaje existe para el cliente y tiene que existir en la bandeja; sin él, el equipo lee media conversación y vuelve a preguntar lo que ya se respondió. Se guardan como `OUTBOUND/HUMAN` y pasan la conversación a manos humanas, para que la IA no conteste por encima de una persona que ya está atendiendo.

**Alcance deliberado**: solo lo que alimenta la Bandeja. Un mensaje sin texto (sticker, ubicación, audio suelto) se descarta en vez de guardar una burbuja vacía; los grupos y los estados de WhatsApp se ignoran. Adjuntos, campañas y automatizaciones quedan fuera.

## 2026-08-07 — Tiempo real por WebSocket, con avisos flacos

**Decisión**: el panel abre un WebSocket (socket.io, namespace `/realtime`) autenticado con el mismo JWT que la API, en el handshake. Cada conexión entra en la sala de **su** tenant y en ninguna más.

**Los eventos dicen QUÉ cambió, no el contenido nuevo**: `{ tipo: 'mensaje', conversationId }`, no el mensaje entero. El panel recarga lo afectado por la API de siempre. El precio es una petición extra; a cambio hay una sola forma de serializar una conversación —la del controlador— en vez de dos que se desincronizan en cuanto una crece un campo, y por el socket viajan identificadores en lugar de contenido cifrado de conversaciones.

**El `tenantId` de la sala sale del token verificado, nunca del cliente.** Es el mismo principio que rige toda la API, y aquí pesa más: un socket vive minutos u horas, no una petición.

**Un solo socket para todo el panel**, compartido por las pantallas que lo necesiten y cerrado al salir de la sesión: son eventos del negocio entero, no de una vista.

## 2026-08-07 — "Canales" como sección propia, no dentro de la Bandeja

**Decisión**: conectar WhatsApp vive en `/canales`, una sección nueva al final del menú, no en un diálogo de la Bandeja.

**Motivo**: la Bandeja es donde se atienden conversaciones; la gestión de conexiones es configuración que se toca el primer día y casi nunca más. Mezclarlas obligaría a rediseñar la Bandeja en cuanto entre el segundo canal. Instagram, Messenger, Telegram y email aparecen ya como "próximamente": dicen a qué aspira esto y evitan que alguien los busque por el resto del panel.

**La pantalla no sabe qué proveedor hay detrás**: el bloque del QR depende de `vinculaConQr`, no del nombre del proveedor. Cuando se migre a Meta —donde el número se da de alta fuera del panel— esta pantalla ya está preparada.

**Se sondea el estado mientras hay un QR en pantalla**, además de escuchar el webhook. El backend aprovecha ese sondeo para preguntarle al proveedor si ya se escaneó y para renovar el código caducado, así que la vinculación se completa sola incluso cuando el proveedor no consigue alcanzar al servidor — el caso normal en desarrollo, donde Evolution no puede llegar a `localhost`.

## 2026-08-08 — "Conectado" pasa a significar comprobado, no guardado

**Problema**: el panel anunciaba Google Calendar como conectado mientras las citas no llegaban a ningún sitio. `getStatus` solo comprobaba que el refresh token guardado **descifrara**, y eso no dice nada sobre si Google lo sigue aceptando: basta con que alguien retire el acceso a WhatsFlow desde su cuenta de Google —o cambie la contraseña— para que el token quede muerto y aquí siga figurando todo correcto. Verificado en la cuenta del propietario: los tokens descifraban sin problema y Google respondía `invalid_grant — Token has been expired or revoked`.

**Decisión**: se añade `POST /integrations/google-calendar/check`, que fuerza un refresco del access token contra Google **aunque el guardado no haya caducado** —lo que se quiere probar es el refresh token, que es la credencial de larga duración y la única que puede revocarse sin aviso— y después lee el calendario de destino, porque un token válido para una cuenta que ya no tiene ese calendario tampoco sirve.

**El resultado se persiste** (`lastCheckedAt`, `lastCheckError` en `GoogleCalendarIntegration`): sin guardarlo, el diagnóstico se perdería al recargar y la tarjeta volvería a mentir. `needsReconnect` pasa a ser cierto por dos motivos —credenciales ilegibles **o** última comprobación fallida—, y se evalúa por contenido y no contra `null`: un campo ausente también significa "sin error", y compararlo con `null` pedía reconectar cuentas sanas.

**La tarjeta dice cuándo se comprobó**, o que no se ha comprobado nunca desde que se conectó. "Conectado" a secas era exactamente la afirmación que no se podía sostener.

**El error se traduce antes de enseñarlo**: `invalid_grant` no le dice nada a nadie y suena a fallo del programa cuando normalmente es que alguien retiró el permiso.

**El botón sube además lo pendiente**, acotado al tenant y saltándose el backoff: quien lo pulsa acaba de arreglar algo y espera que sus citas suban ahora, no dentro de seis horas ni compitiendo por el lote con el resto de la plataforma. Si la conexión no responde no se intenta subir nada — cada fallo gastaría uno de los intentos que tiene la cita antes de abandonarse.

## 2026-08-08 — Un catálogo vacío no es un negocio sin nada que ofrecer

**Problema**: una barbería con sus cortes y precios escritos en el perfil, y ningún producto dado de alta, preguntaba "¿qué cortes tienes y cuáles son los precios?" y el agente contestaba *"escalo porque no tengo acceso al catálogo"*. La pregunta más común de ese negocio, con la respuesta delante, derivada a una persona.

**Tres causas, las tres en el texto que lee el modelo:**

1. La lista de motivos para escalar decía *"…o se trate de dinero, condiciones o compromisos que el negocio no dejó por escrito"*. El calificador va al final y se pega mal: un modelo pequeño lee "se trate de dinero" → un precio es dinero → escalo. Se quita ese motivo y se añade la regla en positivo: **lo que SÍ está escrito en la información del negocio se responde directamente**, y escalar por dinero solo aplica a importes que no figuren ahí.

2. La herramienta del catálogo decía *"úsala SIEMPRE… nunca respondas de memoria"*, sin acotar a qué. Ahora se acota a los **productos registrados**, y dice explícitamente que los servicios y precios del perfil no están ahí y no necesitan la herramienta.

3. Con el catálogo vacío, el resultado de la herramienta era *"dile que lo confirme con el equipo"* — una orden directa que pisaba el perfil. Ahora dice que un catálogo vacío **no** significa que el negocio no ofrezca nada, y que mire la información del negocio antes de derivar.

**Se comprobó que las salvaguardas siguen**: por un producto no declarado (shampoo) ofrece confirmar en vez de inventar; por devoluciones no declaradas escala con la herramienta. Lo declarado se responde, lo no declarado no se improvisa — que era el equilibrio buscado desde el principio.

**Además, el agente dejaba ver sus reglas**: le decía al cliente *"Escale a una persona del equipo porque no está claro en los datos del negocio"*. Al otro lado hay un cliente, no un registro de depuración; ahora se le prohíbe anunciar que escala y se le pide decir con naturalidad que lo confirma con el equipo.

## 2026-08-08 — Rescatar las llamadas que el modelo escribe como texto

**Incidente**: el agente le respondió a un cliente con `<TOOLCALL>[{"name": "create_appointment", …` en crudo. La cita no se creó —el modelo escribió la llamada en el texto en vez de emitirla por la API de herramientas—, el cliente vio las tripas del sistema y, dos mensajes después, el agente le confirmó que su cita "está registrada". Un cliente presentándose a una cita que no existe es el peor fallo posible de este producto.

**Decisión**: `NvidiaChatService` reconoce el bloque `<TOOLCALL>` en el contenido, lo interpreta y ejecuta esas llamadas como si hubieran llegado por la API. En todo caso el bloque se retira del mensaje antes de que salga: se pueda interpretar o no, un cliente no puede leer eso.

**Si el JSON llega cortado no se adivina lo que falta.** Aquí se agendan citas: completar a ojo una fecha truncada agendaría a una hora que el cliente nunca pidió. Se le devuelve el error al modelo y se le obliga a repetir la llamada, en vez de cerrar el turno — cerrarlo es lo que dejaba al modelo creyendo que ya había agendado.

**Y el system prompt le prohíbe dar por hecho lo que no ejecutó**: nunca decir que una cita, un recordatorio o un cambio quedó hecho sin confirmación de la herramienta. Vale para cualquier proveedor, no solo para este.

**Lo que NO se puede arreglar desde aquí**: la fiabilidad con la que `nvidia-nemotron-nano-9b-v2` decide llamar a una herramienta. Medido sobre el mismo caso y sin cambios relevantes de código: 4 de 5 en un momento, 0 de 6 poco después; y peticiones directas que funcionaban dejaron de funcionar minutos más tarde sin tocar nada. No es el prompt ni la forma de la conversación —se descartaron por medición— sino el modelo gratuito de pruebas. La vía real es `AI_PROVIDER=anthropic`.

**Nota de método**: durante el diagnóstico se atribuyó la caída primero a un añadido en la descripción de la herramienta y después a que la hora pedida ya había pasado. Las dos hipótesis se descartaron midiendo tras revertir. Queda anotado porque el error de atribución era plausible en ambos casos: con un modelo tan variable, una sola tanda de pruebas no distingue una causa de una coincidencia.
