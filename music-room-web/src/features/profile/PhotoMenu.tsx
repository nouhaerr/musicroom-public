import { useEffect, useId, useRef, useState } from 'react';

export function PhotoMenu({ busy, hasPhoto, onChoose, onRemove }: {
  busy: boolean; hasPhoto: boolean; onChoose: () => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  return <div className="photo-menu" ref={root}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} type="button" className="photo-picker" disabled={busy}
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>Change photo</button>
    {open && <div className="photo-options" id={id}>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); trigger.current?.focus(); onChoose(); }}>Choose a photo</button>
      {hasPhoto && <button type="button" className="remove-photo" disabled={busy} onClick={() => { setOpen(false); trigger.current?.focus(); onRemove(); }}>Remove photo</button>}
    </div>}
  </div>;
}
