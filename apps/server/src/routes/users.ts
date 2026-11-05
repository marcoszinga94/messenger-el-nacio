import type { FastifyInstance } from 'fastify';
import type { ContactState, SearchResult } from '@nacio/shared';
import { fail } from '../http.js';
import { getUserRow, toPublicUser, type UserRow } from '../serialize.js';

interface ContactRow {
  owner_id: string;
  contact_id: string;
  nickname: string | null;
  state: ContactState;
  created_at: number;
}

function relationFor(app: FastifyInstance, userId: string, otherId: string): SearchResult['relation'] {
  if (userId === otherId) return 'self';
  const out = app.db
    .prepare('SELECT state FROM contacts WHERE owner_id = ? AND contact_id = ?')
    .get(userId, otherId) as { state: ContactState } | undefined;
  const inc = app.db
    .prepare('SELECT state FROM contacts WHERE owner_id = ? AND contact_id = ?')
    .get(otherId, userId) as { state: ContactState } | undefined;

  if (out?.state === 'blocked') return 'blocked';
  if (out?.state === 'accepted' || inc?.state === 'accepted') return 'accepted';
  if (out?.state === 'pending') return 'pending';
  if (inc?.state === 'pending') return 'pending';
  return 'none';
}

function directionFor(app: FastifyInstance, userId: string, otherId: string): SearchResult['direction'] {
  const out = app.db
    .prepare('SELECT state FROM contacts WHERE owner_id = ? AND contact_id = ?')
    .get(userId, otherId) as { state: ContactState } | undefined;
  const inc = app.db
    .prepare('SELECT state FROM contacts WHERE owner_id = ? AND contact_id = ?')
    .get(otherId, userId) as { state: ContactState } | undefined;
  if (out?.state === 'accepted' && inc?.state === 'accepted') return 'mutual';
  if (out?.state === 'pending') return 'outgoing';
  if (inc?.state === 'pending') return 'incoming';
  if (out?.state === 'accepted') return 'outgoing';
  if (inc?.state === 'accepted') return 'incoming';
  return null;
}

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.get('/users/search', { preHandler: [app.authenticate] }, async (request, reply) => {
    const q = String((request.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return reply.send({ results: [] });

    const rows = db
      .prepare(
        `SELECT * FROM users
         WHERE id != ? AND banned = 0 AND (username LIKE ? OR display_name LIKE ?)
         ORDER BY username COLLATE NOCASE LIMIT 12`,
      )
      .all(request.user.id, `${q}%`, `%${q}%`) as unknown as UserRow[];

    const results: SearchResult[] = rows.map((row) => ({
      user: toPublicUser(row),
      relation: relationFor(app, request.user.id, row.id),
      direction: directionFor(app, request.user.id, row.id),
    }));
    return reply.send({ results });
  });

  app.get('/users/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const row = getUserRow(db, (request.params as { id: string }).id);
    if (!row || row.banned === 1) return fail(reply, 404, 'Usuario no encontrado.');
    return reply.send({
      user: toPublicUser(row),
      relation: relationFor(app, request.user.id, row.id),
      direction: directionFor(app, request.user.id, row.id),
    });
  });
}
