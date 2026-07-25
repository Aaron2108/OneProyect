import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ReminderDispatchService } from './reminder-dispatch.service';
import {
  DISPATCH_DUE_JOB,
  DISPATCH_INTERVAL_MS,
  REMINDERS_QUEUE,
} from './reminders.constants';

/**
 * Worker periódico que revisa recordatorios vencidos. Al arrancar registra un
 * job repetible en la cola (cada `DISPATCH_INTERVAL_MS`); cada ejecución delega
 * el trabajo real en `ReminderDispatchService`.
 */
@Processor(REMINDERS_QUEUE)
export class ReminderProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    @InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue,
    private readonly dispatch: ReminderDispatchService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Job repetible; BullMQ evita duplicarlo entre reinicios (mismo nombre + repeat).
    await this.queue.add(
      DISPATCH_DUE_JOB,
      {},
      {
        repeat: { every: DISPATCH_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Despacho de recordatorios activo (cada ${DISPATCH_INTERVAL_MS / 1000}s)`,
    );
  }

  async process(): Promise<void> {
    await this.dispatch.dispatchDue(new Date());
  }
}
