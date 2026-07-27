/**
 * Validación de lo que devuelve el inicio de sesión con Google.
 *
 * Está separado de la pantalla porque es lo que decide si una sesión se guarda
 * o no: conviene poder probarlo con casos malos sin montar la interfaz.
 */

import type { AuthResult } from '@/lib/types';

function esCadena(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Comprueba la forma de lo que viene en la URL antes de darlo por bueno.
 *
 * Lo que llega en el fragmento lo escribe el backend, pero por el camino lo
 * puede poner cualquiera: basta un enlace preparado para que el panel guarde un
 * token y un usuario inventados y se comporte como si hubiera sesión. `as
 * AuthResult` no comprobaba nada — solo silenciaba a TypeScript.
 *
 * No valida la firma del token (eso solo puede hacerlo el servidor, que la
 * vuelve a exigir en cada petición); valida que sea un JWT de tres segmentos y
 * que el usuario traiga los campos con los que el panel decide qué enseñar.
 */
export function esAuthResult(x: unknown): x is AuthResult {
  if (!x || typeof x !== 'object') return false;
  const { accessToken, user } = x as { accessToken?: unknown; user?: unknown };
  if (!esCadena(accessToken)) return false;
  const partes = accessToken.split('.');
  if (partes.length !== 3 || partes.some((p) => p === '')) return false;
  if (!user || typeof user !== 'object') return false;
  const u = user as Record<string, unknown>;
  return (
    esCadena(u.id) &&
    esCadena(u.email) &&
    esCadena(u.name) &&
    esCadena(u.tenantId) &&
    (u.role === 'OWNER' || u.role === 'AGENT')
  );
}

/**
 * Decodifica el AuthResult que el backend deja en el fragmento de la URL tras
 * "Continuar con Google" (ver GoogleAuthController.callback). Devuelve `null` si
 * no es base64 válido, si no es JSON o si no tiene la forma esperada — quien
 * llama no debe persistir nada en ese caso.
 */
export function decodeGoogleAuthResult(base64url: string): AuthResult | null {
  try {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const dato: unknown = JSON.parse(atob(padded));
    return esAuthResult(dato) ? dato : null;
  } catch {
    return null;
  }
}
