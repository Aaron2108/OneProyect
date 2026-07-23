import { Injectable, Logger } from '@nestjs/common';
import { Appointment, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarOauthService } from './google-calendar-oauth.service';
import { GoogleCalendarEvent } from './google-calendar.types';

const EVENTS_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars';
// El modelo de Appointment no guarda duración; se asume 1h por cita, el mínimo
// necesario para que Google acepte el evento (no se inventa un dato de negocio
// que no existe — ver CLAUDE.md).
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * Refleja las citas del panel como eventos de Google Calendar — una sola vía
 * (WhatsFlow → Google, ver docs/DECISIONS.md). Nunca hace fallar la operación
 * de la cita que la origina: si Google no responde o el tenant no tiene la
 * integración conectada, se registra y se sigue — la cita ya quedó guardada en
 * WhatsFlow, que es la fuente de verdad.
 */
@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOauthService,
  ) {}

  async syncOnCreate(tenantId: string, appointment: Appointment): Promise<void> {
    try {
      const ctx = await this.context(tenantId);
      if (!ctx) return;
      const event = await this.createEvent(ctx, appointment);
      await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { googleEventId: event.id },
      });
    } catch (err) {
      this.logger.error(
        `No se pudo crear el evento en Google Calendar para la cita ${appointment.id}: ${(err as Error).message}`,
      );
    }
  }

  async syncOnUpdate(tenantId: string, appointment: Appointment): Promise<void> {
    try {
      const ctx = await this.context(tenantId);
      if (!ctx) return;

      if (appointment.status === AppointmentStatus.CANCELLED) {
        if (appointment.googleEventId) {
          await this.deleteEvent(ctx, appointment.googleEventId);
          await this.prisma.appointment.update({
            where: { id: appointment.id },
            data: { googleEventId: null },
          });
        }
        return;
      }

      if (appointment.googleEventId) {
        await this.updateEvent(ctx, appointment.googleEventId, appointment);
      } else {
        const event = await this.createEvent(ctx, appointment);
        await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { googleEventId: event.id },
        });
      }
    } catch (err) {
      this.logger.error(
        `No se pudo sincronizar con Google Calendar la cita ${appointment.id}: ${(err as Error).message}`,
      );
    }
  }

  private async context(
    tenantId: string,
  ): Promise<{ accessToken: string; calendarId: string } | null> {
    if (!this.oauth.isConfigured()) return null;
    const accessToken = await this.oauth.getValidAccessToken(tenantId);
    if (!accessToken) return null;
    const calendarId = await this.oauth.getCalendarId(tenantId);
    return { accessToken, calendarId };
  }

  private eventPayload(appointment: Appointment): Record<string, unknown> {
    const start = appointment.scheduledAt;
    const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
    return {
      summary: appointment.title,
      description: appointment.notes ?? undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };
  }

  private async createEvent(
    ctx: { accessToken: string; calendarId: string },
    appointment: Appointment,
  ): Promise<GoogleCalendarEvent> {
    const response = await fetch(`${EVENTS_BASE_URL}/${encodeURIComponent(ctx.calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.eventPayload(appointment)),
    });
    if (!response.ok) {
      throw new Error(`Google Calendar respondió ${response.status} al crear el evento`);
    }
    return (await response.json()) as GoogleCalendarEvent;
  }

  private async updateEvent(
    ctx: { accessToken: string; calendarId: string },
    eventId: string,
    appointment: Appointment,
  ): Promise<void> {
    const response = await fetch(
      `${EVENTS_BASE_URL}/${encodeURIComponent(ctx.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.eventPayload(appointment)),
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Google Calendar respondió ${response.status} al actualizar el evento`);
    }
  }

  private async deleteEvent(
    ctx: { accessToken: string; calendarId: string },
    eventId: string,
  ): Promise<void> {
    const response = await fetch(
      `${EVENTS_BASE_URL}/${encodeURIComponent(ctx.calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${ctx.accessToken}` } },
    );
    // 404/410: el evento ya no existe en Google — no es un fallo desde WhatsFlow.
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(`Google Calendar respondió ${response.status} al borrar el evento`);
    }
  }
}
