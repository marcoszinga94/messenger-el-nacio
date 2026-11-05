import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useApp } from './store';
import { Login } from './components/Login';
import { Main } from './components/Main';
import { MsnLogo, ResizeHandles, TitleBar } from './components/TitleBar';
import { conversationTitle } from './utils';
import { CURRENT_VERSION } from './updates';
import './styles.css';

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function App() {
  const session = useApp((state) => state.session);
  const ready = useApp((state) => state.ready);
  const initialize = useApp((state) => state.initialize);
  const nudgeTick = useApp((state) => state.nudgeTick);
  const winkBurst = useApp((state) => state.winkBurst);
  const clearWink = useApp((state) => state.clearWink);
  const update = useApp((state) => state.update);
  const updateDismissed = useApp((state) => state.updateDismissed);
  const checkForUpdates = useApp((state) => state.checkForUpdates);
  const dismissUpdate = useApp((state) => state.dismissUpdate);
  const openUpdate = useApp((state) => state.openUpdate);
  const endSession = useApp((state) => state.endSession);
  const activeId = useApp((state) => state.activeId);
  const conversations = useApp((state) => state.conversations);
  const contacts = useApp((state) => state.contacts);
  const [shake, setShake] = useState(false);
  const closing = useRef(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const appWindow = getCurrentWindow();
        const off = await appWindow.onCloseRequested(async (event) => {
          if (closing.current) return;
          closing.current = true;
          event.preventDefault();
          endSession();
          try {
            await appWindow.close();
          } catch {
            closing.current = false;
          }
        });
        if (cancelled) off();
        else unlisten = off;
      } catch {
        // Fuera de Tauri o sin permiso: la ventana se cierra normalmente.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [endSession]);

  useEffect(() => {
    if (!nudgeTick) return;
    setShake(true);
    const timer = setTimeout(() => setShake(false), 650);
    return () => clearTimeout(timer);
  }, [nudgeTick]);

  useEffect(() => {
    if (!winkBurst) return;
    const timer = setTimeout(clearWink, 2600);
    return () => clearTimeout(timer);
  }, [winkBurst, clearWink]);

  useEffect(() => {
    void checkForUpdates({ silent: true });
    const timer = setInterval(() => void checkForUpdates({ silent: true }), 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [checkForUpdates]);

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-logo">
          <MsnLogo size={84} />
        </div>
        <h1>Messenger El Nacio</h1>
        <p>Conectando…</p>
      </div>
    );
  }

  function requestClose() {
    if (!inTauri) return;
    endSession();
    closing.current = true;
    void getCurrentWindow()
      .close()
      .catch(() => {
        closing.current = false;
      });
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
        <TitleBar title={windowTitle} onClose={requestClose} />
        {update && !updateDismissed && (
          <div className="update-banner">
            <span className="update-banner-icon">⭐</span>
            <span className="update-banner-text">
              Hay una nueva versión de Messenger El Nacio: <strong>v{update.latest}</strong>. Tenés la
              v{CURRENT_VERSION}.
            </span>
            <button type="button" className="mini-button ok" onClick={() => void openUpdate()}>
              Descargar
            </button>
            <button
              type="button"
              className="update-banner-close"
              onClick={dismissUpdate}
              title="Ocultar hasta la próxima versión"
            >
              ×
            </button>
          </div>
        )}
        <div className="window-body">{session ? <Main /> : <Login />}</div>
      </div>
      <ResizeHandles />
      {winkBurst && (
        <div className="wink-overlay" key={winkBurst.id} onClick={clearWink}>
          <div className="wink-overlay-emoji">{winkBurst.emoji}</div>
          <div className="wink-overlay-text">{winkBurst.displayName} te mandó un guiño</div>
        </div>
      )}
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
