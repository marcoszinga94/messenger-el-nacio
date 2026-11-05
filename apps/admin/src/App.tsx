import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AdminSettings, AdminStats, AuditEntry, Invite, Me } from '@nacio/shared';
import { getSession, login, logout, request, setSession, type Session } from './api';


type Tab = 'resumen' | 'usuarios' | 'invitaciones' | 'salas' | 'ajustes' | 'auditoria';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: '▦' },
  { id: 'usuarios', label: 'Usuarios', icon: '👥' },
  { id: 'invitaciones', label: 'Invitaciones', icon: '🎟️' },
  { id: 'salas', label: 'Salas y grupos', icon: '🏫' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️' },
  { id: 'auditoria', label: 'Auditoría', icon: '🧾' },
];

const ACTION_LABELS: Record<string, string> = {
  'user.update': 'Usuario actualizado',
  'user.reset_password': 'Contraseña restablecida',
  'invite.create': 'Invitación creada',
  'invite.revoke': 'Invitación revocada',
  'conversation.delete': 'Conversación eliminada',
  'room.create': 'Sala creada',
  'settings.update': 'Ajustes modificados',
};

function formatDate(value: number | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function App() {
  const [session, setLocalSession] = useState<Session | null>(getSession());

  if (!session) {
    return <LoginView onLogin={setLocalSession} />;
  }

  return (
    <Panel
      session={session}
      onSession={setLocalSession}
      onLogout={() => {
        void logout();
        setSession(null);
        setLocalSession(null);
      }}
    />
  );
}

function LoginView({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const next = await login(username.trim(), password);
      onLogin(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="login-logo">💬</span>
          <div>
            <h1>Messenger El Nacio</h1>
            <p>Panel de administración</p>
          </div>
        </div>

        <label>
          Usuario
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            placeholder="administrador"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>

        {error && <div className="alert error">{error}</div>}

        <button className="btn primary wide" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar al panel'}
        </button>
        <p className="login-foot">Solo cuentas con rol de administrador.</p>
      </form>
    </div>
  );
}

function Panel({
  session,
  onLogout,
  onSession,
}: {
  session: Session;
  onLogout: () => void;
  onSession: (session: Session) => void;
}) {
  const [tab, setTab] = useState<Tab>('resumen');

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">💬</span>
          <div>
            <strong>El Nacio</strong>
            <small>Administración</small>
          </div>
        </div>

        <nav>
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{session.user.avatar}</div>
          <div className="user-meta">
            <strong>{session.user.displayName}</strong>
            <small>@{session.user.username}</small>
          </div>
          <button className="icon-btn" title="Salir" onClick={onLogout}>
            ⎋
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h2>{TABS.find((t) => t.id === tab)?.label}</h2>
            <p>Servidor de mensajería de la institución</p>
          </div>
          <span className="pill online">● En línea</span>
        </header>

        {tab === 'resumen' && <Dashboard />}
        {tab === 'usuarios' && <Users onSession={onSession} />}
        {tab === 'invitaciones' && <Invites />}
        {tab === 'salas' && <Rooms />}
        {tab === 'ajustes' && <Settings />}
        {tab === 'auditoria' && <Audit />}
      </main>
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    request<{ stats: AdminStats }>('/api/admin/stats')
      .then((data) => setStats(data.stats))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!stats) return <div className="muted">Cargando…</div>;

  const cards = [
    { label: 'Usuarios registrados', value: stats.users, icon: '👥' },
    { label: 'Conectados ahora', value: stats.online, icon: '🟢' },
    { label: 'Mensajes hoy', value: stats.messagesToday, icon: '✉️' },
    { label: 'Conversaciones', value: stats.conversations, icon: '💬' },
    { label: 'Mensajes totales', value: stats.messagesTotal, icon: '🗂️' },
    { label: 'Invitaciones activas', value: stats.invitesActive, icon: '🎟️' },
  ];

  return (
    <>
      <div className="cards">
        {cards.map((card) => (
          <div className="stat-card" key={card.label}>
            <span className="stat-icon">{card.icon}</span>
            <div>
              <strong>{card.value.toLocaleString('es-AR')}</strong>
              <small>{card.label}</small>
            </div>
          </div>
        ))}
      </div>

      <section className="panel">
        <h3>Cómo arrancar</h3>
        <ol className="steps">
          <li>Creá una invitación por curso en <strong>Invitaciones</strong> y compartí el código.</li>
          <li>Los alumnos se registran desde el cliente con ese código.</li>
          <li>Armá las salas oficiales en <strong>Salas y grupos</strong> para cada división.</li>
          <li>Revisá el uso y los bloqueos desde <strong>Usuarios</strong>.</li>
        </ol>
        <p className="muted small">
          El historial se borra automáticamente según la retención configurada en Ajustes.
        </p>
      </section>
    </>
  );
}

interface AdminUser extends Me {
  banned: boolean;
  online: boolean;
}

function Users({ onSession }: { onSession: (session: Session) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetInfo, setResetInfo] = useState<{ username: string; password: string } | null>(null);

  async function load(q = query) {
    try {
      const data = await request<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios.');
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(query), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function patch(user: AdminUser, body: Record<string, unknown>) {
    setError('');
    try {
      await request(`/api/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setNotice('Cambios guardados.');
      await load();
      setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar.');
    }
  }

  async function reset(user: AdminUser) {
    if (!window.confirm(`¿Restablecer la contraseña de @${user.username}? Se cerrarán sus sesiones.`)) return;
    setError('');
    try {
      const data = await request<{ password: string }>(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
      });
      setResetInfo({ username: user.username, password: data.password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer.');
    }
  }

  async function refreshSession() {
    try {
      const data = await request<{ user: Me }>('/api/me');
      onSession({ ...getSession()!, user: data.user });
    } catch {
      // Sin cambios.
    }
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por usuario o nombre…"
        />
        <button className="btn" onClick={() => void load()}>
          Actualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Alta</th>
              <th className="right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={user.banned ? 'row-banned' : ''}>
                <td>
                  <span className="cell-user">
                    <span className="mini-avatar">{user.avatar}</span>@{user.username}
                  </span>
                </td>
                <td>{user.displayName}</td>
                <td>
                  <span className={`badge ${user.role === 'admin' ? 'admin' : ''}`}>
                    {user.role === 'admin' ? 'Admin' : 'Alumno'}
                  </span>
                </td>
                <td>
                  {user.banned ? (
                    <span className="badge danger">Bloqueado</span>
                  ) : user.online ? (
                    <span className="badge online">En línea</span>
                  ) : (
                    <span className="badge">Desconectado</span>
                  )}
                </td>
                <td className="muted small">{formatDate(user.createdAt)}</td>
                <td className="right actions">
                  <button className="btn tiny" onClick={() => void patch(user, { banned: !user.banned })}>
                    {user.banned ? 'Desbloquear' : 'Bloquear'}
                  </button>
                  <button
                    className="btn tiny"
                    onClick={() => {
                      if (user.id === getSession()?.user.id) {
                        setError('No podés cambiarte el rol a vos mismo.');
                        return;
                      }
                      void patch(user, { role: user.role === 'admin' ? 'student' : 'admin' });
                    }}
                  >
                    {user.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                  </button>
                  <button className="btn tiny" onClick={() => void reset(user)}>
                    Resetear clave
                  </button>
                  {user.id === getSession()?.user.id && (
                    <button className="btn tiny ghost" onClick={() => void refreshSession()}>
                      Refrescar sesión
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No hay usuarios para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resetInfo && (
        <Modal title="Contraseña temporal" onClose={() => setResetInfo(null)}>
          <p>
            Pasale esta contraseña a <strong>@{resetInfo.username}</strong>. La va a tener que cambiar al entrar.
          </p>
          <div className="code-box">
            <code>{resetInfo.password}</code>
            <button className="btn small" onClick={() => void copyText(resetInfo.password)}>
              Copiar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Invites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [course, setCourse] = useState('');
  const [maxUses, setMaxUses] = useState(30);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const data = await request<{ invites: Invite[] }>('/api/admin/invites');
      setInvites(data.invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar invitaciones.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await request('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ course, maxUses, expiresInDays: days }),
      });
      setCourse('');
      setNotice('Invitación creada.');
      await load();
      setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la invitación.');
    }
  }

  async function revoke(invite: Invite) {
    if (!window.confirm(`¿Revocar el código ${invite.code}?`)) return;
    try {
      await request(`/api/admin/invites/${invite.code}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revocar.');
    }
  }

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <section className="panel">
        <h3>Nueva invitación</h3>
        <form className="inline-form" onSubmit={create}>
          <label>
            Curso
            <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="1A Turno Mañana" />
          </label>
          <label>
            Usos
            <input
              type="number"
              min={1}
              max={500}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
            />
          </label>
          <label>
            Vence en (días)
            <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </label>
          <button className="btn primary">Crear código</button>
        </form>
      </section>

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Curso</th>
              <th>Usos</th>
              <th>Vence</th>
              <th>Estado</th>
              <th className="right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => {
              const expired = invite.expiresAt !== null && invite.expiresAt < Date.now();
              const exhausted = invite.uses >= invite.maxUses;
              return (
                <tr key={invite.code}>
                  <td>
                    <code className="invite-code">{invite.code}</code>
                  </td>
                  <td>{invite.course || <span className="muted">—</span>}</td>
                  <td>
                    {invite.uses}/{invite.maxUses}
                  </td>
                  <td className="muted small">{formatDate(invite.expiresAt)}</td>
                  <td>
                    {invite.revoked ? (
                      <span className="badge danger">Revocada</span>
                    ) : expired ? (
                      <span className="badge">Vencida</span>
                    ) : exhausted ? (
                      <span className="badge">Agotada</span>
                    ) : (
                      <span className="badge online">Activa</span>
                    )}
                  </td>
                  <td className="right actions">
                    <button className="btn tiny" onClick={() => void copyText(invite.code)}>
                      Copiar
                    </button>
                    {!invite.revoked && (
                      <button className="btn tiny danger" onClick={() => void revoke(invite)}>
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {invites.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Todavía no hay invitaciones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface AdminConversation {
  id: string;
  type: string;
  name: string | null;
  course: string;
  isOfficial: boolean;
  createdAt: number;
  memberCount: number;
  messageCount: number;
}

function Rooms() {
  const [rooms, setRooms] = useState<AdminConversation[]>([]);
  const [name, setName] = useState('');
  const [course, setCourse] = useState('');
  const [topic, setTopic] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const data = await request<{ conversations: AdminConversation[] }>('/api/admin/conversations?type=group');
      setRooms(data.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar salas.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await request('/api/admin/rooms', {
        method: 'POST',
        body: JSON.stringify({ name, course, topic }),
      });
      setName('');
      setCourse('');
      setTopic('');
      setNotice('Sala creada. Agregá integrantes desde el cliente o la API.');
      await load();
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sala.');
    }
  }

  async function remove(room: AdminConversation) {
    if (!window.confirm(`¿Eliminar "${room.name}" y todo su historial?`)) return;
    try {
      await request(`/api/admin/conversations/${room.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  }

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <section className="panel">
        <h3>Nueva sala oficial</h3>
        <form className="inline-form" onSubmit={create}>
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="1A Turno Mañana" required />
          </label>
          <label>
            Curso (para invitaciones)
            <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="1A" />
          </label>
          <label>
            Descripción
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Sala del curso" />
          </label>
          <button className="btn primary">Crear sala</button>
        </form>
        <p className="muted small">
          Los alumnos que se registren con una invitación del mismo curso entran automáticamente a esta sala.
        </p>
      </section>

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sala</th>
              <th>Tipo</th>
              <th>Curso</th>
              <th>Integrantes</th>
              <th>Mensajes</th>
              <th>Creada</th>
              <th className="right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.name ?? <span className="muted">Sin nombre</span>}</td>
                <td>{room.isOfficial ? <span className="badge admin">Oficial</span> : <span className="badge">Grupo</span>}</td>
                <td>{room.course || <span className="muted">—</span>}</td>
                <td>{room.memberCount}</td>
                <td>{room.messageCount}</td>
                <td className="muted small">{formatDate(room.createdAt)}</td>
                <td className="right actions">
                  <button className="btn tiny danger" onClick={() => void remove(room)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No hay salas creadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Settings() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    request<{ settings: AdminSettings }>('/api/admin/settings')
      .then((data) => setSettings(data.settings))
      .catch((err: Error) => setError(err.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError('');
    try {
      const data = await request<{ settings: AdminSettings }>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setSettings(data.settings);
      setNotice('Ajustes guardados.');
      setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  }

  async function changePassword() {
    setError('');
    if (newPassword.length < 8) {
      setError('La contraseña nueva necesita al menos 8 caracteres.');
      return;
    }
    try {
      await request('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setNotice('Contraseña cambiada. Iniciá sesión de nuevo.');
      setSession(null);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    }
  }

  if (!settings) return error ? <div className="alert error">{error}</div> : <div className="muted">Cargando…</div>;

  return (
    <form className="panel form-panel" onSubmit={save}>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <label>
        Nombre de la aplicación
        <input
          value={settings.appName}
          onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
        />
      </label>

      <label>
        Días de retención del historial
        <input
          type="number"
          min={1}
          max={3650}
          value={settings.retentionDays}
          onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
        />
        <small className="muted">Los mensajes más viejos se borran automáticamente cada 6 horas.</small>
      </label>

      <label>
        Máximo de integrantes por grupo
        <input
          type="number"
          min={2}
          max={200}
          value={settings.maxGroupSize}
          onChange={(e) => setSettings({ ...settings, maxGroupSize: Number(e.target.value) })}
        />
      </label>

      <label className="switch">
        <input
          type="checkbox"
          checked={settings.registrationEnabled}
          onChange={(e) => setSettings({ ...settings, registrationEnabled: e.target.checked })}
        />
        Permitir registro con código de invitación
      </label>

      <div>
        <button className="btn primary">Guardar ajustes</button>
      </div>

      <hr className="sep" />

      <h3>Mi contraseña</h3>
      <label>
        Contraseña actual
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <label>
        Contraseña nueva
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <div>
        <button type="button" className="btn" disabled={!currentPassword || !newPassword} onClick={() => void changePassword()}>
          Cambiar contraseña
        </button>
      </div>
    </form>
  );
}

function Audit() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    request<{ entries: AuditEntry[] }>('/api/admin/audit')
      .then((data) => setEntries(data.entries))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <div className="alert error">{error}</div>;

  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Quién</th>
            <th>Acción</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="muted small">{formatDate(entry.createdAt)}</td>
              <td>{entry.actorName ?? <span className="muted">Sistema</span>}</td>
              <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
              <td className="muted small detail">{entry.detail ?? '—'}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">
                Sin movimientos registrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
