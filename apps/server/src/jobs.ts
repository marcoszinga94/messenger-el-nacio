import type { FastifyInstance } from 'fastify';
import { getSettingNumber, type Db } from './db.js';

const HOURS_6 = 6 * 60 * 60 * 1000;

function cleanup(db: Db): { messages: number; tokens: number; audit: number } {
  const now = Date.now();
  const retentionDays = getSettingNumber(db, 'retentionDays', 30);
  const cutoff = now - retentionDays * 86_400_000;

  const messages = db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff);
  const tokens = db
    .prepare('DELETE FROM refresh_tokens WHERE (expires_at < ? OR revoked = 1) AND created_at < ?')
    .run(now, now - 7 * 86_400_000);
  const audit = db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(now - 365 * 86_400_000);

  return {
    messages: Number(messages.changes),
    tokens: Number(tokens.changes),
    audit: Number(audit.changes),
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
