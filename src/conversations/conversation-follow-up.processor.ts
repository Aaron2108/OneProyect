import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConversationFollowUpService } from './conversation-follow-up.service';
import { FOLLOW_UP_QUEUE, SCAN_FOLLOW_UPS_JOB, SCAN_INTERVAL_MS } from './follow-up.constants';

/**
 * Worker periódico del seguimiento automático (Fase 4). Mismo patrón que
 * `reminders/reminder.processor.ts` y `google-calendar/google-calendar-sync.processor.ts`:
 * job repetible en BullMQ, cada tick delega el trabajo real en el servicio.
 */
@Processor(FOLLOW_UP_QUEUE)
export class ConversationFollowUpProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ConversationFollowUpProcessor.name);

  constructor(
    @InjectQueue(FOLLOW_UP_QUEUE) private readonly queue: Queue,
    private readonly followUp: ConversationFollowUpService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      SCAN_FOLLOW_UPS_JOB,
      {},
      {
        repeat: { every: SCAN_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Seguimiento automático de conversaciones activo (cada ${SCAN_INTERVAL_MS / 60000} min)`);
  }

  async process(): Promise<void> {
    await this.followUp.scanAndSchedule(new Date());
  }
}
