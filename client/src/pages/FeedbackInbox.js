import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Input, Loading, Modal, PageHeader, Select, Tabs, Textarea } from '../components/ui';
import { displayName, formatDateTime } from '../lib/format';

const STATUS = { new: 'gold', seen: 'gray', planned: 'indigo', done: 'green', closed: 'gray' };
const TYPE = { bug: 'danger', idea: 'indigo', question: 'periwinkle', praise: 'green' };

export default function FeedbackInbox() {
  const toast = useToast();
  const [access, setAccess] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('new');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [notes, setNotes] = useState('');

  useEffect(() => { api.get('/api/feedback/admin/access').then(r => setAccess(r.data.staff)).catch(() => setAccess(false)); }, []);
  const load = () => { setError(''); api.get('/api/feedback/admin', { params: { status, type, q } }).then(r => setData(r.data)).catch(err => setError(errorMessage(err))); };
  useEffect(() => { if (access) load(); }, [access, status, type, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (id, patch) => {
    try { await api.put(`/api/feedback/admin/${id}`, patch); toast.success('Updated.'); load(); if (open && open.id === id) setOpen(o => ({ ...o, ...patch })); }
    catch (err) { toast.error(errorMessage(err)); }
  };

  if (access === null) return <Loading />;
  if (access === false) return <Navigate to="/app" replace />;

  const counts = data?.counts || {};
  return (
    <div>
      <PageHeader title="Feedback inbox" subtitle="Everything customers send from the Feedback button, across all workspaces." />
      <Tabs active={status} onChange={setStatus} tabs={[{ id: 'new', label: 'New', count: counts.new || 0 }, { id: 'seen', label: 'Seen', count: counts.seen || 0 }, { id: 'planned', label: 'Planned', count: counts.planned || 0 }, { id: 'done', label: 'Done', count: counts.done || 0 }, { id: 'closed', label: 'Closed', count: counts.closed || 0 }, { id: '', label: 'All' }]} />
      <div className="row wrap mb-3">
        <Select value={type} onChange={e => setType(e.target.value)} style={{ maxWidth: 180 }}><option value="">All types</option><option value="bug">Bugs</option><option value="idea">Ideas</option><option value="question">Questions</option><option value="praise">Praise</option></Select>
        <Input placeholder="Search messages…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 300 }} />
      </div>
      {error && <ErrorBlock message={error} retry={load} />}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && <Card><EmptyState icon="✉" title="Nothing here">Feedback matching these filters will show up as it arrives.</EmptyState></Card>}
      {data && data.items.length > 0 && (
        <Card><div className="table-wrap"><table className="table">
          <thead><tr><th>From</th><th>Message</th><th>Type</th><th>Status</th><th /></tr></thead>
          <tbody>{data.items.map(f => (
            <tr key={f.id} className="clickable" onClick={() => { setOpen(f); setNotes(f.adminNotes || ''); if (f.status === 'new') update(f.id, { status: 'seen' }); }}>
              <td><div className="strong">{displayName(f.user)}</div><div className="tiny muted">{f.company.name} · {f.company.plan}</div><div className="tiny faint">{formatDateTime(f.createdAt)}</div></td>
              <td style={{ maxWidth: 460 }}><div className="small" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.message}</div><div className="tiny faint">{f.page}{f.rating ? ` · ${'★'.repeat(f.rating)}` : ''}{f.hasScreenshot ? ' · 📎' : ''}</div></td>
              <td><Badge tone={TYPE[f.type]}>{f.type}</Badge></td>
              <td><Badge tone={STATUS[f.status]}>{f.status}</Badge></td>
              <td style={{ textAlign: 'right' }}><Button variant="ghost" size="sm">Open</Button></td>
            </tr>
          ))}</tbody>
        </table></div></Card>
      )}

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open.type} from ${displayName(open.user)}` : ''} size="lg" footer={open && <>
        <Select className="select-sm" value={open.status} onChange={e => update(open.id, { status: e.target.value })} style={{ width: 150 }}>{Object.keys(STATUS).map(s => <option key={s} value={s}>{s}</option>)}</Select>
        <a className="btn btn-secondary btn-sm" href={`mailto:${open.user.email}?subject=${encodeURIComponent('Re: your Merge feedback')}`}>Reply by email</a>
        <Button size="sm" onClick={() => update(open.id, { adminNotes: notes })}>Save notes</Button>
      </>}>
        {open && (
          <div className="stack">
            <div className="tiny muted">{open.user.email} · {open.company.name} ({open.company.kind}, {open.company.plan}) · {formatDateTime(open.createdAt)}<br />Page: {open.page || 'n/a'}{open.rating ? ` · Rating ${open.rating}/5` : ''}<br /><span className="faint">{open.userAgent}</span></div>
            <div className="callout pre-wrap">{open.message}</div>
            {open.hasScreenshot && <ScreenshotView id={open.id} />}
            <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes (customer can't see these)" />
          </div>
        )}
      </Modal>
    </div>
  );
}

function ScreenshotView({ id }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    api.get(`/api/feedback/admin/${id}/screenshot`, { responseType: 'blob' }).then(r => { url = URL.createObjectURL(r.data); setSrc(url); }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt="Screenshot from the customer" style={{ maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 8 }} /> : null;
}
