import { create } from 'zustand';
import type { ContactEntry, ConversationSummary, Me, Message, UserStatus } from '@nacio/shared';
import { WINKS } from '@nacio/shared';
import { api, ApiError, requestLogin, requestRegister, uploadAttachment } from './api';
import { cacheMessages, cachedMessages, clearConversationHistory, clearLocalHistory } from './db';
import {
  clearSession,
  loadSession,
  refreshTokens,
  saveSession,
  setServer,
  type StoredSession,
} from './session';
import { createSocket, type AppSocket } from './socket';
import { isSoundOn, playSound, setSoundOn } from './sounds';
import {
  CURRENT_VERSION,
  clearDismissedVersion,
  dismissedVersion,
  dismissVersion,
  fetchLatestRelease,
  isNewer,
  openExternal,
  type ReleaseInfo,
} from './updates';

type Connection = 'online' | 'connecting' | 'offline';

interface TypingEntry {
  userId: string;
  displayName: string;
  at: number;
}

interface Toast {
  id: number;
  text: string;
}

interface WinkBurst {
  id: number;
  emoji: string;
  displayName: string;
}

const BACKGROUNDS_KEY = 'nacio-chat-backgrounds';

function loadBackgrounds(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BACKGROUNDS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export interface AppState {
  session: StoredSession | null;
  ready: boolean;
  contacts: ContactEntry[];
  conversations: ConversationSummary[];
  messages: Record<string, Message[]>;
  openIds: string[];
  activeId: string | null;
  typing: Record<string, TypingEntry[]>;
  connection: Connection;
  soundOn: boolean;
  toast: Toast | null;
  nudgeTick: number;
  winkBurst: WinkBurst | null;
  backgrounds: Record<string, string>;
  update: ReleaseInfo | null;
  updateDismissed: boolean;
  updateChecking: boolean;

  initialize: () => Promise<void>;
  checkForUpdates: (options?: { silent?: boolean; manual?: boolean }) => Promise<ReleaseInfo | null>;
  dismissUpdate: () => void;
  openUpdate: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (input: { code: string; username: string; displayName: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  connect: () => void;
  refreshContacts: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  closeConversation: (id: string) => void;
  openDm: (userId: string) => Promise<void>;
  createGroup: (name: string, topic: string, memberIds: string[]) => Promise<void>;
  leaveGroup: (id: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  addGroupMembers: (id: string, userIds: string[]) => Promise<void>;
  sendMessage: (body: string) => Promise<void>;
  sendAttachment: (blob: Blob, name: string, duration?: number) => Promise<void>;
  sendDice: () => Promise<void>;
  sendWink: (wink: string) => Promise<void>;
  clearWink: () => void;
  setBackground: (conversationId: string, preset: string) => void;
  sendNudge: () => Promise<void>;
  markRead: (id: string) => void;
  notifyTyping: (id: string, typing: boolean) => void;
  receiveTyping: (payload: { conversationId: string; userId: string; displayName: string; typing: boolean }) => void;
  updatePresence: (userId: string, status: PublicUserStatus, lastSeen: number | null) => void;
  incomingMessage: (message: Message) => void;
  incomingNudge: (payload: { conversationId: string; from: { displayName: string } }) => void;
  incomingWink: (payload: {
    conversationId: string;
    from: { displayName: string };
    wink: string;
  }) => void;
  updateMe: (patch: {
    displayName?: string;
    avatar?: string;
    statusMessage?: string;
    status?: UserStatus;
  }) => Promise<void>;
  addContact: (username: string) => Promise<void>;
  acceptContact: (userId: string) => Promise<void>;
  rejectContact: (userId: string) => Promise<void>;
  blockContact: (userId: string) => Promise<void>;
  removeContact: (userId: string) => Promise<void>;
  setToast: (text: string) => void;
  clearToast: () => void;
  setSound: (value: boolean) => void;
  clearHistoryLocal: () => Promise<void>;
  clearOneHistoryLocal: (id: string) => Promise<void>;
  changeServer: (url: string) => void;
}

type PublicUserStatus = ContactEntry['user']['status'];

let socket: AppSocket | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const message of current) map.set(message.id, message);
  for (const message of incoming) map.set(message.id, message);
  return [...map.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function upsertConversation(list: ConversationSummary[], conversation: ConversationSummary): ConversationSummary[] {
  const map = new Map(list.map((item) => [item.id, item]));
  map.set(conversation.id, conversation);
  return [...map.values()].sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? a.createdAt;
    const bt = b.lastMessage?.createdAt ?? b.createdAt;
    return bt - at;
  });
}

export const useApp = create<AppState>()((set, get) => ({
  session: null,
  ready: false,
  contacts: [],
  conversations: [],
  messages: {},
  openIds: [],
  activeId: null,
  typing: {},
  connection: 'offline',
  soundOn: isSoundOn(),
  toast: null,
  nudgeTick: 0,
  winkBurst: null,
  backgrounds: loadBackgrounds(),
  update: null,
  updateDismissed: false,
  updateChecking: false,

  async initialize() {
    const stored = loadSession();
    if (!stored) {
      set({ ready: true });
      return;
    }
    set({ session: stored });
    try {
      const data = await api<{ user: Me }>('/api/me');
      const session = { ...stored, user: data.user };
      saveSession(session);
      set({ session });
      await Promise.all([get().refreshContacts(), get().refreshConversations()]);
      get().connect();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        set({ session: null });
      } else {
        set({ connection: 'offline' });
      }
    } finally {
      set({ ready: true });
    }
  },

  async checkForUpdates(options = {}) {
    if (get().updateChecking) return get().update;
    if (options.manual) clearDismissedVersion();
    set({ updateChecking: true });
    try {
      const release = await fetchLatestRelease();
      if (!release || !isNewer(release.latest)) {
        set({ update: null, updateDismissed: false, updateChecking: false });
        if (options.manual) get().setToast(`Estás al día (v${CURRENT_VERSION}).`);
        return null;
      }
      const dismissed = dismissedVersion() === release.latest;
      set({ update: release, updateDismissed: dismissed, updateChecking: false });
      if (options.manual) get().setToast(`Hay una nueva versión disponible: v${release.latest}.`);
      return release;
    } catch {
      set({ updateChecking: false });
      if (options.manual) get().setToast('No se pudo comprobar si hay actualizaciones.');
      return null;
    }
  },

  dismissUpdate() {
    const update = get().update;
    if (update) dismissVersion(update.latest);
    set({ updateDismissed: true });
  },

  async openUpdate() {
    const update = get().update;
    if (!update) return;
    try {
      await openExternal(update.url);
    } catch {
      get().setToast('No se pudo abrir el enlace de descarga.');
    }
  },

  async login(username, password) {
    const session = await requestLogin(username, password);
    set({ session, ready: true });
    await Promise.all([get().refreshContacts(), get().refreshConversations()]);
    get().connect();
  },

  async register(input) {
    const session = await requestRegister(input);
    set({ session, ready: true });
    await Promise.all([get().refreshContacts(), get().refreshConversations()]);
    get().connect();
  },

  async logout() {
    try {
      await api('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: loadSession()?.refreshToken ?? '' }),
      });
    } catch {
      // Cerramos igual.
    }
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    clearSession();
    set({
      session: null,
      ready: true,
      contacts: [],
      conversations: [],
      messages: {},
      openIds: [],
      activeId: null,
      typing: {},
      connection: 'offline',
    });
  },

  connect() {
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = createSocket();
    set({ connection: 'connecting' });

    socket.on('connect', () => set({ connection: 'online' }));
    socket.on('disconnect', () => set({ connection: 'offline' }));
    socket.on('connect_error', async (error) => {
      set({ connection: 'offline' });
      const message = String(error.message);
      if (message.includes('Sesión') || message.includes('credenciales') || message.includes('Cuenta')) {
        if ((await refreshTokens()) && socket) {
          socket.auth = { token: loadSession()?.accessToken ?? '' };
          socket.connect();
        }
      }
    });

    socket.on('message:new', (message) => get().incomingMessage(message));
    socket.on('conversation:new', () => void get().refreshConversations());
    socket.on('conversation:update', () => void get().refreshConversations());
    socket.on('contact:update', () => void get().refreshContacts());
    socket.on('presence:update', (presence) => get().updatePresence(presence.userId, presence.status, presence.lastSeen));
    socket.on('typing', (payload) => get().receiveTyping(payload));
    socket.on('nudge', (payload) => get().incomingNudge(payload));
    socket.on('wink', (payload) => get().incomingWink(payload));
  },

  async refreshContacts() {
    if (!get().session) return;
    try {
      const data = await api<{ contacts: ContactEntry[] }>('/api/contacts');
      set({ contacts: data.contacts });
    } catch {
      // Sin contactos no bloqueamos la app.
    }
  },

  async refreshConversations() {
    if (!get().session) return;
    try {
      const data = await api<{ conversations: ConversationSummary[] }>('/api/conversations');
      set((state) => {
        const openIds = state.openIds.filter((id) => data.conversations.some((c) => c.id === id));
        const activeId = state.activeId && data.conversations.some((c) => c.id === state.activeId)
          ? state.activeId
          : (openIds.at(-1) ?? null);
        return { conversations: data.conversations, openIds, activeId };
      });
    } catch {
      // Mantenemos la lista anterior.
    }
  },

  async openConversation(id) {
    const state = get();
    set({
      activeId: id,
      openIds: state.openIds.includes(id) ? state.openIds : [...state.openIds, id],
    });

    try {
      const cached = await cachedMessages(id);
      if (cached.length) {
        set((current) => ({
          messages: { ...current.messages, [id]: mergeMessages(current.messages[id] ?? [], cached) },
        }));
      }
      const data = await api<{ messages: Message[] }>(`/api/conversations/${id}/messages?limit=80`);
      set((current) => ({
        messages: { ...current.messages, [id]: mergeMessages(current.messages[id] ?? [], data.messages) },
      }));
      await cacheMessages(data.messages);
    } catch (error) {
      get().setToast(error instanceof Error ? error.message : 'No se pudo cargar el historial.');
    }
    get().markRead(id);
  },

  closeConversation(id) {
    set((state) => {
      const openIds = state.openIds.filter((item) => item !== id);
      return {
        openIds,
        activeId: state.activeId === id ? (openIds.at(-1) ?? null) : state.activeId,
      };
    });
  },

  async openDm(userId) {
    const data = await api<{ conversation: ConversationSummary }>('/api/conversations/dm', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    set((state) => ({ conversations: upsertConversation(state.conversations, data.conversation) }));
    await get().openConversation(data.conversation.id);
  },

  async createGroup(name, topic, memberIds) {
    const data = await api<{ conversation: ConversationSummary }>('/api/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ name, topic, memberIds }),
    });
    set((state) => ({ conversations: upsertConversation(state.conversations, data.conversation) }));
    await get().openConversation(data.conversation.id);
  },

  async leaveGroup(id) {
    const me = get().session?.user;
    if (!me) return;
    await api(`/api/conversations/${id}/members/${me.id}`, { method: 'DELETE' });
    await get().refreshConversations();
    get().closeConversation(id);
  },

  async deleteGroup(id) {
    await api(`/api/conversations/${id}`, { method: 'DELETE' });
    await get().refreshConversations();
    get().closeConversation(id);
  },

  async addGroupMembers(id, userIds) {
    await api(`/api/conversations/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
    await get().refreshConversations();
  },

  async sendMessage(body) {
    const { activeId } = get();
    const text = body.trim();
    if (!activeId || !text) return;
    playSound('send');

    if (socket?.connected) {
      await new Promise<void>((resolve) => {
        socket!.emit('message:send', { conversationId: activeId, body: text }, (result) => {
          if (!result.ok) get().setToast(result.error ?? 'No se pudo enviar el mensaje.');
          resolve();
        });
      });
      return;
    }

    try {
      const data = await api<{ message: Message }>(`/api/conversations/${activeId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      });
      get().incomingMessage(data.message);
    } catch (error) {
      get().setToast(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    }
  },

  async sendAttachment(blob, name, duration) {
    const { activeId } = get();
    if (!activeId) return;
    try {
      const attachment = await uploadAttachment(blob, name, duration);
      if (socket?.connected) {
        await new Promise<void>((resolve) => {
          socket!.emit('message:send', { conversationId: activeId, fileId: attachment.id }, (result) => {
            if (!result.ok) get().setToast(result.error ?? 'No se pudo enviar el archivo.');
            resolve();
          });
        });
      } else {
        const data = await api<{ message: Message }>(`/api/conversations/${activeId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ fileId: attachment.id }),
        });
        get().incomingMessage(data.message);
      }
      playSound('send');
    } catch (error) {
      get().setToast(error instanceof Error ? error.message : 'No se pudo enviar el archivo.');
    }
  },

  async sendDice() {
    const { activeId } = get();
    if (!activeId) return;
    if (socket?.connected) {
      await new Promise<void>((resolve) => {
        socket!.emit('game:dice', { conversationId: activeId }, (result) => {
          if (!result.ok) get().setToast(result.error ?? 'No se pudieron tirar los dados.');
          resolve();
        });
      });
      return;
    }
    try {
      const data = await api<{ message: Message }>(`/api/conversations/${activeId}/dice`, {
        method: 'POST',
      });
      get().incomingMessage(data.message);
    } catch (error) {
      get().setToast(error instanceof Error ? error.message : 'No se pudieron tirar los dados.');
    }
  },

  async sendWink(wink) {
    const { activeId } = get();
    if (!activeId) return;
    if (socket?.connected) {
      await new Promise<void>((resolve) => {
        socket!.emit('wink', { conversationId: activeId, wink }, (result) => {
          if (!result.ok) get().setToast(result.error ?? 'No se pudo mandar el guiño.');
          resolve();
        });
      });
      return;
    }
    try {
      const data = await api<{ message: Message }>(`/api/conversations/${activeId}/wink`, {
        method: 'POST',
        body: JSON.stringify({ wink }),
      });
      get().incomingMessage(data.message);
    } catch (error) {
      get().setToast(error instanceof Error ? error.message : 'No se pudo mandar el guiño.');
    }
  },

  clearWink() {
    set({ winkBurst: null });
  },

  setBackground(conversationId, preset) {
    set((state) => {
      const backgrounds = { ...state.backgrounds };
      if (preset === 'default') delete backgrounds[conversationId];
      else backgrounds[conversationId] = preset;
      try {
        localStorage.setItem(BACKGROUNDS_KEY, JSON.stringify(backgrounds));
      } catch {
        // Si el almacenamiento está lleno, el fondo se mantiene solo en memoria.
      }
      return { backgrounds };
    });
  },

  async sendNudge() {
    const { activeId } = get();
    if (!activeId) return;
    if (socket?.connected) {
      await new Promise<void>((resolve) => {
        socket!.emit('nudge', { conversationId: activeId }, (result) => {
          if (!result.ok) get().setToast(result.error ?? 'No se pudo mandar el zumbido.');
          else {
            playSound('nudge');
            set((state) => ({ nudgeTick: state.nudgeTick + 1 }));
          }
          resolve();
        });
      });
      return;
    }
    try {
      await api(`/api/conversations/${activeId}/nudge`, { method: 'POST' });
      playSound('nudge');
      set((state) => ({ nudgeTick: state.nudgeTick + 1 }));
    } catch (error) {
      get().setToast(error instanceof Error ? error.message : 'No se pudo mandar el zumbido.');
    }
  },

  markRead(id) {
    socket?.emit('conversation:read', { conversationId: id });
    void api(`/api/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, unread: 0, lastReadAt: Date.now() } : conversation,
      ),
    }));
  },

  notifyTyping(id, typing) {
    if (!socket?.connected) return;
    socket.emit('typing', { conversationId: id, typing });
  },

  receiveTyping(payload) {
    set((state) => {
      const list = (state.typing[payload.conversationId] ?? []).filter((entry) => entry.userId !== payload.userId);
      if (payload.typing) {
        list.push({ userId: payload.userId, displayName: payload.displayName, at: Date.now() + 4000 });
      }
      return { typing: { ...state.typing, [payload.conversationId]: list } };
    });
  },

  updatePresence(userId, status, lastSeen) {
    set((state) => ({
      contacts: state.contacts.map((contact) =>
        contact.user.id === userId ? { ...contact, user: { ...contact.user, status, lastSeen } } : contact,
      ),
      conversations: state.conversations.map((conversation) => ({
        ...conversation,
        members: conversation.members.map((member) =>
          member.user.id === userId ? { ...member, user: { ...member.user, status, lastSeen } } : member,
        ),
      })),
    }));
  },

  incomingMessage(message) {
    const state = get();
    const own = message.sender?.id === state.session?.user.id;
    if (message.kind === 'text' && !own) playSound('message');

    set((current) => {
      const existing = current.messages[message.conversationId] ?? [];
      if (existing.some((item) => item.id === message.id)) return current;
      const messages = {
        ...current.messages,
        [message.conversationId]: mergeMessages(existing, [message]),
      };
      const active = current.activeId === message.conversationId;
      const conversations = current.conversations.map((conversation) =>
        conversation.id === message.conversationId
          ? {
              ...conversation,
              lastMessage: message,
              unread: active || own ? 0 : conversation.unread + 1,
            }
          : conversation,
      );
      return { messages, conversations };
    });

    void cacheMessages([message]);
    if (!get().conversations.some((conversation) => conversation.id === message.conversationId)) {
      void get().refreshConversations();
    }
    if (get().activeId === message.conversationId) get().markRead(message.conversationId);
  },

  incomingNudge(payload) {
    playSound('nudge');
    set((state) => ({
      nudgeTick: state.nudgeTick + 1,
      toast: { id: Date.now(), text: `${payload.from.displayName} te mandó un zumbido` },
    }));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },

  incomingWink(payload) {
    const wink = WINKS.find((item) => item.id === payload.wink);
    set({
      winkBurst: {
        id: Date.now(),
        emoji: wink?.emoji ?? '✨',
        displayName: payload.from.displayName,
      },
    });
    get().setToast(`${payload.from.displayName} te mandó un guiño`);
  },

  async updateMe(patch) {
    const data = await api<{ user: Me }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const session = get().session;
    if (!session) return;
    const next = { ...session, user: data.user };
    saveSession(next);
    set({ session: next });
  },

  async addContact(username) {
    await api('/api/contacts', { method: 'POST', body: JSON.stringify({ username }) });
    await get().refreshContacts();
    get().setToast('Solicitud enviada.');
  },

  async acceptContact(userId) {
    await api(`/api/contacts/${userId}/accept`, { method: 'POST' });
    await get().refreshContacts();
  },

  async rejectContact(userId) {
    await api(`/api/contacts/${userId}`, { method: 'DELETE' });
    await get().refreshContacts();
  },

  async blockContact(userId) {
    await api(`/api/contacts/${userId}/block`, { method: 'POST' });
    await get().refreshContacts();
    get().setToast('Usuario bloqueado.');
  },

  async removeContact(userId) {
    await api(`/api/contacts/${userId}`, { method: 'DELETE' });
    await get().refreshContacts();
  },

  setToast(text) {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), text } });
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },

  clearToast() {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null });
  },

  setSound(value) {
    setSoundOn(value);
    set({ soundOn: value });
  },

  async clearHistoryLocal() {
    await clearLocalHistory();
    set({ messages: {} });
    get().setToast('Historial local borrado.');
  },

  async clearOneHistoryLocal(id) {
    await clearConversationHistory(id);
    set((state) => {
      const messages = { ...state.messages };
      delete messages[id];
      return { messages };
    });
  },

  changeServer(url) {
    setServer(url);
  },
}));

export function getSocket(): AppSocket | null {
  return socket;
}
