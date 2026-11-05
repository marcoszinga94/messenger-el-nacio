import Dexie, { type Table } from 'dexie';
import type { Message } from '@nacio/shared';

class NacioDatabase extends Dexie {
  messages!: Table<Message, string>;

  constructor() {
    super('nacio-messenger');
    this.version(1).stores({
      messages: 'id, conversationId, createdAt',
    });
  }
}

export const localDb = new NacioDatabase();

export async function cacheMessages(messages: Message[]): Promise<void> {
  if (!messages.length) return;
  try {
    await localDb.messages.bulkPut(messages);
  } catch {
    // La caché es opcional; si falla no interrumpimos el chat.
  }
}

export async function cachedMessages(conversationId: string, limit = 120): Promise<Message[]> {
  try {
    const rows = await localDb.messages.where('conversationId').equals(conversationId).toArray();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return rows.slice(-limit);
  } catch {
    return [];
  }
}

export async function clearLocalHistory(): Promise<void> {
  await localDb.messages.clear();
}

export async function clearConversationHistory(conversationId: string): Promise<void> {
  await localDb.messages.where('conversationId').equals(conversationId).delete();
}
