import { Fragment, useEffect, useRef, useState } from 'react';
import type { ConversationSummary, Message } from '@nacio/shared';
import { EMOTICONS, renderEmoticons } from '@nacio/shared';
import { useApp } from '../store';
import { Wordmark } from './TitleBar';
import {
  canManageGroup,
  contactName,
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

export function Chat({
  onOpenMembers,
  onOpenProfile,
}: {
  onOpenMembers: (conversationId: string) => void;
  onOpenProfile: () => void;
}) {
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
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingSent = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, conversationId, search]);

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
  const isOwner = membership?.role === 'owner';
  const canInvite = conversation.type === 'group' && canManageGroup(conversation, me.id);
  const isOnline = connection === 'online';

  const query = search.trim().toLowerCase();
  const visibleMessages = query
    ? messages.filter((message) => message.body.toLowerCase().includes(query))
    : messages;

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

  function handleInvite() {
    if (canInvite) {
      onOpenMembers(conversation.id);
      return;
    }
    setToast('Creá un grupo para invitar a más compañeros.');
  }

  function notAvailable() {
    setToast('Todavía no está disponible en esta versión.');
  }

  async function handleBlock() {
    if (!peer) return;
    if (!window.confirm(`¿Bloquear a ${peer.displayName}? No va a poder escribirte.`)) return;
    try {
      await blockContact(peer.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo bloquear.');
    }
  }

  async function handleRemove() {
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
    if (!window.confirm('¿Salir de este grupo?')) return;
    try {
      await leaveGroup(conversation.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo salir del grupo.');
    }
  }

  async function handleDeleteGroup() {
    if (!window.confirm('¿Eliminar el grupo para todos? Se borra el historial.')) return;
    try {
      await deleteGroup(conversation.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No se pudo eliminar el grupo.');
    }
  }

  async function handleClearLocal() {
    if (!window.confirm('¿Borrar el historial guardado en esta computadora?')) return;
    await clearOneHistoryLocal(conversation.id);
    setToast('Historial local borrado.');
  }

  function toggleSearch() {
    setShowSearch((value) => !value);
    setSearch('');
  }

  function memberName(userId: string, fallback: string) {
    const entry = contacts.find((item) => item.user.id === userId);
    return entry ? contactName(entry) : fallback;
  }

  return (
    <div className="chat">
      <div className="chat-toolbar">
        <ToolButton icon="👤" label="Invitar" onClick={handleInvite} />
        <ToolButton icon="📁" label="Enviar archivos" onClick={notAvailable} />
        <ToolButton icon="🎥" label="Videollamada" onClick={notAvailable} />
        <ToolButton icon="🎤" label="Voz" onClick={notAvailable} />
        <ToolButton icon="⭐" label="Actividades" onClick={notAvailable} />
        <ToolButton icon="🎮" label="Juegos" onClick={notAvailable} />
        <span className="toolbar-spacer" />
        <Wordmark />
        <button
          type="button"
          className="round-tool block"
          title="Bloquear contacto"
          onClick={() => void handleBlock()}
          disabled={conversation.type !== 'dm'}
        >
          🚫
        </button>
        <button
          type="button"
          className="round-tool"
          title="Ayuda"
          onClick={() => setToast('Elegí un contacto para chatear. Enter envía, Mayús+Enter hace un salto de línea.')}
        >
          ?
        </button>
      </div>

      {!isOnline && (
        <div className="offline-banner">Sin conexión con el servidor. Los mensajes no se van a enviar.</div>
      )}

      <div className="chat-main">
        <div className="chat-left">
          <div className="to-strip">
            <span className="to-label">Para:</span>
            <div className="to-chips">
              {conversation.type === 'group' ? (
                <>
                  {conversation.members.slice(0, 6).map((member) => (
                    <span className="to-chip" key={member.user.id}>
                      <span className="to-chip-avatar">{member.user.avatar}</span>
                      {memberName(member.user.id, member.user.displayName)}
                      {member.user.id === me.id ? ' (yo)' : ''}
                    </span>
                  ))}
                  {conversation.members.length > 6 && (
                    <span className="to-chip more">+{conversation.members.length - 6} más</span>
                  )}
                </>
              ) : peer ? (
                <span className="to-chip">
                  <span className="to-chip-avatar">{peer.avatar}</span>
                  {peer.displayName}
                  <i className={`status-dot ${peerStatus}`} />
                </span>
              ) : null}
            </div>
            {canInvite && (
              <button type="button" className="to-add" onClick={() => onOpenMembers(conversation.id)}>
                Agregar…
              </button>
            )}
          </div>

          {showSearch && (
            <div className="chat-search">
              <span className="chat-search-icon">🔍</span>
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar en esta conversación…"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') toggleSearch();
                }}
              />
              <span className="chat-search-count">
                {query ? `${visibleMessages.length} resultado${visibleMessages.length === 1 ? '' : 's'}` : ''}
              </span>
              <button type="button" className="chat-search-close" onClick={toggleSearch} title="Cerrar búsqueda">
                ×
              </button>
            </div>
          )}

          <div className="messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="messages-empty">
                <p>Todavía no hay mensajes.</p>
                <small>Escribí el primero y rompé el hielo.</small>
              </div>
            )}

            {messages.length > 0 && query && visibleMessages.length === 0 && (
              <div className="messages-empty">
                <p>No se encontraron mensajes.</p>
                <small>Probá con otra palabra.</small>
              </div>
            )}

            {visibleMessages.map((message, index) => {
              const showDay =
                index === 0 ||
                dayKey(visibleMessages[index - 1]!.createdAt) !== dayKey(message.createdAt);
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
                          <span className={`message-author ${own ? 'mine' : ''}`}>
                            {own ? 'Vos decís:' : `${author} dice:`}
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

          <div className="composer-area">
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

            <div className="emoticon-bar">
              <button
                type="button"
                className="emoticon-btn letter"
                title="Formato del texto"
                onClick={() => setToast('El formato enriquecido todavía no está disponible.')}
              >
                A
              </button>
              <button
                type="button"
                className="emoticon-btn"
                title="Emoticones"
                onClick={() => setShowEmoji((value) => !value)}
              >
                🙂
              </button>
              <span className="emoticon-sep" />
              <button type="button" className="emoticon-btn wide" title="Nota de voz" onClick={notAvailable}>
                🎤 <span>Nota de voz</span>
              </button>
              <button
                type="button"
                className="emoticon-btn"
                title="Mandar un zumbido"
                onClick={() => void handleNudge()}
                disabled={!isOnline}
              >
                💥
              </button>
              <button type="button" className="emoticon-btn" title="Fondo de la conversación" onClick={notAvailable}>
                🖼️
              </button>
              <span className="emoticon-sep" />
              <button
                type="button"
                className="emoticon-btn"
                title="Guiño ;)"
                onClick={() => {
                  setText((value) => value + ';)');
                  inputRef.current?.focus();
                }}
              >
                😉
              </button>
            </div>

            <div className="composer-row">
              <textarea
                ref={inputRef}
                rows={3}
                value={text}
                placeholder={isOnline ? 'Escribí un mensaje…' : 'Sin conexión…'}
                onChange={(event) => handleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                onFocus={() => setShowEmoji(false)}
              />

              <div className="composer-buttons">
                <button
                  className="send-button"
                  type="button"
                  onClick={() => void submit()}
                  disabled={!text.trim() || !isOnline}
                >
                  Enviar
                </button>
                <button className="search-button" type="button" onClick={toggleSearch}>
                  Buscar
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="chat-side">
          <div className="avatar-panel tall">
            <div className="avatar-panel-face">
              <span>{conversation.type === 'group' ? (conversation.avatar ?? '👥') : (peer?.avatar ?? '🐱')}</span>
            </div>
            <div className="avatar-panel-name">
              {conversation.type === 'dm' && <i className={`status-dot ${peerStatus}`} />}
              <span>{title}</span>
            </div>
            <button
              type="button"
              className="avatar-panel-arrow"
              title={conversation.type === 'group' ? 'Ver integrantes' : 'Ver estado'}
              onClick={() =>
                conversation.type === 'group' ? onOpenMembers(conversation.id) : setToast(`${title}: ${subtitle}`)
              }
            >
              ▾
            </button>
          </div>

          <button type="button" className="avatar-panel me" onClick={onOpenProfile} title="Mi perfil y estado">
            <div className="avatar-panel-face">
              <span>{me.avatar}</span>
            </div>
            <div className="avatar-panel-name">
              <i className={`status-dot ${me.status}`} />
              <span>{me.displayName}</span>
            </div>
          </button>
        </div>
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

      <div className="chat-statusbar">
        <span className="chat-promo">Escribí :) para sonreír · Emoticones y zumbidos incluidos</span>
        <span>
          {isOnline ? 'En línea' : 'Sin conexión'} · {messages.length} mensaje{messages.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="tool-button" onClick={onClick} title={label}>
      <span className="tool-icon">{icon}</span>
      <span className="tool-label">{label}</span>
    </button>
  );
}
