import { Injectable, NotFoundException } from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

/**
 * CRUD de citas, siempre con scope de tenant. La IA crea citas internamente vía
 * tool-calling (ai-tool-executor); estos endpoints permiten al equipo humano
 * gestionarlas desde el panel bajo las mismas reglas de aislamiento.
 */
@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, contactId?: string): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: { tenantId, contactId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async get(tenantId: string, id: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
    });
    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }
    return appointment;
  }

  async create(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    await this.assertContactBelongsToTenant(tenantId, dto.contactId);
    return this.prisma.appointment.create({
      data: {
        tenantId,
        contactId: dto.contactId,
        title: dto.title,
        scheduledAt: new Date(dto.scheduledAt),
        notes: dto.notes ?? null,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    await this.get(tenantId, id); // asegura pertenencia al tenant
    return this.prisma.appointment.update({
      where: { id },
      data: {
        title: dto.title,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
    });
  }

  /** Un contacto solo puede referenciarse si pertenece al mismo tenant. */
  private async assertContactBelongsToTenant(
    tenantId: string,
    contactId: string,
  ): Promise<void> {
    const count = await this.prisma.contact.count({
      where: { id: contactId, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException('Contacto no encontrado');
    }
  }
}
