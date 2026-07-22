import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import { InviteUserDto } from './dto/invite-user.dto';
import { TeamMember, UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Equipo del tenant. Cualquier miembro autenticado puede ver a sus compañeros. */
  @Get()
  list(@CurrentUser() user: AuthContext): Promise<TeamMember[]> {
    return this.users.list(user.tenantId);
  }

  /** Invitar a un miembro del equipo. Solo el propietario (OWNER). */
  @Post()
  @Roles(UserRole.OWNER)
  @HttpCode(201)
  invite(
    @CurrentUser() user: AuthContext,
    @Body() dto: InviteUserDto,
  ): Promise<TeamMember> {
    return this.users.invite(user.tenantId, dto);
  }
}
