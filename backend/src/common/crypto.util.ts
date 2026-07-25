import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Cifrado simétrico (AES-256-GCM) para secretos en reposo — hoy los tokens
 * OAuth de Google Calendar (ver `google-calendar/`), el mismo mecanismo sirve
 * para futura PII cifrada (ver TASKS.md). Formato almacenado: `iv:tag:cifrado`
 * (todo hex), análogo al `salt:hash` de `auth/password.util.ts`.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function loadKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY inválida: se espera una clave de 32 bytes en base64 (AES-256)',
    );
  }
  return key;
}

export function encryptSecret(plainText: string, base64Key: string): string {
  const key = loadKey(base64Key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string, base64Key: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Formato de secreto cifrado inválido');
  }
  const key = loadKey(base64Key);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
