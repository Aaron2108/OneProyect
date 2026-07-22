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
    setUser(null);
  }

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user && !!getToken(),
      login: async (input) => persist(await api<AuthResult>('/auth/login', { method: 'POST', body: input })),
      register: async (input) => persist(await api<AuthResult>('/auth/register', { method: 'POST', body: input })),
      logout,
      changePassword: async (currentPassword, newPassword) => {
        await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
