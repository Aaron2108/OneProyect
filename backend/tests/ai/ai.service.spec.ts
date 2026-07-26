import { ConfigService } from '@nestjs/config';
import { AiContextMemoryService } from '../../src/ai/ai-context-memory.service';
import { AiService } from '../../src/ai/ai.service';
import { AI_TOOLS, AiToolExecutorService } from '../../src/ai/ai-tool-executor.service';
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
  const noProfile = {
    describe: jest.fn().mockResolvedValue([]),
    // Sin zona propia: la IA cae al respaldo global (BUSINESS_TIME_ZONE).
    timeZoneOf: jest.fn().mockResolvedValue(null),
  } as unknown as BusinessProfileService;
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
    /**
     * `enConversacion` es el conteo de la primera consulta (la de esta
     * conversación); `enHora`/`enDia`, los dos del negocio que van juntos en
     * una transacción.
     */
    const prismaCon = (enConversacion: number, enHora = 0, enDia = 0) =>
      ({
        message: { count: jest.fn().mockResolvedValue(enConversacion) },
        $transaction: jest.fn().mockResolvedValue([enHora, enDia]),
      }) as unknown as PrismaService;

    const service = (prisma: PrismaService) =>
      new AiService(makeConfig('sk-ant-test', 20), prisma, tools, noMemory, noProfile, noKnowledge, noNvidia);

    it('permite cuando el conteo está por debajo del límite', async () => {
      expect(await service(prismaCon(5)).withinRateLimit('conv-1', 't1')).toEqual({ allowed: true });
    });

    it('bloquea cuando la conversación alcanza su límite', async () => {
      expect(await service(prismaCon(20)).withinRateLimit('conv-1', 't1')).toEqual({
        allowed: false,
        reason: 'conversacion-hora',
      });
    });

    it('bloquea por el techo del negocio aunque la conversación vaya holgada', async () => {
      // El caso que motiva el techo por negocio: el gasto repartido entre
      // muchas conversaciones no lo delata ninguna de ellas.
      expect(await service(prismaCon(1, 200, 400)).withinRateLimit('conv-1', 't1')).toEqual({
        allowed: false,
        reason: 'negocio-hora',
      });
    });

    it('bloquea por el techo diario aunque la hora vaya holgada', async () => {
      // El goteo sostenido: por hora nunca llega al techo, pero suma.
      expect(await service(prismaCon(1, 10, 1500)).withinRateLimit('conv-1', 't1')).toEqual({
        allowed: false,
        reason: 'negocio-dia',
      });
    });

    it('sin tenantId solo aplica el techo de la conversación', async () => {
      const prisma = prismaCon(1, 9999, 9999);
      expect(await service(prisma).withinRateLimit('conv-1')).toEqual({ allowed: true });
      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).not.toHaveBeenCalled();
    });

    it('al agotarse el presupuesto escala a una persona, no deja al cliente sin respuesta', async () => {
      // Callarse, desde el lado del cliente, es que el negocio lo dejó en visto.
      const toolsMock = { escalateToHuman: jest.fn().mockResolvedValue('ok') } as unknown as AiToolExecutorService;
      const svc = new AiService(
        makeConfig('sk-ant-test', 20), prismaCon(0), toolsMock, noMemory, noProfile, noKnowledge, noNvidia,
      );

      await svc.escalateForCostLimit(
        { tenantId: 't1', tenantName: 'E', contactId: 'c', contactName: null, contactPhone: '1', conversationId: 'cv' },
        'negocio-dia',
      );

      expect(toolsMock.escalateToHuman).toHaveBeenCalledTimes(1);
      const [motivo] = (toolsMock.escalateToHuman as jest.Mock).mock.calls[0];
      // El motivo lo lee el equipo en la bandeja: tiene que decir qué pasó.
      expect(motivo).toMatch(/límite de respuestas automáticas/i);
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

  describe('zona horaria por negocio', () => {
    const ctx = {
      tenantId: 't1',
      tenantName: 'Empresa',
      contactId: 'c1',
      contactName: 'Ana',
      contactPhone: '52155',
      conversationId: 'cv1',
    };
    const mockConfig = {
      get: (key: string) =>
        ({ 'ai.provider': 'mock', 'business.timeZone': 'America/Lima' })[key],
    } as unknown as ConfigService;

    /** Perfil de un negocio que eligió (o no) su propia zona. */
    const profileCon = (timeZone: string | null) =>
      ({
        describe: jest.fn().mockResolvedValue([]),
        timeZoneOf: jest.fn().mockResolvedValue(timeZone),
      }) as unknown as BusinessProfileService;

    it('usa la zona del negocio, no la global de la plataforma', async () => {
      // El caso que motiva el cambio: con un unico valor global, un negocio en
      // Madrid agendaba con las horas de Lima.
      const toolsMock = {
        execute: jest.fn().mockResolvedValue('ok'),
        describeWithoutExecuting: jest.fn(),
      } as unknown as AiToolExecutorService;
      const service = new AiService(
        mockConfig, {} as PrismaService, toolsMock, noMemory, profileCon('Europe/Madrid'), noKnowledge, noNvidia,
      );

      await service.respond(ctx, [{ role: 'user', text: 'quiero una cita' }]);

      expect((toolsMock.execute as jest.Mock).mock.calls[0][2].timeZone).toBe('Europe/Madrid');
    });

    it('si el negocio no eligió ninguna, cae al valor global', async () => {
      const toolsMock = {
        execute: jest.fn().mockResolvedValue('ok'),
        describeWithoutExecuting: jest.fn(),
      } as unknown as AiToolExecutorService;
      const service = new AiService(
        mockConfig, {} as PrismaService, toolsMock, noMemory, profileCon(null), noKnowledge, noNvidia,
      );

      await service.respond(ctx, [{ role: 'user', text: 'quiero una cita' }]);

      expect((toolsMock.execute as jest.Mock).mock.calls[0][2].timeZone).toBe('America/Lima');
    });

    it('una zona guardada inválida no rompe la conversación', async () => {
      // No deberia llegar (el panel la valida), pero si llegara, `Intl` fallaria
      // en cada mensaje y el cliente se quedaria sin respuesta.
      const toolsMock = {
        execute: jest.fn().mockResolvedValue('ok'),
        describeWithoutExecuting: jest.fn(),
      } as unknown as AiToolExecutorService;
      const service = new AiService(
        mockConfig, {} as PrismaService, toolsMock, noMemory, profileCon('Marte/Olympus'), noKnowledge, noNvidia,
      );

      await service.respond(ctx, [{ role: 'user', text: 'quiero una cita' }]);

      expect((toolsMock.execute as jest.Mock).mock.calls[0][2].timeZone).toBe('America/Lima');
    });

    it('el system prompt anuncia la zona del negocio', () => {
      const service = new AiService(
        makeConfig('sk-ant-test'), {} as PrismaService, tools, noMemory, noProfile, noKnowledge, noNvidia,
      );

      const prompt = service.buildSystemPrompt(
        { ...ctx, timeZone: 'Europe/Madrid' }, [], [], [], new Date('2026-08-03T21:00:00Z'),
      );

      expect(prompt).toContain('Europe/Madrid');
      expect(prompt).not.toContain('America/Lima');
    });
  });

  describe('escalado por baja confianza (RF-11)', () => {
    const ctx = {
      tenantId: 't1',
      tenantName: 'Empresa',
      contactId: 'c1',
      contactName: 'Ana',
      contactPhone: '52155',
      conversationId: 'cv1',
    };
    // Proveedor simulado: ejercita el bucle de herramientas sin gastar créditos.
    const mockConfig = {
      get: (key: string) =>
        ({ 'ai.provider': 'mock', 'business.timeZone': 'America/Lima' })[key],
    } as unknown as ConfigService;

    const prompt = () =>
      new AiService(
        makeConfig('sk-ant-test'), {} as PrismaService, tools, noMemory, noProfile, noKnowledge, noNvidia,
      ).buildSystemPrompt(
        { tenantId: 't', tenantName: 'E', contactId: 'c', contactName: 'Ana', contactPhone: '1', conversationId: 'cv' },
      );

    it('el prompt le dice que escale en vez de improvisar', () => {
      // Sin esto el modelo prefiere inventar antes que admitir que no sabe: en
      // una prueba real se inventó una moneda que el negocio nunca declaró.
      expect(prompt()).toMatch(/escala la conversación a una persona/i);
      expect(prompt()).toMatch(/en vez de improvisar/i);
    });

    it('y también le pone el contrapeso para que no escale todo', () => {
      // Un agente que escala cada mensaje le devuelve al dueño el trabajo que
      // venía a quitarle: la instrucción sin freno rompe el producto.
      expect(prompt()).toMatch(/no escales por costumbre/i);
      expect(prompt()).toMatch(/si la información que tienes alcanza.*responde tú/i);
    });

    it('la herramienta se le ofrece al modelo', () => {
      expect(AI_TOOLS.map((t) => t.name)).toContain('escalar_a_humano');
    });

    it('el modo simulado ejercita la cadena completa sin gastar créditos', async () => {
      const toolsMock = {
        execute: jest.fn().mockResolvedValue('Conversación pasada a una persona del equipo.'),
        describeWithoutExecuting: jest.fn(),
      } as unknown as AiToolExecutorService;
      const service = new AiService(
        mockConfig, {} as PrismaService, toolsMock, noMemory, noProfile, noKnowledge, noNvidia,
      );

      const reply = await service.respond(ctx, [{ role: 'user', text: 'quiero hacer un reclamo' }]);

      expect(toolsMock.execute).toHaveBeenCalledWith(
        'escalar_a_humano',
        expect.objectContaining({ motivo: expect.any(String) }),
        { ...ctx, timeZone: expect.any(String) },
      );
      expect(reply.actions).toContain('escalar_a_humano');
    });

    it('en el chat de prueba se simula: probar no puede escalar una conversación real', async () => {
      const toolsMock = {
        execute: jest.fn(),
        describeWithoutExecuting: jest.fn().mockReturnValue('Conversación pasada a una persona.'),
      } as unknown as AiToolExecutorService;
      const service = new AiService(
        mockConfig, {} as PrismaService, toolsMock, noMemory, noProfile, noKnowledge, noNvidia,
      );

      const reply = await service.respond(
        ctx, [{ role: 'user', text: 'quiero una devolución' }], { simulateTools: true },
      );

      expect(toolsMock.execute).not.toHaveBeenCalled();
      expect(reply.simulatedTools?.[0]?.name).toBe('escalar_a_humano');
    });
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
        timeZoneOf: jest.fn().mockResolvedValue(null),
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
        timeZoneOf: jest.fn().mockResolvedValue(null),
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
        timeZoneOf: jest.fn().mockResolvedValue(null),
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
      expect(toolsMock.execute).toHaveBeenCalledWith(
        'create_appointment',
        { title: 'Corte' },
        { ...ctx, timeZone: expect.any(String) },
      );
    });

    it('en el chat de prueba NO ejecuta herramientas y reporta lo que habría hecho', async () => {
      const toolsMock = {
        execute: jest.fn(),
        describeWithoutExecuting: jest.fn().mockReturnValue('Cita creada para el lunes.'),
      } as unknown as AiToolExecutorService;
      const nvidia = {
        isEnabled: () => true,
        respond: jest.fn().mockImplementation(
          async (
            _system: string,
            _history: unknown,
            run: (n: string, i: unknown) => Promise<string>,
          ) => {
            const resultado = await run('create_appointment', {
              title: 'Corte',
              scheduled_at: '2026-08-03T11:00:00-05:00',
            });
            return { text: `Listo. ${resultado}`, actions: ['create_appointment'] };
          },
        ),
      } as unknown as NvidiaChatService;
      const service = new AiService(
        nvidiaConfig, {} as PrismaService, toolsMock, noMemory, noProfile, noKnowledge, nvidia,
      );

      const reply = await service.respond(
        ctx, [{ role: 'user', text: 'quiero un corte' }], { simulateTools: true },
      );

      // Lo importante: probar el agente no puede crear una cita de verdad.
      expect(toolsMock.execute).not.toHaveBeenCalled();
      expect(reply.simulatedTools).toEqual([
        {
          name: 'create_appointment',
          input: { title: 'Corte', scheduled_at: '2026-08-03T11:00:00-05:00' },
        },
      ]);
      // El modelo igual recibe una confirmación creíble, para seguir el hilo.
      expect(reply.text).toContain('Cita creada para el lunes.');
    });

    it('en el chat de prueba, consultar el catálogo SÍ se ejecuta (es solo lectura)', async () => {
      // Simularlo devolvería productos inventados y el dueño no podría
      // comprobar si su agente responde bien sobre el stock.
      const toolsMock = {
        execute: jest.fn().mockResolvedValue('Resultado del catálogo: Remera, 4 disponibles.'),
        describeWithoutExecuting: jest.fn(),
      } as unknown as AiToolExecutorService;
      const nvidia = {
        isEnabled: () => true,
        respond: jest.fn().mockImplementation(
          async (
            _system: string,
            _history: unknown,
            run: (n: string, i: unknown) => Promise<string>,
          ) => {
            const resultado = await run('consultar_producto', { consulta: 'remera' });
            return { text: resultado, actions: ['consultar_producto'] };
          },
        ),
      } as unknown as NvidiaChatService;
      const service = new AiService(
        nvidiaConfig, {} as PrismaService, toolsMock, noMemory, noProfile, noKnowledge, nvidia,
      );

      const reply = await service.respond(
        ctx, [{ role: 'user', text: '¿tienen remeras?' }], { simulateTools: true },
      );

      expect(toolsMock.execute).toHaveBeenCalledWith(
        'consultar_producto',
        { consulta: 'remera' },
        { ...ctx, timeZone: expect.any(String) },
      );
      expect(toolsMock.describeWithoutExecuting).not.toHaveBeenCalled();
      expect(reply.text).toContain('4 disponibles');
      // No es una acción simulada: se ejecutó de verdad y no modificó nada.
      expect(reply.simulatedTools).toEqual([]);
    });

    it('sin la opción sí ejecuta de verdad y no devuelve simulatedTools', async () => {
      const toolsMock = {
        execute: jest.fn().mockResolvedValue('Cita creada para el lunes.'),
        describeWithoutExecuting: jest.fn(),
      } as unknown as AiToolExecutorService;
      const nvidia = {
        isEnabled: () => true,
        respond: jest.fn().mockImplementation(
          async (
            _system: string,
            _history: unknown,
            run: (n: string, i: unknown) => Promise<string>,
          ) => {
            await run('create_appointment', { title: 'Corte' });
            return { text: 'Listo', actions: ['create_appointment'] };
          },
        ),
      } as unknown as NvidiaChatService;
      const service = new AiService(
        nvidiaConfig, {} as PrismaService, toolsMock, noMemory, noProfile, noKnowledge, nvidia,
      );

      const reply = await service.respond(ctx, [{ role: 'user', text: 'quiero un corte' }]);

      expect(toolsMock.execute).toHaveBeenCalledWith(
        'create_appointment',
        { title: 'Corte' },
        { ...ctx, timeZone: expect.any(String) },
      );
      expect(reply.simulatedTools).toBeUndefined();
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
