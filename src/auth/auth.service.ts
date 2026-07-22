import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResult, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password.util';

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
    // Verifica siempre (aunque no exista el usuario) para no filtrar por timing
    // cuál email está registrado.
    const ok =
      user !== null && (await verifyPassword(dto.password, user.passwordHash));
    if (!user || !ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.issueToken(user);
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
