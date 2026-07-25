import { BadRequestException } from '@nestjs/common';

/**
 * Primitivas de bajo nivel para hablar con OAuth2/OpenID Connect de Google —
 * compartidas por `auth/google-auth.service.ts` (iniciar sesión con Google) y
 * `google-calendar/google-calendar-oauth.service.ts` (conectar el calendario
 * del negocio). Son dos flujos independientes con distinto alcance de scopes
 * y ciclo de vida de tokens, pero ambos hacen el mismo intercambio código→token
 * y la misma consulta de perfil — de ahí la extracción.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/** Perfil devuelto por el endpoint `userinfo` de OpenID Connect. */
export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: params.scope,
    state: params.state,
  });
  return `${AUTH_URL}?${query.toString()}`;
}

export async function exchangeGoogleAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new BadRequestException(`Google rechazó el código de autorización: ${errText.slice(0, 300)}`);
  }
  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Google rechazó el refresh token: ${errText.slice(0, 300)}`);
  }
  return (await response.json()) as GoogleTokenResponse;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new BadRequestException('No se pudo obtener el perfil de Google');
  }
  return (await response.json()) as GoogleProfile;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
}
