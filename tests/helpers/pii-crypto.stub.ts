import { ConfigService } from '@nestjs/config';
import { PiiCryptoService } from '../../src/common/pii-crypto.service';

/** Clave AES-256 de prueba (32 bytes en base64) — solo para tests. */
export const TEST_PII_KEY = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';

/** Instancia real de PiiCryptoService (cifra/descifra de verdad) con una clave de prueba fija. */
export function makeTestPiiCrypto(): PiiCryptoService {
  const config = {
    get: (key: string) => (key === 'security.tokenEncryptionKey' ? TEST_PII_KEY : undefined),
  } as unknown as ConfigService;
  return new PiiCryptoService(config);
}
