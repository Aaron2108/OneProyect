import { ConfigService } from '@nestjs/config';
import { AiUsageService } from '../../src/ai/ai-usage.service';
import { AiWriterService } from '../../src/ai/ai-writer.service';
import { BusinessProfileService } from '../../src/business-profile/business-profile.service';

describe('AiWriterService (resúmenes y seguimientos)', () => {
  const config = (apiKey: string, provider = 'anthropic'): ConfigService =>
    ({
      get: (key: string) =>
        ({ 'ai.apiKey': apiKey, 'ai.provider': provider, 'ai.model': 'claude-haiku-4-5' })[key],
    }) as unknown as ConfigService;

  const ctx = {
    tenantId: 't1',
    tenantName: 'Empresa',
    contactId: 'c1',
    contactName: 'Ana',
    contactPhone: '1',
    conversationId: 'cv1',
  };

  let usage: { record: jest.Mock };
  let profile: BusinessProfileService;

  beforeEach(() => {
    usage = { record: jest.fn().mockResolvedValue(undefined) };
    profile = { describe: jest.fn().mockResolvedValue([]) } as unknown as BusinessProfileService;
  });

  /** Servicio con el cliente de Anthropic sustituido por un doble. */
  function conRespuesta(texto: string, tokens = { input: 100, output: 20 }) {
    const create = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: texto }],
      usage: { input_tokens: tokens.input, output_tokens: tokens.output },
    });
    const service = new AiWriterService(
      config('sk-ant-test'),
      usage as unknown as AiUsageService,
      profile,
    );
    (service as unknown as { client: unknown }).client = { messages: { create } };
    return { service, create };
  }

  const historial = [
    { role: 'user' as const, text: '¿Tienen turno el jueves?' },
    { role: 'assistant' as const, text: 'Sí, a las 16h.' },
  ];

  describe('summarize (memoria de la IA)', () => {
    it('pide un resumen corto y devuelve el texto', async () => {
      const { service, create } = conRespuesta('El cliente agendó para el jueves.');
      expect(await service.summarize(historial)).toBe('El cliente agendó para el jueves.');
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('sin historial no llama al modelo', async () => {
      const { service, create } = conRespuesta('x');
      expect(await service.summarize([])).toBe('');
      expect(create).not.toHaveBeenCalled();
    });

    it('sin origen no imputa el gasto a ningún negocio', async () => {
      // Apuntarlo a alguien elegido al azar seria peor que no apuntarlo.
      const { service } = conRespuesta('Resumen.');
      await service.summarize(historial);
      expect(usage.record).not.toHaveBeenCalled();
    });

    it('con origen apunta el gasto como memoria interna', async () => {
      const { service } = conRespuesta('Resumen.');
      await service.summarize(historial, { tenantId: 't1', conversationId: 'cv1' });
      expect(usage.record).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't1', purpose: 'summarize' }),
      );
    });
  });

  describe('summarizeForTeam (resumen para personas)', () => {
    it('usa un prompt distinto al de la memoria: pide lo pendiente', async () => {
      // Mismo material de entrada, lector distinto. Si compartieran prompt, el
      // equipo leeria una nota escrita para que la IA recuerde, no para actuar.
      const { service, create } = conRespuesta('Quería turno; se le ofreció el jueves.');
      await service.summarizeForTeam(historial, { tenantId: 't1', conversationId: 'cv1' });

      const system = create.mock.calls[0][0].system as string;
      expect(system).toMatch(/queda pendiente/i);
      expect(system).toMatch(/nota interna/i);
      // Sin esto el modelo rellena huecos y el equipo actúa sobre algo que
      // nadie dijo.
      expect(system).toMatch(/no inventes/i);
    });

    it('apunta el gasto por separado del resumen de memoria', async () => {
      const { service } = conRespuesta('Resumen.');
      await service.summarizeForTeam(historial, { tenantId: 't1', conversationId: 'cv1' });
      expect(usage.record).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'team-summary', conversationId: 'cv1' }),
      );
    });

    it('sin historial no llama al modelo', async () => {
      const { service, create } = conRespuesta('x');
      expect(await service.summarizeForTeam([], { tenantId: 't1', conversationId: 'cv1' })).toBe('');
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('generateFollowUp', () => {
    it('incluye el tono que configuró el negocio', async () => {
      profile = {
        describe: jest.fn().mockResolvedValue(['Tono/estilo con el que debes responder: Cercano.']),
      } as unknown as BusinessProfileService;
      const { service, create } = conRespuesta('Hola Ana, ¿seguís por ahí?');

      const texto = await service.generateFollowUp(ctx, [
        { role: 'assistant', text: 'Hola, ¿en qué te ayudo?' },
      ]);

      expect(texto).toBe('Hola Ana, ¿seguís por ahí?');
      expect(profile.describe).toHaveBeenCalledWith('t1');
      expect(create.mock.calls[0][0].system as string).toContain('Cercano');
    });

    it('apunta el gasto como seguimiento', async () => {
      const { service } = conRespuesta('Hola.');
      await service.generateFollowUp(ctx, []);
      expect(usage.record).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'follow-up', tenantId: 't1' }),
      );
    });

    it('sin mensajes previos igual escribe algo, sin transcripción vacía', async () => {
      const { service, create } = conRespuesta('Hola.');
      await service.generateFollowUp(ctx, []);
      expect(create.mock.calls[0][0].messages[0].content).toBe('Sin mensajes previos.');
    });
  });

  describe('modo simulado (sin créditos)', () => {
    const simulado = () =>
      new AiWriterService(config('', 'mock'), usage as unknown as AiUsageService, profile);

    it('resume sin llamar a la API', async () => {
      expect(await simulado().summarize(historial)).toContain('simulada');
    });

    it('el resumen para el equipo se distingue de uno real', async () => {
      expect(await simulado().summarizeForTeam(historial, { tenantId: 't1', conversationId: 'c' }))
        .toContain('simulado');
    });

    it('el seguimiento saluda por el nombre del contacto', async () => {
      const texto = await simulado().generateFollowUp(ctx, []);
      expect(texto).toContain('Ana');
      expect(texto).toContain('simulado');
    });

    it('no apunta gasto: no hubo llamada que pagar', async () => {
      await simulado().summarize(historial, { tenantId: 't1' });
      await simulado().generateFollowUp(ctx, []);
      expect(usage.record).not.toHaveBeenCalled();
    });
  });

  it('sin API key se comporta como el modo simulado, no revienta', async () => {
    const sinClave = new AiWriterService(
      config(''),
      usage as unknown as AiUsageService,
      profile,
    );
    expect(await sinClave.summarize(historial)).toContain('simulada');
  });
});
