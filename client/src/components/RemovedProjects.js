import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Button, Card, useConfirm } from './ui';
import { formatDate } from '../lib/format';

// Settings → Removed: projects taken off the portal. Their text stays here until restored or deleted for good.
export default function RemovedProjects({ isAdmin }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const load = () => api.get('/api/projects/removed/list').then(r => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const restore = async (p) => {
    setBusy(p.id);
    try { await api.post(`/api/projects/${p.id}/restore`); toast.success(`${p.name} is back in Projects.`); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };
  const destroy = async (p) => {
    if (!(await confirm({ title: 'Delete forever', message: `This permanently deletes “${p.name}” and every answer in it. There is no undo.`, confirmLabel: 'Delete forever', danger: true }))) return;
    setBusy(p.id);
    try { await api.delete(`/api/projects/${p.id}/permanent`); toast.success('Deleted.'); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  return (
    <Card pad className="mt-3" id="removed">
      {confirmDialog}
      <h3>Removed</h3>
      <p className="small muted">Projects you removed from the portal. Their questions and answers are kept here so nothing is lost. Restore one to bring it back.</p>
      {items === null && <div className="loading-block"><span className="spinner" /></div>}
      {items && items.length === 0 && <p className="faint small mb-0">Nothing removed.</p>}
      {items && items.map(p => (
        <div key={p.id} className="removed-item">
          <div className="row-between wrap">
            <div>
              <div className="strong" style={{ color: 'var(--navy)' }}>{p.name}</div>
              <div className="tiny muted">Removed {formatDate(p.removedAt)} · {p.questions.length} question{p.questions.length === 1 ? '' : 's'}{p.deadlineDate ? ` · was due ${formatDate(p.deadlineDate)}` : ''}</div>
            </div>
            <div className="row">
              <Button variant="ghost" size="sm" onClick={() => setOpenId(openId === p.id ? null : p.id)}>{openId === p.id ? 'Hide text' : 'View text'}</Button>
              <Button variant="secondary" size="sm" onClick={() => restore(p)} loading={busy === p.id}>Restore</Button>
              {isAdmin && <Button variant="danger" size="sm" onClick={() => destroy(p)} loading={busy === p.id}>Delete forever</Button>}
            </div>
          </div>
          {openId === p.id && (
            <div className="removed-text mt-2">
              {p.description && <p className="small muted">{p.description}</p>}
              {p.questions.map((q, i) => (
                <div key={q.id} className="mb-2">
                  {q.section && (i === 0 || p.questions[i - 1].section !== q.section) && <div className="tiny strong" style={{ color: 'var(--green-dark)', marginTop: 8 }}>{q.section}</div>}
                  <div className="small strong">{i + 1}. {q.text}</div>
                  <div className="small pre-wrap muted">{q.type === 'upload' ? (q.answer || 'Not uploaded.') : (q.answer || 'No answer.')}</div>
                </div>
              ))}
              {p.narrative?.content && <details className="mt-2"><summary className="small" style={{ cursor: 'pointer', color: 'var(--indigo)' }}>Merged narrative</summary><div className="small pre-wrap mt-1">{p.narrative.content}</div></details>}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
