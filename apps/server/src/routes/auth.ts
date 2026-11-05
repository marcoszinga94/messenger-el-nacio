import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  AVATARS,
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateMeSchema,
} from '@nacio/shared';
import {
  consumeRefreshToken,
  createRefreshToken,
  hashPassword,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../auth.js';
import { broadcastPresence } from '../chat.js';
import { getSettingBool, getSettings } from '../db.js';
import { fail, parse } from '../http.js';
import { toMe, type UserRow } from '../serialize.js';

interface InviteRow {
  code: string;
  course: string;
  max_uses: number;
  uses: number;
  expires_at: number | null;
  created_by: string | null;
  created_at: number;
  revoked: number;
}

function authPayload(user: UserRow, accessToken: string, refreshToken: string) {
  return { user: toMe(user), accessToken, refreshToken };
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.post('/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parse(registerSchema, request.body, reply);
    if (!body) return;

    if (!getSettingBool(db, 'registrationEnabled', true)) {
      return fail(reply, 403, 'El registro está cerrado por el momento.');
    }

    const now = Date.now();
    const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(body.code.toUpperCase()) as
      | InviteRow
      | undefined;

    if (
      !invite ||
      invite.revoked === 1 ||
      invite.uses >= invite.max_uses ||
      (invite.expires_at !== null && invite.expires_at < now)
    ) {
      return fail(reply, 400, 'El código de invitación no es válido o ya venció.');
    }

    const existing = db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username);
    if (existing) return fail(reply, 409, 'Ese nombre de usuario ya está en uso.');

    const id = randomUUID();
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? '🐱';
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, avatar, status, status_message, role, created_at)
       VALUES (?, ?, ?, ?, ?, 'online', '', 'student', ?)`,
    ).run(id, body.username, body.displayName, hashPassword(body.password), avatar, now);

    db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').run(invite.code);

    if (invite.course) {
      const room = db
        .prepare("SELECT id FROM conversations WHERE is_official = 1 AND course = ? COLLATE NOCASE LIMIT 1")
        .get(invite.course) as { id: string } | undefined;
      if (room) {
        db.prepare(
          "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, 'member', ?, ?)",
        ).run(room.id, id, now, now);
      }
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    const accessToken = await signAccessToken({ id, username: user.username, role: 'student' });
    const refreshToken = createRefreshToken(db, id);
    return reply.code(201).send(authPayload(user, accessToken, refreshToken));
  });

  app.post('/auth/login', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parse(loginSchema, request.body, reply);
    if (!body) return;

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(body.username) as unknown as UserRow | undefined;
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      return fail(reply, 401, 'Usuario o contraseña incorrectos.');
    }
    if (user.banned === 1) return fail(reply, 403, 'Esta cuenta está bloqueada.');

    db.prepare("UPDATE users SET status = 'online' WHERE id = ?").run(user.id);
    const fresh = { ...user, status: 'online' as const };
    const accessToken = await signAccessToken({ id: user.id, username: user.username, role: user.role });
    const refreshToken = createRefreshToken(db, user.id);
    return reply.send(authPayload(fresh, accessToken, refreshToken));
  });

  app.post('/auth/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parse(refreshSchema, request.body, reply);
    if (!body) return;

    const userId = consumeRefreshToken(db, body.refreshToken);
    if (!userId) return fail(reply, 401, 'La sesión venció. Volvé a iniciar sesión.');

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow | undefined;
    if (!user || user.banned === 1) return fail(reply, 401, 'Cuenta no disponible.');

    const accessToken = await signAccessToken({ id: user.id, username: user.username, role: user.role });
    const refreshToken = createRefreshToken(db, user.id);
    return reply.send(authPayload(user, accessToken, refreshToken));
  });

  app.post('/auth/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const token = (request.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (token) revokeRefreshToken(db, token);
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id) as unknown as UserRow | undefined;
    if (!user) return fail(reply, 404, 'Usuario no encontrado.');
    return reply.send({ user: toMe(user) });
  });

  app.patch('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parse(updateMeSchema, request.body, reply);
    if (!body) return;

    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id) as unknown as UserRow | undefined;
    if (!current) return fail(reply, 404, 'Usuario no encontrado.');

    db.prepare('UPDATE users SET display_name = ?, avatar = ?, status_message = ?, status = ? WHERE id = ?').run(
      body.displayName ?? current.display_name,
      body.avatar ?? current.avatar,
      body.statusMessage ?? current.status_message,
      body.status ?? current.status,
      current.id,
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(current.id) as unknown as UserRow;
    if (body.status !== undefined || body.statusMessage !== undefined) {
      broadcastPresence(db, current.id);
    }
    return reply.send({ user: toMe(updated) });
  });

  app.post('/me/password', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parse(changePasswordSchema, request.body, reply);
    if (!body) return;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user.id) as unknown as UserRow | undefined;
    if (!user || !verifyPassword(body.currentPassword, user.password_hash)) {
      return fail(reply, 400, 'La contraseña actual no es correcta.');
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.newPassword), user.id);
    revokeAllRefreshTokens(db, user.id);
    return reply.send({ ok: true });
  });

  app.get('/me/settings', { preHandler: [app.authenticate] }, async (_request, reply) => {
    return reply.send(getSettings(db));
  });
}
