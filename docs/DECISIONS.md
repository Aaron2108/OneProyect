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
