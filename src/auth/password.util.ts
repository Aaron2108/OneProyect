import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

/**
 * Hashing de contraseñas con `scrypt` (incluido en Node, sin dependencias
 * nativas). Formato almacenado: `salt:hashHex`. Se compara en tiempo constante
 * para no filtrar información por temporización.
 */
const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, key] = stored.split(':');
  if (!salt || !key) {
    return false;
  }
  const keyBuffer = Buffer.from(key, 'hex');
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  if (keyBuffer.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(keyBuffer, derived);
}
