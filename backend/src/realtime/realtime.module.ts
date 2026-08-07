import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/**
 * Tiempo real del panel. Exporta solo `RealtimeService`: quien emite eventos no
 * necesita —ni debe— tocar el gateway ni socket.io.
 */
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
