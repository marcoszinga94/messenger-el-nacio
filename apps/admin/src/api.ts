import type { AuthResponse, Me } from '@nacio/shared';

const BASE = import.meta.env.VITE_API_URL ?? '';
const STORAGE_KEY = 'nacio-admin-session';

export interface Session {
  user: Me;
  accessToken: string;
  refreshToken: string;
}

function readStored(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let session: Session | null = readStored();

export function getSession(): Session | null {
  return session;
}

export function setSession(next: Session | null): void {
  session = next;
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
}

export async function login(username: string, password: string): Promise<Session> {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<AuthResponse> & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'No se pudo iniciar sesión.');
  if (data.user?.role !== 'admin') throw new Error('Esta cuenta no tiene permisos de administrador.');
  const next = data as unknown as Session;
  setSession(next);
  return next;
}

async function refresh(): Promise<boolean> {
  if (!session?.refreshToken) return false;
  const response = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!response.ok) {
    setSession(null);
    return false;
  }
  const data = (await response.json()) as AuthResponse;
  setSession(data as unknown as Session);
  return true;
}

export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.accessToken}`;

  const response = await fetch(`${BASE}${path}`, { ...init, headers });

  if (response.status === 401 && retry && (await refresh())) {
    return request<T>(path, init, false);
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
    throw new Error(message);
  }
  return data as T;
}

export async function logout(): Promise<void> {
  try {
    await request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session?.refreshToken ?? '' }),
    });
  } catch {
    // Si falla igual cerramos la sesión local.
  }
  setSession(null);
}
