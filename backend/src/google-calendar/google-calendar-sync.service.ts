import { Injectable, Logger } from '@nestjs/common';
import { Appointment, AppointmentStatus, GoogleCalendarSyncJob } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarOauthService } from './google-calendar-oauth.service';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CLAIM_LEASE_MS,
  MAX_SYNC_ATTEMPTS,
  RETRY_BATCH,
} from './google-calendar.constants';
import { GoogleCalendarEvent } from './google-calendar.types';

const EVENTS_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars';
// El modelo de Appointment no guarda duración; se asume 1h por cita, el mínimo
// necesario para que Google acepte el evento (no se inventa un dato de negocio
// que no existe — ver CLAUDE.md).
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

type SyncContext = { accessToken: string; calendarId: string };

/**
 * Refleja las citas del panel como eventos de Google Calendar — una sola vía
 * (WhatsFlow → Google, ver docs/DECISIONS.md). Nunca hace fallar la operación
 * de la cita que la origina: si Google no responde o el tenant no tiene la
 * integración conectada, se registra y se sigue — la cita ya quedó guardada en
 * WhatsFlow, que es la fuente de verdad.
 *
 * Si la llamada a Google falla (red, token, rate limit), el intento se agenda
 * en `GoogleCalendarSyncJob` con backoff exponencial (`retryDue`, invocado por
 * `GoogleCalendarSyncProcessor`) en vez de abandonarse en silencio: sin esto,
 * un fallo transitorio dejaba la cita desincronizada para siempre.
 */
@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOauthService,
  ) {}

  async syncOnCreate(tenantId: string, appointment: Appointment): Promise<void> {
    await this.attemptSync(tenantId, appointment);
  }

  async syncOnUpdate(tenantId: string, appointment: Appointment): Promise<void> {
    await this.attemptSync(tenantId, appointment);
  }

  /** Revisa los reintentos vencidos y los reprocesa (llamado por el worker periódico). */
  async retryDue(now: Date = new Date()): Promise<{ succeeded: number; failed: number }> {
    const candidates = await this.prisma.googleCalendarSyncJob.findMany({
      where: { nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: RETRY_BATCH,
    });

    let succeeded = 0;
    let failed = 0;
    for (const job of candidates) {
      // Claim atómico: evita que otra instancia/tick reprocese el mismo job.
      const claim = await this.prisma.googleCalendarSyncJob.updateMany({
        where: { id: job.id, nextAttemptAt: { lte: now } },
        data: { nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
      });
      if (claim.count === 0) continue;

      const appointment = await this.prisma.appointment.findUnique({
        where: { id: job.appointmentId },
      });
      if (!appointment) {
        // La cita ya no existe (borrado en cascada la limpiaría, pero por si acaso).
        await this.prisma.googleCalendarSyncJob.deleteMany({ where: { id: job.id } });
        continue;
      }

      const ok = await this.attemptSync(job.tenantId, appointment, job);
      if (ok) succeeded += 1;
      else failed += 1;
    }
    if (candidates.length > 0) {
      this.logger.log(
        `Reintentos de sincronización con Google Calendar: ${candidates.length} procesados (${succeeded} ok, ${failed} aplazados/agotados)`,
      );
    }
    return { succeeded, failed };
  }

  /**
   * Intenta reconciliar el estado de la cita contra Google Calendar. Nunca
   * lanza: si falla, agenda (o reprograma) el reintento y devuelve `false`.
   */
  private async attemptSync(
    tenantId: string,
    appointment: Appointment,
    existingJob?: GoogleCalendarSyncJob,
  ): Promise<boolean> {
    try {
      const ctx = await this.context(tenantId);
      if (!ctx) {
        // Sin integración conectada no hay nada que sincronizar ni que reintentar.
        if (existingJob) await this.clearRetry(appointment.id);
        return true;
      }
      await this.reconcile(ctx, appointment);
      await this.clearRetry(appointment.id);
      return true;
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `No se pudo sincronizar con Google Calendar la cita ${appointment.id}: ${message}`,
      );
      await this.scheduleRetry(tenantId, appointment.id, message, existingJob);
      return false;
    }
  }

  /** Crea, actualiza o borra el evento según el estado actual de la cita (idempotente). */
  private async reconcile(ctx: SyncContext, appointment: Appointment): Promise<void> {
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
  }

  private async context(tenantId: string): Promise<SyncContext | null> {
    if (!this.oauth.isConfigured()) return null;
    const accessToken = await this.oauth.getValidAccessToken(tenantId);
    if (!accessToken) return null;
    const calendarId = await this.oauth.getCalendarId(tenantId);
    return { accessToken, calendarId };
  }

  /** Agenda o reprograma (backoff exponencial) el reintento; abandona tras `MAX_SYNC_ATTEMPTS`. */
  private async scheduleRetry(
    tenantId: string,
    appointmentId: string,
    error: string,
    existingJob?: GoogleCalendarSyncJob,
  ): Promise<void> {
    const attempts = (existingJob?.attempts ?? 0) + 1;
    if (attempts > MAX_SYNC_ATTEMPTS) {
      this.logger.error(
        `Cita ${appointmentId}: se agotaron los ${MAX_SYNC_ATTEMPTS} reintentos de sincronización con Google Calendar — requiere revisión manual (p. ej. reconectar la integración).`,
      );
      await this.clearRetry(appointmentId);
      return;
    }
    const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
    const nextAttemptAt = new Date(Date.now() + backoff);
    await this.prisma.googleCalendarSyncJob.upsert({
      where: { appointmentId },
      create: { tenantId, appointmentId, attempts, nextAttemptAt, lastError: error },
      update: { attempts, nextAttemptAt, lastError: error },
    });
  }

  private async clearRetry(appointmentId: string): Promise<void> {
    await this.prisma.googleCalendarSyncJob.deleteMany({ where: { appointmentId } });
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
    ctx: SyncContext,
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
    ctx: SyncContext,
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

  private async deleteEvent(ctx: SyncContext, eventId: string): Promise<void> {
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
