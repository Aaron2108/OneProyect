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
import { Appointment } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('contactId') contactId?: string,
  ): Promise<Appointment[]> {
    return this.appointments.list(user.tenantId, contactId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<Appointment> {
    return this.appointments.get(user.tenantId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateAppointmentDto,
  ): Promise<Appointment> {
    return this.appointments.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    return this.appointments.update(user.tenantId, id, dto);
  }
}
