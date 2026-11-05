import type { FastifyInstance } from 'fastify';
import type { ContactEntry, ContactState } from '@nacio/shared';
import { fail, parse } from '../http.js';
import { contactRequestSchema } from '@nacio/shared';
import { emitToUser } from '../realtime.js';
import { getUserRow, toPublicUser, type UserRow } from '../serialize.js';

interface ContactRow {
  owner_id: string;
  contact_id: string;
  nickname: string | null;
  state: ContactState;
  created_at: number;
}

function contactEntry(
  db: FastifyInstance['db'],
  viewerId: string,
  row: ContactRow,
  otherId: string,
): ContactEntry | null {
  const user = getUserRow(db, otherId);
  if (!user) return null;
  return {
    user: toPublicUser(user),
    nickname: row.owner_id === viewerId ? row.nickname : null,
    state: row.state,
    direction: row.owner_id === viewerId ? 'outgoing' : 'incoming',
    createdAt: row.created_at,
  };
}

export default async function contactRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.get('/contacts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const me = request.user.id;
    const rows = db
      .prepare('SELECT * FROM contacts WHERE owner_id = ? OR contact_id = ?')
      .all(me, me) as unknown as ContactRow[];

    const map = new Map<string, ContactEntry>();
    for (const row of rows) {
      if (row.state === 'blocked') {
        if (row.owner_id !== me) continue;
        const entry = contactEntry(db, me, row, row.contact_id);
        if (entry) map.set(entry.user.id, entry);
        continue;
      }
      if (row.state === 'pending' && row.owner_id !== me) {
        const entry = contactEntry(db, me, row, row.owner_id);
        if (entry) map.set(entry.user.id, entry);
        continue;
      }
      if (row.state === 'pending' && row.owner_id === me) {
        const entry = contactEntry(db, me, row, row.contact_id);
        if (entry) map.set(entry.user.id, entry);
        continue;
      }
      // accepted: priorizamos la fila propia (tiene el apodo)
      const otherId = row.owner_id === me ? row.contact_id : row.owner_id;
      const existing = map.get(otherId);
      if (existing?.state === 'accepted' && existing.direction === 'outgoing' && row.owner_id !== me) continue;
      const entry = contactEntry(db, me, row, otherId);
      if (entry) map.set(otherId, entry);
    }

    return reply.send({ contacts: [...map.values()] });
  });

  function acceptPair(requesterId: string, targetId: string): void {
    const now = Date.now();
    db.prepare("UPDATE contacts SET state = 'accepted' WHERE owner_id = ? AND contact_id = ?").run(requesterId, targetId);
    db.prepare(
      `INSERT INTO contacts (owner_id, contact_id, nickname, state, created_at)
       VALUES (?, ?, NULL, 'accepted', ?)
       ON CONFLICT(owner_id, contact_id) DO UPDATE SET state = 'accepted'`,
    ).run(targetId, requesterId, now);
    emitToUser(requesterId, 'contact:update', null);
    emitToUser(targetId, 'contact:update', null);
  }

  app.post('/contacts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = parse(contactRequestSchema, request.body, reply);
    if (!body) return;

    const me = request.user.id;
    const target = db.prepare('SELECT * FROM users WHERE username = ?').get(body.username) as unknown as UserRow | undefined;
    if (!target || target.banned === 1) return fail(reply, 404, 'No existe ningún usuario con ese nombre.');
    if (target.id === me) return fail(reply, 400, 'No podés agregarte a vos mismo.');

    const outgoing = db
      .prepare('SELECT * FROM contacts WHERE owner_id = ? AND contact_id = ?')
      .get(me, target.id) as unknown as ContactRow | undefined;
    const incoming = db
      .prepare('SELECT * FROM contacts WHERE owner_id = ? AND contact_id = ?')
      .get(target.id, me) as unknown as ContactRow | undefined;

    if (outgoing?.state === 'blocked' || incoming?.state === 'blocked') {
      return fail(reply, 403, 'No es posible agregar a este usuario.');
    }
    if (outgoing?.state === 'accepted' || incoming?.state === 'accepted') {
      return fail(reply, 409, 'Ese usuario ya está en tus contactos.');
    }
    if (outgoing?.state === 'pending') {
      return fail(reply, 409, 'Ya le enviaste una solicitud a este usuario.');
    }
    if (incoming?.state === 'pending') {
      acceptPair(target.id, me);
      return reply.send({ ok: true, accepted: true });
    }

    db.prepare("INSERT INTO contacts (owner_id, contact_id, state, created_at) VALUES (?, ?, 'pending', ?)").run(
      me,
      target.id,
      Date.now(),
    );
    emitToUser(target.id, 'contact:update', null);
    emitToUser(me, 'contact:update', null);
    return reply.code(201).send({ ok: true, accepted: false });
  });

  app.post('/contacts/:id/accept', { preHandler: [app.authenticate] }, async (request, reply) => {
    const me = request.user.id;
    const requesterId = (request.params as { id: string }).id;
    const row = db
      .prepare("SELECT 1 FROM contacts WHERE owner_id = ? AND contact_id = ? AND state = 'pending'")
      .get(requesterId, me);
    if (!row) return fail(reply, 404, 'No hay una solicitud pendiente de ese usuario.');
    acceptPair(requesterId, me);
    return reply.send({ ok: true });
  });

  app.delete('/contacts/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const me = request.user.id;
    const otherId = (request.params as { id: string }).id;
    db.prepare(
      'DELETE FROM contacts WHERE (owner_id = ? AND contact_id = ?) OR (owner_id = ? AND contact_id = ?)',
    ).run(me, otherId, otherId, me);
    emitToUser(me, 'contact:update', null);
    emitToUser(otherId, 'contact:update', null);
    return reply.send({ ok: true });
  });

  app.patch('/contacts/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const me = request.user.id;
    const otherId = (request.params as { id: string }).id;
    const body = request.body as { nickname?: string | null };
    const nickname = (body.nickname ?? '').trim().slice(0, 40) || null;
    const result = db
      .prepare('UPDATE contacts SET nickname = ? WHERE owner_id = ? AND contact_id = ?')
      .run(nickname, me, otherId);
    if (result.changes === 0) return fail(reply, 404, 'Ese usuario no está en tus contactos.');
    return reply.send({ ok: true, nickname });
  });

  app.post('/contacts/:id/block', { preHandler: [app.authenticate] }, async (request, reply) => {
    const me = request.user.id;
    const otherId = (request.params as { id: string }).id;
    if (otherId === me) return fail(reply, 400, 'No podés bloquearte a vos mismo.');
    db.prepare(
      `INSERT INTO contacts (owner_id, contact_id, nickname, state, created_at)
       VALUES (?, ?, NULL, 'blocked', ?)
       ON CONFLICT(owner_id, contact_id) DO UPDATE SET state = 'blocked'`,
    ).run(me, otherId, Date.now());
    emitToUser(me, 'contact:update', null);
    return reply.send({ ok: true });
  });

  app.delete('/contacts/:id/block', { preHandler: [app.authenticate] }, async (request, reply) => {
    const me = request.user.id;
    const otherId = (request.params as { id: string }).id;
    const reverse = db
      .prepare("SELECT 1 FROM contacts WHERE owner_id = ? AND contact_id = ? AND state = 'accepted'")
      .get(otherId, me);
    if (reverse) {
      db.prepare("UPDATE contacts SET state = 'accepted' WHERE owner_id = ? AND contact_id = ?").run(me, otherId);
    } else {
      db.prepare('DELETE FROM contacts WHERE owner_id = ? AND contact_id = ?').run(me, otherId);
    }
    emitToUser(me, 'contact:update', null);
    return reply.send({ ok: true });
  });
}
