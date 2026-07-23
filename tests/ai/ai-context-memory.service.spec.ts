import { AiContextMemoryService } from '../../src/ai/ai-context-memory.service';
import { EmbeddingsService } from '../../src/ai/embeddings.service';
import { PiiCryptoService } from '../../src/common/pii-crypto.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { makeTestPiiCrypto } from '../helpers/pii-crypto.stub';

describe('AiContextMemoryService', () => {
  function makeEmbeddings(overrides: Partial<EmbeddingsService> = {}): EmbeddingsService {
    return {
      isEnabled: () => true,
      embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      ...overrides,
    } as unknown as EmbeddingsService;
  }

  it('isEnabled delega en EmbeddingsService.isEnabled', () => {
    const enabled = makeEmbeddings({ isEnabled: () => false });
    const service = new AiContextMemoryService({} as PrismaService, enabled, makeTestPiiCrypto());
    expect(service.isEnabled()).toBe(false);
  });

  describe('remember', () => {
    it('no hace nada si la memoria de contexto está deshabilitada', async () => {
      const embed = jest.fn();
      const embeddings = makeEmbeddings({ isEnabled: () => false, embed });
      const executeRaw = jest.fn();
      const prisma = { $executeRaw: executeRaw } as unknown as PrismaService;
      const service = new AiContextMemoryService(prisma, embeddings, makeTestPiiCrypto());

      await service.remember('t1', 'c1', 'cv1', 'texto');

      expect(embed).not.toHaveBeenCalled();
      expect(executeRaw).not.toHaveBeenCalled();
    });

    it('no hace nada con texto vacío', async () => {
      const executeRaw = jest.fn();
      const prisma = { $executeRaw: executeRaw } as unknown as PrismaService;
      const service = new AiContextMemoryService(prisma, makeEmbeddings(), makeTestPiiCrypto());

      await service.remember('t1', 'c1', 'cv1', '   ');

      expect(executeRaw).not.toHaveBeenCalled();
    });

    it('cifra el contenido y guarda el embedding vía SQL crudo', async () => {
      const executeRaw = jest.fn().mockResolvedValue(1);
      const prisma = { $executeRaw: executeRaw } as unknown as PrismaService;
      const pii = makeTestPiiCrypto();
      const service = new AiContextMemoryService(prisma, makeEmbeddings(), pii);

      await service.remember('t1', 'c1', 'cv1', 'El cliente preguntó por precios.');

      expect(executeRaw).toHaveBeenCalledTimes(1);
      // El $executeRaw de Prisma se invoca como tagged template: primer arg son los strings.
      const strings = executeRaw.mock.calls[0][0] as TemplateStringsArray;
      expect(strings.join('')).toContain('INSERT INTO ai_context_memory');
      const values = executeRaw.mock.calls[0].slice(1);
      expect(values).toContain('t1');
      expect(values).toContain('c1');
      expect(values).toContain('cv1');
      // El contenido persistido está cifrado, no en claro.
      expect(values).not.toContain('El cliente preguntó por precios.');
    });

    it('no propaga el error si falla el guardado (best-effort)', async () => {
      const executeRaw = jest.fn().mockRejectedValue(new Error('DB caída'));
      const prisma = { $executeRaw: executeRaw } as unknown as PrismaService;
      const service = new AiContextMemoryService(prisma, makeEmbeddings(), makeTestPiiCrypto());

      await expect(service.remember('t1', 'c1', 'cv1', 'texto')).resolves.toBeUndefined();
    });
  });

  describe('recall', () => {
    it('devuelve [] si está deshabilitada', async () => {
      const embeddings = makeEmbeddings({ isEnabled: () => false });
      const queryRaw = jest.fn();
      const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
      const service = new AiContextMemoryService(prisma, embeddings, makeTestPiiCrypto());

      expect(await service.recall('t1', 'c1', 'algo')).toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('devuelve [] con texto de búsqueda vacío', async () => {
      const queryRaw = jest.fn();
      const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
      const service = new AiContextMemoryService(prisma, makeEmbeddings(), makeTestPiiCrypto());

      expect(await service.recall('t1', 'c1', '  ')).toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('descifra y devuelve el contenido de las filas más similares', async () => {
      const pii = makeTestPiiCrypto();
      const encrypted = pii.encrypt('El cliente ya preguntó por esto antes.');
      const queryRaw = jest.fn().mockResolvedValue([{ content: encrypted }]);
      const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
      const service = new AiContextMemoryService(prisma, makeEmbeddings(), pii);

      const result = await service.recall('t1', 'c1', '¿cuánto cuesta?');

      expect(result).toEqual(['El cliente ya preguntó por esto antes.']);
      const strings = queryRaw.mock.calls[0][0] as TemplateStringsArray;
      expect(strings.join('')).toContain('WHERE tenant_id =');
      const values = queryRaw.mock.calls[0].slice(1);
      expect(values).toContain('t1');
      expect(values).toContain('c1');
    });

    it('no propaga el error si falla la búsqueda (best-effort)', async () => {
      const queryRaw = jest.fn().mockRejectedValue(new Error('DB caída'));
      const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
      const service = new AiContextMemoryService(prisma, makeEmbeddings(), makeTestPiiCrypto());

      await expect(service.recall('t1', 'c1', 'algo')).resolves.toEqual([]);
    });
  });
});
