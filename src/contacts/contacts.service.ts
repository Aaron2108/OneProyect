import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Contact } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toCsv } from '../common/csv.util';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsDto } from './dto/list-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

/** Tope de filas en una exportación (evita respuestas enormes). */
const EXPORT_LIMIT = 5000;

/**
 * CRUD de contactos. TODAS las operaciones se filtran por `tenantId` (que viene
 * del token, no del cliente): un tenant nunca puede leer ni tocar contactos de
 * otro — mismo principio de aislamiento que el resto del sistema.
 */
@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Contactos del tenant con búsqueda y paginación keyset (cursor). */
  async list(
    tenantId: string,
    opts: ListContactsDto,
  ): Promise<{ items: Contact[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 25;
    const q = opts.q?.trim();
    const items = await this.prisma.contact.findMany({
      where: {
        tenantId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const nextCursor = items.length === limit ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  /** Exporta los contactos del tenant a CSV. */
  async exportCsv(tenantId: string): Promise<string> {
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
    });
    return toCsv(
      ['Telefono', 'Nombre', 'Notas', 'Creado'],
      contacts.map((c) => [c.phone, c.name, c.notes, c.createdAt.toISOString()]),
    );
  }

  async get(tenantId: string, id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId },
    });
    if (!contact) {
      throw new NotFoundException('Contacto no encontrado');
    }
    return contact;
  }

  async create(tenantId: string, dto: CreateContactDto): Promise<Contact> {
    const exists = await this.prisma.contact.findUnique({
      where: { tenantId_phone: { tenantId, phone: dto.phone } },
    });
    if (exists) {
      throw new ConflictException('Ya existe un contacto con ese teléfono');
    }
    return this.prisma.contact.create({
      data: {
        tenantId,
        phone: dto.phone,
        name: dto.name ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateContactDto,
  ): Promise<Contact> {
    await this.get(tenantId, id); // asegura pertenencia al tenant antes de tocar
    return this.prisma.contact.update({
      where: { id },
      data: { name: dto.name, notes: dto.notes },
    });
  }
}
