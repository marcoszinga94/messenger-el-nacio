import { useEffect, useState } from 'react';
import { useApp } from './store';
import { Login } from './components/Login';
import { Main } from './components/Main';
import { Butterfly, ResizeHandles, TitleBar } from './components/TitleBar';
import { conversationTitle } from './utils';
import './styles.css';

export function App() {
  const session = useApp((state) => state.session);
  const ready = useApp((state) => state.ready);
  const initialize = useApp((state) => state.initialize);
  const nudgeTick = useApp((state) => state.nudgeTick);
  const activeId = useApp((state) => state.activeId);
  const conversations = useApp((state) => state.conversations);
  const contacts = useApp((state) => state.contacts);
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
        <div className="splash-logo">
          <Butterfly size={84} />
        </div>
        <h1>Messenger El Nacio</h1>
        <p>Conectando…</p>
      </div>
    );
  }

  const activeConversation = activeId
    ? conversations.find((conversation) => conversation.id === activeId)
    : undefined;
  const windowTitle = session
    ? activeConversation
      ? `${conversationTitle(activeConversation, session.user.id, contacts)} - Conversación`
      : 'Messenger El Nacio'
    : 'Iniciar sesión - Messenger El Nacio';

  return (
    <div className={`app-root ${shake ? 'shake' : ''}`}>
      <div className="window-frame">
        <TitleBar title={windowTitle} />
        <div className="window-body">{session ? <Main /> : <Login />}</div>
      </div>
      <ResizeHandles />
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
