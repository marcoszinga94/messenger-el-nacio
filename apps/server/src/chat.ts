import { randomUUID } from 'node:crypto';
import type { Message, MessageKind } from '@nacio/shared';
import { NUDGE_COOLDOWN_MS } from '@nacio/shared';
import type { Db } from './db.js';
import { emitToUsers, getIO } from './realtime.js';
import {
  effectiveStatus,
  getConversationRow,
  getUserRow,
  toMessage,
  type FileRow,
  type MessageRow,
} from './serialize.js';

export function isMember(db: Db, conversationId: string, userId: string): boolean {
  return (
    db
      .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
      .get(conversationId, userId) !== undefined
  );
}

export function memberRole(db: Db, conversationId: string, userId: string): string | null {
  const row = db
    .prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId) as { role: string } | undefined;
  return row?.role ?? null;
}

export function conversationMemberIds(db: Db, conversationId: string): string[] {
  const rows = db
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?')
    .all(conversationId) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

export function contactIdsOf(db: Db, userId: string): string[] {
  const rows = db
    .prepare(
      `SELECT CASE WHEN owner_id = ? THEN contact_id ELSE owner_id END AS id
       FROM contacts
       WHERE state = 'accepted' AND (owner_id = ? OR contact_id = ?)`,
    )
    .all(userId, userId, userId) as { id: string }[];
  return [...new Set(rows.map((r) => r.id))].filter((id) => !isBlockedBetween(db, userId, id));
}

export function areContacts(db: Db, a: string, b: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM contacts WHERE owner_id = ? AND contact_id = ? AND state = 'accepted'")
    .get(a, b);
  return row !== undefined;
}

export function isBlockedBetween(db: Db, a: string, b: string): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM contacts
         WHERE state = 'blocked'
           AND ((owner_id = ? AND contact_id = ?) OR (owner_id = ? AND contact_id = ?))`,
      )
      .get(a, b, b, a) !== undefined
  );
}

export function canSendToConversation(
  db: Db,
  conversationId: string,
  senderId: string,
): { ok: true } | { ok: false; error: string } {
  if (!isMember(db, conversationId, senderId)) return { ok: false, error: 'No participás de esta conversación.' };
  const conv = getConversationRow(db, conversationId);
  if (!conv) return { ok: false, error: 'La conversación no existe.' };
  if (conv.type === 'dm') {
    const other = conversationMemberIds(db, conversationId).find((id) => id !== senderId);
    if (other && isBlockedBetween(db, senderId, other)) {
      return { ok: false, error: 'No podés enviar mensajes a este usuario.' };
    }
  }
  return { ok: true };
}

export function broadcastMessage(message: Message): void {
  getIO()?.to(`conv:${message.conversationId}`).emit('message:new', message);
}

export function createMessage(
  db: Db,
  conversationId: string,
  senderId: string | null,
  kind: MessageKind,
  body: string,
  fileId: string | null = null,
): Message {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO messages (id, conversation_id, sender_id, kind, body, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, conversationId, senderId, kind, body, fileId, now);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as unknown as MessageRow;
  return toMessage(db, row);
}

/** Los audios se muestran como nota de voz; el resto, como archivo adjunto. */
export function kindForFile(file: Pick<FileRow, 'mime'>): MessageKind {
  return file.mime.startsWith('audio/') ? 'voice' : 'file';
}

export function createAttachmentMessage(
  db: Db,
  conversationId: string,
  senderId: string,
  file: FileRow,
  caption: string,
): Message {
  return createMessage(db, conversationId, senderId, kindForFile(file), caption, file.id);
}

/** Avisa a los contactos aceptados que cambió el estado de presencia. */
export function broadcastPresence(db: Db, userId: string): void {
  const row = getUserRow(db, userId);
  if (!row) return;
  emitToUsers(contactIdsOf(db, userId), 'presence:update', {
    userId,
    status: effectiveStatus(row),
    lastSeen: row.last_seen,
  });
}

/** Avisa a los miembros de una conversación que la lista cambió. */
export function notifyConversationUpdate(db: Db, conversationId: string): void {
  emitToUsers(conversationMemberIds(db, conversationId), 'conversation:update', conversationId);
}

export function disconnectUser(userId: string): void {
  getIO()?.in(`user:${userId}`).disconnectSockets(true);
}

const lastNudgeAt = new Map<string, number>();

export function nudgeCooldown(userId: string, conversationId: string): number {
  const key = `${conversationId}:${userId}`;
  const last = lastNudgeAt.get(key) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < NUDGE_COOLDOWN_MS) return NUDGE_COOLDOWN_MS - elapsed;
  lastNudgeAt.set(key, Date.now());
  return 0;
}
