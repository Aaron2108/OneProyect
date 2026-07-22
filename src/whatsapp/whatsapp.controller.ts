import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { WhatsappService } from './whatsapp.service';
import { WhatsAppWebhookBody } from './whatsapp.types';

@Controller('webhooks/whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  /**
   * Verificación del webhook (Meta hace un GET con hub.* al registrarlo).
   * Devuelve el challenge en texto plano si el verify token coincide.
   */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const result = this.whatsapp.verifyWebhook(mode, token, challenge);
    if (result === null) {
      throw new ForbiddenException('Verificación de webhook fallida');
    }
    return result;
  }

  /**
   * Recepción de eventos entrantes. Valida la firma, responde 200 de inmediato
   * y encola el procesamiento real de forma asíncrona (nunca trabajo pesado aquí).
   */
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: WhatsAppWebhookBody,
  ): Promise<{ received: true }> {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!this.whatsapp.isValidSignature(req.rawBody, signature)) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }
    if (!body || body.object !== 'whatsapp_business_account') {
      throw new BadRequestException('Payload de webhook no reconocido');
    }
    await this.whatsapp.enqueueInbound(body);
    return { received: true };
  }
}
