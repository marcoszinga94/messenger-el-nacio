import { useEffect, useState } from 'react';
import { useApp } from './store';
import { Login } from './components/Login';
import { Main } from './components/Main';
import './styles.css';

export function App() {
  const session = useApp((state) => state.session);
  const ready = useApp((state) => state.ready);
  const initialize = useApp((state) => state.initialize);
  const nudgeTick = useApp((state) => state.nudgeTick);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!nudgeTick) return;
    setShake(true);
    const timer = setTimeout(() => setShake(false), 650);
    return () => clearTimeout(timer);
  }, [nudgeTick]);

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-logo">💬</div>
        <h1>Messenger El Nacio</h1>
        <p>Conectando…</p>
      </div>
    );
  }

  return (
    <div className={`app-root ${shake ? 'shake' : ''}`}>
      {session ? <Main /> : <Login />}
      <Toast />
    </div>
  );
}

function Toast() {
  const toast = useApp((state) => state.toast);
  const clear = useApp((state) => state.clearToast);
  if (!toast) return null;
  return (
    <button className="toast" key={toast.id} onClick={clear}>
      {toast.text}
    </button>
  );
}
