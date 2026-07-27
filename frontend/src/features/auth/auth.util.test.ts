import { describe, expect, it } from 'vitest';
import { decodeGoogleAuthResult, esAuthResult } from './auth.util';

const USUARIO_VALIDO = {
  id: 'u1',
  email: 'ana@negocio.com',
  name: 'Ana',
  role: 'OWNER',
  tenantId: 't1',
};
const TOKEN_VALIDO = 'cabecera.cuerpo.firma';
const RESULTADO_VALIDO = { accessToken: TOKEN_VALIDO, user: USUARIO_VALIDO };

/** Codifica como lo hace el backend: base64url sin relleno. */
function aBase64Url(valor: unknown): string {
  return btoa(JSON.stringify(valor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('esAuthResult', () => {
  it('acepta un resultado completo', () => {
    expect(esAuthResult(RESULTADO_VALIDO)).toBe(true);
  });

  it('acepta el rol de agente', () => {
    expect(esAuthResult({ ...RESULTADO_VALIDO, user: { ...USUARIO_VALIDO, role: 'AGENT' } })).toBe(true);
  });

  it('rechaza lo que no es un objeto', () => {
    for (const basura of [null, undefined, 'texto', 42, [], true]) {
      expect(esAuthResult(basura)).toBe(false);
    }
  });

  it('rechaza un token que no tiene tres segmentos', () => {
    expect(esAuthResult({ ...RESULTADO_VALIDO, accessToken: 'sin-puntos' })).toBe(false);
    expect(esAuthResult({ ...RESULTADO_VALIDO, accessToken: 'solo.dos' })).toBe(false);
    expect(esAuthResult({ ...RESULTADO_VALIDO, accessToken: 'a.b.c.d' })).toBe(false);
  });

  it('rechaza un token con algún segmento vacío', () => {
    expect(esAuthResult({ ...RESULTADO_VALIDO, accessToken: '..' })).toBe(false);
    expect(esAuthResult({ ...RESULTADO_VALIDO, accessToken: 'a..c' })).toBe(false);
  });

  it('rechaza un token que no es cadena', () => {
    expect(esAuthResult({ ...RESULTADO_VALIDO, accessToken: 123 })).toBe(false);
    expect(esAuthResult({ user: USUARIO_VALIDO })).toBe(false);
  });

  it('rechaza un rol que el panel no conoce', () => {
    // El caso que importa: si colara, el panel enseñaría una interfaz que no
    // corresponde a ningún rol real.
    expect(esAuthResult({ ...RESULTADO_VALIDO, user: { ...USUARIO_VALIDO, role: 'ADMIN' } })).toBe(false);
    expect(esAuthResult({ ...RESULTADO_VALIDO, user: { ...USUARIO_VALIDO, role: '' } })).toBe(false);
  });

  it('exige todos los campos del usuario', () => {
    for (const campo of ['id', 'email', 'name', 'tenantId'] as const) {
      const user = { ...USUARIO_VALIDO, [campo]: undefined };
      expect(esAuthResult({ ...RESULTADO_VALIDO, user })).toBe(false);
    }
  });

  it('rechaza campos vacíos, que pasarían un typeof', () => {
    expect(esAuthResult({ ...RESULTADO_VALIDO, user: { ...USUARIO_VALIDO, tenantId: '' } })).toBe(false);
  });

  it('rechaza que falte el usuario entero', () => {
    expect(esAuthResult({ accessToken: TOKEN_VALIDO })).toBe(false);
    expect(esAuthResult({ accessToken: TOKEN_VALIDO, user: null })).toBe(false);
    expect(esAuthResult({ accessToken: TOKEN_VALIDO, user: 'ana' })).toBe(false);
  });
});

describe('decodeGoogleAuthResult', () => {
  it('decodifica lo que manda el backend', () => {
    expect(decodeGoogleAuthResult(aBase64Url(RESULTADO_VALIDO))).toEqual(RESULTADO_VALIDO);
  });

  it('devuelve null si no es base64', () => {
    expect(decodeGoogleAuthResult('no-es-base64-***')).toBeNull();
  });

  it('devuelve null si es base64 pero no JSON', () => {
    expect(decodeGoogleAuthResult(btoa('esto no es json'))).toBeNull();
  });

  it('devuelve null si es JSON válido pero no un AuthResult', () => {
    // Este es el ataque que importa: un enlace preparado con un token
    // inventado. Antes se persistía sin mirar.
    expect(decodeGoogleAuthResult(aBase64Url({ accessToken: 'falso', user: { role: 'OWNER' } }))).toBeNull();
  });

  it('nunca lanza: quien llama solo tiene que mirar si es null', () => {
    for (const entrada of ['', '=', 'a', '%%%']) {
      expect(() => decodeGoogleAuthResult(entrada)).not.toThrow();
    }
  });
});
