import { useEffect, useRef } from 'react';
import './confirm-dialog.css';

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; cancelLabel?: string | null; destructive?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (cancelLabel !== null ? cancelRef.current : confirmRef.current)?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [cancelLabel, onCancel]);
  return <div className="sonora-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="sonora-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sonora-dialog-title" aria-describedby="sonora-dialog-message">
      <span className="sonora-dialog-mark" aria-hidden="true">♫</span>
      <h2 id="sonora-dialog-title">{title}</h2>
      <p id="sonora-dialog-message">{message}</p>
      <div className="sonora-dialog-actions">
        {cancelLabel !== null ? <button ref={cancelRef} type="button" className="sonora-dialog-cancel" onClick={onCancel}>{cancelLabel}</button> : null}
        <button ref={confirmRef} type="button" className={destructive ? 'sonora-dialog-confirm danger' : 'sonora-dialog-confirm'} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}
