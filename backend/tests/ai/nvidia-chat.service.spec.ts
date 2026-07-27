import { ConfigService } from '@nestjs/config';
import { NvidiaChatService } from '../../src/ai/nvidia-chat.service';
import { NVIDIA_REQUEST_TIMEOUT_MS } from '../../src/ai/ai.constants';
import { HistoryTurn } from '../../src/ai/ai.types';

const config = {
  get: (key: string) =>
    ({
      'ai.nvidia.apiKey': 'nvapi-test',
      'ai.nvidia.model': 'nvidia/modelo-de-prueba',
      'ai.nvidia.baseUrl': 'https://ejemplo.test/v1',
    })[key],
} as unknown as ConfigService;

/** Mensaje del asistente en el formato que devuelve una API compatible con OpenAI. */
function assistantMessage(
  content: string | null,
  toolCalls?: Array<{ id: string; name: string; arguments: string }>,
): unknown {
  return {
    choices: [
      {
        finish_reason: toolCalls ? 'tool_calls' : 'stop',
        message: {
          content,
          ...(toolCalls
            ? {
                tool_calls: toolCalls.map((c) => ({
                  id: c.id,
                  type: 'function',
                  function: { name: c.name, arguments: c.arguments },
                })),
              }
            : {}),
        },
      },
    ],
  };
}

interface CapturedCall {
  url: string;
  body: {
    model: string;
    messages: Array<Record<string, unknown>>;
    tools: Array<{ type: string; function: { name: string; parameters: unknown } }>;
    tool_choice: string;
  };
  authorization: string;
}

/** Sustituye `fetch` y devuelve las llamadas capturadas, en orden. */
function mockFetch(payloads: unknown[]): CapturedCall[] {
  const calls: CapturedCall[] = [];
  const queue = [...payloads];
  global.fetch = jest.fn(async (url: unknown, init: unknown) => {
    const request = init as { body: string; headers: Record<string, string> };
    calls.push({
      url: String(url),
      body: JSON.parse(request.body),
      authorization: request.headers.Authorization,
    });
    const payload = queue.shift();
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  }) as unknown as typeof fetch;
  return calls;
}

