import { ConfigService } from '@nestjs/config';
import { EMBEDDING_DIMENSIONS, EmbeddingsService } from '../../src/ai/embeddings.service';

describe('EmbeddingsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeConfig(provider: string, apiKey = '', model = ''): ConfigService {
    return {
      get: (key: string) =>
        ({
          'embeddings.provider': provider,
          'embeddings.apiKey': apiKey,
          'embeddings.model': model,
          'embeddings.baseUrl': 'https://nvidia.test/v1',
        })[key],
    } as unknown as ConfigService;
  }

  it('isEnabled es true en modo mock aunque no haya API key', () => {
    const service = new EmbeddingsService(makeConfig('mock'));
    expect(service.isEnabled()).toBe(true);
  });

  it('isEnabled es false en modo real sin API key', () => {
    const service = new EmbeddingsService(makeConfig('voyage', ''));
    expect(service.isEnabled()).toBe(false);
  });

  it('isEnabled es true en modo real con API key', () => {
    const service = new EmbeddingsService(makeConfig('voyage', 'vo-test'));
    expect(service.isEnabled()).toBe(true);
  });

  describe('modo mock', () => {
    it('produce un vector de la dimensión esperada, normalizado', async () => {
      const service = new EmbeddingsService(makeConfig('mock'));
      const vector = await service.embed('hola mundo', 'passage');
      expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
      const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('es determinístico: el mismo texto produce el mismo vector', async () => {
      const service = new EmbeddingsService(makeConfig('mock'));
      const a = await service.embed('mismo texto', 'passage');
      const b = await service.embed('mismo texto', 'passage');
      expect(a).toEqual(b);
    });

    it('textos distintos producen vectores distintos', async () => {
      const service = new EmbeddingsService(makeConfig('mock'));
      const a = await service.embed('quiero agendar una cita', 'passage');
      const b = await service.embed('cuál es el horario de atención', 'passage');
      expect(a).not.toEqual(b);
    });
  });

  describe('proveedor Voyage AI', () => {
    it('llama a la API con el texto y el modelo configurado', async () => {
      const embedding = new Array(EMBEDDING_DIMENSIONS).fill(0.01);
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding }] }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const service = new EmbeddingsService(makeConfig('voyage', 'vo-test', 'voyage-3'));

      const result = await service.embed('hola', 'passage');

      expect(result).toEqual(embedding);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('voyageai.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer vo-test' }),
        }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      // Voyage llama `document` a lo que aquí es `passage`.
      expect(body).toEqual({ input: 'hola', model: 'voyage-3', input_type: 'document' });
    });

    it('distingue la consulta del texto indexado', async () => {
      const embedding = new Array(EMBEDDING_DIMENSIONS).fill(0.01);
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding }] }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const service = new EmbeddingsService(makeConfig('voyage', 'vo-test'));

      await service.embed('¿cuánto cobran?', 'query');

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).input_type).toBe('query');
    });

    it('lanza si Voyage AI responde con error', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
      const service = new EmbeddingsService(makeConfig('voyage', 'vo-test'));
      await expect(service.embed('hola', 'query')).rejects.toThrow('401');
    });

    it('lanza si la dimensión del embedding devuelto no coincide', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
      }) as unknown as typeof fetch;
      const service = new EmbeddingsService(makeConfig('voyage', 'vo-test'));
      // Un vector de otra dimensión rompería el ::vector en la BD con un error
      // opaco: se corta acá y el mensaje dice qué revisar.
      await expect(service.embed('hola', 'query')).rejects.toThrow('dimensión');
    });
  });

  describe('proveedor NVIDIA', () => {
    function mockOk(): jest.Mock {
      const embedding = new Array(EMBEDDING_DIMENSIONS).fill(0.02);
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding }] }),
        text: async () => '',
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    it('usa el endpoint configurado y manda el input_type correcto', async () => {
      const fetchMock = mockOk();
      const service = new EmbeddingsService(makeConfig('nvidia', 'nvapi-test'));

      await service.embed('las cancelaciones se avisan con 24 horas', 'passage');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://nvidia.test/v1/embeddings',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer nvapi-test' }),
        }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({
        input: ['las cancelaciones se avisan con 24 horas'],
        model: 'nvidia/nv-embedqa-e5-v5',
        input_type: 'passage',
        truncate: 'END',
      });
    });

    it('una consulta viaja como query, no como passage', async () => {
      // El modelo es asimétrico: codifica distinto la pregunta y el texto donde
      // se busca. Confundirlos degrada el ranking sin dar ningún error.
      const fetchMock = mockOk();
      const service = new EmbeddingsService(makeConfig('nvidia', 'nvapi-test'));

      await service.embed('¿me cobran si cancelo tarde?', 'query');

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).input_type).toBe('query');
    });

    it('lanza con el código HTTP si el proveedor falla', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limit',
      }) as unknown as typeof fetch;
      const service = new EmbeddingsService(makeConfig('nvidia', 'nvapi-test'));
      await expect(service.embed('hola', 'query')).rejects.toThrow('429');
    });
  });
});
