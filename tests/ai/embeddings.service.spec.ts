import { ConfigService } from '@nestjs/config';
import { EMBEDDING_DIMENSIONS, EmbeddingsService } from '../../src/ai/embeddings.service';

describe('EmbeddingsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeConfig(provider: string, apiKey = ''): ConfigService {
    return {
      get: (key: string) =>
        ({
          'embeddings.provider': provider,
          'embeddings.apiKey': apiKey,
          'embeddings.model': 'voyage-3-lite',
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
      const vector = await service.embed('hola mundo');
      expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
      const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('es determinístico: el mismo texto produce el mismo vector', async () => {
      const service = new EmbeddingsService(makeConfig('mock'));
      const a = await service.embed('mismo texto');
      const b = await service.embed('mismo texto');
      expect(a).toEqual(b);
    });

    it('textos distintos producen vectores distintos', async () => {
      const service = new EmbeddingsService(makeConfig('mock'));
      const a = await service.embed('quiero agendar una cita');
      const b = await service.embed('cuál es el horario de atención');
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
      const service = new EmbeddingsService(makeConfig('voyage', 'vo-test'));

      const result = await service.embed('hola');

      expect(result).toEqual(embedding);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('voyageai.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer vo-test' }),
        }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual({ input: 'hola', model: 'voyage-3-lite' });
    });

    it('lanza si Voyage AI responde con error', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
      const service = new EmbeddingsService(makeConfig('voyage', 'vo-test'));
      await expect(service.embed('hola')).rejects.toThrow('401');
    });

    it('lanza si la dimensión del embedding devuelto no coincide', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
      }) as unknown as typeof fetch;
      const service = new EmbeddingsService(makeConfig('voyage', 'vo-test'));
      await expect(service.embed('hola')).rejects.toThrow('dimensión');
    });
  });
});
