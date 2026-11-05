import type { Message, PublicUser } from './types.js';

export interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'conversation:new': (conversationId: string) => void;
  'conversation:update': (conversationId: string) => void;
  'contact:update': () => void;
  'presence:update': (payload: { userId: string; status: PublicUser['status']; lastSeen: number | null }) => void;
  'typing': (payload: { conversationId: string; userId: string; displayName: string; typing: boolean }) => void;
  'nudge': (payload: { conversationId: string; from: PublicUser }) => void;
  'wink': (payload: { conversationId: string; from: PublicUser; wink: string }) => void;
  'session:error': (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  'message:send': (
    payload: { conversationId: string; body?: string; fileId?: string },
    ack?: (result: { ok: boolean; message?: Message; error?: string }) => void,
  ) => void;
  'typing': (payload: { conversationId: string; typing: boolean }) => void;
  'nudge': (
    payload: { conversationId: string },
    ack?: (result: { ok: boolean; message?: Message; error?: string }) => void,
  ) => void;
  'wink': (
    payload: { conversationId: string; wink: string },
    ack?: (result: { ok: boolean; message?: Message; error?: string }) => void,
  ) => void;
  'game:dice': (
    payload: { conversationId: string },
    ack?: (result: { ok: boolean; message?: Message; error?: string }) => void,
  ) => void;
  'conversation:read': (payload: { conversationId: string; at?: number }) => void;
}
