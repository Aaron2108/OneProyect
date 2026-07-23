import { ConfigService } from '@nestjs/config';
import { AiContextMemoryService } from '../../src/ai/ai-context-memory.service';
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
  const noMemory = { recall: jest.fn().mockResolvedValue([]) } as unknown as AiContextMemoryService;

  it('isEnabled es false sin API key', () => {
    const prisma = {} as PrismaService;
    const service = new AiService(makeConfig(''), prisma, tools, noMemory);
    expect(service.isEnabled()).toBe(false);
  });

  it('isEnabled es true con API key', () => {
    const prisma = {} as PrismaService;
    const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, noMemory);
    expect(service.isEnabled()).toBe(true);
  });

  describe('withinRateLimit (guarda de costo)', () => {
    it('permite cuando el conteo está por debajo del límite', async () => {
      const prisma = {
        message: { count: jest.fn().mockResolvedValue(5) },
      } as unknown as PrismaService;
      const service = new AiService(makeConfig('sk-ant-test', 20), prisma, tools, noMemory);
      expect(await service.withinRateLimit('conv-1')).toBe(true);
    });

    it('bloquea cuando el conteo alcanza el límite', async () => {
      const prisma = {
        message: { count: jest.fn().mockResolvedValue(20) },
      } as unknown as PrismaService;
      const service = new AiService(makeConfig('sk-ant-test', 20), prisma, tools, noMemory);
      expect(await service.withinRateLimit('conv-1')).toBe(false);
    });

    it('respond lanza si la IA está deshabilitada', async () => {
      const prisma = {} as PrismaService;
      const service = new AiService(makeConfig(''), prisma, tools, noMemory);
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
    const service = new AiService(makeConfig('sk-ant-test'), prisma, toolsMock, noMemory);
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

  describe('memoria de contexto (Fase 4)', () => {
    it('recupera recuerdos del contacto y los incluye en el system prompt', async () => {
      const prisma = {} as PrismaService;
      const contextMemory = {
        recall: jest.fn().mockResolvedValue(['El cliente preguntó por precios de envío.']),
      } as unknown as AiContextMemoryService;
      const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, contextMemory);
      const create = jest.fn().mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hola de nuevo' }],
      });
      (service as unknown as { client: unknown }).client = { messages: { create } };

      await service.respond(
        { tenantId: 't1', tenantName: 'E', contactId: 'c1', contactName: null, contactPhone: '1', conversationId: 'cv' },
        [{ role: 'user', text: '¿Cuánto cuesta el envío?' }],
      );

      expect(contextMemory.recall).toHaveBeenCalledWith('t1', 'c1', '¿Cuánto cuesta el envío?');
      const systemPrompt = create.mock.calls[0][0].system as string;
      expect(systemPrompt).toContain('El cliente preguntó por precios de envío.');
    });

    it('summarize en modo real pide un resumen corto a Claude', async () => {
      const prisma = {} as PrismaService;
      const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, noMemory);
      const create = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'El cliente agendó una cita para el jueves.' }],
      });
      (service as unknown as { client: unknown }).client = { messages: { create } };

      const summary = await service.summarize([
        { role: 'user', text: 'Quiero una cita el jueves' },
        { role: 'assistant', text: 'Listo, quedó agendada' },
      ]);

      expect(summary).toBe('El cliente agendó una cita para el jueves.');
      expect(create).toHaveBeenCalled();
    });

    it('summarize devuelve vacío sin historial', async () => {
      const service = new AiService(makeConfig('sk-ant-test'), {} as PrismaService, tools, noMemory);
      expect(await service.summarize([])).toBe('');
    });
  });
});
