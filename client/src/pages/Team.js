import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Badge, Button, Card, CopyButton, EmptyState, ErrorBlock, Field, Input, Loading, Modal, PageHeader, Select, useConfirm } from '../components/ui';
import { displayName, formatDate } from '../lib/format';
import { usePlan } from '../context/PlanContext';
import { Link } from 'react-router-dom';

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Manages the workspace, team, and every project.' },
  { value: 'editor', label: 'Editor', desc: 'Creates projects and answers assigned questions.' },
  { value: 'approver', label: 'Approver', desc: 'Signs off on proposals before submission.' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only access.' },
];

export default function Team() {
  const { user } = useAuth();
  const toast = useToast();
  const { plan, has, usage } = usePlan();
  const [users, setUsers] = useState(null);
  const [invites, setInvites] = useState([]);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: '', role: 'editor' });
  const [created, setCreated] = useState(null);
  const [resetLink, setResetLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const load = () => {
    setError('');
    api.get('/api/admin/users').then(r => setUsers(r.data)).catch(err => setError(errorMessage(err)));
    api.get('/api/auth/invitations').then(r => setInvites(r.data)).catch(() => {});
    api.get('/api/admin/users/pending').then(r => setPending(r.data)).catch(() => {});
  };
  useEffect(load, []);

  const sendInvite = async () => {
    setBusy(true);
    try {
      const res = await api.post('/api/auth/invitations', invite);
      setCreated(res.data); setInvite({ email: '', role: 'editor' }); load();
      toast.success(res.data.emailed ? 'Invitation emailed.' : 'Invitation created.');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const changeRole = async (u, role) => {
    try { await api.put(`/api/admin/users/${u.id}/update`, { role }); toast.success(`${displayName(u)} is now ${role}.`); load(); } catch (err) { toast.error(errorMessage(err)); }
  };
  const remove = async (u) => {
    if (!(await confirm({ title: 'Remove teammate', message: `Remove ${displayName(u)} from the workspace? Their answers stay, but they lose access.`, confirmLabel: 'Remove', danger: true }))) return;
    try { await api.delete(`/api/admin/users/${u.id}`); toast.success('Teammate removed.'); load(); } catch (err) { toast.error(errorMessage(err)); }
  };
  const revoke = async (i) => { try { await api.delete(`/api/auth/invitations/${i.id}`); load(); } catch (err) { toast.error(errorMessage(err)); } };
  const reset = async (u) => {
    try { const res = await api.post(`/api/auth/users/${u.id}/reset-link`); setResetLink({ user: u, ...res.data }); } catch (err) { toast.error(errorMessage(err)); }
  };
  const approve = async (u) => { try { await api.put(`/api/admin/users/${u.id}/approve`, { role: 'editor' }); toast.success('Account approved.'); load(); } catch (err) { toast.error(errorMessage(err)); } };

  return (
    <div>
      {confirmDialog}
      <PageHeader title="Team" subtitle="Invite teammates and manage what each person can do." actions={<Button onClick={() => { setCreated(null); setInviteOpen(true); }}>+ Invite teammate</Button>} />
      {error && <ErrorBlock message={error} retry={load} />}
      {!users && !error && <Loading />}
      {plan && !has('team') && <div className="callout callout-gold mb-3"><strong>Teammates are included in Premium and above.</strong> Your workspace is on {plan.name}. <Link to="/app/settings#plan">See plans</Link>.</div>}
      {plan && has('team') && plan.limits.seats !== null && usage && <p className="small muted mb-2">{usage.seats} of {plan.limits.seats} seats used on {plan.name}{plan.trialing ? ' (trial)' : ''}.</p>}

      {pending.length > 0 && (
        <Card className="mb-3">
          <div className="card-header"><h3>Waiting for approval</h3><span className="small muted">Accounts created before invites existed.</span></div>
          <div className="table-wrap"><table className="table"><tbody>{pending.map(u => (
            <tr key={u.id}><td><div className="strong">{displayName(u)}</div><div className="tiny muted">{u.email}</div></td><td style={{ textAlign: 'right' }}><Button size="sm" onClick={() => approve(u)}>Approve as editor</Button></td></tr>
          ))}</tbody></table></div>
        </Card>
      )}

      {users && (
        <Card className="mb-3">
          <div className="card-header"><h3>Members</h3><span className="small muted">{users.length} {users.length === 1 ? 'person' : 'people'}</span></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Person</th><th>Role</th><th>Joined</th><th /></tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.id}>
                <td><div className="row"><Avatar user={u} /><div><div className="strong">{displayName(u)}{u.id === user.id && <span className="tiny muted"> (you)</span>}</div><div className="tiny muted">{u.email}</div></div></div></td>
                <td><Select className="select-sm" value={u.role} onChange={e => changeRole(u, e.target.value)} style={{ width: 130 }}>{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></td>
                <td className="small muted">{formatDate(u.createdAt)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><Button variant="ghost" size="sm" onClick={() => reset(u)}>Reset password</Button>{u.id !== user.id && <Button variant="danger" size="sm" onClick={() => remove(u)}>Remove</Button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      <Card className="mb-3">
        <div className="card-header"><h3>Pending invitations</h3></div>
        {invites.length === 0 ? <EmptyState icon="✉" title="No open invitations">Invite someone and their link will be listed here until they accept.</EmptyState> : (
          <div className="table-wrap"><table className="table"><tbody>{invites.map(i => (
            <tr key={i.id}><td><div className="strong">{i.email}</div><div className="tiny muted">Invited by {displayName(i.invitedBy)} · {i.expired ? 'expired' : `expires ${formatDate(i.expiresAt)}`}</div></td><td><Badge tone="indigo">{i.role}</Badge></td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><CopyButton text={i.link} /> <Button variant="danger" size="sm" onClick={() => revoke(i)}>Revoke</Button></td></tr>
          ))}</tbody></table></div>
        )}
      </Card>

      <Card pad>
        <h3>Roles</h3>
        <div className="grid-4">{ROLES.map(r => <div key={r.value}><div className="strong" style={{ color: 'var(--navy)' }}>{r.label}</div><div className="small muted">{r.desc}</div></div>)}</div>
      </Card>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a teammate" footer={created ? <Button onClick={() => setInviteOpen(false)}>Done</Button> : <><Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button><Button onClick={sendInvite} loading={busy} disabled={!invite.email.trim()}>Create invitation</Button></>}>
        {created ? (
          <div>
            <div className="form-success">{created.emailed ? `Invitation sent to ${created.invitation.email}. They have 7 days to accept.` : `Invitation created for ${created.invitation.email}.`}</div>
            {created.emailed ? <p className="small muted">Didn't arrive? Ask them to check spam, or copy the link below and send it yourself.</p> : <p className="small muted">The email could not be sent. Share this link yourself; it works for 7 days.</p>}
            <details><summary className="small" style={{ cursor: 'pointer', color: 'var(--indigo)' }}>Show invite link</summary><div className="callout row-between mt-1"><code className="truncate" style={{ maxWidth: 360 }}>{created.link}</code><CopyButton text={created.link} /></div></details>
          </div>
        ) : (
          <>
            <Field label="Email"><Input type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} placeholder="teammate@organization.org" autoFocus /></Field>
            <Field label="Role" hint={ROLES.find(r => r.value === invite.role)?.desc}><Select value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}>{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
          </>
        )}
      </Modal>

      <Modal open={Boolean(resetLink)} onClose={() => setResetLink(null)} title="Password reset link" footer={<Button onClick={() => setResetLink(null)}>Done</Button>}>
        {resetLink && (
          <div>
            <div className="form-success">{resetLink.emailed ? `We emailed a reset link to ${resetLink.user.email}.` : `Reset link created for ${displayName(resetLink.user)}.`}</div>
            {!resetLink.emailed && <p className="small muted">Share this link with them directly. It expires in 2 hours.</p>}
            <div className="callout row-between"><code className="truncate" style={{ maxWidth: 360 }}>{resetLink.link}</code><CopyButton text={resetLink.link} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
