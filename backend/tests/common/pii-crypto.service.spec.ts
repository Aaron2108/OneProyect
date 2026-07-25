import { makeTestPiiCrypto } from '../helpers/pii-crypto.stub';

describe('PiiCryptoService', () => {
  const pii = makeTestPiiCrypto();

  it('descifra lo que cifró', () => {
    const cipher = pii.encrypt('Hola, ¿cómo estás?');
    expect(pii.decrypt(cipher)).toBe('Hola, ¿cómo estás?');
    expect(cipher).not.toBe('Hola, ¿cómo estás?');
  });

  it('encryptNullable/decryptNullable pasan null tal cual', () => {
    expect(pii.encryptNullable(null)).toBeNull();
    expect(pii.encryptNullable(undefined)).toBeNull();
    expect(pii.decryptNullable(null)).toBeNull();
  });

  it('encryptNullable/decryptNullable cifran y descifran valores presentes', () => {
    const cipher = pii.encryptNullable('nota interna');
    expect(cipher).not.toBeNull();
    expect(pii.decryptNullable(cipher)).toBe('nota interna');
  });
});
