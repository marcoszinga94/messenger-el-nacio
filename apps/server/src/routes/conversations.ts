import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  addMembersSchema,
  dmSchema,
  groupSchema,
  messageSchema,
  winkSchema,
  WINKS,
} from '@nacio/shared';
import {
  areContacts,
  broadcastMessage,
  canSendToConversation,
  conversationMemberIds,
  createAttachmentMessage,
  createMessage,
  isBlockedBetween,
  isMember,
  memberRole,
  nudgeCooldown,
} from '../chat.js';
import { getSettingNumber } from '../db.js';
import { fail, parse } from '../http.js';
import { emitToUsers, getIO } from '../realtime.js';
import {
  conversationSummary,
  conversationsForUser,
  getConversationRow,
  getFileRow,
  getUserRow,
  toMessage,
  type MessageRow,
  type UserRow,
} from '../serialize.js';

function connectSockets(conversationId: string, userIds: string[]): void {
  const io = getIO();
  if (!io) return;
  for (const id of userIds) io.in(`user:${id}`).socketsJoin(`conv:${conversationId}`);
}

function announceNew(conversationId: string, userIds: string[]): void {
  connectSockets(conversationId, userIds);
  emitToUsers(userIds, 'conversation:new', conversationId);
}

export default async function conversationRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.get('/conversations', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.send({ conversations: conversationsForUser(db, request.user.id) });
  });

  app.get('/conversations/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!isMember(db, id, request.user.id)) return fail(reply, 404, 'Conversación no encontrada.');
    const summary = conversationSummary(db, id, request.user.id);
    if (!summary) return fail(reply, 404, 'Conversación no encontrada.');
    return reply.send({ conversation: summary });
  });

  app.post('/conversations/dm', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parse(dmSchema, request.body, reply);
    if (!body) return;
    const me = request.user.id;
    if (body.userId === me) return fail(reply, 400, 'No podés abrir un chat con vos mismo.');

    const other = getUserRow(db, body.userId);
    if (!other || other.banned === 1) return fail(reply, 404, 'Usuario no encontrado.');
    if (isBlockedBetween(db, me, other.id)) return fail(reply, 403, 'No podés escribirle a este usuario.');
    if (request.user.role !== 'admin' && !areContacts(db, me, other.id)) {
      return fail(reply, 403, 'Primero agregá a la persona como contacto.');
    }

    const key = [me, other.id].sort().join(':');
    const existing = db.prepare("SELECT * FROM conversations WHERE type = 'dm' AND dm_key = ?").get(key) as
      | { id: string }
      | undefined;

    if (existing) {
      const summary = conversationSummary(db, existing.id, me);
      return reply.send({ conversation: summary });
    }

    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      "INSERT INTO conversations (id, type, name, topic, course, dm_key, is_official, created_by, created_at) VALUES (?, 'dm', NULL, '', '', ?, 0, ?, ?)",
    ).run(id, key, me, now);
    db.prepare(
      "INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, 'member', ?, ?)",
    ).run(id, me, now, now);
    db.prepare(
      "INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, 'member', ?, ?)",
    ).run(id, other.id, now, now);

    announceNew(id, [me, other.id]);
    return reply.code(201).send({ conversation: conversationSummary(db, id, me) });
  });

  app.post('/conversations/group', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parse(groupSchema, request.body, reply);
    if (!body) return;
    const me = request.user.id;
    const maxSize = getSettingNumber(db, 'maxGroupSize', 50);
    const wanted = [...new Set([me, ...body.memberIds])];

    const placeholders = wanted.map(() => '?').join(',');
    const valid = (
      db.prepare(`SELECT id FROM users WHERE banned = 0 AND id IN (${placeholders})`).all(...wanted) as {
        id: string;
      }[]
    ).map((r) => r.id);

    if (valid.length < 2) return fail(reply, 400, 'Elegí al menos un compañero para crear el grupo.');
    if (valid.length > maxSize) return fail(reply, 400, `El grupo admite hasta ${maxSize} integrantes.`);

    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      "INSERT INTO conversations (id, type, name, topic, avatar, course, is_official, created_by, created_at) VALUES (?, 'group', ?, ?, '👥', '', 0, ?, ?)",
    ).run(id, body.name, body.topic, me, now);
    db.prepare(
      "INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, 'owner', ?, ?)",
    ).run(id, me, now, now);

    for (const userId of valid) {
      if (userId === me) continue;
      db.prepare(
        "INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, 'member', ?, ?)",
      ).run(id, userId, now, now);
    }

    const creator = getUserRow(db, me);
    if (creator) {
      createMessage(db, id, null, 'system', `${creator.display_name} creó el grupo "${body.name}".`);
    }

    announceNew(id, valid);
    return reply.code(201).send({ conversation: conversationSummary(db, id, me) });
  });

  app.post('/conversations/:id/members', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parse(addMembersSchema, request.body, reply);
    if (!body) return;
    const id = (request.params as { id: string }).id;
    const me = request.user.id;
    const conv = getConversationRow(db, id);
    if (!conv) return fail(reply, 404, 'Conversación no encontrada.');
    if (conv.type !== 'group') return fail(reply, 400, 'Solo los grupos pueden sumar integrantes.');

    const role = memberRole(db, id, me);
    if (!role) return fail(reply, 403, 'No participás de este grupo.');
    if (role !== 'owner' && role !== 'admin' && request.user.role !== 'admin') {
      return fail(reply, 403, 'Solo el dueño del grupo puede agregar integrantes.');
    }

    const currentIds = conversationMemberIds(db, id);
    const maxSize = getSettingNumber(db, 'maxGroupSize', 50);
    const candidates = [...new Set(body.userIds)].filter((uid) => !currentIds.includes(uid));
    const placeholders = candidates.map(() => '?').join(',');
    const valid = candidates.length
      ? (db.prepare(`SELECT id FROM users WHERE banned = 0 AND id IN (${placeholders})`).all(...candidates) as {
          id: string;
        }[]).map((r) => r.id)
      : [];

    if (valid.length === 0) return fail(reply, 400, 'No hay usuarios válidos para agregar.');
    if (currentIds.length + valid.length > maxSize) {
      return fail(reply, 400, `El grupo admite hasta ${maxSize} integrantes.`);
    }

    const now = Date.now();
    for (const userId of valid) {
      db.prepare(
        "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at, last_read_at) VALUES (?, ?, 'member', ?, ?)",
      ).run(id, userId, now, now);
    }

    connectSockets(id, valid);
    emitToUsers(valid, 'conversation:new', id);
    emitToUsers([...currentIds, ...valid], 'conversation:update', id);
    return reply.send({ ok: true, added: valid });
  });

  app.delete('/conversations/:id/members/:userId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const targetId = (request.params as { userId: string }).userId;
    const me = request.user.id;
    const conv = getConversationRow(db, id);
    if (!conv) return fail(reply, 404, 'Conversación no encontrada.');
    if (conv.type !== 'group') return fail(reply, 400, 'No se puede quitar gente de un chat privado.');

    const requesterRole = memberRole(db, id, me);
    if (!requesterRole) return fail(reply, 403, 'No participás de este grupo.');
    const targetRole = memberRole(db, id, targetId);
    if (!targetRole) return fail(reply, 404, 'Ese usuario no está en el grupo.');

    if (targetId !== me && requesterRole !== 'owner' && requesterRole !== 'admin' && request.user.role !== 'admin') {
      return fail(reply, 403, 'No tenés permiso para quitar integrantes.');
    }
    if (targetId === me && targetRole === 'owner') {
      return fail(reply, 400, 'El dueño no puede salir del grupo; tenés que eliminarlo.');
    }
    if (targetRole === 'owner' && request.user.role !== 'admin') {
      return fail(reply, 403, 'No podés quitar al dueño del grupo.');
    }

    const remaining = conversationMemberIds(db, id).filter((uid) => uid !== targetId);

    if (targetRole === 'owner') {
      const next = remaining[0];
      if (!next) {
        db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
        emitToUsers(remaining, 'conversation:update', id);
        return reply.send({ ok: true });
      }
      db.prepare("UPDATE conversation_members SET role = 'owner' WHERE conversation_id = ? AND user_id = ?").run(
        id,
        next,
      );
    }

    db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(id, targetId);
    getIO()?.in(`user:${targetId}`).socketsLeave(`conv:${id}`);
    emitToUsers([targetId, ...remaining], 'conversation:update', id);
    return reply.send({ ok: true });
  });

  app.delete('/conversations/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const me = request.user.id;
    const conv = getConversationRow(db, id);
    if (!conv) return fail(reply, 404, 'Conversación no encontrada.');
    if (conv.type === 'dm') return fail(reply, 400, 'Los chats privados no se eliminan.');

    const role = memberRole(db, id, me);
    if (role !== 'owner' && request.user.role !== 'admin') {
      return fail(reply, 403, 'Solo el dueño del grupo puede eliminarlo.');
    }

    const members = conversationMemberIds(db, id);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    for (const userId of members) getIO()?.in(`user:${userId}`).socketsLeave(`conv:${id}`);
    emitToUsers(members, 'conversation:update', id);
    return reply.send({ ok: true });
  });

  app.post('/conversations/:id/read', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!isMember(db, id, request.user.id)) return fail(reply, 404, 'Conversación no encontrada.');
    db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
      Date.now(),
      id,
      request.user.id,
    );
    return reply.send({ ok: true });
  });

  app.get('/conversations/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!isMember(db, id, request.user.id)) return fail(reply, 404, 'Conversación no encontrada.');

    const query = request.query as { before?: string; limit?: string };
    const before = Number(query.before) || Date.now() + 1;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));

    const rows = db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?')
      .all(id, before, limit) as unknown as MessageRow[];

    const messages = rows.reverse().map((row) => toMessage(db, row));
    return reply.send({ messages, hasMore: rows.length === limit });
  });

  app.post('/conversations/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parse(messageSchema, request.body, reply);
    if (!body) return;
    const id = (request.params as { id: string }).id;
    const check = canSendToConversation(db, id, request.user.id);
    if (!check.ok) return fail(reply, check.error.includes('participás') ? 404 : 403, check.error);

    let message;
    if (body.fileId) {
      const file = getFileRow(db, body.fileId);
      if (!file || file.owner_id !== request.user.id) {
        return fail(reply, 400, 'El archivo no está disponible.');
      }
      message = createAttachmentMessage(db, id, request.user.id, file, body.body);
    } else {
      message = createMessage(db, id, request.user.id, 'text', body.body);
    }
    broadcastMessage(message);
    return reply.code(201).send({ message });
  });

  app.post('/conversations/:id/nudge', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const check = canSendToConversation(db, id, request.user.id);
    if (!check.ok) return fail(reply, check.error.includes('participás') ? 404 : 403, check.error);

    const wait = nudgeCooldown(request.user.id, id);
    if (wait > 0) return fail(reply, 429, `Esperá ${Math.ceil(wait / 1000)} segundos antes de mandar otro zumbido.`);

    const message = createMessage(db, id, request.user.id, 'nudge', '');
    broadcastMessage(message);
    if (message.sender) {
      getIO()
        ?.to(`conv:${id}`)
        .except(`user:${request.user.id}`)
        .emit('nudge', { conversationId: id, from: message.sender });
    }
    return reply.code(201).send({ message });
  });

  app.post('/conversations/:id/wink', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parse(winkSchema, request.body, reply);
    if (!body) return;
    const id = (request.params as { id: string }).id;
    if (!WINKS.some((wink) => wink.id === body.wink)) return fail(reply, 400, 'Ese guiño no existe.');
    const check = canSendToConversation(db, id, request.user.id);
    if (!check.ok) return fail(reply, check.error.includes('participás') ? 404 : 403, check.error);

    const message = createMessage(db, id, request.user.id, 'wink', body.wink);
    broadcastMessage(message);
    if (message.sender) {
      getIO()
        ?.to(`conv:${id}`)
        .except(`user:${request.user.id}`)
        .emit('wink', { conversationId: id, from: message.sender, wink: body.wink });
    }
    return reply.code(201).send({ message });
  });

  app.post('/conversations/:id/dice', { preHandler: [app.authenticate] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const check = canSendToConversation(db, id, request.user.id);
    if (!check.ok) return fail(reply, check.error.includes('participás') ? 404 : 403, check.error);

    const values = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const message = createMessage(
      db,
      id,
      request.user.id,
      'game',
      JSON.stringify({ game: 'dice', values }),
    );
    broadcastMessage(message);
    return reply.code(201).send({ message });
  });
}
