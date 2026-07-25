import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthContext } from './auth.types';

export const ROLES_KEY = 'roles';

/** Restringe un endpoint a ciertos roles: `@Roles(UserRole.OWNER)`. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Comprueba el rol del usuario autenticado contra los roles exigidos por
 * `@Roles(...)`. Debe usarse DESPUÉS de `JwtAuthGuard` (necesita `request.user`).
 * Sin `@Roles`, no restringe.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: AuthContext }>();
    return !!request.user && required.includes(request.user.role);
  }
}
