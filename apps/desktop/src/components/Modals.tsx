import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { ContactEntry, ConversationSummary, SearchResult } from '@nacio/shared';
import { AVATARS } from '@nacio/shared';
import { api } from '../api';
import { getServer } from '../session';
import { useApp } from '../store';
import { contactName, conversationPeer, conversationTitle } from '../utils';

export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}

export function AddContactModal({ onClose }: { onClose: () => void }) {
  const addContact = useApp((state) => state.addContact);
  const setToast = useApp((state) => state.setToast);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api<{ results: SearchResult[] }>(`/api/users/search?q=${encodeURIComponent(term)}`);
        setResults(data.results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo buscar.');
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function add(result: SearchResult) {
    setError('');
    try {
      await addContact(result.user.username);
      setSent((current) => new Set(current).add(result.user.id));
      setToast(`Solicitud enviada a ${result.user.displayName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar.');
    }
  }

  return (
    <Modal title="Agregar contacto" onClose={onClose}>
      <p className="modal-help">Buscá por nombre de usuario o por nombre y apellido.</p>
      <input
        className="modal-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ej.: juan.perez"
        autoFocus
      />
      {error && <div className="form-error">{error}</div>}

      <div className="search-results">
        {loading && <div className="muted small">Buscando…</div>}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <div className="muted small">No encontramos a nadie con ese nombre.</div>
        )}
        {results.map((result) => {
          const relation = result.relation;
          const alreadySent = sent.has(result.user.id);
          return (
            <div className="search-row" key={result.user.id}>
              <span className="avatar small">{result.user.avatar}</span>
              <div className="search-info">
                <strong>{result.user.displayName}</strong>
                <small>@{result.user.username}</small>
              </div>
              {relation === 'accepted' ? (
                <span className="badge ok">Ya es contacto</span>
              ) : relation === 'pending' ? (
                <span className="badge">Pendiente</span>
              ) : relation === 'blocked' ? (
                <span className="badge danger">Bloqueado</span>
              ) : alreadySent ? (
                <span className="badge ok">Enviado</span>
              ) : (
                <button className="mini-button ok" onClick={() => void add(result)}>
                  Agregar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const contacts = useApp((state) => state.contacts);
  const createGroup = useApp((state) => state.createGroup);
  const setToast = useApp((state) => state.setToast);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const accepted = useMemo(
    () => contacts.filter((contact) => contact.state === 'accepted'),
    [contacts],
  );
  const filtered = accepted.filter((contact) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      contactName(contact).toLowerCase().includes(term) ||
      contact.user.username.toLowerCase().includes(term)
    );
  });

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || selected.size === 0) return;
    setError('');
    setLoading(true);
    try {
      await createGroup(name.trim(), topic.trim(), [...selected]);
      setToast('Grupo creado.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el grupo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Crear un grupo" onClose={onClose}>
      <form onSubmit={submit} className="modal-form">
        <label>
          Nombre del grupo
          <input
            className="modal-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej.: 1A Turno Mañana"
            maxLength={40}
            autoFocus
          />
        </label>
        <label>
          Descripción (opcional)
          <input
            className="modal-input"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="De qué se habla en el grupo"
            maxLength={120}
          />
        </label>
        <label>
          Buscar compañeros
          <input
            className="modal-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filtrar contactos…"
          />
        </label>

        <div className="member-picker">
          {filtered.length === 0 && (
            <div className="muted small">Primero agregá contactos para poder armar un grupo.</div>
          )}
          {filtered.map((contact) => (
            <label className="member-row" key={contact.user.id}>
              <input
                type="checkbox"
                checked={selected.has(contact.user.id)}
                onChange={() => toggle(contact.user.id)}
              />
              <span className="avatar tiny">{contact.user.avatar}</span>
              <span className="member-name">{contactName(contact)}</span>
              <small>@{contact.user.username}</small>
            </label>
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="mini-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="big-button compact" disabled={loading || !name.trim() || selected.size === 0}>
            {loading ? 'Creando…' : `Crear grupo (${selected.size})`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SettingsModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const session = useApp((state) => state.session);
  const updateMe = useApp((state) => state.updateMe);
  const soundOn = useApp((state) => state.soundOn);
  const setSound = useApp((state) => state.setSound);
  const clearHistoryLocal = useApp((state) => state.clearHistoryLocal);
  const logout = useApp((state) => state.logout);
  const changeServer = useApp((state) => state.changeServer);

  const [displayName, setDisplayName] = useState(session?.user.displayName ?? '');
  const [avatar, setAvatar] = useState(session?.user.avatar ?? '🐱');
  const [statusMessage, setStatusMessage] = useState(session?.user.statusMessage ?? '');
  const [server, setServer] = useState(getServer());
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!session) return null;
  const me = session.user;

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updateMe({
        displayName: displayName.trim() || me.displayName,
        avatar,
        statusMessage: statusMessage.trim(),
      });
      onDone('Perfil actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('La contraseña nueva necesita al menos 8 caracteres.');
      return;
    }
    try {
      await api('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onDone('Contraseña cambiada. Volvé a iniciar sesión.');
      setTimeout(() => void logout(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    }
  }

  function saveServerUrl() {
    changeServer(server);
    setServer(getServer());
    onDone('Servidor guardado. Cerrá sesión y volvé a entrar.');
  }

  return (
    <Modal title="Ajustes" onClose={onClose} wide>
      {error && <div className="form-error">{error}</div>}

      <section className="settings-section">
        <h3>Mi perfil</h3>
        <form onSubmit={saveProfile} className="modal-form">
          <label>
            Nombre para mostrar
            <input
              className="modal-input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={40}
            />
          </label>
          <label>
            Mensaje personal
            <input
              className="modal-input"
              value={statusMessage}
              onChange={(event) => setStatusMessage(event.target.value)}
              placeholder="Ej.: estudiando para el examen"
              maxLength={140}
            />
          </label>
          <div>
            <span className="field-label">Avatar</span>
            <div className="avatar-grid">
              {AVATARS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`avatar-option ${avatar === item ? 'selected' : ''}`}
                  onClick={() => setAvatar(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button className="big-button compact" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar perfil'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section">
        <h3>Sonido y datos</h3>
        <label className="switch-row">
          <input type="checkbox" checked={soundOn} onChange={(event) => setSound(event.target.checked)} />
          Reproducir sonidos de mensajes y zumbidos
        </label>
        <div className="settings-row">
          <button
            className="mini-button"
            onClick={() => {
              if (window.confirm('¿Borrar todo el historial guardado en esta PC?')) {
                void clearHistoryLocal();
              }
            }}
          >
            Borrar historial local
          </button>
          <small className="muted">Los mensajes del servidor se conservan 30 días.</small>
        </div>
      </section>

      <section className="settings-section">
        <h3>Servidor</h3>
        <div className="server-row">
          <input className="modal-input" value={server} onChange={(event) => setServer(event.target.value)} />
          <button type="button" className="mini-button" onClick={saveServerUrl}>
            Guardar
          </button>
        </div>
        <small className="muted">
          Actual: {getServer()}. Si cambiás de servidor tenés que volver a iniciar sesión.
        </small>
      </section>

      <section className="settings-section">
        <h3>Cambiar contraseña</h3>
        <form onSubmit={changePassword} className="modal-form">
          <label>
            Contraseña actual
            <input
              className="modal-input"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            Contraseña nueva
            <input
              className="modal-input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <div className="modal-actions">
            <button className="mini-button" disabled={!currentPassword || !newPassword}>
              Cambiar contraseña
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section">
        <h3>Sesión</h3>
        <div className="settings-row">
          <button className="mini-button danger" onClick={() => void logout()}>
            Cerrar sesión
          </button>
          <small className="muted">Usuario: @{me.username}</small>
        </div>
        <small className="muted">Messenger El Nacio v0.1 · Tauri + React</small>
      </section>
    </Modal>
  );
}

export function GroupInfoModal({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const session = useApp((state) => state.session);
  const conversations = useApp((state) => state.conversations);
  const contacts = useApp((state) => state.contacts);
  const addGroupMembers = useApp((state) => state.addGroupMembers);
  const setToast = useApp((state) => state.setToast);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const conversation = conversations.find((item) => item.id === conversationId);
  const me = session?.user;

  if (!conversation || !me) return null;

  const groupId = conversation.id;
  const memberIds = new Set(conversation.members.map((member) => member.user.id));
  const candidates = contacts.filter(
    (contact) => contact.state === 'accepted' && !memberIds.has(contact.user.id),
  );
  const myRole = conversation.members.find((member) => member.user.id === me.id)?.role;
  const canAdd = myRole === 'owner' || myRole === 'admin';
  const peer = conversationPeer(conversation, me.id);

  async function add() {
    if (selected.size === 0) return;
    setError('');
    setLoading(true);
    try {
      await addGroupMembers(groupId, [...selected]);
      setSelected(new Set());
      setToast('Integrantes agregados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron agregar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={conversationTitle(conversation, me.id, contacts)} onClose={onClose} wide>
      <p className="modal-help">
        {conversation.type === 'group'
          ? `${conversation.members.length} integrantes${conversation.course ? ` · Curso ${conversation.course}` : ''}`
          : `Chat privado con ${peer?.displayName ?? 'un contacto'}`}
      </p>

      <section className="settings-section">
        <h3>Integrantes</h3>
        <div className="member-list">
          {conversation.members.map((member) => (
            <div className="member-row static" key={member.user.id}>
              <span className="avatar tiny">{member.user.avatar}</span>
              <span className="member-name">{member.user.displayName}</span>
              <small>@{member.user.username}</small>
              {member.role === 'owner' && <span className="badge">Dueño</span>}
              {member.role === 'admin' && <span className="badge">Admin</span>}
            </div>
          ))}
        </div>
      </section>

      {canAdd && (
        <section className="settings-section">
          <h3>Agregar integrantes</h3>
          {candidates.length === 0 ? (
            <div className="muted small">Todos tus contactos ya están en el grupo.</div>
          ) : (
            <div className="member-picker">
              {candidates.map((contact) => (
                <label className="member-row" key={contact.user.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(contact.user.id)}
                    onChange={() => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(contact.user.id)) next.delete(contact.user.id);
                        else next.add(contact.user.id);
                        return next;
                      });
                    }}
                  />
                  <span className="avatar tiny">{contact.user.avatar}</span>
                  <span className="member-name">{contactName(contact)}</span>
                  <small>@{contact.user.username}</small>
                </label>
              ))}
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button className="big-button compact" disabled={loading || selected.size === 0} onClick={() => void add()}>
              {loading ? 'Agregando…' : `Agregar (${selected.size})`}
            </button>
          </div>
        </section>
      )}
    </Modal>
  );
}
