import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AdminSettings, AdminStats, Invite } from '@nacio/shared';
import { adminUserPatchSchema, inviteSchema, settingsSchema } from '@nacio/shared';
import { hashPassword, randomPassword, revokeAllRefreshTokens } from '../auth.js';
import { conversationMemberIds, disconnectUser } from '../chat.js';
import { getSettings, setSetting } from '../db.js';
import { fail, parse } from '../http.js';
import { emitToUsers, isOnline, onlineCount } from '../realtime.js';
import {
  getConversationRow,
  getUserRow,
  toMe,
  type ConversationRow,
  type UserRow,
} from '../serialize.js';

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

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

function toInvite(row: InviteRow): Invite {
  return {
    code: row.code,
    course: row.course,
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revoked: row.revoked === 1,
    createdBy: row.created_by,
  };
}

function audit(app: FastifyInstance, actorId: string, action: string, target: string | null, detail: unknown): void {
  app.db
    .prepare('INSERT INTO audit_log (id, actor_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      randomUUID(),
      actorId,
      action,
      target,
      detail === undefined ? null : JSON.stringify(detail),
      Date.now(),
    );
}

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const guard = [app.authenticate, app.requireAdmin];

  app.get('/stats', { preHandler: guard }, async (_request, reply) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const stats: AdminStats = {
      users: (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n,
      online: onlineCount(),
      conversations: (db.prepare('SELECT COUNT(*) AS n FROM conversations').get() as { n: number }).n,
      messagesToday: (
        db.prepare('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ?').get(start.getTime()) as { n: number }
      ).n,
      messagesTotal: (db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }).n,
      invitesActive: (
        db
          .prepare(
            'SELECT COUNT(*) AS n FROM invites WHERE revoked = 0 AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?)',
          )
          .get(Date.now()) as { n: number }
      ).n,
    };
    return reply.send({ stats });
  });

  app.get('/users', { preHandler: guard }, async (request, reply) => {
    const q = String((request.query as { q?: string }).q ?? '').trim();
    const rows = db
      .prepare(
        `SELECT * FROM users
         WHERE (? = '' OR username LIKE ? OR display_name LIKE ?)
         ORDER BY created_at DESC LIMIT 300`,
      )
      .all(q, `%${q}%`, `%${q}%`) as unknown as UserRow[];

    return reply.send({
      users: rows.map((row) => ({
        ...toMe(row),
        banned: row.banned === 1,
        online: isOnline(row.id),
      })),
    });
  });

  app.patch('/users/:id', { preHandler: guard }, async (request, reply) => {
    const body = parse(adminUserPatchSchema, request.body, reply);
    if (!body) return;
    const id = (request.params as { id: string }).id;
    const target = getUserRow(db, id);
    if (!target) return fail(reply, 404, 'Usuario no encontrado.');

    if (id === request.user.id && (body.banned === true || body.role === 'student')) {
      return fail(reply, 400, 'No podés bloquearte ni quitarte el rol de administrador.');
    }

    db.prepare('UPDATE users SET display_name = ?, banned = ?, role = ? WHERE id = ?').run(
      body.displayName ?? target.display_name,
      body.banned === undefined ? target.banned : body.banned ? 1 : 0,
      body.role ?? target.role,
      id,
    );

    if (body.banned === true) {
      db.prepare("UPDATE users SET status = 'offline', last_seen = ? WHERE id = ?").run(Date.now(), id);
      revokeAllRefreshTokens(db, id);
      disconnectUser(id);
    }

    audit(app, request.user.id, 'user.update', id, body);
    const updated = getUserRow(db, id)!;
    return reply.send({ user: { ...toMe(updated), banned: updated.banned === 1 } });
  });

  app.post('/users/:id/reset-password', { preHandler: guard }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const target = getUserRow(db, id);
    if (!target) return fail(reply, 404, 'Usuario no encontrado.');

    const password = randomPassword();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
    revokeAllRefreshTokens(db, id);
    disconnectUser(id);
    audit(app, request.user.id, 'user.reset_password', id, null);
    return reply.send({ password });
  });

  app.get('/invites', { preHandler: guard }, async (_request, reply) => {
    const rows = db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all() as unknown as InviteRow[];
    return reply.send({ invites: rows.map(toInvite) });
  });

  app.post('/invites', { preHandler: guard }, async (request, reply) => {
    const body = parse(inviteSchema, request.body, reply);
    if (!body) return;

    let code = makeCode();
    while (db.prepare('SELECT 1 FROM invites WHERE code = ?').get(code)) code = makeCode();

    const now = Date.now();
    const expiresAt = body.expiresInDays ? now + body.expiresInDays * 86_400_000 : null;
    db.prepare(
      'INSERT INTO invites (code, course, max_uses, uses, expires_at, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
    ).run(code, body.course, body.maxUses, expiresAt, request.user.id, now);

    audit(app, request.user.id, 'invite.create', code, body);
    const row = db.prepare('SELECT * FROM invites WHERE code = ?').get(code) as unknown as InviteRow;
    return reply.code(201).send({ invite: toInvite(row) });
  });

  app.delete('/invites/:code', { preHandler: guard }, async (request, reply) => {
    const code = (request.params as { code: string }).code.toUpperCase();
    const row = db.prepare('SELECT 1 FROM invites WHERE code = ?').get(code);
    if (!row) return fail(reply, 404, 'Invitación no encontrada.');
    db.prepare('UPDATE invites SET revoked = 1 WHERE code = ?').run(code);
    audit(app, request.user.id, 'invite.revoke', code, null);
    return reply.send({ ok: true });
  });

  app.get('/conversations', { preHandler: guard }, async (request, reply) => {
    const type = (request.query as { type?: string }).type;
    const rows = db
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_count,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c
         WHERE (? = '' OR c.type = ?)
         ORDER BY c.created_at DESC LIMIT 300`,
      )
      .all(type ?? '', type ?? '') as unknown as (ConversationRow & {
      member_count: number;
      message_count: number;
    })[];

    return reply.send({
      conversations: rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        course: row.course,
        isOfficial: row.is_official === 1,
        createdAt: row.created_at,
        memberCount: row.member_count,
        messageCount: row.message_count,
      })),
    });
  });

  app.delete('/conversations/:id', { preHandler: guard }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const conv = getConversationRow(db, id);
    if (!conv) return fail(reply, 404, 'Conversación no encontrada.');
    const members = conversationMemberIds(db, id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    for (const userId of members) {
      app.io.in(`user:${userId}`).socketsLeave(`conv:${id}`);
    }
    emitToUsers(members, 'conversation:update', id);
    audit(app, request.user.id, 'conversation.delete', id, { name: conv.name });
    return reply.send({ ok: true });
  });

  app.post('/rooms', { preHandler: guard }, async (request, reply) => {
    const body = request.body as { name?: string; course?: string; topic?: string };
    const name = (body.name ?? '').trim();
    if (name.length < 1 || name.length > 40) return fail(reply, 400, 'El nombre debe tener entre 1 y 40 caracteres.');

    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO conversations (id, type, name, topic, avatar, course, is_official, created_by, created_at)
       VALUES (?, 'group', ?, ?, '🏫', ?, 1, ?, ?)`,
    ).run(id, name, (body.topic ?? '').trim().slice(0, 120), (body.course ?? '').trim().slice(0, 60), request.user.id, now);
    db.prepare(
      "INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, 'owner', ?, ?)",
    ).run(id, request.user.id, now, now);

    audit(app, request.user.id, 'room.create', id, { name });
    return reply.code(201).send({ id });
  });

  app.get('/settings', { preHandler: guard }, async (_request, reply) => {
    return reply.send({ settings: getSettings(db) as AdminSettings });
  });

  app.patch('/settings', { preHandler: guard }, async (request, reply) => {
    const body = parse(settingsSchema, request.body, reply);
    if (!body) return;
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) setSetting(db, key, String(value));
    }
    audit(app, request.user.id, 'settings.update', null, body);
    return reply.send({ settings: getSettings(db) as AdminSettings });
  });

  app.get('/audit', { preHandler: guard }, async (request, reply) => {
    const limit = Math.min(200, Math.max(1, Number((request.query as { limit?: string }).limit) || 100));
    const rows = db
      .prepare(
        `SELECT a.*, u.display_name AS actor_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
         ORDER BY a.created_at DESC LIMIT ?`,
      )
      .all(limit) as {
      id: string;
      actor_id: string | null;
      actor_name: string | null;
      action: string;
      target: string | null;
      detail: string | null;
      created_at: number;
    }[];

    return reply.send({
      entries: rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        target: row.target,
        detail: row.detail,
        createdAt: row.created_at,
      })),
    });
  });
}
