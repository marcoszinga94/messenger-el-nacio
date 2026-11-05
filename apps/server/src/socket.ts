import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { ClientToServerEvents, Message, ServerToClientEvents } from '@nacio/shared';
import { messageSchema } from '@nacio/shared';
import { verifyAccessToken, type AuthUser } from './auth.js';
import {
  broadcastMessage,
  broadcastPresence,
  canSendToConversation,
  createMessage,
  isMember,
  nudgeCooldown,
} from './chat.js';
import { config } from './config.js';
import { addUserSocket, removeUserSocket, setIO } from './realtime.js';
import { getUserRow, type UserRow } from './serialize.js';

interface SocketData {
  user: AuthUser;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function setupSockets(app: FastifyInstance): IO {
  const io: IO = new Server(app.server, {
    path: '/socket.io',
    cors: { origin: config.corsOrigins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 100_000,
    pingTimeout: 25_000,
  });
  setIO(io as unknown as Server);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('Sin credenciales.'));
    const payload = await verifyAccessToken(token);
    if (!payload) return next(new Error('Sesión vencida.'));
    const row = app.db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) as unknown as UserRow | undefined;
    if (!row || row.banned === 1) return next(new Error('Cuenta no disponible.'));
    socket.data.user = { id: row.id, username: row.username, role: row.role };
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    addUserSocket(user.id, socket.id);
    socket.join(`user:${user.id}`);

    const memberships = app.db
      .prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ?')
      .all(user.id) as { conversation_id: string }[];
    for (const m of memberships) socket.join(`conv:${m.conversation_id}`);

    app.db
      .prepare(
        "UPDATE users SET status = CASE WHEN status = 'offline' THEN 'online' ELSE status END, last_seen = ? WHERE id = ?",
      )
      .run(Date.now(), user.id);
    broadcastPresence(app.db, user.id);

    let windowStart = Date.now();
    let windowCount = 0;
    const allowMessage = (): boolean => {
      const now = Date.now();
      if (now - windowStart > 10_000) {
        windowStart = now;
        windowCount = 0;
      }
      windowCount += 1;
      return windowCount <= 25;
    };

    socket.on('message:send', (payload, ack) => {
      if (!allowMessage()) {
        ack?.({ ok: false, error: 'Estás enviando mensajes demasiado rápido.' });
        return;
      }
      const parsed = messageSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: parsed.error.issues[0]?.message ?? 'Mensaje inválido.' });
        return;
      }
      if (!payload || typeof payload.conversationId !== 'string') {
        ack?.({ ok: false, error: 'Conversación inválida.' });
        return;
      }

      const check = canSendToConversation(app.db, payload.conversationId, user.id);
      if (!check.ok) {
        ack?.({ ok: false, error: check.error });
        return;
      }

      const message: Message = createMessage(app.db, payload.conversationId, user.id, 'text', parsed.data.body);
      broadcastMessage(message);
      ack?.({ ok: true, message });
    });

    socket.on('typing', (payload) => {
      if (!payload || typeof payload.conversationId !== 'string') return;
      if (!isMember(app.db, payload.conversationId, user.id)) return;
      const row = getUserRow(app.db, user.id);
      socket.to(`conv:${payload.conversationId}`).emit('typing', {
        conversationId: payload.conversationId,
        userId: user.id,
        displayName: row?.display_name ?? user.username,
        typing: Boolean(payload.typing),
      });
    });

    socket.on('nudge', (payload, ack) => {
      if (!payload || typeof payload.conversationId !== 'string') {
        ack?.({ ok: false, error: 'Conversación inválida.' });
        return;
      }
      const check = canSendToConversation(app.db, payload.conversationId, user.id);
      if (!check.ok) {
        ack?.({ ok: false, error: check.error });
        return;
      }
      const wait = nudgeCooldown(user.id, payload.conversationId);
      if (wait > 0) {
        ack?.({ ok: false, error: `Esperá ${Math.ceil(wait / 1000)} segundos para otro zumbido.` });
        return;
      }
      const message = createMessage(app.db, payload.conversationId, user.id, 'nudge', '');
      broadcastMessage(message);
      if (message.sender) {
        socket.to(`conv:${payload.conversationId}`).emit('nudge', {
          conversationId: payload.conversationId,
          from: message.sender,
        });
      }
      ack?.({ ok: true, message });
    });

    socket.on('conversation:read', (payload) => {
      if (!payload || typeof payload.conversationId !== 'string') return;
      if (!isMember(app.db, payload.conversationId, user.id)) return;
      const at = Math.min(Number(payload.at) || Date.now(), Date.now());
      app.db
        .prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?')
        .run(at, payload.conversationId, user.id);
    });

    socket.on('disconnect', () => {
      const online = removeUserSocket(user.id, socket.id);
      if (!online) {
        app.db.prepare("UPDATE users SET status = 'offline', last_seen = ? WHERE id = ?").run(Date.now(), user.id);
        broadcastPresence(app.db, user.id);
      }
    });
  });

  return io;
}
