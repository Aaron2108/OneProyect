import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Product } from '@prisma/client';
import { parseCsv } from '../common/csv.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/** Tope de filas por importación: evita bloquear la petición con un archivo enorme. */
export const MAX_IMPORT_ROWS = 2000;

/** Resultado de una importación, por fila, para poder corregir el archivo. */
export interface ImportReport {
  created: number;
  updated: number;
  errors: Array<{ row: number; reason: string }>;
}

/**
 * Catálogo de productos. Todas las operaciones filtran por `tenantId` del token:
 * un negocio nunca ve ni toca el catálogo de otro.
 *
 * El precio se guarda en céntimos y como entero — en dinero, el punto flotante
 * arrastra errores de redondeo.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    opts: ListProductsDto,
  ): Promise<{ items: Product[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 25;
    // `searchText` ya está en minúsculas y sin tildes, así que basta con
    // normalizar la consulta igual: "Pantalón" y "pantalon" caen en lo mismo.
    const q = normalizeForSearch(opts.q ?? '');
    const items = await this.prisma.product.findMany({
      where: {
        tenantId,
        ...(opts.onlyActive === 'true' ? { active: true } : {}),
        ...(q ? { searchText: { contains: q } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    return {
      items,
      nextCursor: items.length === limit ? items[items.length - 1].id : null,
    };
  }

  /**
   * Búsqueda para la herramienta de la IA: solo productos activos y en vivo
   * contra la BD, nunca desde el prompt — el stock cambia entre mensajes.
   */
  async searchForAi(tenantId: string, query: string, limit = 5): Promise<Product[]> {
    const terminos = buildSearchTerms(query);
    // Sin términos útiles la pregunta no es "¿tienen X?" sino "¿qué tienen?".
    // Devolver vacío hacía que el agente respondiera que no hay nada; lo que
    // corresponde es enseñar el catálogo.
    if (terminos.length === 0) return this.sampleForAi(tenantId, limit);

    // Basta con que coincida UN término; el orden final lo decide cuántos
    // coinciden, así que "pantalon negro" gana a "pantalon beige" sin excluirlo.
    const candidatos = await this.prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        OR: terminos.map((t) => ({ searchText: { contains: t } })),
      },
      // Se piden de más porque el orden útil se calcula abajo, no en SQL.
      take: limit * 4,
    });

    if (candidatos.length > 0) {
      return candidatos
        .map((p) => ({
          p,
          aciertos: terminos.filter((t) => p.searchText.includes(t)).length,
        }))
        .sort((a, b) => b.aciertos - a.aciertos || a.p.name.localeCompare(b.p.name))
        .slice(0, limit)
        .map((x) => x.p);
    }

    // Nada coincide literalmente: puede ser una errata ("pantalonn"). Antes de
    // decirle al cliente que no existe, se reintenta por parecido.
    return this.searchByLikeness(tenantId, terminos, limit);
  }

  /**
   * Muestra del catálogo, para cuando preguntan qué se vende en general.
   *
   * Se ordena por stock descendente: si hay que enseñar solo unos pocos, que
   * sean los que de verdad se pueden vender hoy y no los agotados.
   */
  private sampleForAi(tenantId: string, limit: number): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { tenantId, active: true },
      orderBy: [{ stock: 'desc' }, { name: 'asc' }],
      take: limit,
    });
  }

  /** Cuántos productos activos tiene el negocio (para avisar de que hay más). */
  countActive(tenantId: string): Promise<number> {
    return this.prisma.product.count({ where: { tenantId, active: true } });
  }

  /**
   * Rescate por similitud de trigramas para cuando la coincidencia literal no
   * devuelve nada. `<%` compara el término contra el fragmento más parecido del
   * texto, no contra el texto entero: sin eso, una palabra corta contra una
   * descripción larga nunca supera el umbral.
   *
   * Se piden solo los `id` y se releen con Prisma porque `$queryRaw` devuelve
   * las columnas tal cual están en la base (`price_cents`), sin el mapeo del
   * modelo — quien llama espera un `Product` de verdad.
   */
  private async searchByLikeness(
    tenantId: string,
    terminos: string[],
    limit: number,
  ): Promise<Product[]> {
    const filas = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p.id
      FROM products p
      WHERE p.tenant_id = ${tenantId}
        AND p.active = true
        AND EXISTS (
          SELECT 1 FROM unnest(${terminos}::text[]) AS t WHERE t <% p.search_text
        )
      ORDER BY (
        SELECT max(word_similarity(t, p.search_text))
        FROM unnest(${terminos}::text[]) AS t
      ) DESC
      LIMIT ${limit}
    `;
    if (filas.length === 0) return [];

    const encontrados = await this.prisma.product.findMany({
      where: { id: { in: filas.map((f) => f.id) } },
    });
    // `findMany` no conserva el orden por similitud que calculó Postgres.
    const porId = new Map(encontrados.map((p) => [p.id, p]));
    return filas.map((f) => porId.get(f.id)).filter((p): p is Product => p !== undefined);
  }

  async get(tenantId: string, id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    await this.ensureSkuFree(tenantId, dto.sku);
    const name = dto.name.trim();
    const sku = dto.sku?.trim() || null;
    const description = dto.description?.trim() || null;
    return this.prisma.product.create({
      data: {
        tenantId,
        name,
        sku,
        description,
        priceCents: dto.priceCents ?? null,
        currency: dto.currency?.toUpperCase() || null,
        stock: dto.stock ?? 0,
        active: dto.active ?? true,
        searchText: buildSearchText(name, sku, description),
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto): Promise<Product> {
    const actual = await this.get(tenantId, id); // 404 si es de otro tenant
    if (dto.sku !== undefined) await this.ensureSkuFree(tenantId, dto.sku, id);

    const name = dto.name !== undefined ? dto.name.trim() : actual.name;
    const sku = dto.sku !== undefined ? dto.sku.trim() || null : actual.sku;
    const description =
      dto.description !== undefined ? dto.description.trim() || null : actual.description;

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name } : {}),
        ...(dto.sku !== undefined ? { sku } : {}),
        ...(dto.description !== undefined ? { description } : {}),
        ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
        ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        // Se recalcula desde los valores ya fusionados: cambiar solo la
        // descripción no puede dejar el nombre fuera del índice de búsqueda.
        searchText: buildSearchText(name, sku, description),
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.get(tenantId, id);
    await this.prisma.product.delete({ where: { id } });
  }

  /**
   * Importa un CSV con cabecera. Columnas reconocidas (en español o inglés):
   * nombre/name, sku/codigo, descripcion/description, precio/price, stock,
   * moneda/currency.
   *
   * Actualiza por SKU en vez de duplicar: volver a subir el archivo del negocio
   * con el stock nuevo es el caso normal, no la excepción. Las filas con error
   * no detienen la importación — se informan para poder corregirlas.
   */
  async importCsv(tenantId: string, csv: string): Promise<ImportReport> {
    const filas = parseCsv(csv);
    if (filas.length < 2) {
      throw new BadRequestException(
        'El archivo no tiene datos: se espera una fila de cabecera y al menos un producto.',
      );
    }
    if (filas.length - 1 > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `El archivo tiene ${filas.length - 1} productos; el máximo por importación es ${MAX_IMPORT_ROWS}.`,
      );
    }

    const columnas = mapHeaders(filas[0]);
    if (columnas.name === undefined) {
      throw new BadRequestException(
        'Falta la columna obligatoria "nombre" (o "name") en la cabecera.',
      );
    }

    const report: ImportReport = { created: 0, updated: 0, errors: [] };

    for (let i = 1; i < filas.length; i++) {
      // +1 más porque la fila 1 del archivo es la cabecera: así el número
      // coincide con lo que el usuario ve en Excel.
      const numeroDeFila = i + 1;
      try {
        const fila = filas[i];
        const valor = (col?: number): string => (col === undefined ? '' : (fila[col] ?? '').trim());

        const name = valor(columnas.name);
        if (!name) {
          report.errors.push({ row: numeroDeFila, reason: 'El nombre está vacío' });
          continue;
        }
        const sku = valor(columnas.sku) || null;
        const stock = parseEntero(valor(columnas.stock));
        if (stock === null) {
          report.errors.push({ row: numeroDeFila, reason: 'El stock no es un número entero' });
          continue;
        }
        const priceCents = parsePrecioACentimos(valor(columnas.price));
        if (priceCents === undefined) {
          report.errors.push({ row: numeroDeFila, reason: 'El precio no es un número válido' });
          continue;
        }

        const description = valor(columnas.description) || null;
        const datos = {
          name,
          description,
          priceCents,
          currency: valor(columnas.currency).toUpperCase() || null,
          stock,
          searchText: buildSearchText(name, sku, description),
        };

        // Sin SKU no hay forma de saber si es el mismo producto: se crea.
        const existente = sku
          ? await this.prisma.product.findFirst({ where: { tenantId, sku } })
          : null;

        if (existente) {
          await this.prisma.product.update({ where: { id: existente.id }, data: datos });
          report.updated++;
        } else {
          await this.prisma.product.create({ data: { tenantId, sku, ...datos } });
          report.created++;
        }
      } catch (err) {
        report.errors.push({ row: numeroDeFila, reason: (err as Error).message });
      }
    }

    this.logger.log(
      `Importación de productos (tenant ${tenantId}): ${report.created} creados, ` +
        `${report.updated} actualizados, ${report.errors.length} con error.`,
    );
    return report;
  }

  private async ensureSkuFree(tenantId: string, sku?: string, exceptId?: string): Promise<void> {
    const limpio = sku?.trim();
    if (!limpio) return;
    const existente = await this.prisma.product.findFirst({ where: { tenantId, sku: limpio } });
    if (existente && existente.id !== exceptId) {
      throw new ConflictException(`Ya existe un producto con el código "${limpio}".`);
    }
  }
}

/**
 * Deja el texto en minúsculas y sin signos diacríticos.
 *
 * Nadie escribe tildes desde el teclado del móvil: el producto está guardado
 * como "Pantalón" y el cliente pregunta por "pantalon". Se descompone en NFD y
 * se quitan las marcas combinantes, así que "ñ" pasa a "n" — buscado: quien
 * escribe "nino" espera encontrar "niño".
 */
export function normalizeForSearch(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Texto normalizado que se guarda en `Product.searchText` y se indexa. */
export function buildSearchText(
  name: string,
  sku?: string | null,
  description?: string | null,
): string {
  return normalizeForSearch([name, sku ?? '', description ?? ''].join(' ')).replace(/\s+/g, ' ');
}

/**
 * Convierte lo que escribe el cliente en términos de búsqueda.
 *
 * Un cliente pregunta "¿tienen pantalones negros?" y el producto se llama
 * "Pantalon negro": buscar la frase entera no encuentra nada. Se parte en
 * palabras, se descartan las muy cortas (artículos, preposiciones) y se añade
 * la forma sin plural — medido con el agente real, que respondía "no lo
 * encontramos" sobre un producto que sí estaba en el catálogo.
 *
 * Los términos salen ya normalizados para poder compararlos con `searchText`.
 */
/**
 * Palabras que no distinguen un producto de otro y solo generan ruido.
 *
 * Dos grupos: las de relleno del español (ya sin las de menos de 3 letras, que
 * se descartan por longitud) y las que nombran la categoría en vez del
 * artículo — "producto", "artículo", "catálogo".
 *
 * El segundo grupo importa más de lo que parece. Con la pregunta "¿qué otros
 * productos tienes?", el término "producto" casaba con el único artículo cuya
 * descripción decía "no es producto de venta": el agente respondía con lo
 * único que NO estaba a la venta, y daba por vacío el resto del catálogo.
 */
const PALABRAS_VACIAS = new Set([
  'que', 'cual', 'cuales', 'quien', 'como', 'cuando', 'donde', 'cuanto', 'cuanta',
  'cuantos', 'cuantas', 'otro', 'otra', 'otros', 'otras', 'mas', 'menos', 'muy',
  'todo', 'toda', 'todos', 'todas', 'algo', 'algun', 'alguna', 'alguno', 'algunos',
  'algunas', 'nada', 'cosa', 'cosas', 'para', 'por', 'con', 'sin', 'los', 'las',
  'del', 'una', 'uno', 'unos', 'unas', 'este', 'esta', 'esto', 'estos', 'estas',
  'ese', 'esa', 'eso', 'esos', 'esas', 'aqui', 'ahi', 'alli', 'pero', 'porque',
  'hay', 'tiene', 'tienen', 'tienes', 'tenes', 'tengo', 'quiero', 'quisiera',
  'necesito', 'busco', 'buscar', 'vende', 'venden', 'vendes', 'ver', 'dame',
  'hola', 'gracias', 'favor', 'buenas', 'buenos', 'dias', 'tardes', 'noches',
  // Nombran la categoría, no el artículo.
  'producto', 'productos', 'articulo', 'articulos', 'catalogo', 'stock',
  'precio', 'precios', 'disponible', 'disponibles', 'disponibilidad',
]);

export function buildSearchTerms(query: string): string[] {
  const palabras = normalizeForSearch(query)
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((palabra) => palabra.length >= 3 && !PALABRAS_VACIAS.has(palabra));

  const terminos = new Set<string>();
  const agregar = (t: string): void => {
    // La forma recortada también puede caer en la lista: "productos" ya se
    // filtró, pero conviene que "producto" tampoco entre por esta puerta.
    if (!PALABRAS_VACIAS.has(t)) terminos.add(t);
  };
  for (const palabra of palabras) {
    agregar(palabra);
    if (palabra.endsWith('es') && palabra.length > 4) {
      agregar(palabra.slice(0, -2)); // "pantalones" -> "pantalon"
    } else if (palabra.endsWith('s') && palabra.length > 3) {
      agregar(palabra.slice(0, -1)); // "remeras" -> "remera"
    }
  }
  return [...terminos];
}

/** Posición de cada columna reconocida en la cabecera del CSV. */
interface ColumnMap {
  name?: number;
  sku?: number;
  description?: number;
  price?: number;
  stock?: number;
  currency?: number;
}

/** Acepta cabeceras en español o inglés, sin distinguir mayúsculas ni acentos. */
function mapHeaders(cabecera: string[]): ColumnMap {
  const alias: Record<string, keyof ColumnMap> = {
    nombre: 'name',
    producto: 'name',
    name: 'name',
    sku: 'sku',
    codigo: 'sku',
    code: 'sku',
    descripcion: 'description',
    description: 'description',
    precio: 'price',
    price: 'price',
    stock: 'stock',
    cantidad: 'stock',
    existencias: 'stock',
    moneda: 'currency',
    currency: 'currency',
  };
  const mapa: ColumnMap = {};
  cabecera.forEach((titulo, indice) => {
    const clave = titulo
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // quita tildes: "descripción" -> "descripcion"
    const campo = alias[clave];
    if (campo && mapa[campo] === undefined) mapa[campo] = indice;
  });
  return mapa;
}

/** Vacío = 0 (no indicar stock significa "sin existencias"); inválido = null. */
function parseEntero(valor: string): number | null {
  if (!valor) return 0;
  const n = Number(valor.replace(/\s/g, ''));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * "19,90", "19.90", "S/ 19.90" o "1.299,50" -> céntimos. Vacío = null (sin
 * precio); inválido = undefined, que el llamador reporta como error de fila.
 */
function parsePrecioACentimos(valor: string): number | null | undefined {
  if (!valor) return null;
  // Quita todo lo que no sea dígito, coma, punto o signo (símbolos de moneda).
  let limpio = valor.replace(/[^\d.,-]/g, '');
  if (!limpio) return null;

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');
  if (ultimaComa > -1 && ultimoPunto > -1) {
    // El separador decimal es el que va más a la derecha; el otro es de miles.
    const decimal = ultimaComa > ultimoPunto ? ',' : '.';
    const miles = decimal === ',' ? '.' : ',';
    limpio = limpio.split(miles).join('').replace(decimal, '.');
  } else if (ultimaComa > -1) {
    limpio = limpio.replace(',', '.');
  }

  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}
