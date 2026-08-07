import { ConfigService } from '@nestjs/config';
import { MetaProvider } from '../../src/whatsapp/providers/meta.provider';
import { WhatsappIngestService } from '../../src/whatsapp/whatsapp-ingest.service';
import { WhatsappSenderService } from '../../src/whatsapp/whatsapp-sender.service';
import { WhatsappService } from '../../src/whatsapp/whatsapp.service';
import { WhatsAppWebhookBody } from '../../src/whatsapp/whatsapp.types';

/**
 * Lo que queda aquí es lo específico de Meta: la verificación del registro del
 * webhook. La traducción del payload se prueba en `meta.provider.spec.ts` y el
 * reparto de eventos en `whatsapp-ingest.service.spec.ts` — ese reparto ya no
 * depende del proveedor, y probarlo tres veces no lo hace más cierto.
 */
describe('WhatsappService (webhook de Meta)', () => {
  let service: WhatsappService;
  let ingerir: jest.Mock;

  const config = {
    get: (key: string) =>
      ({ 'whatsapp.verifyToken': 'verify123', 'whatsapp.appSecret': 'secret' })[key],
  } as unknown as ConfigService;

  beforeEach(() => {
    ingerir = jest.fn().mockResolvedValue(1);
    const meta = new MetaProvider({ isEnabled: () => true } as unknown as WhatsappSenderService);
    service = new WhatsappService(config, meta, {
      ingerir,
    } as unknown as WhatsappIngestService);
  });

  describe('verifyWebhook', () => {
    it('devuelve el challenge cuando el token coincide', () => {
      expect(service.verifyWebhook('subscribe', 'verify123', 'reto')).toBe('reto');
    });

    it('devuelve null cuando el token no coincide', () => {
      expect(service.verifyWebhook('subscribe', 'malo', 'reto')).toBeNull();
    });

    it('devuelve null cuando el modo no es subscribe', () => {
      expect(service.verifyWebhook('otro', 'verify123', 'reto')).toBeNull();
    });
  });

  describe('enqueueInbound', () => {
    const buildBody = (withMessage: boolean): WhatsAppWebhookBody => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'e1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: 'PN1' },
                contacts: [{ wa_id: '5215500000000', profile: { name: 'Ana' } }],
                messages: withMessage
                  ? [
                      {
                        id: 'wamid.ABC',
                        from: '5215500000000',
                        timestamp: '1700000000',
                        type: 'text',
                        text: { body: 'Hola' },
                      },
                    ]
                  : undefined,
                statuses: withMessage
                  ? undefined
                  : [{ id: 'wamid.ABC', status: 'delivered', recipient_id: 'x' }],
              },
            },
          ],
        },
      ],
    });

    it('traduce el mensaje y lo entrega a la ingesta común', async () => {
      await service.enqueueInbound(buildBody(true));
      expect(ingerir).toHaveBeenCalledWith([
        expect.objectContaining({
          clase: 'mensaje',
          externalId: 'PN1',
          externalMessageId: 'wamid.ABC',
          direccion: 'entrante',
          contactPhone: '5215500000000',
          contactName: 'Ana',
          texto: 'Hola',
        }),
      ]);
    });

    it('ignora eventos de estado (sin mensaje) — guarda NFR', async () => {
      await service.enqueueInbound(buildBody(false));
      expect(ingerir).toHaveBeenCalledWith([]);
    });
  });
});
