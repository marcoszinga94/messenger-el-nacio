import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { getSettingNumber, type Db } from './db.js';

const HOURS_6 = 6 * 60 * 60 * 1000;

function cleanup(db: Db): { messages: number; tokens: number; audit: number; files: number } {
  const now = Date.now();
  const retentionDays = getSettingNumber(db, 'retentionDays', 30);
  const cutoff = now - retentionDays * 86_400_000;

  const messages = db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff);

  const orphans = db
    .prepare(
      `DELETE FROM files
       WHERE created_at < ?
         AND id NOT IN (SELECT file_id FROM messages WHERE file_id IS NOT NULL)
       RETURNING id`,
    )
    .all(cutoff) as { id: string }[];
  for (const file of orphans) {
    const target = path.join(config.uploadsDir, file.id);
    if (existsSync(target)) {
      try {
        unlinkSync(target);
      } catch {
        // Si no se puede borrar, el archivo queda huérfano pero no rompe la limpieza.
      }
    }
  }

  const tokens = db
    .prepare('DELETE FROM refresh_tokens WHERE (expires_at < ? OR revoked = 1) AND created_at < ?')
    .run(now, now - 7 * 86_400_000);
  const audit = db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(now - 365 * 86_400_000);

  return {
    messages: Number(messages.changes),
    tokens: Number(tokens.changes),
    audit: Number(audit.changes),
    files: orphans.length,
  };
}

export function startJobs(app: FastifyInstance): void {
  const run = () => {
    try {
      const result = cleanup(app.db);
      if (result.messages || result.tokens || result.audit) {
        app.log.info(result, 'Limpieza automática completada');
      }
    } catch (error) {
      app.log.error(error, 'Falló la limpieza automática');
    }
  };

  run();
  const timer = setInterval(run, HOURS_6);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
