# SECURITY.md

> Creado: 2026-07-22 · Actualizado: 2026-07-21 · Postura de seguridad de WhatsFlow AI.

## 1. Aislamiento multi-tenant (control central)

El invariante de seguridad más importante del producto: **ningún tenant puede leer ni
modificar datos de otro**. Se garantiza así:

- El `tenantId` viaja en el **JWT** (firmado) y se extrae en el `JwtAuthGuard`; los
  controladores lo reciben vía `@CurrentUser()`. **Nunca** se toma de la entrada del cliente
  (query, body o params).
- Todas las consultas de negocio (contactos, conversaciones, citas, recordatorios, mensajes)
  se filtran por ese `tenantId`. Las escrituras verifican pertenencia antes de actualizar.
- El motor de IA aplica el mismo principio: sus herramientas (crear cita/recordatorio,
  actualizar contacto) **no exponen** `tenantId` ni `contactId` en su schema — se inyectan
  desde el contexto de confianza de la conversación, de modo que el texto no confiable del
  cliente final no puede redirigir una acción hacia otro contacto o tenant.

## 2. Autenticación y contraseñas

- **JWT** por sesión de usuario del panel (payload: `sub`, `tenantId`, `email`, `role`),
  firmado con `JWT_SECRET`. Guard propio sin passport.
- Contraseñas hasheadas con **`scrypt`** (KDF nativo de Node), formato `salt:hash`,
  comparación en tiempo constante. Nunca se almacenan en claro.
- Login en tiempo constante: siempre ejecuta scrypt (contra un hash señuelo si el email no existe), para no revelar por temporización qué emails están registrados.
- Autorización por rol **disponible** vía `@Roles()` + `RolesGuard` (OWNER/AGENT). Aún ningún endpoint la usa; cuando se use, debe aplicarse con ambos guards juntos: `@UseGuards(JwtAuthGuard, RolesGuard)` (el orden importa: primero autentica y adjunta el usuario, luego valida el rol).

## 3. Webhook de WhatsApp (Meta Cloud API)

- **Verificación de firma HMAC-SHA256** (`X-Hub-Signature-256`) contra `WHATSAPP_APP_SECRET`
  sobre el cuerpo crudo; se rechaza (401) cualquier payload sin firma válida.
- Verificación del webhook (`hub.verify_token`) contra `WHATSAPP_VERIFY_TOKEN`.
- **Deduplicación** por `whatsappMessageId` (único por tenant): los reenvíos de Meta no se
  reprocesan (evita disparar IA/acciones repetidas → guarda de costo y de efectos).
- El webhook responde rápido y encola; el trabajo real corre en el worker (BullMQ), fuera del
  ciclo de respuesta.
- El `verify_token` del registro (GET) se compara en **tiempo constante**.
- El webhook está **exento del rate limiting** (`@SkipThrottle`): Meta envía ráfagas legítimas;
  la firma HMAC ya lo protege.

## 4. Secretos y configuración

- `.env` y `.env.*` están gitignoreados y **denegados a la lectura** por
  `.claude/settings.json` (`permissions.deny`). Nunca se commitean.
- Las credenciales (claves de Anthropic/Meta, `JWT_SECRET`, `DATABASE_URL`) se leen solo de
  variables de entorno, validadas al arranque (`env.validation.ts`).

## 5. Cumplimiento con Meta / mensajería

- **Ventana de servicio de 24h (RF-10)**: fuera de ella no se envía texto libre; se requiere
  plantilla pre-aprobada (pendiente de implementar el envío con plantilla).
- **Opt-in / consentimiento (RF-12)**: se registra el consentimiento del contacto
  (`contact_consent`) al recibir su primer mensaje entrante; la verificación de consentimiento
  antes de enviar mensajes proactivos se completa con el módulo de recordatorios.
- **Handoff a humano (RF-11)**: el cliente puede pedir una persona; la IA deja de responder.

## 6. Privacidad de datos (PII)

Los datos en `contacts`/`messages` son PII de clientes finales de terceros (las PyMEs que
usan el software), no del propio tenant operador. Controles: acceso siempre filtrado por
tenant (sección 1); el contenido real de las conversaciones se cifra en reposo (§10); pendiente
para fases posteriores: políticas de retención/borrado y, si el volumen o la normativa lo
exige, extender el cifrado a `Contact.phone`/`name` (ver §10, requiere un índice ciego).

## 7. Rate limiting (implementado ✅)

- `ThrottlerGuard` global (`@nestjs/throttler`): 100 req/min por IP como red de seguridad.
- `/auth/login` y `/auth/register` con límite estricto (10/min por IP) para frenar fuerza
  bruta de contraseñas y abuso de registro.
- El webhook de WhatsApp está exento (ver sección 3).

## 8. Requisitos transversales

- Validar toda entrada en los límites del sistema (DTOs con `class-validator`, `ValidationPipe`
  global con `whitelist`/`forbidNonWhitelisted`; verificación de firma en el webhook).
