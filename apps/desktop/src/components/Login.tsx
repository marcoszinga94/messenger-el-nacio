import { useState, type FormEvent } from 'react';
import { useApp } from '../store';
import { getServer } from '../session';
import { version } from '../../package.json';
import { Butterfly } from './TitleBar';

type Mode = 'login' | 'register';

export function Login() {
  const login = useApp((state) => state.login);
  const register = useApp((state) => state.register);
  const changeServer = useApp((state) => state.changeServer);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [server, setServerValue] = useState(getServer());
  const [serverSaved, setServerSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register({
          code: code.trim(),
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
          password,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
    } finally {
      setLoading(false);
    }
  }

  function saveServer() {
    changeServer(server);
    setServerValue(getServer());
    setServerSaved(true);
    setTimeout(() => setServerSaved(false), 2500);
  }

  return (
    <div className="login-root">
      <div className="login-window">
        <div className="login-body">
          <aside className="login-hero">
            <div className="hero-logo">
              <Butterfly size={64} />
            </div>
            <h1>Messenger<br />El Nacio</h1>
            <p>Tu mensajería de la institución, con el espíritu de MSN.</p>
            <ul className="hero-list">
              <li>Chats privados y salas de curso</li>
              <li>Contactos, estados y zumbidos</li>
              <li>Funciona en la LAN y desde casa</li>
            </ul>
            <div className="hero-badge">50 alumnos · sin instalar nada más</div>
          </aside>

          <section className="login-form">
            <div className="login-tabs">
              <button
                type="button"
                className={mode === 'login' ? 'active' : ''}
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'active' : ''}
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
              >
                Crear cuenta
              </button>
            </div>

            <form onSubmit={submit} className="login-fields">
              {mode === 'register' && (
                <label>
                  Código de invitación
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    placeholder="HHZM4ZFY"
                    maxLength={12}
                    autoFocus
                  />
                  <small>Pedíselo a tu docente.</small>
                </label>
              )}

              <label>
                Usuario
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="nombre.apellido"
                  autoComplete="username"
                  autoFocus={mode === 'login'}
                />
              </label>

              {mode === 'register' && (
                <label>
                  Nombre para mostrar
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Tu nombre y apellido"
                    maxLength={40}
                  />
                </label>
              )}

              <label>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                {mode === 'register' && <small>Mínimo 8 caracteres.</small>}
              </label>

              {error && <div className="form-error">{error}</div>}

              <button className="big-button" disabled={loading}>
                {loading ? 'Conectando…' : mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}
              </button>
            </form>

            <details className="server-details">
              <summary>Servidor: {server}</summary>
              <div className="server-row">
                <input value={server} onChange={(event) => setServerValue(event.target.value)} />
                <button type="button" className="mini-button" onClick={saveServer}>
                  Guardar
                </button>
              </div>
              {serverSaved && <small className="ok-text">Servidor guardado.</small>}
              <small>Si la institución cambia la dirección, actualizala acá.</small>
            </details>
          </section>
        </div>

        <div className="login-statusbar">
          <span>Messenger El Nacio v{version}</span>
          <span>{server.replace(/^https?:\/\//, '')}</span>
        </div>
      </div>
    </div>
  );
}
