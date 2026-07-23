import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import {
  GOOGLE_CALENDAR_SYNC_QUEUE,
  RETRY_DUE_JOB,
  RETRY_INTERVAL_MS,
} from './google-calendar.constants';

/**
 * Worker periódico que reintenta las sincronizaciones con Google Calendar que
 * fallaron (ver `GoogleCalendarSyncService.retryDue`). Mismo patrón que
 * `reminders/reminder.processor.ts`: job repetible en BullMQ, cada tick delega
 * el trabajo real en el servicio.
 */
@Processor(GOOGLE_CALENDAR_SYNC_QUEUE)
export class GoogleCalendarSyncProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(GoogleCalendarSyncProcessor.name);

  constructor(
    @InjectQueue(GOOGLE_CALENDAR_SYNC_QUEUE) private readonly queue: Queue,
    private readonly sync: GoogleCalendarSyncService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      RETRY_DUE_JOB,
      {},
      {
        repeat: { every: RETRY_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Reintento de sincronización con Google Calendar activo (cada ${RETRY_INTERVAL_MS / 1000}s)`,
    );
  }

  async process(): Promise<void> {
    await this.sync.retryDue(new Date());
  }
}
