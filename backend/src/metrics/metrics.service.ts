import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  ConversationHandler,
  ConversationStatus,
  MessageDirection,
  MessageSender,
  ReminderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Un punto de la serie de actividad diaria. */
export interface ActivityPoint {
  date: string; // YYYY-MM-DD
  inbound: number;
  outbound: number;
}

/** Resumen de métricas de un tenant para el panel. */
export interface MetricsOverview {
  conversations: { total: number; open: number; closed: number; handledByAi: number; handledByHuman: number };
  messages: { total: number; inbound: number; outbound: number; fromContact: number; fromAi: number; fromHuman: number };
  contacts: { total: number };
  appointments: { total: number; scheduled: number; confirmed: number; cancelled: number; completed: number };
  reminders: { total: number; pending: number; sent: number; cancelled: number };
  /** Proporción de respuestas resueltas por la IA sobre el total de respuestas salientes (0-1). */
  automationRate: number;
  /** Actividad de mensajes de los últimos 7 días. */
  activity: ActivityPoint[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_DAYS = 7; // rango por defecto si no se pide uno
const MAX_ACTIVITY_DAYS = 92; // tope de la serie diaria (evita series enormes)

/**
 * Agregaciones para el panel de métricas. TODAS las consultas se filtran por
 * `tenantId` (del token): un tenant solo ve sus propios números. Se usan
 * `groupBy`/`count` (una pasada por tabla) para que escale con el volumen.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(
    tenantId: string,
    range: { from?: Date; to?: Date } = {},
  ): Promise<MetricsOverview> {
    const until = range.to ?? new Date();
    const since = new Date(range.from ?? new Date(until.getTime() - (ACTIVITY_DAYS - 1) * DAY_MS));
    since.setUTCHours(0, 0, 0, 0); // límites de día en UTC (coherente con date_trunc y toISOString)
    // Todas las métricas se calculan en el período seleccionado (createdAt).
    const where = { tenantId, createdAt: { gte: since, lte: until } };
    const dayCount = Math.min(
      MAX_ACTIVITY_DAYS,
      Math.floor((this.startOfDay(until).getTime() - since.getTime()) / DAY_MS) + 1,
    );

    const [
      convByStatus,
      convByHandler,
      msgByDirection,
      msgBySender,
      contacts,
      apptByStatus,
      remByStatus,
      activityRows,
    ] = await Promise.all([
      this.prisma.conversation.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.conversation.groupBy({ by: ['handledBy'], where, _count: { _all: true } }),
      this.prisma.message.groupBy({ by: ['direction'], where, _count: { _all: true } }),
      this.prisma.message.groupBy({ by: ['sender'], where, _count: { _all: true } }),
      this.prisma.contact.count({ where }),
      this.prisma.appointment.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.reminder.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.dailyActivity(tenantId, since, until),
    ]);

    const convStatus = this.tally(convByStatus, 'status');
    const convHandler = this.tally(convByHandler, 'handledBy');
    const msgDir = this.tally(msgByDirection, 'direction');
    const msgSender = this.tally(msgBySender, 'sender');
    const appt = this.tally(apptByStatus, 'status');
    const rem = this.tally(remByStatus, 'status');

    const fromAi = msgSender[MessageSender.AI] ?? 0;
    const fromHuman = msgSender[MessageSender.HUMAN] ?? 0;
    const outboundReplies = fromAi + fromHuman;

    return {
      conversations: {
        total: this.sum(convStatus),
        open: convStatus[ConversationStatus.OPEN] ?? 0,
        closed: convStatus[ConversationStatus.CLOSED] ?? 0,
        handledByAi: convHandler[ConversationHandler.AI] ?? 0,
        handledByHuman: convHandler[ConversationHandler.HUMAN] ?? 0,
      },
      messages: {
        total: this.sum(msgDir),
        inbound: msgDir[MessageDirection.INBOUND] ?? 0,
        outbound: msgDir[MessageDirection.OUTBOUND] ?? 0,
        fromContact: msgSender[MessageSender.CONTACT] ?? 0,
        fromAi,
        fromHuman,
      },
      contacts: { total: contacts },
      appointments: {
        total: this.sum(appt),
        scheduled: appt[AppointmentStatus.SCHEDULED] ?? 0,
        confirmed: appt[AppointmentStatus.CONFIRMED] ?? 0,
        cancelled: appt[AppointmentStatus.CANCELLED] ?? 0,
        completed: appt[AppointmentStatus.COMPLETED] ?? 0,
      },
      reminders: {
        total: this.sum(rem),
        pending: rem[ReminderStatus.PENDING] ?? 0,
        sent: rem[ReminderStatus.SENT] ?? 0,
        cancelled: rem[ReminderStatus.CANCELLED] ?? 0,
      },
      automationRate: outboundReplies === 0 ? 0 : fromAi / outboundReplies,
      activity: this.fillDays(activityRows, since, dayCount),
    };
  }

  /** Actividad diaria (entrantes/salientes) vía SQL agregado y parametrizado por tenant. */
  private async dailyActivity(
    tenantId: string,
    since: Date,
    until: Date,
  ): Promise<{ day: Date; inbound: number; outbound: number }[]> {
    return this.prisma.$queryRaw<{ day: Date; inbound: number; outbound: number }[]>`
      SELECT date_trunc('day', created_at) AS day,
             count(*) FILTER (WHERE direction = 'INBOUND')::int  AS inbound,
             count(*) FILTER (WHERE direction = 'OUTBOUND')::int AS outbound
      FROM messages
      WHERE tenant_id = ${tenantId} AND created_at >= ${since} AND created_at <= ${until}
      GROUP BY 1
      ORDER BY 1`;
  }

  /** Rellena los días sin actividad con ceros para una serie continua de `dayCount` días. */
  private fillDays(
    rows: { day: Date; inbound: number; outbound: number }[],
    since: Date,
    dayCount: number,
  ): ActivityPoint[] {
    const byDay = new Map<string, { inbound: number; outbound: number }>();
    for (const r of rows) {
      byDay.set(this.isoDay(new Date(r.day)), { inbound: Number(r.inbound), outbound: Number(r.outbound) });
    }
    const out: ActivityPoint[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(since.getTime() + i * DAY_MS);
      const key = this.isoDay(d);
      const v = byDay.get(key) ?? { inbound: 0, outbound: 0 };
      out.push({ date: key, inbound: v.inbound, outbound: v.outbound });
    }
    return out;
  }

  private isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }

  private tally<T extends string>(
    rows: Array<Record<string, unknown> & { _count: { _all: number } }>,
    key: string,
  ): Record<T, number> {
    const acc = {} as Record<T, number>;
    for (const row of rows) {
      acc[row[key] as T] = row._count._all;
    }
    return acc;
  }

  private sum(rec: Record<string, number>): number {
    return Object.values(rec).reduce((a, b) => a + b, 0);
  }
}
