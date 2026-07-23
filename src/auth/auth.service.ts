import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { isUniqueConstraintViolation } from '../common/prisma-error.util';
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
   * El email se exige único a nivel global (para que el login por email no
   * sea ambiguo) con una restricción `@unique` en la base de datos —
   * `findFirst` de abajo solo da un mensaje de error más rápido/claro en el
   * caso común; la restricción de la BD es la que de verdad cierra la
   * condición de carrera entre dos altas concurrentes con el mismo email
   * (ver DECISIONS.md).
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await hashPassword(dto.password);
    try {
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
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException('El email ya está registrado');
      }
      throw err;
    }
  }

  /** Inicio de sesión con email + contraseña. */
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    // Ejecuta scrypt SIEMPRE (contra el hash real o el señuelo) para no filtrar
    // por temporización cuál email está registrado. Una cuenta creada con
    // "Continuar con Google" tiene `passwordHash` nulo — nunca puede autenticar
    // por contraseña, así que se compara igual contra el señuelo.
    const passwordOk = await verifyPassword(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.issueToken(user);
  }

  /**
   * Cambia (o establece por primera vez) la contraseña del usuario
   * autenticado. Si la cuenta no tiene contraseña aún (se creó con
   * "Continuar con Google"), no hay nada que verificar y se establece
   * directamente — estar autenticado con un JWT válido ya es la prueba de
   * identidad en ese caso.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    if (user.passwordHash && !(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }

  /** Público: lo usa también `GoogleAuthService` tras autenticar/crear la cuenta con Google. */
  async issueToken(user: User): Promise<AuthResult> {
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
