import { Injectable, NotFoundException } from '@nestjs/common';
import { Reminder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

/**
 * CRUD de recordatorios, siempre con scope de tenant. El envío programado real
 * (worker que dispara los recordatorios PENDING cuando llega `remindAt`) se
 * conecta en una iteración posterior con el módulo de envío y las plantillas de
 * Meta; aquí se gestiona su alta/edición.
 */
@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, contactId?: string): Promise<Reminder[]> {
    return this.prisma.reminder.findMany({
      where: { tenantId, contactId },
      orderBy: { remindAt: 'asc' },
    });
  }

  async get(tenantId: string, id: string): Promise<Reminder> {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, tenantId },
    });
    if (!reminder) {
      throw new NotFoundException('Recordatorio no encontrado');
    }
    return reminder;
  }

  async create(tenantId: string, dto: CreateReminderDto): Promise<Reminder> {
    await this.assertBelongsToTenant(
      this.prisma.contact.count({ where: { id: dto.contactId, tenantId } }),
      'Contacto no encontrado',
    );
    if (dto.appointmentId) {
      await this.assertBelongsToTenant(
        this.prisma.appointment.count({ where: { id: dto.appointmentId, tenantId } }),
        'Cita no encontrada',
      );
    }
    return this.prisma.reminder.create({
      data: {
        tenantId,
        contactId: dto.contactId,
        appointmentId: dto.appointmentId ?? null,
        message: dto.message,
        remindAt: new Date(dto.remindAt),
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateReminderDto,
  ): Promise<Reminder> {
    await this.get(tenantId, id); // asegura pertenencia al tenant
    return this.prisma.reminder.update({
      where: { id },
      data: {
        message: dto.message,
        remindAt: dto.remindAt ? new Date(dto.remindAt) : undefined,
        status: dto.status,
      },
    });
  }

  private async assertBelongsToTenant(
    countQuery: Promise<number>,
    notFoundMessage: string,
  ): Promise<void> {
    if ((await countQuery) === 0) {
      throw new NotFoundException(notFoundMessage);
    }
  }
}
