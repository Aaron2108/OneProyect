import { UserRole } from '@prisma/client';
import { AuthContext, JwtPayload } from './auth.types';

/** Marca del token de sesión. Los tokens de OAuth llevan otro `purpose`. */
export const ACCESS_TOKEN_PURPOSE = 'access';

/**
 * Convierte un JWT ya verificado en el contexto de autenticación, RECHAZANDO
 * todo lo que no sea un token de sesión.
 *
 * Existe por un fallo real (ver docs/DECISIONS.md 2026-08-08): el guard se
 * fiaba de que la firma fuera válida y adjuntaba el payload tal cual. Pero
 * WhatsFlow firma con el MISMO secreto varios tokens que no son de sesión —el
 * `google-login` y el `google-signup` del alta con Google—, y esos no llevan
 * `tenantId`. Un `tenantId` undefined llega a Prisma como "sin filtro", así que
 * `findMany({ where: { tenantId: undefined } })` devolvía los datos de TODOS
 * los negocios. El token de alta se le entrega a cualquiera que empiece un alta
 * con Google, así que era una fuga entre tenants sin autenticación previa.
 *
 * La comprobación es positiva: un token vale como sesión solo si declara serlo
 * (`purpose === 'access'`) y trae las tres señas que todo el sistema da por
 * seguras. No basta con que la firma cuadre.
 *
 * @throws si el token no es un token de sesión completo.
 */
export function toAuthContext(payload: JwtPayload | Record<string, unknown>): AuthContext {
  const p = payload as Partial<JwtPayload> & { purpose?: unknown };

  // `purpose` puede faltar en tokens de sesión emitidos antes de este arreglo;
  // se acepta su ausencia, pero NUNCA un `purpose` de otra familia (los de
  // Google lo traen explícito). Así el arreglo no cierra la sesión a nadie y a
  // la vez bloquea los tokens que causaban la fuga.
  if (p.purpose !== undefined && p.purpose !== ACCESS_TOKEN_PURPOSE) {
    throw new Error('El token no es de sesión');
  }
  if (!esTextoNoVacio(p.sub) || !esTextoNoVacio(p.tenantId) || !esTextoNoVacio(p.email)) {
    throw new Error('Token de sesión incompleto');
  }
  if (!esRolValido(p.role)) {
    throw new Error('Token de sesión sin rol válido');
  }

  return { userId: p.sub, tenantId: p.tenantId, email: p.email, role: p.role };
}

function esTextoNoVacio(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function esRolValido(v: unknown): v is UserRole {
  return typeof v === 'string' && Object.values(UserRole).includes(v as UserRole);
}
