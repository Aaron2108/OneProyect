import { hashPassword, verifyPassword } from '../../src/auth/password.util';

describe('password.util (scrypt)', () => {
  it('verifica correctamente una contraseña válida', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(await verifyPassword('Sup3rSecret!', hash)).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    expect(await verifyPassword('otra', hash)).toBe(false);
  });

  it('genera hashes distintos para la misma contraseña (salt aleatorio)', async () => {
    const a = await hashPassword('misma');
    const b = await hashPassword('misma');
    expect(a).not.toBe(b);
  });

  it('devuelve false ante un hash con formato inválido', async () => {
    expect(await verifyPassword('x', 'sin-formato')).toBe(false);
  });
});
