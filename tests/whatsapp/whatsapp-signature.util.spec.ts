import { createHmac } from 'crypto';
import {
  timingSafeStringEqual,
  verifyWhatsAppSignature,
} from '../../src/whatsapp/whatsapp-signature.util';

describe('timingSafeStringEqual', () => {
  it('es true para cadenas iguales', () => {
    expect(timingSafeStringEqual('verify_token_123', 'verify_token_123')).toBe(true);
  });
  it('es false para cadenas distintas (incluso de distinta longitud)', () => {
    expect(timingSafeStringEqual('token', 'token-x')).toBe(false);
    expect(timingSafeStringEqual('a', 'b')).toBe(false);
    expect(timingSafeStringEqual('', 'x')).toBe(false);
  });
});

describe('verifyWhatsAppSignature', () => {
  const appSecret = 'test_app_secret';
  const rawBody = Buffer.from(JSON.stringify({ object: 'x' }));

  const sign = (body: Buffer, secret: string): string =>
    'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

  it('acepta una firma válida', () => {
    const sig = sign(rawBody, appSecret);
    expect(verifyWhatsAppSignature(rawBody, sig, appSecret)).toBe(true);
  });

  it('rechaza una firma calculada con otro secreto', () => {
    const sig = sign(rawBody, 'otro_secreto');
    expect(verifyWhatsAppSignature(rawBody, sig, appSecret)).toBe(false);
  });

  it('rechaza si el cuerpo fue alterado', () => {
    const sig = sign(rawBody, appSecret);
    const tampered = Buffer.from(JSON.stringify({ object: 'y' }));
    expect(verifyWhatsAppSignature(tampered, sig, appSecret)).toBe(false);
  });

  it('rechaza cuando faltan datos o el prefijo es incorrecto', () => {
    expect(verifyWhatsAppSignature(undefined, 'sha256=abc', appSecret)).toBe(false);
    expect(verifyWhatsAppSignature(rawBody, undefined, appSecret)).toBe(false);
    expect(verifyWhatsAppSignature(rawBody, 'md5=abc', appSecret)).toBe(false);
    expect(verifyWhatsAppSignature(rawBody, sign(rawBody, appSecret), '')).toBe(false);
  });
});
