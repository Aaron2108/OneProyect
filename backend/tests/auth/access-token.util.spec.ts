import { UserRole } from '@prisma/client';
import { ACCESS_TOKEN_PURPOSE, toAuthContext } from '../../src/auth/access-token.util';

/**
 * Regresión de la fuga entre tenants (ver docs/DECISIONS.md 2026-08-08): el
 * guard aceptaba cualquier JWT bien firmado, y los tokens de OAuth —firmados
 * con el mismo secreto pero SIN `tenantId`— pasaban. Un `tenantId` undefined
 * desactivaba el filtro por tenant en Prisma y volcaba datos de todos los
 * negocios. `toAuthContext` es la barrera que lo cierra.
 */
describe('toAuthContext', () => {
  const sesion = {
    purpose: ACCESS_TOKEN_PURPOSE,
    sub: 'u1',
    tenantId: 't1',
    email: 'a@b.com',
    role: UserRole.OWNER,
  };

  it('acepta un token de sesión completo', () => {
    expect(toAuthContext(sesion)).toEqual({
      userId: 'u1',
      tenantId: 't1',
      email: 'a@b.com',
      role: UserRole.OWNER,
    });
  });

  it('acepta un token de sesión anterior al arreglo (sin purpose)', () => {
    const { purpose: _omit, ...legado } = sesion;
    expect(toAuthContext(legado).tenantId).toBe('t1');
  });

  // El corazón del fallo: el token del alta con Google.
  it('rechaza el token google-signup (otro purpose, sin tenantId)', () => {
    expect(() =>
      toAuthContext({ purpose: 'google-signup', email: 'x@y.com', name: 'X', googleId: 'g' }),
    ).toThrow();
  });

  it('rechaza el state google-login', () => {
    expect(() => toAuthContext({ purpose: 'google-login' })).toThrow();
  });

  it('rechaza un token sin tenantId aunque traiga sub y role', () => {
    const { tenantId: _omit, ...sinTenant } = sesion;
    expect(() => toAuthContext(sinTenant)).toThrow();
  });

  it('rechaza un tenantId vacío (llegaría a Prisma como "sin filtro")', () => {
    expect(() => toAuthContext({ ...sesion, tenantId: '' })).toThrow();
  });

  it('rechaza un rol que no existe', () => {
    expect(() => toAuthContext({ ...sesion, role: 'SUPERADMIN' })).toThrow();
  });

  it('rechaza un purpose desconocido aunque traiga las tres señas', () => {
    // Defensa a futuro: cualquier token de otra familia que un día llevara
    // tenantId no debe colarse por parecerse a uno de sesión.
    expect(() => toAuthContext({ ...sesion, purpose: 'password-reset' })).toThrow();
  });
});
