import type { ConversationMember, ConversationSummary, EffectiveStatus, Me, Message, MessageKind, PublicUser, UserRole, UserStatus } from '@nacio/shared';
import type { Db } from './db.js';
import { isOnline } from './realtime.js';

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar: string;
  status: UserStatus;
  status_message: string;
  role: UserRole;
  banned: number;
  created_at: number;
  last_seen: number | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string;
  created_at: number;
}

export interface ConversationRow {
  id: string;
  type: 'dm' | 'group';
  name: string | null;
  topic: string;
  avatar: string | null;
  course: string;
  dm_key: string | null;
  is_official: number;
  created_by: string | null;
  created_at: number;
}

export function effectiveStatus(row: Pick<UserRow, 'id' | 'status'>): EffectiveStatus {
  if (!isOnline(row.id)) return 'offline';
  if (row.status === 'invisible' || row.status === 'offline') return 'offline';
  return row.status;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    status: effectiveStatus(row),
    statusMessage: row.status_message,
    lastSeen: row.last_seen,
    role: row.role,
  };
}

export function toMe(row: UserRow): Me {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    status: row.status,
    statusMessage: row.status_message,
    lastSeen: row.last_seen,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function getUserRow(db: Db, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
}

export function toMessage(db: Db, row: MessageRow): Message {
  const sender = row.sender_id ? getUserRow(db, row.sender_id) : undefined;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: sender ? toPublicUser(sender) : null,
    kind: row.kind,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function getConversationRow(db: Db, id: string): ConversationRow | undefined {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as unknown as ConversationRow | undefined;
}

export function conversationSummary(db: Db, conversationId: string, viewerId: string): ConversationSummary | null {
  const conv = getConversationRow(db, conversationId);
  if (!conv) return null;

  const memberRows = db
    .prepare(
      `SELECT u.*, cm.role AS member_role, cm.joined_at AS member_joined_at, cm.last_read_at AS member_last_read_at,
              cm.muted AS member_muted
       FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ?
       ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.display_name COLLATE NOCASE`,
    )
    .all(conversationId) as unknown as (UserRow & {
    member_role: ConversationMember['role'];
    member_joined_at: number;
    member_last_read_at: number;
    member_muted: number;
  })[];

  const viewer = memberRows.find((m) => m.id === viewerId);

  const lastRow = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(conversationId) as unknown as MessageRow | undefined;

  const unreadRow = db
    .prepare(
      'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND created_at > ? AND (sender_id IS NULL OR sender_id != ?)',
    )
    .get(conversationId, viewer?.member_last_read_at ?? 0, viewerId) as { n: number };

  const members: ConversationMember[] = memberRows.map((m) => ({
    user: toPublicUser(m),
    role: m.member_role,
    joinedAt: m.member_joined_at,
  }));

  return {
    id: conv.id,
    type: conv.type,
    name: conv.name,
    topic: conv.topic,
    avatar: conv.avatar,
    course: conv.course,
    isOfficial: conv.is_official === 1,
    createdBy: conv.created_by,
    createdAt: conv.created_at,
    members,
    lastMessage: lastRow ? toMessage(db, lastRow) : null,
    unread: unreadRow.n,
    muted: Boolean(viewer?.member_muted),
    lastReadAt: viewer?.member_last_read_at ?? 0,
  };
}

export function conversationsForUser(db: Db, userId: string): ConversationSummary[] {
  const rows = db
    .prepare(
      `SELECT c.* FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = ?`,
    )
    .all(userId) as unknown as ConversationRow[];

  const summaries = rows
    .map((c) => conversationSummary(db, c.id, userId))
    .filter((c): c is ConversationSummary => c !== null);

  summaries.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? a.createdAt;
    const bt = b.lastMessage?.createdAt ?? b.createdAt;
    return bt - at;
  });
  return summaries;
}
