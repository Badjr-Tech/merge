import React, { useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { usePlan } from '../context/PlanContext';

// Per-project rich-text notes in a collapsible right-hand drawer. Saves automatically.
export default function NotesDrawer({ projectId, initialNotes, open, onClose, canEdit }) {
  const toast = useToast();
  const { has } = usePlan();
  const ref = useRef();
  const [status, setStatus] = useState('saved'); // saved | dirty | saving | error
  const timer = useRef();
  const lastSaved = useRef(initialNotes || '');
  const [width, setWidth] = useState(() => { try { return Math.min(Math.max(parseInt(localStorage.getItem('notesWidth') || '400', 10), 300), 900); } catch { return 400; } });
  const dragging = useRef(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--notes-w', `${width}px`);
    try { localStorage.setItem('notesWidth', String(width)); } catch { /* ignore */ }
  }, [width]);

  const startDrag = (e) => {
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add('notes-resizing');
    const onMove = (ev) => {
      if (!dragging.current) return;
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      setWidth(Math.min(Math.max(window.innerWidth - x, 300), Math.min(900, window.innerWidth - 240)));
    };
    const onUp = () => { dragging.current = false; document.body.classList.remove('notes-resizing'); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); window.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', onUp);
  };

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (initialNotes || '')) ref.current.innerHTML = initialNotes || '';
    lastSaved.current = initialNotes || '';
  }, [projectId, initialNotes]);

  useEffect(() => {
    document.body.classList.toggle('notes-open', open);
    return () => document.body.classList.remove('notes-open');
  }, [open]);

  const save = async () => {
    const html = ref.current ? ref.current.innerHTML : '';
    if (html === lastSaved.current) { setStatus('saved'); return; }
    setStatus('saving');
    try {
      const res = await api.put(`/api/projects/${projectId}/notes`, { notes: html });
      lastSaved.current = res.data.notes;
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      toast.error(errorMessage(err, 'Could not save notes.'));
    }
  };

  const onInput = () => {
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 900);
  };

  useEffect(() => () => { clearTimeout(timer.current); }, []);

  const cmd = (command, value) => { document.execCommand(command, false, value); ref.current && ref.current.focus(); onInput(); };
  const addLink = () => { const url = window.prompt('Link address (https://…)'); if (url) cmd('createLink', url); };

  return (
    <aside className={`notes-drawer ${open ? 'open' : ''}`} aria-label="Grant notes" aria-hidden={!open} style={{ width }}>
      <div className="notes-resize" onMouseDown={startDrag} onTouchStart={startDrag} title="Drag to resize" role="separator" aria-orientation="vertical" />
      <div className="notes-head">
        <div>
          <div className="strong" style={{ color: 'var(--navy)' }}>Grant notes</div>
          <div className="tiny muted">{status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved changes' : status === 'error' ? 'Not saved' : 'Saved'}</div>
        </div>
        <button className="close-x" onClick={onClose} aria-label="Collapse notes">›</button>
      </div>
      {!has('notes') ? (
        <div className="notes-body"><div className="callout callout-gold small">Notes are included in paid plans.</div></div>
      ) : (
        <>
          {canEdit && (
            <div className="notes-toolbar" role="toolbar" aria-label="Formatting">
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd('formatBlock', 'h3')} title="Heading">H</button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd('bold')} title="Bold"><b>B</b></button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd('italic')} title="Italic"><i>I</i></button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd('underline')} title="Underline"><u>U</u></button>
              <span className="sep" />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd('insertUnorderedList')} title="Bulleted list">• List</button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd('insertOrderedList')} title="Numbered list">1. List</button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd('formatBlock', 'blockquote')} title="Quote">❝</button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={addLink} title="Link">Link</button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => cmd('formatBlock', 'p')} title="Plain paragraph">¶</button>
            </div>
          )}
          <div
            ref={ref}
            className="notes-body notes-editor prose"
            contentEditable={canEdit}
            suppressContentEditableWarning
            onInput={onInput}
            onBlur={() => { clearTimeout(timer.current); save(); }}
            data-placeholder="Angle, funder priorities, contacts, budget ideas, reminders… anything about this grant."
          />
        </>
      )}
    </aside>
  );
}
