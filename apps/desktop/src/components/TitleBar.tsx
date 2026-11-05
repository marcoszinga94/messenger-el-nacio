import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import msnLogo from '../assets/msn-logo.png';

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function MsnLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      className="msn-logo"
      src={msnLogo}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function Wordmark() {
  return (
    <span className="wordmark" title="Messenger El Nacio">
      <MsnLogo size={22} />
      <span className="wordmark-text">nacio</span>
    </span>
  );
}

function Glyph({ kind }: { kind: 'min' | 'max' | 'restore' | 'close' }) {
  if (kind === 'min') {
    return (
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <rect x="2" y="7" width="6" height="1.6" fill="currentColor" />
      </svg>
    );
  }
  if (kind === 'close') {
    return (
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M2.2 2.2 7.8 7.8M7.8 2.2 2.2 7.8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'restore') {
    return (
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3 1.5h5.5V7" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <rect x="1.5" y="3.5" width="5.2" height="5" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.8" y="1.8" width="6.4" height="6.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.8" y="1.8" width="6.4" height="1.9" fill="currentColor" />
    </svg>
  );
}

export function TitleBar({ title, onClose }: { title: string; onClose?: () => void }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!inTauri) return;
    getCurrentWindow()
      .isMaximized()
      .then(setMaximized)
      .catch(() => undefined);
  }, []);

  async function run(action: (appWindow: ReturnType<typeof getCurrentWindow>) => Promise<void>) {
    if (!inTauri) return;
    try {
      await action(getCurrentWindow());
      setMaximized(await getCurrentWindow().isMaximized());
    } catch {
      /* la ventana ya no existe */
    }
  }

  return (
    <header className="titlebar" data-tauri-drag-region onDoubleClick={() => void run((w) => w.toggleMaximize())}>
      <span className="titlebar-icon" data-tauri-drag-region>
        <MsnLogo size={16} />
      </span>
      <span className="titlebar-title" data-tauri-drag-region>
        {title}
      </span>

      <div className="titlebar-buttons">
        <button
          type="button"
          className="tb-btn"
          title="Minimizar"
          onClick={() => void run((w) => w.minimize())}
        >
          <Glyph kind="min" />
        </button>
        <button
          type="button"
          className="tb-btn"
          title={maximized ? 'Restaurar' : 'Maximizar'}
          onClick={() => void run((w) => w.toggleMaximize())}
        >
          <Glyph kind={maximized ? 'restore' : 'max'} />
        </button>
        <button
          type="button"
          className="tb-btn close"
          title="Cerrar"
          onClick={() => {
            if (onClose) onClose();
            else void run((w) => w.close());
          }}
        >
          <Glyph kind="close" />
        </button>
      </div>
    </header>
  );
}

export type MenuEntry =
  | { label: string; onClick?: () => void; disabled?: boolean; checked?: boolean }
  | { separator: true };

export function MenuBar({ menus }: { menus: { label: string; items: MenuEntry[] }[] }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    function close() {
      setOpen(null);
    }
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <nav className="menubar" onMouseDown={(event) => event.stopPropagation()}>
      {menus.map((menu, index) => (
        <div className="menubar-entry" key={menu.label}>
          <button
            type="button"
            className={`menubar-item ${open === index ? 'open' : ''}`}
            onMouseDown={() => setOpen(open === index ? null : index)}
            onMouseEnter={() => {
              if (open !== null) setOpen(index);
            }}
          >
            {menu.label}
          </button>
          {open === index && (
            <div className="menubar-dropdown" role="menu">
              {menu.items.map((item, itemIndex) =>
                'separator' in item ? (
                  <div className="menubar-separator" key={`sep-${itemIndex}`} />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className={`menubar-command ${item.checked ? 'checked' : ''}`}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.onClick?.();
                    }}
                  >
                    <span className="menubar-check">{item.checked ? '✓' : ''}</span>
                    {item.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

export function ResizeHandles() {
  if (!inTauri) return null;
  const sides: { name: string; dir: 'North' | 'South' | 'East' | 'West' | 'NorthEast' | 'NorthWest' | 'SouthEast' | 'SouthWest' }[] = [
    { name: 'n', dir: 'North' },
    { name: 's', dir: 'South' },
    { name: 'e', dir: 'East' },
    { name: 'w', dir: 'West' },
    { name: 'ne', dir: 'NorthEast' },
    { name: 'nw', dir: 'NorthWest' },
    { name: 'se', dir: 'SouthEast' },
    { name: 'sw', dir: 'SouthWest' },
  ];

  return (
    <>
      {sides.map((side) => (
        <div
          key={side.name}
          className={`resize-handle ${side.name}`}
          onMouseDown={(event) => {
            event.preventDefault();
            getCurrentWindow().startResizeDragging(side.dir).catch(() => undefined);
          }}
        />
      ))}
    </>
  );
}

export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <span className={`brand-mark ${compact ? 'compact' : ''}`}>
      <MsnLogo size={compact ? 18 : 24} />
      <span className="brand-mark-text">
        <strong>Messenger</strong>
        <small>El Nacio</small>
      </span>
    </span>
  );
}

export function IconFrame({ children }: { children: ReactNode }) {
  return <span className="icon-frame">{children}</span>;
}
