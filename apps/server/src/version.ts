import { config } from './config.js';

export interface ReleaseInfo {
  latest: string;
  name: string;
  url: string;
  publishedAt: string | null;
  notes: string;
  checkedAt: number;
}

const CACHE_MS = 30 * 60 * 1000;
let cache: { at: number; data: ReleaseInfo | null } = { at: 0, data: null };

/**
 * Consulta la última release publicada. Se cachea media hora para no agotar el
 * límite de la API de GitHub. Si falla, devuelve la última copia conocida.
 */
export async function latestRelease(force = false): Promise<ReleaseInfo | null> {
  if (!force && Date.now() - cache.at < CACHE_MS) return cache.data;

  try {
    const response = await fetch(`${config.updateApiBase}/repos/${config.updateRepo}/releases/latest`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'messenger-el-nacio-server',
      },
      signal: AbortSignal.timeout(6000),
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
    if (!/^\d+(\.\d+){0,3}$/.test(latest)) throw new Error('La versión publicada no es válida.');

    cache = {
      at: Date.now(),
      data: {
        latest,
        name: data.name ?? `Versión ${latest}`,
        url: data.html_url ?? config.releasesUrl,
        publishedAt: data.published_at ?? null,
        notes: (data.body ?? '').slice(0, 4000),
        checkedAt: Date.now(),
      },
    };
  } catch {
    // Mantenemos la copia anterior si existía y evitamos reintentar en cada request.
    cache = { at: Date.now(), data: cache.data };
  }

  return cache.data;
}
