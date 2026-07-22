# SECURITY.md

> Creado: 2026-07-22

## 1. Postura actual

El repositorio está en fase de bootstrap: sin código de aplicación, sin datos de usuarios reales, sin superficie pública propia todavía. Los riesgos de seguridad actuales provienen exclusivamente del framework de orquestación (`ruflo`) y de las convenciones aún no aplicadas a código futuro. Auditoría técnica completa en [`REPOSITORY_ANALYSIS.md`](REPOSITORY_ANALYSIS.md#11-riesgos).

`.claude-flow/security/audit-status.json` reporta estado `PENDING`, 0 CVEs revisados — **el propio framework no se ha auditado a sí mismo todavía en este entorno.**

## 2. Riesgos conocidos

| # | Riesgo | Severidad | Descripción |
|---|---|---|---|
| 1 | Telemetría/marketing auto-activado sin consentimiento previo | Media | `hook-handler.cjs` activa "spinner verbs" (texto promocional) por defecto en el primer uso (opt-out, no opt-in) y hace llamadas de red detached (`funnel`/`advisor`) en cada `SessionStart`. Documentado por el propio framework (ADR-316/318/319), pero opt-out en vez de opt-in. |
| 2 | Auto-push sin confirmación si se activa modo `pair` | Media | `auto-commit.sh` tiene `AUTO_PUSH=true` por defecto. No se dispara desde los hooks automáticos, solo si se activa explícitamente `ruflo pair start`, pero de activarse puede pushear a `origin` sin confirmación por commit. |
| 3 | Validación de comandos peligrosos limitada | Media | El hook `pre-bash` solo bloquea 4 patrones literales (`rm -rf /`, `format c:`, `del /s /q c:\`, fork bomb). No es una sandbox; no sustituye la confirmación humana ante comandos destructivos. |
| 4 | Sin pin de versión del framework | Baja-Media | Todos los hooks/helpers invocan `npx ruflo@latest` / `@claude-flow/cli@latest` sin lockfile de proyecto — una actualización aguas arriba puede cambiar comportamiento sin que el repo lo refleje. |
| 5 | Auditoría de seguridad del framework pendiente | Media (mientras dure) | `audit-status.json` en `PENDING`. Mitigable ejecutando `ruflo security scan` / `ruflo doctor --fix`. |
| 6 | Permisos amplios pre-aprobados | Baja | `.claude/settings.json.permissions.allow` autoriza sin preguntar cualquier `Bash(npx @claude-flow*)`, `Bash(npx claude-flow*)`, `Bash(node .claude/*)` y todo `mcp__claude-flow__*` — superficie amplia de auto-aprobación para un framework de terceros. |
| 7 | Daemon consume tokens si se activa sin supervisión | Baja (operativa) | `ruflo daemon start` lanza sesiones headless de `claude` en intervalos; se autolimita a 12h salvo `--ttl 0`. |

## 3. Mitigaciones recomendadas

- Ejecutar `ruflo doctor --fix` y `ruflo security scan` antes de empezar a construir sobre el andamiaje (resuelve el riesgo #5).
- Si se activa el modo `pair`, exportar `AUTO_PUSH=false` explícitamente salvo que se quiera push automático consciente (riesgo #2).
- Considerar `RUFLO_NO_AUTO_ENABLE=1` (o `RUFLO_NO_AUTO_ENABLE_SPINNER=1`) si no se desea la activación automática de contenido promocional (riesgo #1).
- Revisar/pinear la versión de `ruflo` usada, o vendorizarla, si se necesita estabilidad de comportamiento (riesgo #4).
- Tratar `pre-bash`/`security-scanner.sh` como primera línea de defensa, no como sustituto de revisión humana antes de comandos destructivos o pushes (riesgo #3).

## 4. Requisitos de seguridad para código futuro

Derivados de `CLAUDE.md` y aplicables a cualquier código de negocio que se escriba a partir de ahora:

- Validar toda entrada en los límites del sistema (API pública, formularios, archivos subidos, parámetros de configuración).
- Nunca commitear secretos, credenciales o archivos `.env` (ya denegado a nivel de lectura en `settings.json`, pero debe respetarse también al escribir).
- Revisión humana antes de cualquier `git push`, cambio de permisos, o acción que afecte infraestructura compartida.
- Escaneo de seguridad (`ruflo security scan`) después de cualquier cambio relevante en autenticación, autorización o manejo de datos sensibles.

## 5. Seguridad de negocio (a definir)

**PENDIENTE.** Requisitos específicos de seguridad del producto (autenticación de usuarios, cifrado de datos sensibles, cumplimiento normativo, gestión de sesiones, etc.) se definirán al recibir la descripción del proyecto y se añadirán a esta sección.
