import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@nacio/shared';
import { REFRESH_TOKEN_TTL_MS } from '@nacio/shared';
import { config } from './config.js';
import type { Db } from './db.js';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  if (!n || !r || !p || !saltB64 || !keyB64) return false;
  try {
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(keyB64, 'base64url');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(config.jwtSecret);
}

export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      username: String(payload.username ?? ''),
      role: payload.role === 'admin' ? 'admin' : 'student',
    };
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken(db: Db, userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), userId, hashToken(token), now, now + REFRESH_TOKEN_TTL_MS);
  return token;
}

/** Valida y consume el refresh token (rotación). Devuelve el usuario o null. */
export function consumeRefreshToken(db: Db, token: string): string | null {
  const row = db
    .prepare('SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = ? AND revoked = 0')
    .get(hashToken(token)) as { id: string; user_id: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(row.id);
  return row.user_id;
}

export function revokeRefreshToken(db: Db, token: string): void {
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(hashToken(token));
}

export function revokeAllRefreshTokens(db: Db, userId: string): void {
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
}

export function randomPassword(): string {
  return randomBytes(9).toString('base64url');
}
