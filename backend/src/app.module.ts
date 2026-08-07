import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ContactsModule } from './contacts/contacts.module';
import { ConversationsModule } from './conversations/conversations.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { RemindersModule } from './reminders/reminders.module';
import { MetricsModule } from './metrics/metrics.module';
import { QuickRepliesModule } from './quick-replies/quick-replies.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { BusinessProfileModule } from './business-profile/business-profile.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AiContextModule } from './ai-context/ai-context.module';
import { ProductsModule } from './products/products.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    // Rate limiting global (red de seguridad por IP). El webhook de WhatsApp se
    // exceptúa con @SkipThrottle (Meta envía ráfagas); auth usa un límite más
    // estricto con @Throttle. Ver SECURITY.md.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    CommonModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ContactsModule,
    ConversationsModule,
    AppointmentsModule,
    RemindersModule,
    MetricsModule,
    QuickRepliesModule,
    WhatsappModule,
    GoogleCalendarModule,
    BusinessProfileModule,
    KnowledgeModule,
    AiContextModule,
    ProductsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
