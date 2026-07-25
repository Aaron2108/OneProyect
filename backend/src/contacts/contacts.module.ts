import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AuthModule], // aporta JwtAuthGuard / JwtService para proteger los endpoints
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
