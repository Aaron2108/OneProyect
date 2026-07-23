import { randomBytes } from 'crypto';
import { decryptSecret, encryptSecret } from '../../src/common/crypto.util';

describe('crypto.util (cifrado de secretos en reposo)', () => {
  const key = randomBytes(32).toString('base64');
  const otherKey = randomBytes(32).toString('base64');

  it('descifra lo que cifró con la misma clave', () => {
    const encrypted = encryptSecret('token-super-secreto', key);
    expect(decryptSecret(encrypted, key)).toBe('token-super-secreto');
  });

  it('el texto cifrado no contiene el original en claro', () => {
    const encrypted = encryptSecret('token-super-secreto', key);
    expect(encrypted).not.toContain('token-super-secreto');
  });

  it('rechaza descifrar con una clave distinta', () => {
    const encrypted = encryptSecret('token-super-secreto', key);
    expect(() => decryptSecret(encrypted, otherKey)).toThrow();
  });

  it('rechaza un texto cifrado manipulado (auth tag)', () => {
    const encrypted = encryptSecret('token-super-secreto', key);
    const [iv, tag, data] = encrypted.split(':');
    const tampered = `${iv}:${tag}:${data.slice(0, -2)}00`;
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('rechaza una clave que no sea de 32 bytes', () => {
    const shortKey = Buffer.from('demasiado-corta').toString('base64');
    expect(() => encryptSecret('x', shortKey)).toThrow();
  });
});
