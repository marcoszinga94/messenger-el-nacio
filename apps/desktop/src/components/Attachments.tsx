import { useEffect, useState } from 'react';
import type { Attachment } from '@nacio/shared';
import { downloadAttachment } from '../api';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useAttachmentBlob(id: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setError('');
    downloadAttachment(id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'No se pudo abrir el archivo.');
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return { url, error };
}

export function AttachmentView({
  attachment,
  voice,
}: {
  attachment: Attachment;
  voice: boolean;
}) {
  const { url, error } = useAttachmentBlob(attachment.id);
  const [expanded, setExpanded] = useState(false);

  if (error) return <div className="attachment-error">{error}</div>;
  if (!url) return <div className="attachment-loading">Cargando archivo…</div>;

  if (voice || attachment.mime.startsWith('audio/')) {
    return (
      <div className="voice-note">
        <span className="voice-icon">🎤</span>
        <audio controls src={url} preload="metadata" />
        {attachment.duration ? (
          <span className="voice-duration">{formatDuration(attachment.duration)}</span>
        ) : null}
      </div>
    );
  }

  if (attachment.mime.startsWith('image/')) {
    return (
      <>
        <button type="button" className="image-attachment" onClick={() => setExpanded(true)}>
          <img src={url} alt={attachment.name} loading="lazy" />
        </button>
        {expanded && (
          <div className="image-lightbox" onMouseDown={() => setExpanded(false)}>
            <div className="image-lightbox-inner" onMouseDown={(event) => event.stopPropagation()}>
              <img src={url} alt={attachment.name} />
              <div className="image-lightbox-bar">
                <span>{attachment.name}</span>
                <a href={url} download={attachment.name}>
                  Descargar
                </a>
                <button type="button" onClick={() => setExpanded(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="file-attachment">
      <span className="file-icon">📄</span>
      <span className="file-info">
        <strong>{attachment.name}</strong>
        <small>{formatSize(attachment.size)}</small>
      </span>
      <a className="mini-button" href={url} download={attachment.name}>
        Descargar
      </a>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
