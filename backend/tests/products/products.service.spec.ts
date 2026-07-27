import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  buildSearchTerms,
  buildSearchText,
  normalizeForSearch,
  ProductsService,
} from '../../src/products/products.service';

/**
 * Un producto tal y como sale de la base: `searchText` ya normalizado, que es
 * justo lo que la búsqueda mira. Construirlo con la misma función que usa el
 * servicio al escribir evita que los tests pasen con datos imposibles.
 */
function producto(id: string, name: string, description: string | null = null) {
  return { id, name, sku: null, description, searchText: buildSearchText(name, null, description) };
}

describe('ProductsService', () => {
  let prisma: {
    product: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    $queryRaw: jest.Mock;
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
        count: jest.fn().mockResolvedValue(0),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
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

    it('la consulta vacía enseña el catálogo, y sigue acotada al tenant', async () => {
      // Antes devolvía [] sin tocar la base. Se cambió a propósito: una consulta
      // sin términos es "¿qué venden?", no un error — pero el aislamiento entre
      // negocios vale igual en ese camino.
      prisma.product.findMany.mockResolvedValue([producto('1', 'Shampoo')]);

      const resultado = await service.searchForAi('t1', '   ');

      expect(resultado).toHaveLength(1);
      expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({
        tenantId: 't1',
        active: true,
      });
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
        producto('1', 'Pantalon beige'),
        producto('2', 'Pantalon negro'),
      ]);

      const resultado = await service.searchForAi('t1', 'pantalon negro');

      expect(resultado[0].name).toBe('Pantalon negro');
    });

    it('basta con que coincida un término: no excluye alternativas', async () => {
      prisma.product.findMany.mockResolvedValue([producto('1', 'Pantalon beige')]);
      const resultado = await service.searchForAi('t1', 'pantalon negro');
      // Sigue ofreciendo el beige: es mejor mostrar una alternativa que decir
      // que no hay nada.
      expect(resultado).toHaveLength(1);
    });
  });

  describe('preguntas generales y palabras de relleno', () => {
    it('descarta las palabras que no distinguen un producto de otro', () => {
      // Caso real: con "¿que otro productos tienes?" el termino "producto"
      // casaba con el UNICO articulo cuya descripcion decia "no es producto de
      // venta". El agente respondio con lo unico que NO estaba a la venta y dio
      // por vacio el resto del catalogo.
      expect(buildSearchTerms('que otro productos tienes?')).toEqual([]);
    });

    it('tampoco deja pasar la forma recortada de una palabra de relleno', () => {
      // "productos" se filtra, pero el recorte del plural no puede colarla.
      expect(buildSearchTerms('productos')).toEqual([]);
    });

    it('sigue conservando lo que sí identifica un producto', () => {
      expect(buildSearchTerms('tienen shampoo hidratante?')).toEqual(
        expect.arrayContaining(['shampoo', 'hidratante']),
      );
      expect(buildSearchTerms('quiero un shampoo')).toEqual(['shampoo']);
    });

    it('una pregunta general devuelve el catálogo, no una lista vacía', async () => {
      // Devolver vacío hacía que el agente dijera que no hay nada.
      prisma.product.findMany.mockResolvedValue([producto('1', 'Shampoo')]);

      const resultado = await service.searchForAi('t1', '¿que productos tienen?');

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ tenantId: 't1', active: true });
      expect(resultado).toHaveLength(1);
    });

    it('la muestra prioriza lo que sí se puede vender hoy', async () => {
      // Si solo caben unos pocos, que no sean los agotados.
      prisma.product.findMany.mockResolvedValue([]);
      await service.searchForAi('t1', 'que venden');
      expect(prisma.product.findMany.mock.calls[0][0].orderBy).toEqual([
        { stock: 'desc' },
        { name: 'asc' },
      ]);
    });

    it('countActive cuenta solo los activos del negocio', async () => {
      prisma.product.count.mockResolvedValue(7);
      expect(await service.countActive('t1')).toBe(7);
      expect(prisma.product.count).toHaveBeenCalledWith({
        where: { tenantId: 't1', active: true },
      });
    });
  });

  describe('tildes', () => {
    it('el cliente escribe sin tildes y el producto las tiene', () => {
      // Nadie pone tildes desde el móvil. Antes, "pantalon" no encontraba
      // "Pantalón" y el agente respondía que no lo vendían.
      const guardado = buildSearchText('Pantalón de vestir', null, null);
      expect(buildSearchTerms('pantalon').every((t) => guardado.includes(t))).toBe(true);
    });

    it('y al revés: el producto sin tildes y el cliente con ellas', () => {
      const guardado = buildSearchText('Pantalon de vestir', null, null);
      expect(buildSearchTerms('pantalón').every((t) => guardado.includes(t))).toBe(true);
    });

    it('la ñ se pliega a n: quien escribe "nino" busca "niño"', () => {
      expect(normalizeForSearch('Niño')).toBe('nino');
    });

    it('el texto indexado junta nombre, SKU y descripción ya normalizados', () => {
      expect(buildSearchText('Camisón', 'Á-1', 'Algodón')).toBe('camison a-1 algodon');
    });

    it('la búsqueda del panel también ignora las tildes', async () => {
      await service.list('t1', { q: 'PANTALÓN' } as never);
      expect(prisma.product.findMany.mock.calls[0][0].where.searchText).toEqual({
        contains: 'pantalon',
      });
    });

    it('guarda el texto normalizado al crear', async () => {
      await service.create('t1', { name: 'Pantalón', description: 'Algodón' });
      expect(prisma.product.create.mock.calls[0][0].data.searchText).toBe('pantalon algodon');
    });

    it('al editar solo la descripción, el nombre sigue siendo buscable', async () => {
      // Recalcular solo con lo que llega en el DTO habría borrado el nombre del
      // texto indexado y el producto habría desaparecido de las búsquedas.
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Pantalón',
        sku: null,
        description: 'viejo',
      });
      await service.update('t1', 'p1', { description: 'Algodón' });
      expect(prisma.product.update.mock.calls[0][0].data.searchText).toBe('pantalon algodon');
    });

    it('la importación CSV también normaliza', async () => {
      await service.importCsv('t1', 'nombre,descripcion\nPantalón,Algodón');
      expect(prisma.product.create.mock.calls[0][0].data.searchText).toBe('pantalon algodon');
    });
  });

  describe('erratas', () => {
    it('si nada coincide literalmente, reintenta por parecido antes de rendirse', async () => {
      // "no lo encontré" y "no lo vendemos" no son lo mismo: una letra de más
      // no puede costarle una venta al negocio.
      prisma.product.findMany.mockResolvedValueOnce([]); // la búsqueda literal falla
      prisma.$queryRaw.mockResolvedValue([{ id: '2' }]);
      prisma.product.findMany.mockResolvedValueOnce([producto('2', 'Pantalon negro')]);

      const resultado = await service.searchForAi('t1', 'pantalonn');

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(resultado[0].name).toBe('Pantalon negro');
    });

    it('no gasta la consulta por parecido si ya encontró algo', async () => {
      prisma.product.findMany.mockResolvedValue([producto('1', 'Pantalon negro')]);
      await service.searchForAi('t1', 'pantalon');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('el rescate por parecido respeta el tenant y solo mira los activos', async () => {
      prisma.product.findMany.mockResolvedValueOnce([]);
      prisma.$queryRaw.mockResolvedValue([]);

      await service.searchForAi('t1', 'pantalonn');

      // La consulta es SQL en crudo: el aislamiento no lo cubre Prisma, hay que
      // comprobar que el tenant viaja como parámetro y que filtra por activos.
      const [fragmentos, ...parametros] = prisma.$queryRaw.mock.calls[0];
      expect(fragmentos.join('?')).toContain('p.active = true');
      expect(fragmentos.join('?')).toContain('p.tenant_id =');
      expect(parametros).toContain('t1');
    });

    it('conserva el orden por similitud que calculó Postgres', async () => {
      // `findMany` con `in` devuelve en el orden que quiera; el bueno es el de
      // la consulta por similitud.
      prisma.product.findMany.mockResolvedValueOnce([]);
      prisma.$queryRaw.mockResolvedValue([{ id: '2' }, { id: '1' }]);
      prisma.product.findMany.mockResolvedValueOnce([
        producto('1', 'Pantalon beige'),
        producto('2', 'Pantalon negro'),
      ]);

      const resultado = await service.searchForAi('t1', 'pantalonn');

      expect(resultado.map((p) => p.id)).toEqual(['2', '1']);
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
