import { ConfigService } from '@nestjs/config';
import { AiContextMemoryService } from '../../src/ai/ai-context-memory.service';
import { AiService } from '../../src/ai/ai.service';
import { AiToolExecutorService } from '../../src/ai/ai-tool-executor.service';
import { BusinessProfileService } from '../../src/business-profile/business-profile.service';
import { KnowledgeRetrievalService } from '../../src/knowledge/knowledge-retrieval.service';
import { NvidiaChatService } from '../../src/ai/nvidia-chat.service';
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

  const noMemory = { recall: jest.fn().mockResolvedValue([]) } as unknown as AiContextMemoryService;
  const noProfile = { describe: jest.fn().mockResolvedValue([]) } as unknown as BusinessProfileService;
  const noKnowledge = { describe: jest.fn().mockResolvedValue([]) } as unknown as KnowledgeRetrievalService;
  const noNvidia = {
    isEnabled: () => false,
    respond: jest.fn(),
  } as unknown as NvidiaChatService;

  it('isEnabled es true en modo mock aunque no haya API key', () => {
    const service = new AiService(config, {} as PrismaService, {} as AiToolExecutorService, noMemory, noProfile, noKnowledge, noNvidia);
    expect(service.isEnabled()).toBe(true);
  });

  it('ejecuta create_appointment cuando el mensaje menciona una cita', async () => {
    const tools = {
      execute: jest.fn().mockResolvedValue('Cita creada (id x) para ...'),
    } as unknown as AiToolExecutorService;
    const service = new AiService(config, {} as PrismaService, tools, noMemory, noProfile, noKnowledge, noNvidia);

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
    const service = new AiService(config, {} as PrismaService, tools, noMemory, noProfile, noKnowledge, noNvidia);

    const reply = await service.respond(ctx, [
      { role: 'user', text: 'Hola, tengo una duda general' },
    ]);

    expect(reply.actions).toHaveLength(0);
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it('en el chat de prueba, el modo mock tampoco crea la cita', async () => {
    // El proveedor simulado ejecuta tool-calling REAL contra la BD, así que el
    // chat de prueba tenía que desactivarlo también aquí, no solo con NVIDIA.
    const tools = {
      execute: jest.fn(),
      describeWithoutExecuting: jest.fn().mockReturnValue('Cita creada para el lunes.'),
    } as unknown as AiToolExecutorService;
    const service = new AiService(
      config, {} as PrismaService, tools, noMemory, noProfile, noKnowledge, noNvidia,
    );

    const reply = await service.respond(
      ctx, [{ role: 'user', text: 'Hola, quiero agendar una cita' }], { simulateTools: true },
    );

    expect(tools.execute).not.toHaveBeenCalled();
    expect(reply.simulatedTools).toHaveLength(1);
    expect(reply.simulatedTools?.[0].name).toBe('create_appointment');
  });

  it('recupera memoria de contexto también en modo mock (prueba la tubería completa sin gastar créditos)', async () => {
    const tools = { execute: jest.fn() } as unknown as AiToolExecutorService;
    const contextMemory = { recall: jest.fn().mockResolvedValue([]) } as unknown as AiContextMemoryService;
    const service = new AiService(config, {} as PrismaService, tools, contextMemory, noProfile, noKnowledge, noNvidia);

    await service.respond(ctx, [{ role: 'user', text: 'Hola' }]);

    expect(contextMemory.recall).toHaveBeenCalledWith('t1', 'c1', 'Hola');
  });
});
