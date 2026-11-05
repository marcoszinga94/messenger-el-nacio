import type { AuthResponse } from '@nacio/shared';
import { getServer, loadSession, refreshTokens, saveSession, type StoredSession } from './session';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = loadSession();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${getServer()}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.', 0);
  }

  if (response.status === 401 && retry && session?.refreshToken) {
    if (await refreshTokens()) return api<T>(path, init, false);
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Error ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

function storeAuth(data: AuthResponse): StoredSession {
  const session: StoredSession = {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
  saveSession(session);
  return session;
}

export async function requestLogin(username: string, password: string): Promise<StoredSession> {
  const response = await fetch(`${getServer()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await response.json().catch(() => ({}))) as AuthResponse & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? 'No se pudo iniciar sesión.', response.status);
  return storeAuth(data);
}

export async function requestRegister(input: {
  code: string;
  username: string;
  displayName: string;
  password: string;
}): Promise<StoredSession> {
  const response = await fetch(`${getServer()}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => ({}))) as AuthResponse & { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? 'No se pudo crear la cuenta.', response.status);
  return storeAuth(data);
}
