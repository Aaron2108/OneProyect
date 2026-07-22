import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResult, JwtPayload } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password.util';

/**
 * Hash señuelo (formato válido `salt:hash`) para verificar contra él cuando el
 * email no existe: así el login siempre ejecuta scrypt y no revela por
 * temporización qué emails están registrados.
 */
const DUMMY_HASH =
  'be64cd065b4515f0b97e6bca060295a1:43af604d15d3183b9f7250bd583a2d8fb1acc6eab2cf34d19f461449b023a8fa038458a4a36d9902346a25935d6b75ae4260457cc69726a11181db984b3f1c2d';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Alta de una empresa (tenant) con su usuario propietario (OWNER).
   * El email se exige único a nivel global en el MVP para que el login por
   * email no sea ambiguo (el esquema lo restringe por tenant; esta comprobación
   * es más estricta a propósito). Ver DECISIONS.md.
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await hashPassword(dto.password);
    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.tenantName,
        users: {
          create: {
            email: dto.email,
            name: dto.name,
            passwordHash,
            role: UserRole.OWNER,
          },
        },
      },
      include: { users: true },
    });

    return this.issueToken(tenant.users[0]);
  }

  /** Inicio de sesión con email + contraseña. */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    // Ejecuta scrypt SIEMPRE (contra el hash real o el señuelo) para no filtrar
    // por temporización cuál email está registrado.
    const passwordOk = await verifyPassword(
      dto.password,
      user ? user.passwordHash : DUMMY_HASH,
    );
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.issueToken(user);
  }

  /** Cambia la contraseña del usuario autenticado, verificando la actual. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }

  private async issueToken(user: User): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }
}
