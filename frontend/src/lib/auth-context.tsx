import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from './api';
import type { AuthResult, AuthUser } from './types';

const USER_KEY = 'wf_me';

interface RegisterInput {
  tenantName: string;
  name: string;
  email: string;
  password: string;
}
interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** Usado tras "Continuar con Google": ya llega un AuthResult completo, sin llamar a /auth/login. */
  loginWithResult: (result: AuthResult) => void;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  });

  function persist(result: AuthResult): void {
    setToken(result.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
  }

  function logout(): void {
    clearToken();
    localStorage.removeItem(USER_KEY);
    // Lo guardado por sesión (hoy, la conversación del chat de prueba) se va con
    // el usuario: en un equipo compartido, el siguiente en entrar no tiene por
    // qué encontrarse lo que probó el anterior.
    try {
      sessionStorage.clear();
    } catch {
      // Almacenamiento bloqueado: no vale impedir el cierre de sesión por esto.
    }
    setUser(null);
  }

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user && !!getToken(),
      // `skipAuthRedirect` estaba previsto en `api()` para esto exactamente, pero
      // no se pasaba nunca: si quedaba un token viejo en el navegador, fallar el
      // inicio de sesión disparaba el manejador global de 401 y el usuario leía
      // "tu sesión expiró" en vez del motivo real del rechazo.
      login: async (input) =>
        persist(await api<AuthResult>('/auth/login', { method: 'POST', body: input, skipAuthRedirect: true })),
      register: async (input) => persist(await api<AuthResult>('/auth/register', { method: 'POST', body: input })),
      loginWithResult: persist,
      logout,
      changePassword: async (currentPassword, newPassword) => {
        await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// El hook vive junto a su proveedor a proposito: separarlos obligaria a
// importar de dos sitios para usar un unico contexto. Solo cuesta que Fast
// Refresh recargue el modulo entero al editarlo, en desarrollo.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
