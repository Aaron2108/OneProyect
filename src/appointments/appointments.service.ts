import { Injectable, NotFoundException } from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { GoogleCalendarSyncService } from '../google-calendar/google-calendar-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

/** Cita con los datos mínimos del contacto para mostrarla en el panel (calendario, listas). */
export type AppointmentWithContact = Appointment & {
  contact: { id: string; name: string | null; phone: string };
};

/**
 * CRUD de citas, siempre con scope de tenant. La IA crea citas internamente vía
 * tool-calling (ai-tool-executor); estos endpoints permiten al equipo humano
 * gestionarlas desde el panel bajo las mismas reglas de aislamiento. Tras cada
 * alta/cambio se refleja (best-effort) en Google Calendar si el tenant tiene la
 * integración conectada — ver GoogleCalendarSyncService.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendar: GoogleCalendarSyncService,
  ) {}

  /** Lista de citas del tenant, opcionalmente por contacto y/o rango de fechas (vista de calendario). */
  list(tenantId: string, filters: ListAppointmentsDto): Promise<AppointmentWithContact[]> {
    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        contactId: filters.contactId,
        scheduledAt: {
          gte: filters.from ? new Date(filters.from) : undefined,
          lte: filters.to ? new Date(filters.to) : undefined,
        },
      },
      orderBy: { scheduledAt: 'asc' },
      include: { contact: { select: { id: true, name: true, phone: true } } },
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
    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId,
        contactId: dto.contactId,
        title: dto.title,
        scheduledAt: new Date(dto.scheduledAt),
        notes: dto.notes ?? null,
      },
    });
    await this.googleCalendar.syncOnCreate(tenantId, appointment);
    return appointment;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    await this.get(tenantId, id); // asegura pertenencia al tenant
    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: {
        title: dto.title,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.status,
        notes: dto.notes,
      },
    });
    await this.googleCalendar.syncOnUpdate(tenantId, appointment);
    return appointment;
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
