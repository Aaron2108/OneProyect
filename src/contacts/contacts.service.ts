import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Contact } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

/**
 * CRUD de contactos. TODAS las operaciones se filtran por `tenantId` (que viene
 * del token, no del cliente): un tenant nunca puede leer ni tocar contactos de
 * otro — mismo principio de aislamiento que el resto del sistema.
 */
@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string): Promise<Contact[]> {
    return this.prisma.contact.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
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
