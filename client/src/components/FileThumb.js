import React, { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import api from '../api';

// The filename in the file cabinet, with a preview on hover. The image is private storage, so
// it is fetched with auth and held as an object URL — and only when someone actually hovers,
// so opening the page does not pull down a preview for every file in the list.
const cache = new Map();

export default function FileThumb({ file }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState(() => cache.get(file.id) || null);
  const timer = useRef();

  const show = () => {
    timer.current = setTimeout(() => setOpen(true), 250);
    if (!file.thumbKey || cache.has(file.id)) return;
    cache.set(file.id, null); // claim it so a second hover does not fetch again
    api.get(`/api/files/${file.id}/thumbnail`, { responseType: 'blob' })
      .then(r => { const u = URL.createObjectURL(r.data); cache.set(file.id, u); setSrc(u); })
      .catch(() => { /* no preview; the glyph stands in */ });
  };

  const hide = () => { clearTimeout(timer.current); setOpen(false); };

  return (
    <span className="thumb-wrap" onMouseEnter={show} onMouseLeave={hide}>
      <span className="strong" style={{ color: 'var(--navy)' }}>{file.filename}</span>
      {open && (
        <span className="thumb-card">
          {src
            ? <img src={src} alt="" />
            : <span className="thumb-glyph"><FileText size={28} strokeWidth={1.5} aria-hidden="true" /></span>}
        </span>
      )}
    </span>
  );
}
