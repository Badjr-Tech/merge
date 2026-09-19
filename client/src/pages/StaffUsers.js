import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, CopyButton, EmptyState, Input, Loading, Modal, PageHeader } from '../components/ui';
import { formatDate } from '../lib/format';

export default function StaffUsers() {
  const toast = useToast();
  const [access, setAccess] = useState(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [link, setLink] = useState(null);
  useEffect(() => { api.get('/api/staff/access').then(r => setAccess(r.data.staff)).catch(() => setAccess(false)); }, []);
  useEffect(() => { if (!access) return undefined; const t = setTimeout(() => api.get('/api/staff/users', { params: { q } }).then(r => setRows(r.data)).catch(err => toast.error(errorMessage(err))), 250); return () => clearTimeout(t); }, [access, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = async (u) => { try { const r = await api.post(`/api/staff/users/${u.id}/reset-link`); setLink({ user: u, ...r.data }); } catch (err) { toast.error(errorMessage(err)); } };
  if (access === null) return <Loading />;
  if (access === false) return <Navigate to="/app" replace />;
  return (
    <div>
      <PageHeader title="Users" subtitle="Every person across every workspace." />
      <Input placeholder="Search by email or name…" value={q} onChange={e => setQ(e.target.value)} className="mb-3" style={{ maxWidth: 460 }} autoFocus />
      {!rows ? <Loading /> : rows.length === 0 ? <Card><EmptyState icon="☺" title="No users match" /></Card> : (
        <Card><div className="table-wrap"><table className="table"><thead><tr><th>Person</th><th>Workspace</th><th>Role</th><th>Activity</th><th>Joined</th><th /></tr></thead><tbody>{rows.map(u => (
          <tr key={u.id}><td><div className="strong">{u.name || u.username}</div><div className="tiny muted">{u.email}</div></td><td className="small">{u.company ? <>{u.company.name}<div className="tiny muted">{u.company.kind} · {u.company.plan}</div></> : <span className="faint">none</span>}</td><td><Badge tone="indigo">{u.role}</Badge>{!u.isApproved && <Badge tone="gold">unapproved</Badge>}</td><td className="small muted">{u._count.projects} grants · {u._count.assignedQuestions} questions</td><td className="small muted">{formatDate(u.createdAt)}</td><td style={{ textAlign: 'right' }}><Button variant="ghost" size="sm" onClick={() => reset(u)}>Reset link</Button></td></tr>
        ))}</tbody></table></div></Card>
      )}
      <Modal open={Boolean(link)} onClose={() => setLink(null)} title="Password reset link" footer={<Button onClick={() => setLink(null)}>Done</Button>}>
        {link && <div><p className="small muted">For {link.user.email}. Expires in 2 hours. Send it to them directly.</p><div className="callout row-between"><code className="truncate" style={{ maxWidth: 360 }}>{link.link}</code><CopyButton text={link.link} /></div></div>}
      </Modal>
    </div>
  );
}
