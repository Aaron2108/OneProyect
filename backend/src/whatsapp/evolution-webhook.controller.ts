import { Body, Controller, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { EvolutionProvider } from './providers/evolution.provider';
import { timingSafeStringEqual } from './whatsapp-signature.util';
import { WhatsappIngestService } from './whatsapp-ingest.service';

/**
 * Entrada de los eventos de Evolution API.
 *
 * Hay un controlador por proveedor —y no uno solo— porque autenticar el webhook
 * es lo único que NO se puede abstraer: Meta firma el cuerpo con HMAC y
 * Evolution no firma nada. Lo que sí es común empieza una línea más abajo, en
 * `interpretarWebhook`: a partir de ahí los dos caminos son el mismo código.
 *
 * Como Evolution no firma, la autenticación es un token compartido que él mismo
 * devuelve en la cabecera `Authorization` (se le configura al crear la
 * instancia). Es más débil que una firma —no acredita el contenido, solo el
 * origen— y por eso el token es obligatorio: sin él la ruta queda cerrada, en
 * lugar de quedar abierta a cualquiera que la descubra.
 */
@SkipThrottle()
@Controller('webhooks/whatsapp/evolution')
export class EvolutionWebhookController {
  constructor(
    private readonly ingest: WhatsappIngestService,
    private readonly config: ConfigService,
    // El provider concreto, no el activo: esta ruta ES el webhook de Evolution,
    // así que quién sabe leerlo no depende de la configuración.
    private readonly provider: EvolutionProvider,
  ) {}

  @Post()
  @HttpCode(200)
  async recibir(@Req() req: Request, @Body() body: unknown): Promise<{ received: true }> {
    this.exigirToken(req);
    await this.ingest.ingerir(this.provider.interpretarWebhook(body));
    return { received: true };
  }

  /**
   * Comprueba el token compartido en tiempo constante (`timingSafeStringEqual`):
   * una comparación normal filtra, por lo que tarda, cuántos caracteres del
   * token son correctos, y eso hace adivinable un secreto de este tamaño.
   */
  private exigirToken(req: Request): void {
    const esperado = this.config.get<string>('evolution.webhookToken') ?? '';
    if (!esperado) {
      throw new UnauthorizedException('El webhook de WhatsApp no está configurado');
    }
    const cabecera = req.headers.authorization ?? '';
    const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice('Bearer '.length).trim() : '';
    if (!timingSafeStringEqual(recibido, esperado)) {
      throw new UnauthorizedException('Token de webhook inválido');
    }
  }
}
