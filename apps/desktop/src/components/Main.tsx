import { useMemo, useState } from 'react';
import type { ContactEntry, PublicUser, UserStatus } from '@nacio/shared';
import { STATUS_LABELS } from '@nacio/shared';
import { version } from '../../package.json';
import { useApp } from '../store';
import { canManageGroup, contactName, conversationPeer, conversationTitle, lastSeenText, statusLabel } from '../utils';
import { MsnLogo, BrandMark, MenuBar, type MenuEntry } from './TitleBar';
import { Chat } from './Chat';
import { AddContactModal, CreateGroupModal, GroupInfoModal, SettingsModal } from './Modals';

type ModalKind = 'add' | 'group' | 'settings' | null;

const STATUS_SECTIONS: { key: string; title: string }[] = [
  { key: 'online', title: 'En línea' },
  { key: 'busy', title: 'Ocupado' },
  { key: 'away', title: 'Ausente' },
  { key: 'offline', title: 'Desconectados' },
];

export function Main() {
  const session = useApp((state) => state.session);
  const contacts = useApp((state) => state.contacts);
  const conversations = useApp((state) => state.conversations);
  const activeId = useApp((state) => state.activeId);
  const connection = useApp((state) => state.connection);
  const openDm = useApp((state) => state.openDm);
  const openConversation = useApp((state) => state.openConversation);
  const acceptContact = useApp((state) => state.acceptContact);
  const rejectContact = useApp((state) => state.rejectContact);
  const updateMe = useApp((state) => state.updateMe);
  const logout = useApp((state) => state.logout);
  const setToast = useApp((state) => state.setToast);
  const sendNudge = useApp((state) => state.sendNudge);
  const blockContact = useApp((state) => state.blockContact);
  const removeContact = useApp((state) => state.removeContact);
  const closeConversation = useApp((state) => state.closeConversation);

  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const me = session?.user;
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const activePeer =
    activeConversation?.type === 'dm' && me ? conversationPeer(activeConversation, me.id) : null;
  const activePeerId = activePeer?.id;

  const accepted = useMemo(
    () => contacts.filter((contact) => contact.state === 'accepted'),
    [contacts],
  );
  const pending = useMemo(
    () => contacts.filter((contact) => contact.state === 'pending' && contact.direction === 'incoming'),
    [contacts],
  );

  const query = search.trim().toLowerCase();
  const filtered = accepted.filter((contact) => {
    if (!query) return true;
    const name = contactName(contact).toLowerCase();
    return (
      name.includes(query) ||
      contact.user.username.toLowerCase().includes(query) ||
      contact.user.displayName.toLowerCase().includes(query)
    );
  });

  const groups = conversations.filter(
    (conversation) =>
      conversation.type === 'group' &&
      (!query || (conversation.name ?? '').toLowerCase().includes(query)),
  );

  const sections = STATUS_SECTIONS.map((section) => ({
    ...section,
    contacts: filtered
      .filter((contact) => contact.user.status === section.key)
      .sort((a, b) => contactName(a).localeCompare(contactName(b), 'es')),
  })).filter((section) => section.contacts.length > 0);

  function unreadForPeer(peerId: string): number {
    if (!me) return 0;
    const conversation = conversations.find(
      (item) => item.type === 'dm' && conversationPeer(item, me.id)?.id === peerId,
    );
    return conversation?.unread ?? 0;
  }

  async function handleOpenContact(contact: ContactEntry) {
    setError('');
    try {
      await openDm(contact.user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el chat.');
    }
  }

  async function handleAccept(contact: ContactEntry) {
    try {
      await acceptContact(contact.user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aceptar.');
    }
  }

  async function handleReject(contact: ContactEntry) {
    try {
      await rejectContact(contact.user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo rechazar.');
    }
  }

  async function changeStatus(status: UserStatus) {
    try {
      await updateMe({ status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function handleBlock(peer: PublicUser) {
    if (!window.confirm(`¿Bloquear a ${peer.displayName}? No va a poder escribirte.`)) return;
    try {
      await blockContact(peer.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'No se pudo bloquear.');
    }
  }

  async function handleRemove(peer: PublicUser) {
    if (!window.confirm(`¿Eliminar a ${peer.displayName} de tus contactos?`)) return;
    try {
      await removeContact(peer.id);
      closeConversation(activeConversation?.id ?? '');
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  }

  if (!me) return null;

  const connectionLabel =
    connection === 'online' ? 'En línea' : connection === 'connecting' ? 'Conectando…' : 'Sin conexión';

  const actionItems: MenuEntry[] = [];
  if (activeConversation) {
    actionItems.push({
      label: 'Mandar un zumbido',
      disabled: connection !== 'online',
      onClick: () => void sendNudge(),
    });
    if (activeConversation.type === 'group' && canManageGroup(activeConversation, me.id)) {
      actionItems.push({
        label: 'Invitar integrante…',
        onClick: () => setMembersGroupId(activeConversation.id),
      });
    }
    actionItems.push({ separator: true });
    actionItems.push({
      label: 'Cerrar conversación',
      onClick: () => closeConversation(activeConversation.id),
    });
    if (activePeer) {
      actionItems.push({ label: 'Bloquear contacto', onClick: () => void handleBlock(activePeer) });
      actionItems.push({ label: 'Eliminar contacto', onClick: () => void handleRemove(activePeer) });
    }
  } else {
    actionItems.push({ label: 'Abrí un chat para ver más acciones', disabled: true });
  }

  const menus: { label: string; items: MenuEntry[] }[] = [
    {
      label: 'Archivo',
      items: [
        { label: 'Agregar contacto…', onClick: () => setModal('add') },
        { label: 'Crear un grupo…', onClick: () => setModal('group') },
        { separator: true },
        { label: 'Cerrar sesión', onClick: () => void logout() },
      ],
    },
    {
      label: 'Editar',
      items: [
        {
          label: 'Buscar contactos',
          onClick: () => document.querySelector<HTMLInputElement>('.sidebar-search input')?.focus(),
        },
        { label: 'Mi perfil y estado…', onClick: () => setModal('settings') },
      ],
    },
    { label: 'Acciones', items: actionItems },
    {
      label: 'Herramientas',
      items: [{ label: 'Ajustes…', onClick: () => setModal('settings') }],
    },
    {
      label: 'Ayuda',
      items: [
        {
          label: 'Acerca de Messenger El Nacio',
          onClick: () => setToast(`Messenger El Nacio ${version} · Mensajería para la institución.`),
        },
      ],
    },
  ];

  return (
    <div className="main-root">
      <MenuBar menus={menus} />

      <div className="shell">
        <aside className="sidebar">
          <div className="brandbar">
            <BrandMark compact />
            <span className={`conn-dot ${connection}`} title={connectionLabel} />
          </div>

          <div className="me-card">
            <button className="me-avatar" onClick={() => setModal('settings')} title="Editar perfil">
              {me.avatar}
            </button>
            <div className="me-info">
              <strong className="me-name">{me.displayName}</strong>
              <select
                className={`status-select ${me.status}`}
                value={me.status}
                onChange={(event) => void changeStatus(event.target.value as UserStatus)}
              >
                {(['online', 'away', 'busy', 'invisible'] as const).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <button className="me-message" onClick={() => setModal('settings')}>
                {me.statusMessage || 'Escribí un mensaje personal…'}
              </button>
            </div>
          </div>

          <div className="sidebar-search">
            <span className="search-glyph">🔍</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar contactos…"
            />
          </div>

          <div className="contact-scroll">
            {error && <div className="sidebar-error">{error}</div>}

            {pending.length > 0 && (
              <section className="contact-section">
                <div className="section-title">
                  Solicitudes <span>{pending.length}</span>
                </div>
                {pending.map((contact) => (
                  <div className="request-row" key={contact.user.id}>
                    <span className="avatar small">{contact.user.avatar}</span>
                    <div className="request-info">
                      <strong>{contact.user.displayName}</strong>
                      <small>@{contact.user.username} quiere agregarte</small>
                    </div>
                    <button className="mini-button ok" onClick={() => void handleAccept(contact)}>
                      Aceptar
                    </button>
                    <button className="mini-button ghost" onClick={() => void handleReject(contact)}>
                      ✕
                    </button>
                  </div>
                ))}
              </section>
            )}

            {groups.length > 0 && (
              <section className="contact-section">
                <div className="section-title">Salas y grupos</div>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    className={`contact-row ${activeId === group.id ? 'active' : ''}`}
                    onClick={() => void openConversation(group.id)}
                  >
                    <span className="avatar small group">{group.avatar ?? '👥'}</span>
                    <span className="contact-meta">
                      <span className="contact-name">{conversationTitle(group, me.id, contacts)}</span>
                      <span className="contact-sub">
                        {group.course ? `Curso ${group.course}` : `${group.members.length} integrantes`}
                      </span>
                    </span>
                    {group.unread > 0 && <span className="unread">{group.unread}</span>}
                  </button>
                ))}
              </section>
            )}

            {sections.map((section) => (
              <section className="contact-section" key={section.key}>
                <div className="section-title">
                  {section.title} <span>{section.contacts.length}</span>
                </div>
                {section.contacts.map((contact) => {
                  const unread = unreadForPeer(contact.user.id);
                  return (
                    <button
                      key={contact.user.id}
                      className={`contact-row ${activePeerId === contact.user.id ? 'active' : ''}`}
                      onClick={() => void handleOpenContact(contact)}
                    >
                      <span className="avatar small">{contact.user.avatar}</span>
                      <span className="contact-meta">
                        <span className="contact-name">{contactName(contact)}</span>
                        <span className="contact-sub">
                          {contact.user.status === 'offline'
                            ? lastSeenText(contact.user.lastSeen)
                            : contact.user.statusMessage || statusLabel(contact.user.status)}
                        </span>
                      </span>
                      {unread > 0 && <span className="unread">{unread}</span>}
                      <span className={`status-dot ${contact.user.status}`} />
                    </button>
                  );
                })}
              </section>
            ))}

            {filtered.length === 0 && groups.length === 0 && pending.length === 0 && (
              <div className="sidebar-empty">
                <p>Todavía no tenés contactos.</p>
                <small>Buscá a tus compañeros por su nombre de usuario.</small>
                <button className="mini-button ok" onClick={() => setModal('add')}>
                  Agregar contacto
                </button>
              </div>
            )}
          </div>

          <footer className="sidebar-footer">
            <button onClick={() => setModal('add')} title="Agregar contacto">
              <span>＋</span>
              <small>Contacto</small>
            </button>
            <button onClick={() => setModal('group')} title="Crear grupo">
              <span>👥</span>
              <small>Grupo</small>
            </button>
            <button onClick={() => setModal('settings')} title="Ajustes">
              <span>⚙</span>
              <small>Ajustes</small>
            </button>
            <button onClick={() => void logout()} title="Cerrar sesión">
              <span>⏻</span>
              <small>Salir</small>
            </button>
          </footer>
        </aside>

        <section className="workspace">
          {activeId ? (
            <Chat onOpenMembers={(id) => setMembersGroupId(id)} onOpenProfile={() => setModal('settings')} />
          ) : (
            <Welcome
              name={me.displayName}
              connection={connectionLabel}
              onAdd={() => setModal('add')}
              onGroup={() => setModal('group')}
            />
          )}
        </section>
      </div>

      {modal === 'add' && <AddContactModal onClose={() => setModal(null)} />}
      {modal === 'group' && <CreateGroupModal onClose={() => setModal(null)} />}
      {modal === 'settings' && (
        <SettingsModal onClose={() => setModal(null)} onDone={(text) => setToast(text)} />
      )}
      {membersGroupId && (
        <GroupInfoModal conversationId={membersGroupId} onClose={() => setMembersGroupId(null)} />
      )}
    </div>
  );
}

function Welcome({
  name,
  connection,
  onAdd,
  onGroup,
}: {
  name: string;
  connection: string;
  onAdd: () => void;
  onGroup: () => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-logo">
        <MsnLogo size={68} />
      </div>
      <h2>Bienvenido, {name}</h2>
      <p className="welcome-sub">
        Elegí un contacto de la lista para empezar a chatear. Estado: <strong>{connection}</strong>
      </p>
      <div className="welcome-cards">
        <button className="welcome-card" onClick={onAdd}>
          <span className="welcome-icon">🔍</span>
          <strong>Agregar contacto</strong>
          <small>Buscá a un compañero por su usuario.</small>
        </button>
        <button className="welcome-card" onClick={onGroup}>
          <span className="welcome-icon">👥</span>
          <strong>Crear un grupo</strong>
          <small>Juntá a varios compañeros en una sala.</small>
        </button>
      </div>
      <div className="welcome-tip">
        💡 Hacé clic en un contacto para abrir el chat. Los mensajes quedan guardados 30 días en el servidor.
      </div>
    </div>
  );
}
