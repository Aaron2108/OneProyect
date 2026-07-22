import { ConfigService } from '@nestjs/config';
import { AiService } from '../../src/ai/ai.service';
import { AiToolExecutorService } from '../../src/ai/ai-tool-executor.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationContext } from '../../src/ai/ai.types';

/** Modo mock: pruebas locales sin gastar créditos de API. */
describe('AiService (modo mock)', () => {
  const config = {
    get: (key: string) =>
      ({
        'ai.provider': 'mock',
        'ai.apiKey': '',
        'ai.model': 'claude-haiku-4-5',
        'ai.maxCallsPerConversationPerHour': 20,
      })[key],
  } as unknown as ConfigService;

  const ctx: ConversationContext = {
    tenantId: 't1',
    tenantName: 'Empresa',
    contactId: 'c1',
    contactName: 'Ana',
    contactPhone: '5215500000000',
    conversationId: 'cv1',
  };

  it('isEnabled es true en modo mock aunque no haya API key', () => {
    const service = new AiService(config, {} as PrismaService, {} as AiToolExecutorService);
    expect(service.isEnabled()).toBe(true);
  });

  it('ejecuta create_appointment cuando el mensaje menciona una cita', async () => {
    const tools = {
      execute: jest.fn().mockResolvedValue('Cita creada (id x) para ...'),
    } as unknown as AiToolExecutorService;
    const service = new AiService(config, {} as PrismaService, tools);

    const reply = await service.respond(ctx, [
      { role: 'user', text: 'Hola, quiero agendar una cita' },
    ]);

    expect(reply.actions).toContain('create_appointment');
    expect((tools.execute as jest.Mock)).toHaveBeenCalledWith(
      'create_appointment',
      expect.objectContaining({ title: expect.any(String), scheduled_at: expect.any(String) }),
      ctx,
    );
    expect(reply.text).toContain('Ana');
  });

  it('responde sin acciones cuando no se menciona una cita', async () => {
    const tools = { execute: jest.fn() } as unknown as AiToolExecutorService;
    const service = new AiService(config, {} as PrismaService, tools);

    const reply = await service.respond(ctx, [
      { role: 'user', text: 'Hola, tengo una duda general' },
    ]);

    expect(reply.actions).toHaveLength(0);
    expect(tools.execute).not.toHaveBeenCalled();
  });
});
