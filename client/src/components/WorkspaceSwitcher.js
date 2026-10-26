import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';

// Lets one login hold several organizations, each with its own grants, past proposals and
// files. Switching asks the server for a token scoped to the new workspace, then reloads —
// a reload rather than in-place state so nothing from the old workspace can linger on screen.
export default function WorkspaceSwitcher({ current, canCreate }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const box = useRef();

  useEffect(() => {
    if (!open) return undefined;
    api.get('/api/workspaces').then(r => setList(r.data)).catch(() => setList([]));
    const away = (e) => { if (box.current && !box.current.contains(e.target)) { setOpen(false); setCreating(false); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const switchTo = async (id) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post('/api/workspaces/switch', { companyId: id });
      localStorage.setItem('token', r.data.token);
      window.location.assign('/app');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not switch workspace.'));
      setBusy(false);
    }
  };

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const r = await api.post('/api/workspaces', { name: newName.trim(), kind: 'team' });
      await switchTo(r.data.id);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create that workspace.'));
      setBusy(false);
    }
  };

  // Only one workspace and no ability to add another: nothing to switch between.
  const single = list && list.length < 2 && !canCreate;

  return (
    <div className="ws-switch" ref={box}>
      <button type="button" className="ws-current" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="truncate">{current || 'Workspace'}</span>
        <ChevronsUpDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && !single && (
        <div className="ws-menu" role="listbox">
          {list === null && <div className="ws-item muted">Loading…</div>}
          {list && list.map(w => (
            <button key={w.id} type="button" className={`ws-item ${w.active ? 'active' : ''}`} disabled={busy} onClick={() => (w.active ? setOpen(false) : switchTo(w.id))}>
              <span className="truncate">{w.name}</span>
              {w.active
                ? <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                : <span className="tiny muted">{w.planName}</span>}
            </button>
          ))}
          {canCreate && !creating && (
            <button type="button" className="ws-item ws-add" onClick={() => setCreating(true)} disabled={busy}>
              <Plus size={14} strokeWidth={2} aria-hidden="true" /> New workspace
            </button>
          )}
          {canCreate && creating && (
            <div className="ws-new">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false); }}
                placeholder="Organization name"
                aria-label="New workspace name"
              />
              <button type="button" onClick={create} disabled={busy || !newName.trim()}>Create</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
