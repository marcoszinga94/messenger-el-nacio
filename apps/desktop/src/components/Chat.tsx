import { Fragment, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { ConversationSummary, Message } from '@nacio/shared';
import { EMOTICONS, FILE_MAX_BYTES, WINKS } from '@nacio/shared';
import { useApp } from '../store';
import { backgroundCss } from '../backgrounds';
import { renderRichText, FORMAT_MARKERS } from '../richText';
import { AttachmentView } from './Attachments';
import { ActivitiesModal, GamesModal } from './Games';
import { BackgroundModal } from './Modals';
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
  const sendAttachment = useApp((state) => state.sendAttachment);
  const sendNudge = useApp((state) => state.sendNudge);
  const backgrounds = useApp((state) => state.backgrounds);
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
  const [showFormat, setShowFormat] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [modal, setModal] = useState<'games' | 'activities' | 'background' | null>(null);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingSent = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordStartRef = useRef(0);
  const recordConversationRef = useRef<string | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    return () => {
      if (recordTimer.current) clearInterval(recordTimer.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
    ? messages.filter(
        (message) =>
          message.body.toLowerCase().includes(query) ||
          (message.attachment?.name.toLowerCase().includes(query) ?? false),
      )
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

  function applyFormat(prefix: string, suffix: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const selected = text.slice(start, end) || 'texto';
    const next = `${text.slice(0, start)}${prefix}${selected}${suffix}${text.slice(end)}`;
    setText(next);
    setShowFormat(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function pickFiles() {
    fileInputRef.current?.click();
  }

  async function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    for (const file of files) {
      if (file.size > FILE_MAX_BYTES) {
        setToast(`${file.name} supera los ${Math.round(FILE_MAX_BYTES / (1024 * 1024))} MB.`);
        continue;
      }
      await sendAttachment(file, file.name);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setToast('Este equipo no permite grabar audio desde la aplicación.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = 'audio/webm;codecs=opus';
      const options = MediaRecorder.isTypeSupported(preferred) ? { mimeType: preferred } : undefined;
      const recorder = new MediaRecorder(stream, options);
      recordChunks.current = [];
      recordStartRef.current = Date.now();
      recordConversationRef.current = conversation.id;
      recorder.ondataavailable = (chunk) => {
        if (chunk.data.size > 0) recordChunks.current.push(chunk.data);
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      setRecording(true);
      setRecordSeconds(0);
      recorder.start();
      recordTimer.current = setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 250);
    } catch {
      setToast('No pudimos acceder al micrófono. Revisá los permisos del sistema.');
    }
  }

  function stopRecording(send: boolean) {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const duration = (Date.now() - recordStartRef.current) / 1000;
    if (recordTimer.current) clearInterval(recordTimer.current);
    recordTimer.current = null;

    recorder.onstop = () => {
      const blob = new Blob(recordChunks.current, { type: recorder.mimeType || 'audio/webm' });
      recordChunks.current = [];
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setRecordSeconds(0);
      const target = recordConversationRef.current;
      recordConversationRef.current = null;
      if (send && blob.size > 0) {
        if (useApp.getState().activeId !== target) {
          setToast('Se canceló la nota de voz porque cambiaste de conversación.');
        } else {
          void sendAttachment(blob, `nota-de-voz-${Date.now()}.webm`, duration);
        }
      }
    };

    if (recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setRecordSeconds(0);
    }
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
        <ToolButton icon="📁" label="Enviar archivos" onClick={pickFiles} />
        <ToolButton icon="⭐" label="Actividades" onClick={() => setModal('activities')} />
        <ToolButton icon="🎮" label="Juegos" onClick={() => setModal('games')} />
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

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => void onFilesSelected(event)}
      />

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

          <div
            className="messages"
            ref={scrollRef}
            style={backgroundCss(backgrounds[conversation.id]) ? { background: backgroundCss(backgrounds[conversation.id]) } : undefined}
          >
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

                  {message.kind === 'game' && (
                    <div className="nudge-line game-line">{describeGame(message)}</div>
                  )}

                  {message.kind === 'wink' && (
                    <div className="nudge-line wink-line">
                      {winkEmoji(message.body)} {own ? 'Mandaste' : `${author} mandó`} un guiño
                    </div>
                  )}

                  {(message.kind === 'file' || message.kind === 'voice') && (
                    <div className={`message attachment-message ${own ? 'own' : ''}`}>
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
                        {message.attachment ? (
                          <AttachmentView
                            attachment={message.attachment}
                            voice={message.kind === 'voice'}
                          />
                        ) : (
                          <div className="attachment-error">El archivo ya no está disponible.</div>
                        )}
                        {message.body ? (
                          <div className="message-text attachment-caption">
                            {renderRichText(message.body)}
                          </div>
                        ) : null}
                      </div>
                    </div>
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
                        <div className="message-text">{renderRichText(message.body)}</div>
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

            {showFormat && (
              <div className="format-popover">
                {FORMAT_MARKERS.map((format) => (
                  <button
                    key={format.id}
                    type="button"
                    title={format.title}
                    className={`format-${format.id}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyFormat(format.prefix, format.suffix)}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
            )}

            <div className="emoticon-bar">
              <button
                type="button"
                className={`emoticon-btn letter ${showFormat ? 'active' : ''}`}
                title="Formato del texto"
                onClick={() => {
                  setShowFormat((value) => !value);
                  setShowEmoji(false);
                }}
              >
                A
              </button>
              <button
                type="button"
                className="emoticon-btn"
                title="Emoticones"
                onClick={() => {
                  setShowEmoji((value) => !value);
                  setShowFormat(false);
                }}
              >
                🙂
              </button>
              <span className="emoticon-sep" />
              <button
                type="button"
                className={`emoticon-btn wide ${recording ? 'recording' : ''}`}
                title={recording ? 'Grabando una nota de voz' : 'Grabar una nota de voz'}
                onClick={() => {
                  if (recording) stopRecording(true);
                  else void startRecording();
                }}
                disabled={!isOnline}
              >
                🎤 <span>{recording ? 'Grabando…' : 'Nota de voz'}</span>
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
              <button
                type="button"
                className="emoticon-btn"
                title="Fondo de la conversación"
                onClick={() => setModal('background')}
              >
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

            {recording ? (
              <div className="recording-bar">
                <span className="recording-dot" />
                <strong>Grabando…</strong>
                <span className="recording-time">{formatClock(recordSeconds)}</span>
                <span className="recording-hint">Se va a enviar como nota de voz.</span>
                <button type="button" className="mini-button" onClick={() => stopRecording(false)}>
                  Cancelar
                </button>
                <button type="button" className="big-button compact" onClick={() => stopRecording(true)}>
                  Enviar
                </button>
              </div>
            ) : (
              <div className="composer-row">
                <textarea
                  ref={inputRef}
                  rows={3}
                  value={text}
                  placeholder={isOnline ? 'Escribí un mensaje…' : 'Sin conexión…'}
                  onChange={(event) => handleChange(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
                      const key = event.key.toLowerCase();
                      const format = FORMAT_MARKERS.find(
                        (item) =>
                          item.id ===
                          (key === 'b'
                            ? 'bold'
                            : key === 'i'
                              ? 'italic'
                              : key === 'u'
                                ? 'underline'
                                : key === 's'
                                  ? 'strike'
                                  : ''),
                      );
                      if (format) {
                        event.preventDefault();
                        applyFormat(format.prefix, format.suffix);
                        return;
                      }
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  onFocus={() => {
                    setShowEmoji(false);
                    setShowFormat(false);
                  }}
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
            )}
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
        <span className="chat-promo">Escribí :) para sonreír · Emoticones, archivos y notas de voz</span>
        <span>
          {isOnline ? 'En línea' : 'Sin conexión'} · {messages.length} mensaje{messages.length === 1 ? '' : 's'}
        </span>
      </div>

      {modal === 'games' && <GamesModal onClose={() => setModal(null)} />}
      {modal === 'activities' && <ActivitiesModal onClose={() => setModal(null)} />}
      {modal === 'background' && (
        <BackgroundModal conversationId={conversation.id} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function winkEmoji(id: string): string {
  return WINKS.find((wink) => wink.id === id)?.emoji ?? '✨';
}

function describeGame(message: Message): string {
  const author = message.sender?.displayName ?? 'Alguien';
  try {
    const data = JSON.parse(message.body) as { game?: string; values?: number[] };
    if (data.game === 'dice' && Array.isArray(data.values)) {
      return `🎲 ${author} sacó ${data.values.join(' y ')}`;
    }
  } catch {
    // Si el cuerpo no es JSON, mostramos un texto genérico.
  }
  return `🎮 ${author} empezó una partida`;
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
