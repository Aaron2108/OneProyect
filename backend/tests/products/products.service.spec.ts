import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { buildSearchTerms, ProductsService } from '../../src/products/products.service';

describe('ProductsService', () => {
  let prisma: {
    product: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'p1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'p1', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    service = new ProductsService(prisma as unknown as PrismaService);
  });

  describe('aislamiento por tenant', () => {
    it('get no devuelve un producto de otro tenant', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.get('t1', 'p-de-otro')).rejects.toThrow(NotFoundException);
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-de-otro', tenantId: 't1' },
      });
    });

    it('la búsqueda de la IA filtra por tenant y solo activos', async () => {
      await service.searchForAi('t1', 'remera');
      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(where.active).toBe(true);
    });

    it('la búsqueda de la IA con consulta vacía no toca la BD', async () => {
      expect(await service.searchForAi('t1', '   ')).toEqual([]);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe('búsqueda del agente', () => {
    it('encuentra en singular lo que el cliente pidió en plural', async () => {
      // Caso real: el agente respondía "no lo encontramos" sobre un producto
      // que sí estaba, porque buscaba la frase entera.
      expect(buildSearchTerms('pantalones negros')).toContain('pantalon');
      expect(buildSearchTerms('tienen remeras?')).toContain('remera');
    });

    it('descarta palabras demasiado cortas', () => {
      // "de", "un", "el" harían coincidir medio catálogo.
      expect(buildSearchTerms('un par de medias')).toEqual(
        expect.not.arrayContaining(['un', 'de']),
      );
    });

    it('ordena primero el producto que coincide con más términos', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: '1', name: 'Pantalon beige', sku: null, description: null },
        { id: '2', name: 'Pantalon negro', sku: null, description: null },
      ]);

      const resultado = await service.searchForAi('t1', 'pantalon negro');

      expect(resultado[0].name).toBe('Pantalon negro');
    });

    it('basta con que coincida un término: no excluye alternativas', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: '1', name: 'Pantalon beige', sku: null, description: null },
      ]);
      const resultado = await service.searchForAi('t1', 'pantalon negro');
      // Sigue ofreciendo el beige: es mejor mostrar una alternativa que decir
      // que no hay nada.
      expect(resultado).toHaveLength(1);
    });
  });

  describe('SKU', () => {
    it('rechaza un SKU repetido dentro del mismo tenant', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'otro', sku: 'A-1' });
      await expect(service.create('t1', { name: 'Remera', sku: 'A-1' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('permite varios productos sin SKU', async () => {
      await service.create('t1', { name: 'Remera' });
      await service.create('t1', { name: 'Pantalon' });
      expect(prisma.product.create).toHaveBeenCalledTimes(2);
      expect(prisma.product.create.mock.calls[0][0].data.sku).toBeNull();
    });
  });

  describe('importCsv', () => {
    it('crea productos desde una cabecera en español', async () => {
      const csv = 'nombre,sku,precio,stock\nRemera azul,A-1,19.90,7';
      const report = await service.importCsv('t1', csv);

      expect(report).toMatchObject({ created: 1, updated: 0, errors: [] });
      const data = prisma.product.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        tenantId: 't1',
        name: 'Remera azul',
        sku: 'A-1',
        priceCents: 1990, // el precio se guarda en céntimos, como entero
        stock: 7,
      });
    });

    it('actualiza por SKU en vez de duplicar', async () => {
      // Volver a subir el archivo del negocio con el stock nuevo es el caso
      // normal: si duplicara, el catálogo se llenaría de copias.
      prisma.product.findFirst.mockResolvedValue({ id: 'existente', sku: 'A-1' });
      const report = await service.importCsv('t1', 'nombre,sku,stock\nRemera,A-1,3');

      expect(report).toMatchObject({ created: 0, updated: 1 });
      expect(prisma.product.create).not.toHaveBeenCalled();
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'existente' } }),
      );
    });

    it('entiende precios con coma decimal y símbolo de moneda', async () => {
      await service.importCsv('t1', 'nombre,precio\nRemera,"S/ 1.299,50"');
      expect(prisma.product.create.mock.calls[0][0].data.priceCents).toBe(129950);
    });

    it('acepta cabeceras en inglés y con tildes', async () => {
      await service.importCsv('t1', 'name,description,stock\nShirt,Blue,2');
      expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({
        name: 'Shirt',
        description: 'Blue',
        stock: 2,
      });
      prisma.product.create.mockClear();

      await service.importCsv('t1', 'nombre,descripción\nRemera,Azul');
      expect(prisma.product.create.mock.calls[0][0].data.description).toBe('Azul');
    });

    it('una fila inválida no detiene la importación y se informa con su número', async () => {
      const csv = 'nombre,stock\nRemera,5\n,3\nPantalon,no-es-numero\nGorra,1';
      const report = await service.importCsv('t1', csv);

      expect(report.created).toBe(2); // Remera y Gorra
      expect(report.errors).toEqual([
        { row: 3, reason: expect.stringContaining('nombre') },
        { row: 4, reason: expect.stringContaining('stock') },
      ]);
    });

    it('el número de fila coincide con el que se ve en Excel', async () => {
      // Fila 1 = cabecera, así que el primer producto es la fila 2.
      const report = await service.importCsv('t1', 'nombre,stock\n,1');
      expect(report.errors[0].row).toBe(2);
    });

    it('exige la columna de nombre', async () => {
      await expect(service.importCsv('t1', 'precio,stock\n10,5')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza un archivo sin filas de datos', async () => {
      await expect(service.importCsv('t1', 'nombre,stock')).rejects.toThrow(BadRequestException);
    });

    it('sin stock indicado asume 0, no falla', async () => {
      await service.importCsv('t1', 'nombre,stock\nRemera,');
      expect(prisma.product.create.mock.calls[0][0].data.stock).toBe(0);
    });
  });
});
