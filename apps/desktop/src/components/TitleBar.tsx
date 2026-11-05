import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function Butterfly({ size = 20 }: { size?: number }) {
  return (
    <svg className="butterfly" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="wing-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9bd6ff" />
          <stop offset=".55" stopColor="#2f8ee8" />
          <stop offset="1" stopColor="#0b4fae" />
        </linearGradient>
        <linearGradient id="wing-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0b4fae" />
          <stop offset=".6" stopColor="#3f9df2" />
          <stop offset="1" stopColor="#a5dcff" />
        </linearGradient>
      </defs>
      <g stroke="#063a80" strokeWidth=".7" strokeLinejoin="round">
        <path
          d="M15.4 13.4C13.6 7.2 9.3 3.2 5.1 4.1 1.2 4.9.6 9.8 3.2 13.1c2 2.6 6.6 4.1 12.2 3.3z"
          fill="url(#wing-a)"
        />
        <path
          d="M16.6 13.4c1.8-6.2 6.1-10.2 10.3-9.3 3.9.8 4.5 5.7 1.9 9-2 2.6-6.6 4.1-12.2 3.3z"
          fill="url(#wing-a)"
        />
        <path
          d="M15.2 18.6c-3.6-1-7.7.3-8.6 3.5-.8 3.1 2.1 5.8 5.1 5 2.3-.6 3.9-3.6 4.6-7.2z"
          fill="url(#wing-b)"
        />
        <path
          d="M16.8 18.6c3.6-1 7.7.3 8.6 3.5.8 3.1-2.1 5.8-5.1 5-2.3-.6-3.9-3.6-4.6-7.2z"
          fill="url(#wing-b)"
        />
      </g>
      <ellipse cx="16" cy="16.4" rx="1.9" ry="7.2" fill="#08356f" />
      <path
        d="M16 9.8c-.9-2.4-2.4-3.7-4.2-4.1M16 9.8c.9-2.4 2.4-3.7 4.2-4.1"
        stroke="#08356f"
        strokeWidth=".9"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark" title="Messenger El Nacio">
      <Butterfly size={22} />
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

export function TitleBar({ title }: { title: string }) {
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
        <Butterfly size={16} />
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
          onClick={() => void run((w) => w.close())}
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
      <Butterfly size={compact ? 18 : 24} />
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
