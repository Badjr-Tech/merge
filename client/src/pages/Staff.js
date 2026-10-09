import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Input, Loading, Modal, PageHeader, Select, Field } from '../components/ui';
import { formatDate } from '../lib/format';

const WRITER = [['writer', 'Starter'], ['writer_pro', 'Premium'], ['professional', 'Professional']];
const TEAM = [['org_solo', 'Solo Writer'], ['small_team', 'Small Teams'], ['large_team', 'Large Teams'], ['company', 'Companies']];

export default function Staff() {
  const toast = useToast();
  const [access, setAccess] = useState(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({ plan: '', months: '12', note: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/api/staff/access').then(r => setAccess(r.data.staff)).catch(() => setAccess(false)); }, []);
  const load = () => api.get('/api/staff/workspaces', { params: { q } }).then(r => setRows(r.data)).catch(err => toast.error(errorMessage(err)));
  useEffect(() => { if (access) { const t = setTimeout(load, 250); return () => clearTimeout(t); } return undefined; }, [access, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (w) => { setTarget(w); setForm({ plan: (w.kind === 'writer' ? WRITER : TEAM)[1][0], months: '3', revertsTo: (w.kind === 'writer' ? WRITER : TEAM)[0][0], note: w.compNote || '' }); };
  const pilot = async (remove) => {
    setBusy(true);
    try { const r = await api.post(`/api/staff/workspaces/${target.id}/pilot`, remove ? { months: 0 } : { plan: form.plan, months: Number(form.months), revertsTo: form.revertsTo, note: form.note }); toast.success(r.data.msg); setTarget(null); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };

  if (access === null) return <Loading />;
  if (access === false) return <Navigate to="/app" replace />;
  const plans = target ? (target.kind === 'writer' ? WRITER : TEAM) : [];

  return (
    <div>
      <PageHeader title="Staff: workspaces" subtitle="Find any workspace and put it on a free pilot that reverts to a paid plan when it ends." />
      <Input placeholder="Search by workspace name or admin email…" value={q} onChange={e => setQ(e.target.value)} className="mb-3" style={{ maxWidth: 460 }} autoFocus />
      {!rows ? <Loading /> : rows.length === 0 ? <Card><EmptyState icon="☍" title="No workspaces match" /></Card> : (
        <Card><div className="table-wrap"><table className="table">
          <thead><tr><th>Workspace</th><th>Admin</th><th>Plan</th><th>People / grants</th><th /></tr></thead>
          <tbody>{rows.map(w => (
            <tr key={w.id}>
              <td><div className="strong">{w.name}</div><div className="tiny muted">{w.kind} · since {formatDate(w.createdAt)}</div></td>
              <td className="small">{w.users.map(u => u.email).join(', ') || <span className="faint">none</span>}</td>
              <td><Badge tone={w.planInfo.comped ? 'gold' : w.planInfo.trialing ? 'indigo' : w.planInfo.key === 'free' ? 'gray' : 'green'}>{w.planInfo.name}{w.planInfo.pilot ? ' · pilot' : w.planInfo.comped ? ' · comped' : w.planInfo.trialing ? ' · trial' : w.stripeSubscriptionId ? ' · paid' : ''}</Badge>{w.planInfo.pilot ? <div className="tiny muted">free until {formatDate(w.pilotEndsAt)} · then {w.planInfo.pilotRevertsToName}{w.compNote ? ` · ${w.compNote}` : ''}</div> : w.planInfo.comped && <div className="tiny muted">until {formatDate(w.compedUntil)}{w.compNote ? ` · ${w.compNote}` : ''}</div>}</td>
              <td className="small muted">{w._count.users} / {w._count.projects}</td>
              <td style={{ textAlign: 'right' }}><Button size="sm" variant={w.planInfo.pilot ? 'secondary' : 'primary'} onClick={() => open(w)}>{w.planInfo.pilot ? 'Edit pilot' : 'Start pilot'}</Button></td>
            </tr>
          ))}</tbody>
        </table></div></Card>
      )}
      <Modal open={Boolean(target)} onClose={() => setTarget(null)} title={target ? `Pilot for ${target.name}` : ''} footer={<>{(target?.planInfo?.pilot || target?.planInfo?.comped) && <Button variant="danger" onClick={() => pilot(true)} loading={busy}>End pilot now</Button>}<Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button onClick={() => pilot(false)} loading={busy}>Start pilot</Button></>}>
        {target && (
          <>
            <Field label="Plan during the pilot" hint="Free. No card, no Stripe, no trial emails."><Select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>{plans.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</Select></Field>
            <Field label="For how long"><Select value={form.months} onChange={e => setForm({ ...form, months: e.target.value })}><option value="1">1 month</option><option value="2">2 months</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">1 year</option></Select></Field>
            <Field label="Then it reverts to" hint="They get a warning a week out. If there's no card on file when it ends, the workspace moves to Free and is asked to pick."><Select value={form.revertsTo} onChange={e => setForm({ ...form, revertsTo: e.target.value })}><option value="free">Free</option>{plans.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</Select></Field>
            <Field label="Note" hint="Internal only, e.g. pilot for Riverside Arts"><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
          </>
        )}
      </Modal>
    </div>
  );
}
