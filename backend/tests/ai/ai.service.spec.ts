import { ConfigService } from '@nestjs/config';
import { AiContextMemoryService } from '../../src/ai/ai-context-memory.service';
import { AiService } from '../../src/ai/ai.service';
import { AiToolExecutorService } from '../../src/ai/ai-tool-executor.service';
import { BusinessProfileService } from '../../src/business-profile/business-profile.service';
import { KnowledgeRetrievalService } from '../../src/knowledge/knowledge-retrieval.service';
import { NvidiaChatService } from '../../src/ai/nvidia-chat.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AiService', () => {
  const makeConfig = (apiKey: string, maxCalls = 20): ConfigService =>
    ({
      get: (key: string) =>
        ({
          'ai.apiKey': apiKey,
          'ai.model': 'claude-haiku-4-5',
          'ai.maxCallsPerConversationPerHour': maxCalls,
          // Zona fija: sin esto los tests dependerían de la zona de la máquina.
          'business.timeZone': 'America/Lima',
        })[key],
    }) as unknown as ConfigService;

  const tools = {} as AiToolExecutorService;
  const noMemory = { recall: jest.fn().mockResolvedValue([]) } as unknown as AiContextMemoryService;
  const noProfile = { describe: jest.fn().mockResolvedValue([]) } as unknown as BusinessProfileService;
  const noKnowledge = { describe: jest.fn().mockResolvedValue([]) } as unknown as KnowledgeRetrievalService;
  // Proveedor de pruebas NVIDIA sin credenciales: estos casos ejercitan el
  // camino de Anthropic, así que nunca debe usarse.
  const noNvidia = {
    isEnabled: () => false,
    respond: jest.fn(),
  } as unknown as NvidiaChatService;

  it('isEnabled es false sin API key', () => {
    const prisma = {} as PrismaService;
    const service = new AiService(makeConfig(''), prisma, tools, noMemory, noProfile, noKnowledge, noNvidia);
    expect(service.isEnabled()).toBe(false);
  });

  it('isEnabled es true con API key', () => {
    const prisma = {} as PrismaService;
    const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, noMemory, noProfile, noKnowledge, noNvidia);
    expect(service.isEnabled()).toBe(true);
  });

  describe('withinRateLimit (guarda de costo)', () => {
    it('permite cuando el conteo está por debajo del límite', async () => {
      const prisma = {
        message: { count: jest.fn().mockResolvedValue(5) },
      } as unknown as PrismaService;
      const service = new AiService(makeConfig('sk-ant-test', 20), prisma, tools, noMemory, noProfile, noKnowledge, noNvidia);
      expect(await service.withinRateLimit('conv-1')).toBe(true);
    });

    it('bloquea cuando el conteo alcanza el límite', async () => {
      const prisma = {
        message: { count: jest.fn().mockResolvedValue(20) },
      } as unknown as PrismaService;
      const service = new AiService(makeConfig('sk-ant-test', 20), prisma, tools, noMemory, noProfile, noKnowledge, noNvidia);
      expect(await service.withinRateLimit('conv-1')).toBe(false);
    });

    it('respond lanza si la IA está deshabilitada', async () => {
      const prisma = {} as PrismaService;
      const service = new AiService(makeConfig(''), prisma, tools, noMemory, noProfile, noKnowledge, noNvidia);
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
    const service = new AiService(makeConfig('sk-ant-test'), prisma, toolsMock, noMemory, noProfile, noKnowledge, noNvidia);
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

  it('el system prompt le dice al modelo qué día es hoy y en qué zona agendar', () => {
    const service = new AiService(
      makeConfig('sk-ant-test'), {} as PrismaService, tools, noMemory, noProfile, noKnowledge, noNvidia,
    );

    const prompt = service.buildSystemPrompt(
      { tenantId: 't', tenantName: 'E', contactId: 'c', contactName: 'Ana', contactPhone: '1', conversationId: 'cv' },
      [],
      [],
      [],
      new Date('2026-08-03T21:00:00Z'),
    );

    // Sin la fecha, el modelo adivinaba el año; sin la zona, escribía la hora en
    // UTC y la cita quedaba corrida (aquí, 5 horas).
    expect(prompt).toContain('3 de agosto de 2026');
    expect(prompt).toContain('America/Lima');
    expect(prompt).toMatch(/nunca en UTC/i);
  });

  describe('memoria de contexto (Fase 4)', () => {
    it('recupera recuerdos del contacto y los incluye en el system prompt', async () => {
      const prisma = {} as PrismaService;
      const contextMemory = {
        recall: jest.fn().mockResolvedValue(['El cliente preguntó por precios de envío.']),
      } as unknown as AiContextMemoryService;
      const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, contextMemory, noProfile, noKnowledge, noNvidia);
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
      const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, noMemory, noProfile, noKnowledge, noNvidia);
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
      const service = new AiService(makeConfig('sk-ant-test'), {} as PrismaService, tools, noMemory, noProfile, noKnowledge, noNvidia);
      expect(await service.summarize([])).toBe('');
    });
  });

  describe('perfil de negocio (Agente IA)', () => {
    it('incluye lo configurado por el negocio en el system prompt', async () => {
      const prisma = {} as PrismaService;
      const profile = {
        describe: jest.fn().mockResolvedValue(['Horario de atención: lunes a viernes 9-18h.']),
      } as unknown as BusinessProfileService;
      const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, noMemory, profile, noKnowledge, noNvidia);
      const create = jest.fn().mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hola' }],
      });
      (service as unknown as { client: unknown }).client = { messages: { create } };

      await service.respond(
        { tenantId: 't1', tenantName: 'E', contactId: 'c1', contactName: null, contactPhone: '1', conversationId: 'cv' },
        [{ role: 'user', text: '¿A qué hora abren?' }],
      );

      expect(profile.describe).toHaveBeenCalledWith('t1');
      const systemPrompt = create.mock.calls[0][0].system as string;
      expect(systemPrompt).toContain('Horario de atención: lunes a viernes 9-18h.');
    });

    it('sin perfil configurado, no añade nada extra al prompt', async () => {
      const prisma = {} as PrismaService;
      const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, noMemory, noProfile, noKnowledge, noNvidia);
      const create = jest.fn().mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hola' }],
      });
      (service as unknown as { client: unknown }).client = { messages: { create } };

      await service.respond(
        { tenantId: 't1', tenantName: 'E', contactId: 'c1', contactName: null, contactPhone: '1', conversationId: 'cv' },
        [{ role: 'user', text: 'Hola' }],
      );

      const systemPrompt = create.mock.calls[0][0].system as string;
      expect(systemPrompt).not.toContain('el negocio configuró');
    });
  });

  describe('generateFollowUp (seguimiento automático, Fase 4)', () => {
    const ctx = {
      tenantId: 't1',
      tenantName: 'Empresa',
      contactId: 'c1',
      contactName: 'Ana',
      contactPhone: '1',
      conversationId: 'cv',
    };

    it('en modo real, pide un mensaje breve de seguimiento incluyendo el tono del negocio', async () => {
      const prisma = {} as PrismaService;
      const profile = {
        describe: jest.fn().mockResolvedValue(['Tono/estilo con el que debes responder: Cercano.']),
      } as unknown as BusinessProfileService;
      const service = new AiService(makeConfig('sk-ant-test'), prisma, tools, noMemory, profile, noKnowledge, noNvidia);
      const create = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hola Ana, ¿seguís por ahí?' }],
      });
      (service as unknown as { client: unknown }).client = { messages: { create } };

      const text = await service.generateFollowUp(ctx, [{ role: 'assistant', text: 'Hola, ¿en qué te ayudo?' }]);

      expect(text).toBe('Hola Ana, ¿seguís por ahí?');
      expect(profile.describe).toHaveBeenCalledWith('t1');
      const systemPrompt = create.mock.calls[0][0].system as string;
      expect(systemPrompt).toContain('Cercano');
    });

    it('en modo mock, devuelve un seguimiento simulado sin llamar a la API', async () => {
      const service = new AiService(
        { get: () => undefined } as unknown as ConfigService,
        {} as PrismaService,
        tools,
        noMemory,
        noProfile,
        noKnowledge,
        noNvidia,
      );
      (service as unknown as { provider: string }).provider = 'mock';

      const text = await service.generateFollowUp(ctx, []);

      expect(text).toContain('Ana');
      expect(text).toContain('simulado');
    });
  });

  describe('proveedor de pruebas NVIDIA (AI_PROVIDER=nvidia)', () => {
    const ctx = {
      tenantId: 't1',
      tenantName: 'Empresa',
      contactId: 'c1',
      contactName: 'Ana',
      contactPhone: '1',
      conversationId: 'cv',
    };
    const nvidiaConfig = {
      get: (key: string) =>
        ({ 'ai.provider': 'nvidia', 'business.timeZone': 'America/Lima' })[key],
    } as unknown as ConfigService;

    it('isEnabled depende de las credenciales de NVIDIA, no de las de Anthropic', () => {
      const conCredenciales = {
        isEnabled: () => true,
        respond: jest.fn(),
      } as unknown as NvidiaChatService;
      const service = new AiService(
        nvidiaConfig, {} as PrismaService, tools, noMemory, noProfile, noKnowledge, conCredenciales,
      );
      // Sin ANTHROPIC_API_KEY, pero con el proveedor de pruebas configurado.
      expect(service.isEnabled()).toBe(true);
    });

    it('delega en NVIDIA con el MISMO system prompt que usaría Claude', async () => {
      const profile = {
        describe: jest.fn().mockResolvedValue(['Horario: lunes a viernes 9-18h.']),
      } as unknown as BusinessProfileService;
      const knowledge = {
        describe: jest.fn().mockResolvedValue(['Documentación: cancelaciones con 24h.']),
      } as unknown as KnowledgeRetrievalService;
      const nvidia = {
        isEnabled: () => true,
        respond: jest.fn().mockResolvedValue({ text: 'Listo', actions: ['create_appointment'] }),
      } as unknown as NvidiaChatService;
      const toolsMock = { execute: jest.fn() } as unknown as AiToolExecutorService;
      const service = new AiService(
        nvidiaConfig, {} as PrismaService, toolsMock, noMemory, profile, knowledge, nvidia,
      );

      const reply = await service.respond(ctx, [{ role: 'user', text: 'Quiero un turno' }]);

      expect(reply).toEqual({ text: 'Listo', actions: ['create_appointment'] });
      const [systemPrompt, history] = (nvidia.respond as jest.Mock).mock.calls[0];
      // El contexto del negocio y la documentación llegan igual que con Claude:
      // cambiar de proveedor para probar no cambia lo que la IA sabe.
      expect(systemPrompt).toContain('Empresa');
      expect(systemPrompt).toContain('Horario: lunes a viernes 9-18h.');
      expect(systemPrompt).toContain('Documentación: cancelaciones con 24h.');
      expect(history).toEqual([{ role: 'user', text: 'Quiero un turno' }]);
    });

    it('el ejecutor de herramientas inyecta el contexto de confianza, no el modelo', async () => {
      const nvidia = {
        isEnabled: () => true,
        respond: jest.fn(),
      } as unknown as NvidiaChatService;
      const toolsMock = { execute: jest.fn().mockResolvedValue('ok') } as unknown as AiToolExecutorService;
      const service = new AiService(
        nvidiaConfig, {} as PrismaService, toolsMock, noMemory, noProfile, noKnowledge, nvidia,
      );
      (nvidia.respond as jest.Mock).mockImplementation(
        async (_system: string, _history: unknown, run: (n: string, i: unknown) => Promise<string>) => {
          await run('create_appointment', { title: 'Corte' });
          return { text: 'Listo', actions: ['create_appointment'] };
        },
      );

      await service.respond(ctx, [{ role: 'user', text: 'Quiero un turno' }]);

      // El ctx lo agrega AiService: el modelo nunca puede elegir tenant/contacto.
      expect(toolsMock.execute).toHaveBeenCalledWith('create_appointment', { title: 'Corte' }, ctx);
    });

    it('aplica el respaldo de texto vacío igual que con Claude', async () => {
      const nvidia = {
        isEnabled: () => true,
        respond: jest.fn().mockResolvedValue({ text: '', actions: ['create_reminder'] }),
      } as unknown as NvidiaChatService;
      const service = new AiService(
        nvidiaConfig, {} as PrismaService, tools, noMemory, noProfile, noKnowledge, nvidia,
      );

      const reply = await service.respond(ctx, [{ role: 'user', text: 'Recuérdame algo' }]);

      expect(reply.text).toContain('registré');
      expect(reply.actions).toEqual(['create_reminder']);
    });
  });
});
