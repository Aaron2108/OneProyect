import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthContext } from './auth.types';

/**
 * Inyecta el contexto de autenticación (usuario + tenant) que el `JwtAuthGuard`
 * adjuntó a la request. Úsalo en los controladores protegidos:
 * `metodo(@CurrentUser() user: AuthContext)`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthContext }>();
    return request.user;
  },
);
