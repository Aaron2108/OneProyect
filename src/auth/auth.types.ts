import { UserRole } from '@prisma/client';

/** Contenido firmado en el JWT. */
export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
  role: UserRole;
}

/**
 * Contexto de autenticación que el guard adjunta a `request.user` y que los
 * controladores reciben vía `@CurrentUser()`. El `tenantId` viene SIEMPRE del
 * token (de confianza), nunca del cliente — así ningún endpoint puede operar
 * sobre datos de otro tenant.
 */
export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}

/** Respuesta de register/login. */
export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    tenantId: string;
  };
}
