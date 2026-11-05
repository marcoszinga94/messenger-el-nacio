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

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const data = await api<VersionResponse>('/api/version');
  return data.release;
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
