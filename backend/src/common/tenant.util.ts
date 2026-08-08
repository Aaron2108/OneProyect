/**
 * Exige que un `tenantId` esté resuelto antes de usarlo en una consulta.
 *
 * Defensa en profundidad contra la fuga entre negocios del run-1 (ver
 * docs/DECISIONS.md 2026-08-08): una consulta `where: { tenantId: undefined }`
 * hace que Prisma borre el filtro y devuelva filas de TODOS los tenants. El
 * arreglo del guard de autenticación ya garantiza que `user.tenantId` es un
 * texto válido en cada petición; esto lo vuelve a comprobar en la frontera del
 * servicio, para que un llamador futuro que pase un tenant sin resolver falle
 * en el acto —con un error claro— en vez de filtrar datos en silencio.
 *
 * Es una aserción de TypeScript: tras llamarla, el compilador trata `tenantId`
 * como `string` no nulo.
 *
 * @throws si `tenantId` no es un texto no vacío.
 */
export function assertTenantId(tenantId: unknown): asserts tenantId is string {
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    // Es un fallo de programación, no de la petición del usuario: el tenant
    // debería venir siempre de la sesión autenticada. Se lanza un Error normal
    // (500) a propósito — no un 4xx— para que salte en desarrollo y en los logs.
    throw new Error(
      'tenantId sin resolver en una operación con scope de negocio. ' +
        'Debe derivarse de la sesión autenticada, nunca quedar undefined.',
    );
  }
}
