import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import { BusinessProfileDto, BusinessProfileService } from './business-profile.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';

@Controller('business-profile')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BusinessProfileController {
  constructor(private readonly businessProfile: BusinessProfileService) {}

  /** Cualquier miembro del equipo puede ver cómo está configurado el agente. */
  @Get()
  get(@CurrentUser() user: AuthContext): Promise<BusinessProfileDto> {
    return this.businessProfile.get(user.tenantId);
  }

  /** Configurar al agente (horarios, servicios, políticas, tono) es solo del propietario. */
  @Put()
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthContext,
    @Body() dto: UpdateBusinessProfileDto,
  ): Promise<BusinessProfileDto> {
    return this.businessProfile.upsert(user.tenantId, dto);
  }
}
