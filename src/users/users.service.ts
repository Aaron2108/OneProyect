import { ConflictException, Injectable } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/password.util';
import { InviteUserDto } from './dto/invite-user.dto';

/** Miembro del equipo expuesto a la API (nunca incluye el hash de contraseña). */
export type TeamMember = Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt'>;

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

/**
 * Gestión del equipo de un tenant. Todo se filtra por `tenantId` (del token):
 * un tenant solo ve y crea usuarios dentro de su propia empresa.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string): Promise<TeamMember[]> {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Da de alta a un miembro del equipo en el tenant actual. El email se exige
   * único a nivel global (coherente con el registro, para que el login por email
   * no sea ambiguo). El nuevo usuario hereda el `tenantId` del contexto, nunca
   * del cliente.
   */
  async invite(tenantId: string, dto: InviteUserDto): Promise<TeamMember> {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }
    const passwordHash = await hashPassword(dto.password);
    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role ?? UserRole.AGENT,
      },
      select: PUBLIC_FIELDS,
    });
  }
}
