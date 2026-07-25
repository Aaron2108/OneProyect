/**
 * Cliente HTTP mínimo hacia el backend NestJS. Añade el Bearer token si hay
 * sesión, y normaliza los errores del backend (`{ message }`) a `Error`.
 */

const TOKEN_KEY = 'wf_token';

/** Backend en otro origen (repos separados): normaliza `path` a `VITE_API_URL + path` si está definida. */
function resolveUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL;
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Si es true, no dispara el manejador global de 401 (usado por /auth/login). */
  skipAuthRedirect?: boolean;
}

let onUnauthorized: (() => void) | null = null;
/** Registrado por AuthProvider: qué hacer cuando el backend responde 401. */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, skipAuthRedirect, headers, ...rest } = opts;
  const token = getToken();
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(resolveUrl(path), {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && token && !skipAuthRedirect) {
    onUnauthorized?.();
    throw new ApiError('Tu sesión expiró. Entra de nuevo.', 401);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && (data as { message?: string }).message) || `Error ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/**
 * Sube un archivo con `multipart/form-data`.
 *
 * No reusa `api()` porque ahí se fija `Content-Type: application/json`: en una
 * subida el navegador tiene que poner él mismo el `Content-Type` con su
 * `boundary`, y si se lo pisamos el backend no puede parsear el cuerpo.
 */
export async function uploadFile<T = unknown>(path: string, file: File): Promise<T> {
  const token = getToken();
  const body = new FormData();
  body.append('file', file);

  const res = await fetch(resolveUrl(path), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = (data as { message?: string | string[] } | null)?.message;
    const message = Array.isArray(raw) ? raw.join('. ') : raw || `Error ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** Descarga un archivo (CSV) autenticado — un <a href> normal no llevaría el token. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(resolveUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError('No se pudo exportar', res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
