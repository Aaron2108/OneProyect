import { Global, Module } from '@nestjs/common';
import { PiiCryptoService } from './pii-crypto.service';

/** Módulo global: expone utilidades transversales (hoy, el cifrado de PII) a toda la app. */
@Global()
@Module({
  providers: [PiiCryptoService],
  exports: [PiiCryptoService],
})
export class CommonModule {}
