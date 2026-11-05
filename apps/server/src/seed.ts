import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { hashPassword, randomPassword } from './auth.js';
import { config } from './config.js';
import { getSettings, setSetting, type Db } from './db.js';

export interface SeedResult {
  createdAdmin: boolean;
  credentialsPath: string | null;
}

/**
 * Deja la base lista para usar: ajustes por defecto y, si no hay usuarios,
 * un administrador inicial. Si no se definió ADMIN_PASSWORD se genera una
 * contraseña aleatoria y se guarda en data/ADMIN-CREDENTIALS.txt.
 */
export function ensureSeed(db: Db): SeedResult {
  const settings = getSettings(db);
  for (const [key, value] of Object.entries({
    retentionDays: settings.retentionDays,
    registrationEnabled: settings.registrationEnabled,
    maxGroupSize: settings.maxGroupSize,
    appName: settings.appName,
  })) {
    if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key) === undefined) {
      setSetting(db, key, String(value));
    }
  }

  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (count.n > 0) return { createdAdmin: false, credentialsPath: null };

  const password = config.adminPassword || randomPassword();
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, avatar, status, status_message, role, created_at)
     VALUES (?, ?, ?, ?, ?, 'offline', '', 'admin', ?)`,
  ).run(randomUUID(), config.adminUser, 'Administración', hashPassword(password), '🌟', now);

  let credentialsPath: string | null = null;
  if (!config.adminPassword) {
    credentialsPath = path.join(config.dataDir, 'ADMIN-CREDENTIALS.txt');
    writeFileSync(
      credentialsPath,
      `Messenger El Nacio — administrador inicial\n\nUsuario: ${config.adminUser}\nContraseña: ${password}\n\nCambiá la contraseña desde el panel apenas entres.\n`,
      { mode: 0o600 },
    );
  }

  return { createdAdmin: true, credentialsPath };
}