- Nunca commitear secretos, credenciales ni `.env`.
- Revisión humana antes de cualquier `git push` o cambio que afecte auth, autorización o
  manejo de datos sensibles.

## 9. "Continuar con Google" (login/registro, opcional)

- Scope mínimo: `openid email profile` — **no** pide acceso a Calendar ni a nada más. Es un flujo de identidad, separado del de Google Calendar (sección 10): un usuario puede tener uno, otro, ambos o ninguno.
- Solo se acepta el email si Google lo reporta como **verificado** (`email_verified`); si no, se rechaza — evita que alguien entre con un email de un dominio que no controla.
- El alta de cuenta nueva (email no encontrado) usa un token de alta pendiente firmado (JWT corto, ~15 min, `purpose: 'google-signup'`) para pasar el email/nombre/`sub` de Google al segundo paso sin volver a tocar a Google — no se persiste nada hasta que el usuario confirma el nombre de la empresa.
- El token de sesión final (`accessToken`) viaja al navegador en el **fragmento** de la URL de redirección (`#googleAuth=...`), nunca en la query string — los fragmentos no se envían al servidor en peticiones posteriores ni quedan en logs de acceso.
- `User.passwordHash` es nulo para cuentas creadas solo con Google: el login por contraseña se rechaza explícitamente para esas cuentas (nunca intenta comparar contra `null`); `changePassword` permite establecer una contraseña por primera vez sin pedir la "actual" (no existe), usando el JWT de sesión como prueba de identidad suficiente.

## 10. Cifrado en reposo del contenido de conversaciones

- **Qué se cifra** (AES-256-GCM, `src/common/crypto.util.ts` + `PiiCryptoService`): `Message.content`
  (el texto de cada mensaje, entrante y saliente), `ConversationNote.body` (notas internas del
  equipo) y `Contact.notes`. Ninguno de estos campos se busca por SQL, así que cifrarlos no
  cambia ningún comportamiento visible del panel.
- **Qué NO se cifra, a propósito**: `Contact.phone` (índice único por tenant + búsqueda `contains`)
  y `Contact.name` (búsqueda `contains`). Cifrarlos con AES-GCM (no determinista) rompería
  ambas cosas; requeriría un **índice ciego** (hash determinista aparte para el único/búsqueda
  exacta) que además degrada la búsqueda actual a solo-coincidencia-exacta. Decisión explícita
  del propietario de dejarlos en claro por ahora — ver `DECISIONS.md` (2026-07-23).
- **Clave**: `TOKEN_ENCRYPTION_KEY` (AES-256, 32 bytes en base64) — **obligatoria** desde el
  arranque (`env.validation.ts`), no es una integración opcional como Meta/Anthropic/Google:
  no tendría sentido correr con parte de las conversaciones cifradas y parte no.
- **Migración de datos preexistentes**: `prisma/encrypt-existing-pii.ts` (`npm run prisma:encrypt-pii`)
  cifra en un solo paso lo que ya estaba en claro antes de esta funcionalidad; es idempotente
  (detecta el formato ya cifrado y lo deja igual), así que correrlo de más no hace daño.
- Mismo mecanismo de cifrado que los tokens OAuth de Google Calendar (§10) — una sola
  implementación de AES-256-GCM para todo secreto/PII en reposo.

## 11. Integraciones OAuth (Google Calendar, Fase 3)

- Un tenant conecta **una** cuenta de Google (la del negocio); solo el **OWNER** puede
  conectar/desconectar (`@Roles(OWNER)`).
- `access_token`/`refresh_token` se guardan **cifrados en reposo** (AES-256-GCM,
  `src/common/crypto.util.ts`) con `TOKEN_ENCRYPTION_KEY` — nunca en claro en la BD.
- El callback de OAuth (`GET /integrations/google-calendar/callback`) no lleva Bearer token
  (lo invoca el navegador tras el consentimiento en Google); la identidad del tenant/usuario
  viaja en el parámetro `state`, un JWT de corta duración (10 min) firmado con `JWT_SECRET`,
  para que el callback no pueda usarse para inyectar la integración en un tenant ajeno.
- Sincronización de una sola vía (WhatsFlow → Google): sin webhooks entrantes de Google que
  verificar, sin superficie de ataque adicional en esa dirección.
- Al desconectar se intenta revocar el token en Google (best-effort) y siempre se borran las
  credenciales locales.

## 12. Pendiente (fases posteriores)

- Rate limiting distribuido por tenant (además del actual por IP) con backend Redis si se
  despliega multi-instancia.
- Cifrado en reposo de campos sensibles (PII de contactos/mensajes) y política de
  retención/borrado.
- Rotación de `JWT_SECRET` y expiración/refresh de tokens más granular.
- Almacenamiento cifrado del access token de Meta por tenant (onboarding multi-número).
