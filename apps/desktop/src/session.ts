import type { AuthResponse, Me } from '@nacio/shared';

export interface StoredSession {
  user: Me;
  accessToken: string;
  refreshToken: string;
}

const AUTH_KEY = 'nacio.session';
const SERVER_KEY = 'nacio.server';

export const DEFAULT_SERVER =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  'https://messenger.200.115.56.96.sslip.io';

export function getServer(): string {
  const value = localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER;
  return value.replace(/\/+$/, '');
}

export function setServer(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  if (clean) localStorage.setItem(SERVER_KEY, clean);
  else localStorage.removeItem(SERVER_KEY);
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession | null): void {
  if (session) localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  else localStorage.removeItem(AUTH_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_KEY);
}

export async function refreshTokens(): Promise<boolean> {
  const session = loadSession();
  if (!session?.refreshToken) return false;
  try {
    const response = await fetch(`${getServer()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!response.ok) {
      saveSession(null);
      return false;
    }
    const data = (await response.json()) as AuthResponse;
    saveSession({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
    return true;
  } catch {
    return false;
  }
}
