import { ConfigService } from '@nestjs/config';
import { AiService } from '../../src/ai/ai.service';
import { AiToolExecutorService } from '../../src/ai/ai-tool-executor.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AiService', () => {
  const makeConfig = (apiKey: string, maxCalls = 20): ConfigService =>
    ({
      get: (key: string) =>
        ({
          'ai.apiKey': apiKey,
          'ai.model': 'claude-haiku-4-5',
          'ai.maxCallsPerConversationPerHour': maxCalls,
        })[key],
    }) as unknown as ConfigService;

  const tools = {} as AiToolExecutorService;

  it('isEnabled es false sin API key', () => {
    const prisma = {} as PrismaService;
    const service = new AiService(makeConfig(''), prisma, tools);
    expect(service.isEnabled()).toBe(false);
  });

  it('isEnabled es true con API key', () => {
    const prisma = {} as PrismaService;
    const service = new AiService(makeConfig('sk-ant-test'), prisma, tools);
    expect(service.isEnabled()).toBe(true);
  });

  describe('withinRateLimit (guarda de costo)', () => {
    it('permite cuando el conteo está por debajo del límite', async () => {
      const prisma = {
        message: { count: jest.fn().mockResolvedValue(5) },
      } as unknown as PrismaService;
      const service = new AiService(makeConfig('sk-ant-test', 20), prisma, tools);
      expect(await service.withinRateLimit('conv-1')).toBe(true);
    });

    it('bloquea cuando el conteo alcanza el límite', async () => {
      const prisma = {
        message: { count: jest.fn().mockResolvedValue(20) },
      } as unknown as PrismaService;
      const service = new AiService(makeConfig('sk-ant-test', 20), prisma, tools);
      expect(await service.withinRateLimit('conv-1')).toBe(false);
    });

    it('respond lanza si la IA está deshabilitada', async () => {
      const prisma = {} as PrismaService;
      const service = new AiService(makeConfig(''), prisma, tools);
      await expect(
        service.respond(
          {
            tenantId: 't',
            tenantName: 'E',
            contactId: 'c',
            contactName: null,
            contactPhone: '1',
            conversationId: 'cv',
          },
          [],
        ),
      ).rejects.toThrow('IA deshabilitada');
    });
  });

  it('devuelve un texto de cierre si el bucle de tools se agota sin texto (RF-NFR)', async () => {
    const prisma = {} as PrismaService;
    const toolsMock = { execute: jest.fn().mockResolvedValue('ok') } as unknown as AiToolExecutorService;
    const service = new AiService(makeConfig('sk-ant-test'), prisma, toolsMock);
    // El modelo siempre pide tool_use y nunca devuelve texto → agota el bucle.
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu1', name: 'create_appointment', input: {} }],
    });
    (service as unknown as { client: unknown }).client = { messages: { create } };

    const reply = await service.respond(
      { tenantId: 't', tenantName: 'E', contactId: 'c', contactName: null, contactPhone: '1', conversationId: 'cv' },
      [{ role: 'user', text: 'agenda una cita' }],
    );

    expect(reply.text).not.toBe(''); // el cliente siempre recibe respuesta
    expect(reply.text).toContain('registré');
    expect(reply.actions.length).toBeGreaterThan(0);
  });
});