describe('NvidiaChatService (proveedor de pruebas compatible con OpenAI)', () => {
  const history: HistoryTurn[] = [{ role: 'user', text: 'Quiero un turno para corte' }];
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('isEnabled es false sin API key y respond lanza en vez de llamar a la red', async () => {
    const sinKey = {
      get: (key: string) => (key === 'ai.nvidia.apiKey' ? '' : 'x'),
    } as unknown as ConfigService;
    const service = new NvidiaChatService(sinKey);
    const fetchSpy = mockFetch([]);

    expect(service.isEnabled()).toBe(false);
    await expect(service.respond('sistema', history, jest.fn())).rejects.toThrow(
      'NVIDIA_API_KEY',
    );
    expect(fetchSpy).toHaveLength(0);
  });

  it('traduce las herramientas al formato de OpenAI sin perder el esquema', async () => {
    const service = new NvidiaChatService(config);
    const calls = mockFetch([assistantMessage('Hola')]);

    await service.respond('Eres el asistente de Empresa.', history, jest.fn());

    expect(calls[0].url).toBe('https://ejemplo.test/v1/chat/completions');
    expect(calls[0].authorization).toBe('Bearer nvapi-test');
    expect(calls[0].body.model).toBe('nvidia/modelo-de-prueba');
    expect(calls[0].body.tool_choice).toBe('auto');

    const cita = calls[0].body.tools.find((t) => t.function.name === 'create_appointment');
    expect(cita).toBeDefined();
    expect(cita!.type).toBe('function');
    // El JSON Schema viaja tal cual, bajo `parameters` en vez de `input_schema`.
    expect(cita!.function.parameters).toMatchObject({
      type: 'object',
      required: ['title', 'scheduled_at'],
    });
  });

  it('ninguna herramienta expone tenantId ni contactId al modelo', async () => {
    const service = new NvidiaChatService(config);
    const calls = mockFetch([assistantMessage('Hola')]);

    await service.respond('sistema', history, jest.fn());

    // Misma garantía que en el camino de Anthropic: el contexto de confianza lo
    // inyecta el ejecutor, así que texto del cliente no puede redirigir una
    // acción a otro tenant o contacto.
    const esquemas = JSON.stringify(calls[0].body.tools);
    expect(esquemas).not.toMatch(/tenant/i);
    expect(esquemas).not.toMatch(/contact_id|contactId/i);
  });

  it('pone el system prompt primero y respeta el historial', async () => {
    const service = new NvidiaChatService(config);
    const calls = mockFetch([assistantMessage('Hola')]);

    await service.respond('Eres el asistente de Empresa.', [
      { role: 'user', text: 'Hola' },
      { role: 'assistant', text: '¿En qué te ayudo?' },
      { role: 'user', text: 'Quiero un turno' },
    ], jest.fn());

    expect(calls[0].body.messages).toEqual([
      { role: 'system', content: 'Eres el asistente de Empresa.' },
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¿En qué te ayudo?' },
      { role: 'user', content: 'Quiero un turno' },
    ]);
  });

  it('ejecuta la herramienta y devuelve su resultado al modelo para cerrar la respuesta', async () => {
    const service = new NvidiaChatService(config);
    const calls = mockFetch([
      assistantMessage('', [
        {
          id: 'tc1',
          name: 'create_appointment',
          arguments: '{"title":"Corte","scheduled_at":"2026-08-01T15:00:00Z"}',
        },
      ]),
      assistantMessage('Listo, te agendé el corte.'),
    ]);
    const run = jest.fn().mockResolvedValue('Cita creada (id 1)');

    const reply = await service.respond('sistema', history, run);

    expect(run).toHaveBeenCalledWith('create_appointment', {
      title: 'Corte',
      scheduled_at: '2026-08-01T15:00:00Z',
    });
    expect(reply).toMatchObject({
      text: 'Listo, te agendé el corte.',
      actions: ['create_appointment'],
    });
    // Una sola respuesta al cliente costó DOS llamadas a la API: es exactamente
    // la diferencia que la guarda de costo no ve, porque cuenta mensajes.
    expect(reply.usage?.calls).toBe(2);

    // El segundo turno debe llevar el mensaje del asistente CON sus tool_calls y
    // luego el resultado referenciando el mismo id: sin eso el proveedor rechaza
    // la petición.
    const segunda = calls[1].body.messages;
    expect(segunda[segunda.length - 2]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'tc1' }],
    });
    expect(segunda[segunda.length - 1]).toEqual({
      role: 'tool',
      tool_call_id: 'tc1',
      content: 'Cita creada (id 1)',
    });
  });

  it('nunca deja llegar el razonamiento <think> al cliente', async () => {
    const service = new NvidiaChatService(config);
    mockFetch([
      assistantMessage('<think>El cliente pide un turno, debo confirmar.</think>\n¡Listo! Te espero.'),
    ]);

    const reply = await service.respond('sistema', history, jest.fn());

    expect(reply.text).toBe('¡Listo! Te espero.');
    expect(reply.text).not.toContain('<think>');
  });

  it('quita las etiquetas de andamio que el modelo deja abiertas', async () => {
    // Caso real del chat de prueba: llegó un mensaje que empezaba por
    // "<response>" literal porque el modelo abrió la etiqueta y no la cerró.
    const service = new NvidiaChatService(config);
    mockFetch([assistantMessage('<response> Entiendo su frustración, ya aviso al equipo.')]);

    const reply = await service.respond('sistema', history, jest.fn());

    expect(reply.text).toBe('Entiendo su frustración, ya aviso al equipo.');
  });

  it('no destroza un mensaje legítimo que use el signo menor que', async () => {
    // Borrar cualquier <…> se llevaría por delante precios y tallas.
    const service = new NvidiaChatService(config);
    mockFetch([assistantMessage('Tenemos tallas <M> y todo cuesta <10 soles.')]);

    const reply = await service.respond('sistema', history, jest.fn());

    expect(reply.text).toBe('Tenemos tallas <M> y todo cuesta <10 soles.');
  });

  it('con argumentos ilegibles informa al modelo en vez de romper la conversación', async () => {
    const service = new NvidiaChatService(config);
    const calls = mockFetch([
      assistantMessage('', [{ id: 'tc1', name: 'create_appointment', arguments: '{esto no es json' }]),
      assistantMessage('Perdón, ¿me confirmas la fecha?'),
    ]);
    const run = jest.fn();

    const reply = await service.respond('sistema', history, run);

    // No se ejecuta nada contra la BD con argumentos que no se pudieron validar.
    expect(run).not.toHaveBeenCalled();
    expect(reply.actions).toEqual([]);
    expect(reply.text).toBe('Perdón, ¿me confirmas la fecha?');
    const ultima = calls[1].body.messages.at(-1) as { role: string; content: string };
    expect(ultima.role).toBe('tool');
    expect(ultima.content).toMatch(/JSON válido/);
  });

  it('corta el bucle de tool-calling y no gira indefinidamente', async () => {
    const service = new NvidiaChatService(config);
    // El modelo pide herramientas siempre y nunca cierra con texto.
    const siempreTool = assistantMessage('', [
      { id: 'tc1', name: 'create_reminder', arguments: '{"message":"x","remind_at":"2026-08-01T10:00:00Z"}' },
    ]);
    const calls = mockFetch(Array.from({ length: 20 }, () => siempreTool));
    const run = jest.fn().mockResolvedValue('ok');

    const reply = await service.respond('sistema', history, run);

    expect(calls.length).toBe(5); // MAX_TOOL_ITERATIONS
    // Texto vacío: el respaldo común lo resuelve AiService.
    expect(reply.text).toBe('');
    expect(reply.actions).toHaveLength(5);
  });

  it('lanza con el código HTTP cuando el proveedor falla', async () => {
    const service = new NvidiaChatService(config);
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => '{"detail":"rate limit"}',
    })) as unknown as typeof fetch;

    await expect(service.respond('sistema', history, jest.fn())).rejects.toThrow('429');
  });

  it('aborta si el proveedor no responde dentro del límite (no cuelga al worker)', async () => {
    jest.useFakeTimers();
    try {
      const service = new NvidiaChatService(config);
      // Simula un modelo que arranca en frío y nunca contesta: solo termina
      // cuando el propio servicio aborta la petición.
      global.fetch = jest.fn(
        (_url: unknown, init: unknown) =>
          new Promise((_resolve, reject) => {
            const { signal } = init as { signal: AbortSignal };
            signal.addEventListener('abort', () => reject(new Error('abortada')));
          }),
      ) as unknown as typeof fetch;

      // La expectativa se adjunta ANTES de avanzar el reloj: si no, el rechazo
      // ocurre sin manejador y Jest lo reporta como error del test.
      const promesa = service.respond('sistema', history, jest.fn());
      const esperado = expect(promesa).rejects.toThrow('no respondió');
      await jest.advanceTimersByTimeAsync(NVIDIA_REQUEST_TIMEOUT_MS);

      await esperado;
    } finally {
      jest.useRealTimers();
    }
  });

  it('lanza si la respuesta no trae mensaje', async () => {
    const service = new NvidiaChatService(config);
    mockFetch([{ choices: [] }]);

    await expect(service.respond('sistema', history, jest.fn())).rejects.toThrow(
      'sin mensaje',
    );
  });
});
