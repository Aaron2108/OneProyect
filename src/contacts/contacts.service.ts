import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Contact } from '@prisma/client';
import { PiiCryptoService } from '../common/pii-crypto.service';
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
 *
 * `notes` se cifra en reposo (ver SECURITY.md §11): `phone`/`name` siguen en
 * claro a propósito, porque se buscan con `contains` y `phone` tiene un
 * índice único por tenant — cifrarlos exigiría un índice ciego aparte y
 * perder la búsqueda parcial (ver DECISIONS.md).
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiCryptoService,
  ) {}

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
    return { items: items.map((c) => this.decrypted(c)), nextCursor };
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
      contacts.map((c) => [c.phone, c.name, this.pii.decryptNullable(c.notes), c.createdAt.toISOString()]),
    );
  }

  async get(tenantId: string, id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId },
    });
    if (!contact) {
      throw new NotFoundException('Contacto no encontrado');
    }
    return this.decrypted(contact);
  }

  async create(tenantId: string, dto: CreateContactDto): Promise<Contact> {
    const exists = await this.prisma.contact.findUnique({
      where: { tenantId_phone: { tenantId, phone: dto.phone } },
    });
    if (exists) {
      throw new ConflictException('Ya existe un contacto con ese teléfono');
    }
    const created = await this.prisma.contact.create({
      data: {
        tenantId,
        phone: dto.phone,
        name: dto.name ?? null,
        notes: this.pii.encryptNullable(dto.notes ?? null),
      },
    });
    return this.decrypted(created);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateContactDto,
  ): Promise<Contact> {
    await this.get(tenantId, id); // asegura pertenencia al tenant antes de tocar
    const updated = await this.prisma.contact.update({
      where: { id },
      data: {
        name: dto.name,
        notes: dto.notes === undefined ? undefined : this.pii.encryptNullable(dto.notes),
      },
    });
    return this.decrypted(updated);
  }

  private decrypted(contact: Contact): Contact {
    return { ...contact, notes: this.pii.decryptNullable(contact.notes) };
  }
}
