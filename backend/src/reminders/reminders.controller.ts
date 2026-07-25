import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Reminder } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.decorator';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('contactId') contactId?: string,
  ): Promise<Reminder[]> {
    return this.reminders.list(user.tenantId, contactId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<Reminder> {
    return this.reminders.get(user.tenantId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateReminderDto,
  ): Promise<Reminder> {
    return this.reminders.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ): Promise<Reminder> {
    return this.reminders.update(user.tenantId, id, dto);
  }
}
