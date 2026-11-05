import type { ContactEntry, ConversationMember, ConversationSummary, PublicUser } from '@nacio/shared';
import { STATUS_LABELS, STATUS_ORDER } from '@nacio/shared';

const PALETTE = ['#1a5a9e', '#2e7d32', '#8e24aa', '#c62828', '#00695c', '#ad1457', '#4527a0', '#ef6c00'];

export function colorFor(id: string | undefined): string {
  if (!id) return '#5d748a';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? '#1a5a9e';
}

export function contactName(contact: ContactEntry): string {
  return contact.nickname?.trim() || contact.user.displayName;
}

export function userName(user: PublicUser | null | undefined): string {
  return user?.displayName ?? 'Desconocido';
}

export function conversationPeer(conversation: ConversationSummary, meId: string): PublicUser | null {
  return conversation.members.find((member) => member.user.id !== meId)?.user ?? null;
}

export function conversationTitle(
  conversation: ConversationSummary,
  meId: string,
  contacts: ContactEntry[],
): string {
  if (conversation.type === 'group') return conversation.name ?? 'Grupo';
  const peer = conversationPeer(conversation, meId);
  if (!peer) return 'Chat privado';
  const contact = contacts.find((entry) => entry.user.id === peer.id);
  return contact ? contactName(contact) : peer.displayName;
}

export function myMembership(
  conversation: ConversationSummary,
  meId: string,
): ConversationMember | undefined {
  return conversation.members.find((member) => member.user.id === meId);
}

export function canManageGroup(conversation: ConversationSummary, meId: string): boolean {
  const role = myMembership(conversation, meId)?.role;
  return role === 'owner' || role === 'admin';
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusRank(status: string): number {
  return STATUS_ORDER[status] ?? 9;
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(timestamp) === dayKey(today.getTime())) return 'Hoy';
  if (dayKey(timestamp) === dayKey(yesterday.getTime())) return 'Ayer';
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

export function lastSeenText(timestamp: number | null): string {
  if (!timestamp) return 'Desconectado';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'Hace un momento';
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Hace ${Math.floor(diff / 3_600_000)} h`;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(timestamp));
}

export function memberStatus(
  conversation: ConversationSummary,
  meId: string,
  contacts: ContactEntry[],
): string {
  if (conversation.type === 'group') {
    const count = conversation.members.length;
    return `${count} integrante${count === 1 ? '' : 's'}`;
  }
  const peer = conversationPeer(conversation, meId);
  if (!peer) return '';
  const contact = contacts.find((entry) => entry.user.id === peer.id);
  return contact?.user.status ?? peer.status;
}
