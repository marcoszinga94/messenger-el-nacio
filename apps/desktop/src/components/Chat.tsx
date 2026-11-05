import { Fragment, useEffect, useRef, useState } from 'react';
import type { ConversationSummary, Message } from '@nacio/shared';
import { EMOTICONS, renderEmoticons } from '@nacio/shared';
import { useApp } from '../store';
import {
  canManageGroup,
  colorFor,
  conversationPeer,
  conversationTitle,
  dayKey,
  formatDay,
  formatTime,
  lastSeenText,
  myMembership,
  statusLabel,
} from '../utils';

const EMPTY_MESSAGES: Message[] = [];

export function Chat({ onOpenMembers }: { onOpenMembers: (conversationId: string) => void }) {
  const session = useApp((state) => state.session);
  const activeId = useApp((state) => state.activeId);
  const conversations = useApp((state) => state.conversations);
  const openIds = useApp((state) => state.openIds);
  const contacts = useApp((state) => state.contacts);
  const typing = useApp((state) => state.typing);
  const connection = useApp((state) => state.connection);
  const sendMessage = useApp((state) => state.sendMessage);
  const sendNudge = useApp((state) => state.sendNudge);
  const notifyTyping = useApp((state) => state.notifyTyping);
  const openConversation = useApp((state) => state.openConversation);
  const closeConversation = useApp((state) => state.closeConversation);
  const blockContact = useApp((state) => state.blockContact);
  const removeContact = useApp((state) => state.removeContact);
  const leaveGroup = useApp((state) => state.leaveGroup);
  const deleteGroup = useApp((state) => state.deleteGroup);
  const clearOneHistoryLocal = useApp((state) => state.clearOneHistoryLocal);
  const setToast = useApp((state) => state.setToast);

  const activeConversation = conversations.find((item) => item.id === activeId);
  const conversationId = activeConversation?.id;
  const messages = useApp((state) => (state.activeId ? state.messages[state.activeId] : undefined)) ?? EMPTY_MESSAGES;

  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const typingSent = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, conversationId]);

  useEffect(() => {
    return () => {
      if (typingSent.current && conversationId) {
        notifyTyping(conversationId, false);
        typingSent.current = false;
      }
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [conversationId, notifyTyping]);

  if (!activeConversation || !session) {
    return <div className="chat-missing">Conversación no disponible.</div>;
  }

  const conversation = activeConversation;
  const me = session.user;
  const peer = conversationPeer(conversation, me.id);
  const contact = peer ? contacts.find((entry) => entry.user.id === peer.id) : undefined;
  const title = conversationTitle(conversation, me.id, contacts);
  const membership = myMembership(conversation, me.id);
  const peerStatus = contact?.user.status ?? peer?.status ?? 'offline';
  const subtitle =
    conversation.type === 'group'
      ? `${conversation.members.length} integrante${conversation.members.length === 1 ? '' : 's'}`
      : peerStatus === 'offline'
        ? lastSeenText(contact?.user.lastSeen ?? peer?.lastSeen ?? null)
        : contact?.user.statusMessage || statusLabel(peerStatus);
  const typers = (typing[conversation.id] ?? []).filter((entry) => entry.at > now);
  const tabs = openIds
    .map((id) => conversations.find((item) => item.id === id))
    .filter((item): item is ConversationSummary => Boolean(item));

  function closeMenu() {
    menuRef.current?.removeAttribute('open');
  }

  function handleChange(value: string) {
    setText(value);
    if (!typingSent.current) {
      notifyTyping(conversation.id, true);
      typingSent.current = true;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingSent.current = false;
      notifyTyping(conversation.id, false);
    }, 1600);
  }

  async function submit() {
    const body = text.trim();
    if (!body || connection !== 'online') return;
    setText('');
    setShowEmoji(false);
    if (typingSent.current) {
      typingSent.current = false;
      notifyTyping(conversation.id, false);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    await sendMessage(body);
    inputRef.current?.focus();
  }

  async function handleNudge() {
    await sendNudge();
  }

  async function handleBlock() {
    closeMenu();
    if (!peer) return;
    if (!window.confirm(`¿Bloquear a ${peer.displayName}? No va a poder escribirte.`)) return;
    try {
      await blockContact(peer.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo bloquear.');
    }
  }

  async function handleRemove() {
    closeMenu();
    if (!peer) return;
    if (!window.confirm(`¿Eliminar a ${peer.displayName} de tus contactos?`)) return;
    try {
      await removeContact(peer.id);
      closeConversation(conversation.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo eliminar.');
    }
  }

  async function handleLeave() {
    closeMenu();
    if (!window.confirm('¿Salir de este grupo?')) return;
    try {
      await leaveGroup(conversation.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo salir del grupo.');
    }
  }

  async function handleDeleteGroup() {
    closeMenu();
    if (!window.confirm('¿Eliminar el grupo para todos? Se borra el historial.')) return;
    try {
      await deleteGroup(conversation.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo eliminar el grupo.');
    }
  }

  async function handleClearLocal() {
    closeMenu();
    if (!window.confirm('¿Borrar el historial guardado en esta computadora?')) return;
    await clearOneHistoryLocal(conversation.id);
    setToast('Historial local borrado.');
  }

  const isOwner = membership?.role === 'owner';

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="chat-avatar">
          <span>{conversation.type === 'group' ? (conversation.avatar ?? '👥') : (peer?.avatar ?? '🐱')}</span>
          {conversation.type === 'dm' && <i className={`status-dot big ${peerStatus}`} />}
        </div>
        <div className="chat-title">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>

        <div className="chat-actions">
          <button
            className="chat-action"
            title="Mandar zumbido"
            onClick={() => void handleNudge()}
            disabled={connection !== 'online'}
          >
            💥
          </button>
          <details className="dropdown" ref={menuRef}>
            <summary className="chat-action" title="Más opciones">
              ⋯
            </summary>
            <div className="dropdown-menu">
              {conversation.type === 'group' && canManageGroup(conversation, me.id) && (
                <button
                  onClick={() => {
                    closeMenu();
                    onOpenMembers(conversation.id);
                  }}
                >
                  Agregar integrante
                </button>
              )}
              {conversation.type === 'group' && !isOwner && (
                <button onClick={() => void handleLeave()}>Salir del grupo</button>
              )}
              {conversation.type === 'group' && isOwner && (
                <button className="danger" onClick={() => void handleDeleteGroup()}>
                  Eliminar grupo
                </button>
              )}
              {conversation.type === 'dm' && (
                <>
                  <button onClick={() => void handleBlock()}>Bloquear contacto</button>
                  <button className="danger" onClick={() => void handleRemove()}>
                    Eliminar contacto
                  </button>
                </>
              )}
              <button onClick={() => void handleClearLocal()}>Borrar historial local</button>
            </div>
          </details>
        </div>
      </header>

      {connection !== 'online' && (
        <div className="offline-banner">Sin conexión con el servidor. Los mensajes no se van a enviar.</div>
      )}

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="messages-empty">
            <p>Todavía no hay mensajes.</p>
            <small>Escribí el primero y rompé el hielo.</small>
          </div>
        )}

        {messages.map((message, index) => {
          const showDay = index === 0 || dayKey(messages[index - 1]!.createdAt) !== dayKey(message.createdAt);
          const own = message.sender?.id === me.id;
          const author = message.sender?.displayName ?? 'Sistema';

          return (
            <Fragment key={message.id}>
              {showDay && (
                <div className="day-separator">
                  <span>{formatDay(message.createdAt)}</span>
                </div>
              )}

              {message.kind === 'system' && <div className="system-line">{message.body}</div>}

              {message.kind === 'nudge' && (
                <div className="nudge-line">💥 {own ? 'Mandaste' : `${author} mandó`} un zumbido</div>
              )}

              {message.kind === 'text' && (
                <div className={`message ${own ? 'own' : ''}`}>
                  {conversation.type === 'group' && !own && (
                    <span className="message-avatar">{message.sender?.avatar ?? '👤'}</span>
                  )}
                  <div className="message-body">
                    <div className="message-meta">
                      <span className="message-author" style={{ color: colorFor(message.sender?.id) }}>
                        {own ? 'Yo' : author}
                      </span>
                      <span className="message-time">{formatTime(message.createdAt)}</span>
                    </div>
                    <div className="message-text">{renderEmoticons(message.body)}</div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div className="typing-line">
        {typers.length > 0 &&
          (typers.length === 1
            ? `${typers[0]!.displayName} está escribiendo…`
            : 'Varios están escribiendo…')}
      </div>

      <div className="composer">
        <div className="composer-tools">
          <button
            className="composer-tool"
            title="Emoticones"
            onClick={() => setShowEmoji((value) => !value)}
            type="button"
          >
            😊
          </button>
        </div>

        {showEmoji && (
          <div className="emoji-popover">
            {EMOTICONS.map((emoticon) => (
              <button
                key={emoticon.code}
                type="button"
                title={`${emoticon.label} (${emoticon.code})`}
                onClick={() => {
                  setText((value) => value + emoticon.emoji);
                  inputRef.current?.focus();
                }}
              >
                {emoticon.emoji}
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          placeholder={connection === 'online' ? 'Escribí un mensaje…' : 'Sin conexión…'}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          onFocus={() => setShowEmoji(false)}
        />

        <button
          className="send-button"
          type="button"
          onClick={() => void submit()}
          disabled={!text.trim() || connection !== 'online'}
        >
          Enviar
        </button>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${tab.id === conversation.id ? 'active' : ''}`}
            onClick={() => void openConversation(tab.id)}
          >
            <span className="tab-label">{conversationTitle(tab, me.id, contacts)}</span>
            {tab.unread > 0 && tab.id !== conversation.id && <span className="tab-unread">{tab.unread}</span>}
            <span
              className="tab-close"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                closeConversation(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.stopPropagation();
                  closeConversation(tab.id);
                }
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
