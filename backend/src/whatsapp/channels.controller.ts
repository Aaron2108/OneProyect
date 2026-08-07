import { Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import { ChannelStatusDto } from './dto/channel-status.dto';
import { WhatsappInstanceService } from './whatsapp-instance.service';

/**
 * La sección "Canales" del panel.
 *
 * Se llama `channels` y no `whatsapp` a propósito: es el sitio donde vivirán
 * Instagram, Messenger y Telegram, y estrenar la ruta con el nombre definitivo
 * evita tener que romperla —y romper enlaces guardados— al añadir el segundo.
 *
 * Conectar o desconectar el WhatsApp del negocio afecta a todo el equipo, así
 * que queda reservado al propietario; ver el estado lo puede hacer cualquiera,
 * porque un agente necesita entender por qué no le entran mensajes.
 */
@Controller('channels/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChannelsController {
  constructor(private readonly instancias: WhatsappInstanceService) {}

  @Get()
  estado(@CurrentUser() user: AuthContext): Promise<ChannelStatusDto> {
    return this.instancias.obtenerEstado(user.tenantId);
  }

  @Post('connect')
  @Roles(UserRole.OWNER)
  conectar(@CurrentUser() user: AuthContext): Promise<ChannelStatusDto> {
    return this.instancias.conectar(user.tenantId);
  }

  @Post('reconnect')
  @Roles(UserRole.OWNER)
  reconectar(@CurrentUser() user: AuthContext): Promise<ChannelStatusDto> {
    return this.instancias.reconectar(user.tenantId);
  }

  @Delete()
  @Roles(UserRole.OWNER)
  desconectar(@CurrentUser() user: AuthContext): Promise<ChannelStatusDto> {
    return this.instancias.desconectar(user.tenantId);
  }
}
