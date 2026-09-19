import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Loading, Modal, PageHeader, Tabs, Textarea, useConfirm } from '../components/ui';
import UpgradeGate from '../components/Upgrade';
import { displayName, formatDateTime, formatDate } from '../lib/format';

function InnerApprovals() {
  const { isApprover, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState(isApprover ? 'inbox' : 'pending');
  const [inbox, setInbox] = useState(null);
  const [pending, setPending] = useState(null);
  const [rejected, setRejected] = useState(null);
  const [error, setError] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const load = () => {
    setError('');
    if (isApprover) api.get('/api/projects/pending-approval').then(r => setInbox(r.data)).catch(err => setError(errorMessage(err)));
    api.get('/api/projects', { params: { status: 'pending_approval' } }).then(r => setPending(r.data)).catch(err => setError(errorMessage(err)));
    api.get('/api/projects/rejected').then(r => setRejected(r.data)).catch(err => setError(errorMessage(err)));
  };
  useEffect(load, [isApprover]); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = async (projectId, name) => {
    if (!(await confirm({ title: 'Approve proposal', message: `Approve "${name}"? The team will see it as approved.`, confirmLabel: 'Approve' }))) return;
    setBusy(true);
    try { await api.put(`/api/projects/${projectId}/respond-approval`, { approvalStatus: 'approved' }); toast.success('Proposal approved.'); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const reject = async () => {
    if (!comments.trim()) { toast.error('Add a note so the team knows what to change.'); return; }
    setBusy(true);
    try { await api.put(`/api/projects/${rejectTarget.projectId}/respond-approval`, { approvalStatus: 'rejected', comments: comments.trim() }); toast.success('Sent back with your notes.'); setRejectTarget(null); setComments(''); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const rescind = async (projectId) => {
    setBusy(true);
    try { await api.put(`/api/projects/${projectId}/rescind-approval`); toast.success('Request withdrawn.'); load(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };

  const tabs = [];
  if (isApprover) tabs.push({ id: 'inbox', label: 'Waiting on me', count: inbox?.length });
  tabs.push({ id: 'pending', label: 'Awaiting approval', count: pending?.length });
  tabs.push({ id: 'changes', label: 'Needs changes', count: rejected?.length });

  return (
    <div>
      {confirmDialog}
      <PageHeader title="Approvals" subtitle="Proposals moving through sign-off before submission. Review opens the merged narrative; approve it or send it back with notes." />
      {error && <ErrorBlock message={error} retry={load} />}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'inbox' && (inbox === null ? <Loading /> : inbox.length === 0 ? <Card><EmptyState icon="✓" title="Nothing waiting on you">Approval requests sent to you will appear here.</EmptyState></Card> : (
        <div className="stack">{inbox.map(a => (
          <Card key={a.id} pad>
            <div className="row-between">
              <div className="grow">
                <h3 className="mb-0"><Link to={`/app/projects/${a.projectId}`} style={{ color: 'var(--navy)' }}>{a.project.name}</Link></h3>
                <div className="small muted">Requested by {displayName(a.requestedBy)} · {formatDateTime(a.requestedAt)}{a.project.deadlineDate && ` · Due ${formatDate(a.project.deadlineDate)}`}</div>
                {a.project.description && <p className="small mt-1 mb-0">{a.project.description}</p>}
              </div>
              <div className="row wrap">
                <Button variant="secondary" size="sm" to={`/app/projects/${a.projectId}?tab=narrative`}>Review</Button>
                <Button variant="danger" size="sm" onClick={() => { setRejectTarget(a); setComments(''); }}>Request changes</Button>
                <Button size="sm" onClick={() => approve(a.projectId, a.project.name)} loading={busy}>Approve</Button>
              </div>
            </div>
          </Card>
        ))}</div>
      ))}

      {tab === 'pending' && (pending === null ? <Loading /> : pending.length === 0 ? <Card><EmptyState icon="◷" title="No proposals awaiting approval">Request approval from a project's page when the answers are ready.</EmptyState></Card> : (
        <div className="stack">{pending.map(p => (
          <Card key={p.id} pad onClick={() => navigate(`/app/projects/${p.id}`)}>
            <div className="row-between">
              <div className="grow"><h3 className="mb-0">{p.name}</h3><div className="small muted">Owner {displayName(p.owner)}{p.deadlineDate && ` · Due ${formatDate(p.deadlineDate)}`}</div></div>
              <div className="row"><Badge tone="gold">Awaiting approval</Badge>{isAdmin && <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); rescind(p.id); }} loading={busy}>Withdraw</Button>}</div>
            </div>
          </Card>
        ))}</div>
      ))}

      {tab === 'changes' && (rejected === null ? <Loading /> : rejected.length === 0 ? <Card><EmptyState icon="✎" title="Nothing needs changes">Proposals sent back by an approver land here with their notes.</EmptyState></Card> : (
        <div className="stack">{rejected.map(p => (
          <Card key={p.id} pad onClick={() => navigate(`/app/projects/${p.id}`)}>
            <div className="row-between"><div className="grow"><h3 className="mb-0">{p.name}</h3><div className="small muted">Owner {displayName(p.owner)}{p.deadlineDate && ` · Due ${formatDate(p.deadlineDate)}`}</div></div><Badge tone="danger">Needs changes</Badge></div>
            {p.approvalRequests?.[0]?.comments && <div className="callout callout-danger mt-2 small"><strong>Approver notes:</strong> {p.approvalRequests[0].comments}</div>}
          </Card>
        ))}</div>
      ))}

      <Modal open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} title="Request changes" footer={<><Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button><Button variant="danger-solid" onClick={reject} loading={busy}>Send back</Button></>}>
        <p className="small muted">Tell the team what needs to change on <strong>{rejectTarget?.project?.name}</strong>. They'll see your notes on the project page.</p>
        <Field label="Notes"><Textarea rows={5} value={comments} onChange={e => setComments(e.target.value)} autoFocus /></Field>
      </Modal>
    </div>
  );
}

export default function Approvals() {
  return <UpgradeGate feature="approvals" title="Approvals" subtitle="Proposals moving through sign-off before submission."><InnerApprovals /></UpgradeGate>;
}
