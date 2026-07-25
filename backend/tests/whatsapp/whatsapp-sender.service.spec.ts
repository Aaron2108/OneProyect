import { ConfigService } from '@nestjs/config';
import { WhatsappSenderService } from '../../src/whatsapp/whatsapp-sender.service';

function makeConfig(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('WhatsappSenderService', () => {
  const baseConfig = {
    'whatsapp.accessToken': 'TEST_TOKEN',
    'whatsapp.apiBaseUrl': 'https://graph.facebook.com',
    'whatsapp.graphApiVersion': 'v21.0',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('isEnabled es false sin access token', () => {
    const service = new WhatsappSenderService(
      makeConfig({ ...baseConfig, 'whatsapp.accessToken': '' }),
    );
    expect(service.isEnabled()).toBe(false);
  });

  it('no llama a fetch si no está habilitado', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WhatsappSenderService(
      makeConfig({ ...baseConfig, 'whatsapp.accessToken': '' }),
    );

    const result = await service.sendText({
      phoneNumberId: 'PN1',
      to: '5215500000000',
      text: 'hola',
    });

    expect(result.messageId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hace POST al endpoint correcto y devuelve el wamid', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.OUT123' }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WhatsappSenderService(makeConfig(baseConfig));

    const result = await service.sendText({
      phoneNumberId: 'PN1',
      to: '5215500000000',
      text: 'Hola, ¿en qué te ayudo?',
    });

    expect(result.messageId).toBe('wamid.OUT123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/PN1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer TEST_TOKEN');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5215500000000',
      type: 'text',
      text: { body: 'Hola, ¿en qué te ayudo?' },
    });
  });

  it('lanza si Meta responde con error', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid token"}}',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WhatsappSenderService(makeConfig(baseConfig));

    await expect(
      service.sendText({ phoneNumberId: 'PN1', to: '52155', text: 'x' }),
    ).rejects.toThrow(/401/);
  });
});
