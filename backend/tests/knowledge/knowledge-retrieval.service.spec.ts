import { EmbeddingsService } from '../../src/ai/embeddings.service';
import { PiiCryptoService } from '../../src/common/pii-crypto.service';
import { KnowledgeRetrievalService } from '../../src/knowledge/knowledge-retrieval.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('KnowledgeRetrievalService', () => {
  const embeddings = {
    isEnabled: () => true,
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  } as unknown as EmbeddingsService;

  const pii = {
    decrypt: (cipher: string) => cipher.replace('cifrado:', ''),
  } as unknown as PiiCryptoService;

  function makePrisma(rows: Array<{ content: string; filename: string }>) {
    const queryRaw = jest.fn().mockResolvedValue(rows);
    return { prisma: { $queryRaw: queryRaw } as unknown as PrismaService, queryRaw };
  }

  it('acota la consulta al tenant y solo a documentos ACTIVE', async () => {
    const { prisma, queryRaw } = makePrisma([]);
    const service = new KnowledgeRetrievalService(prisma, embeddings, pii);

    await service.recall('tenant-1', 'política de cancelación');

    expect(queryRaw).toHaveBeenCalledTimes(1);
    // $queryRaw con template tag recibe (strings, ...valores): el tenantId debe
    // viajar como parámetro, no interpolado en el SQL.
    const params = queryRaw.mock.calls[0].slice(1);
    expect(params).toContain('tenant-1');
    // El SQL menciona el filtro por estado y por tenant.
    const sql = (queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('tenant_id');
    expect(sql).toContain('status');
  });

  it('descifra el contenido y expone el documento de origen', async () => {
    const { prisma } = makePrisma([
      { content: 'cifrado:Cancelaciones con 24 horas.', filename: 'politicas.pdf' },
    ]);
    const service = new KnowledgeRetrievalService(prisma, embeddings, pii);

    const chunks = await service.recall('tenant-1', 'cancelaciones');

    expect(chunks).toEqual([
      { text: 'Cancelaciones con 24 horas.', source: 'politicas.pdf' },
    ]);
  });

  it('describe() cita el archivo de origen y pide no suponer lo que no está', async () => {
    const { prisma } = makePrisma([
      { content: 'cifrado:Atendemos de 9 a 18.', filename: 'horarios.md' },
    ]);
    const service = new KnowledgeRetrievalService(prisma, embeddings, pii);

    const lines = await service.describe('tenant-1', 'horarios');

    expect(lines[0]).toMatch(/fuente de verdad/i);
    expect(lines[1]).toContain('(horarios.md)');
    expect(lines[1]).toContain('Atendemos de 9 a 18.');
  });

  it('devuelve vacío sin proveedor de embeddings (no consulta la BD)', async () => {
    const { prisma, queryRaw } = makePrisma([]);
    const disabled = {
      isEnabled: () => false,
      embed: jest.fn(),
    } as unknown as EmbeddingsService;
    const service = new KnowledgeRetrievalService(prisma, disabled, pii);

    expect(await service.recall('tenant-1', 'algo')).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('devuelve vacío con una consulta en blanco', async () => {
    const { prisma, queryRaw } = makePrisma([]);
    const service = new KnowledgeRetrievalService(prisma, embeddings, pii);

    expect(await service.recall('tenant-1', '   ')).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('si la consulta falla, la IA responde sin este contexto en vez de romper', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('pgvector caído')),
    } as unknown as PrismaService;
    const service = new KnowledgeRetrievalService(prisma, embeddings, pii);

    await expect(service.recall('tenant-1', 'horarios')).resolves.toEqual([]);
  });
});
