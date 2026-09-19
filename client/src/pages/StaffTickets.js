import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Loading, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui';
import { formatDateTime } from '../lib/format';

const S = { open: 'gold', in_progress: 'indigo', resolved: 'green' };
const T = { bug: 'danger', idea: 'indigo', question: 'periwinkle', praise: 'green' };

export default function StaffTickets() {
  const toast = useToast();
  const [access, setAccess] = useState(null);
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [notes, setNotes] = useState('');
  useEffect(() => { api.get('/api/staff/access').then(r => setAccess(r.data.staff)).catch(() => setAccess(false)); }, []);
  const load = () => api.get('/api/staff/tickets', { params: { status } }).then(r => setData(r.data)).catch(err => toast.error(errorMessage(err)));
  useEffect(() => { if (access) load(); }, [access, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = async (id, patch) => { try { await api.put(`/api/staff/tickets/${id}`, patch); load(); if (open?.id === id) setOpen(o => ({ ...o, ...patch })); } catch (err) { toast.error(errorMessage(err)); } };
  if (access === null) return <Loading />;
  if (access === false) return <Navigate to="/app" replace />;
  const c = data?.counts || {};
  return (
    <div>
      <PageHeader title="Tickets" subtitle="Everything sent through the Feedback button. Also emailed to feedback@badjrtech.com." />
      <Tabs active={status} onChange={setStatus} tabs={[{ id: 'open', label: 'Open', count: c.open || 0 }, { id: 'in_progress', label: 'In progress', count: c.in_progress || 0 }, { id: 'resolved', label: 'Resolved', count: c.resolved || 0 }, { id: 'all', label: 'All' }]} />
      {!data ? <Loading /> : data.items.length === 0 ? <Card><EmptyState icon="✉" title="Nothing here" /></Card> : (
        <Card><div className="table-wrap"><table className="table"><thead><tr><th>From</th><th>Message</th><th>Type</th><th>Status</th><th /></tr></thead><tbody>{data.items.map(t => (
          <tr key={t.id} className="clickable" onClick={() => { setOpen(t); setNotes(t.notes || ''); }}>
            <td><div className="strong">{t.userName || t.userEmail}</div><div className="tiny muted">{t.workspace} · {t.plan}</div><div className="tiny faint">{formatDateTime(t.createdAt)}</div></td>
            <td style={{ maxWidth: 480 }}><div className="small" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.message}</div><div className="tiny faint">{t.page}{t.rating ? ` · ${'★'.repeat(t.rating)}` : ''}</div></td>
            <td><Badge tone={T[t.type]}>{t.type}</Badge></td><td><Badge tone={S[t.status]}>{t.status.replace('_', ' ')}</Badge></td>
            <td style={{ textAlign: 'right' }}><Button variant="ghost" size="sm">Open</Button></td>
          </tr>
        ))}</tbody></table></div></Card>
      )}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open.type} from ${open.userName || open.userEmail}` : ''} size="lg" footer={open && <>
        <Select className="select-sm" value={open.status} onChange={e => update(open.id, { status: e.target.value })} style={{ width: 150 }}><option value="open">open</option><option value="in_progress">in progress</option><option value="resolved">resolved</option></Select>
        <a className="btn btn-secondary btn-sm" href={`mailto:${open.userEmail}?subject=${encodeURIComponent('Re: your Merge feedback')}`}>Reply by email</a>
        <Button size="sm" onClick={() => update(open.id, { notes })}>Save notes</Button>
      </>}>
        {open && <div className="stack"><div className="tiny muted">{open.userEmail} · {open.workspace} ({open.plan}) · {formatDateTime(open.createdAt)} · Page: {open.page || 'n/a'}</div><div className="callout pre-wrap">{open.message}</div><Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes" /></div>}
      </Modal>
    </div>
  );
}
