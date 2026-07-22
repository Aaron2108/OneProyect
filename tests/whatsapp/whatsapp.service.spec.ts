import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WhatsappService } from '../../src/whatsapp/whatsapp.service';
import { WhatsAppWebhookBody } from '../../src/whatsapp/whatsapp.types';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let queue: { add: jest.Mock };

  const config = {
    get: (key: string) =>
      ({ 'whatsapp.verifyToken': 'verify123', 'whatsapp.appSecret': 'secret' })[
        key
      ],
  } as unknown as ConfigService;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new WhatsappService(config, queue as unknown as Queue);
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

    it('encola un job por cada mensaje entrante', async () => {
      const count = await service.enqueueInbound(buildBody(true));
      expect(count).toBe(1);
      expect(queue.add).toHaveBeenCalledTimes(1);
      const [, job, opts] = queue.add.mock.calls[0];
      expect(job.text).toBe('Hola');
      expect(job.waMessageId).toBe('wamid.ABC');
      expect(opts.jobId).toBe('PN1_wamid.ABC'); // dedup de reenvíos (sin ":")
    });

    it('ignora eventos de estado (sin mensaje) — guarda NFR', async () => {
      const count = await service.enqueueInbound(buildBody(false));
      expect(count).toBe(0);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
