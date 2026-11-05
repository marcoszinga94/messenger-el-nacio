import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

try {
  process.loadEnvFile?.('.env');
} catch {
  // No hay .env, usamos variables de entorno o valores por defecto.
}

const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
mkdirSync(dataDir, { recursive: true });

const secretPath = path.join(dataDir, 'jwt-secret');
if (!existsSync(secretPath)) {
  writeFileSync(secretPath, randomBytes(32).toString('hex'), { mode: 0o600 });
}

const defaultOrigins = [
  'http://localhost:1420',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
];

const extraOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const config = {
  appName: 'Messenger El Nacio',
  env: process.env.NODE_ENV ?? 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  publicUrl: process.env.PUBLIC_URL ?? '',
  releasesUrl: process.env.RELEASES_URL ?? 'https://github.com/marcoszinga94/messenger-el-nacio/releases/latest',
  corsOrigins: [...new Set([...defaultOrigins, ...extraOrigins])],
  jwtSecret: Buffer.from(readFileSync(secretPath, 'utf8').trim(), 'hex'),
  adminUser: process.env.ADMIN_USER ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  retentionDays: Number(process.env.RETENTION_DAYS ?? 30),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
