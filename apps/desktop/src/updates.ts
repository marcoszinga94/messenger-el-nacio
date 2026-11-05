import { version } from '../package.json';
import { api } from './api';

export interface ReleaseInfo {
  latest: string;
  name: string;
  url: string;
  publishedAt: string | null;
  notes: string;
  checkedAt: number;
}

export interface VersionResponse {
  release: ReleaseInfo | null;
  releasesUrl: string;
}

export const CURRENT_VERSION = version;
const DISMISS_KEY = 'nacio.dismissed-update';
const CACHE_KEY = 'nacio.update-cache';
const CACHE_TTL = 6 * 60 * 60 * 1000;
const UPDATE_REPO =
  (import.meta.env.VITE_UPDATE_REPO as string | undefined) ?? 'marcoszinga94/messenger-el-nacio';

function numericParts(value: string): number[] {
  return value
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

/** Devuelve 1 si `a` es mayor que `b`, -1 si es menor y 0 si son iguales. */
export function compareVersions(a: string, b: string): number {
  const left = numericParts(a);
  const right = numericParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const one = left[index] ?? 0;
    const other = right[index] ?? 0;
    if (one !== other) return one > other ? 1 : -1;
  }
  return 0;
}

export function isNewer(latest: string, current = CURRENT_VERSION): boolean {
  return compareVersions(latest, current) > 0;
}

export function dismissedVersion(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? '';
  } catch {
    return '';
  }
}

export function dismissVersion(latest: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, latest);
  } catch {
    // Si no hay almacenamiento, se vuelve a mostrar la próxima vez.
  }
}

export function clearDismissedVersion(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

function readCache(): ReleaseInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReleaseInfo;
    return typeof parsed.latest === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(release: ReleaseInfo): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(release));
  } catch {
    // Sin almacenamiento se consulta de nuevo la próxima vez.
  }
}

async function fetchFromGitHub(): Promise<ReleaseInfo | null> {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
  const data = (await response.json()) as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    published_at?: string;
    body?: string;
  };
  const latest = (data.tag_name ?? '').replace(/^v/i, '').trim();
  if (!/^\d+(\.\d+){0,3}$/.test(latest)) return null;
  return {
    latest,
    name: data.name ?? `Versión ${latest}`,
    url: data.html_url ?? `https://github.com/${UPDATE_REPO}/releases/latest`,
    publishedAt: data.published_at ?? null,
    notes: (data.body ?? '').slice(0, 4000),
    checkedAt: Date.now(),
  };
}

/**
 * Primero pregunta al servidor (que cachea la API de GitHub). Si el servidor es
 * viejo o no tiene el endpoint, consulta GitHub directamente; así el aviso
 * también funciona en instalaciones que todavía no actualizaron el servidor.
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  let serverRelease: ReleaseInfo | null = null;
  try {
    const data = await api<VersionResponse>('/api/version');
    serverRelease = data.release;
    if (serverRelease) {
      writeCache(serverRelease);
      return serverRelease;
    }
  } catch {
    // Servidor anterior a esta función o sin conexión: probamos GitHub directo.
  }

  const cached = readCache();
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) return cached;

  try {
    const release = await fetchFromGitHub();
    if (release) {
      writeCache(release);
      return release;
    }
  } catch {
    // Sin internet o límite de la API: usamos la última copia si existe.
  }

  return cached;
}

export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
