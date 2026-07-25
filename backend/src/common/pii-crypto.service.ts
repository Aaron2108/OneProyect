import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptSecret, encryptSecret } from './crypto.util';

/**
 * Cifrado en reposo del contenido de conversaciones (ver SECURITY.md §11 y
 * DECISIONS.md): el texto de mensajes, notas internas y notas de contacto
 * nunca se guarda en claro. Envuelve `crypto.util` con la clave ya resuelta
 * desde configuración, para no repetir `config.get(...)` en cada servicio que
 * toca estos campos.
 */
@Injectable()
export class PiiCryptoService {
  private readonly key: string;

  constructor(config: ConfigService) {
    this.key = config.get<string>('security.tokenEncryptionKey') ?? '';
  }

  encrypt(plain: string): string {
    return encryptSecret(plain, this.key);
  }

  decrypt(cipher: string): string {
    return decryptSecret(cipher, this.key);
  }

  encryptNullable(plain: string | null | undefined): string | null {
    return plain == null ? null : this.encrypt(plain);
  }

  decryptNullable(cipher: string | null | undefined): string | null {
    return cipher == null ? null : this.decrypt(cipher);
  }
}
