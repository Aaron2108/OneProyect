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
tenant (sección 1), y —pendiente para fases posteriores— políticas de retención/borrado y
cifrado de campos sensibles en reposo si el volumen o la normativa lo exigen.

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

## 9. Pendiente (fases posteriores)

- Rate limiting distribuido por tenant (además del actual por IP) con backend Redis si se
  despliega multi-instancia.
- Cifrado en reposo de campos sensibles y política de retención/borrado de PII.
- Rotación de `JWT_SECRET` y expiración/refresh de tokens más granular.
- Almacenamiento cifrado del access token de Meta por tenant (onboarding multi-número).
