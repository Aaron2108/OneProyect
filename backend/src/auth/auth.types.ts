import { UserRole } from '@prisma/client';

/** Contenido firmado en el JWT. */
export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
  role: UserRole;
  /**
   * Marca de token de sesión. La validan el guard HTTP y el gateway de tiempo
   * real para no confundirlo con los tokens de OAuth (`google-login`,
   * `google-signup`), que se firman con el mismo secreto pero no dan sesión.
   * Opcional en el tipo por los tokens ya emitidos sin ella (ver
   * access-token.util.ts).
   */
  purpose?: 'access';
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

/** Resultado de procesar el callback de "Continuar con Google". */
export type GoogleAuthCallbackResult =
  | { kind: 'authenticated'; result: AuthResult }
  | { kind: 'signup-required'; signupToken: string; email: string; name: string };
