import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Badge, Button, Card, CopyButton, EmptyState, ErrorBlock, Field, Input, Loading, Modal, Progress, Select, Tabs, Textarea, useConfirm } from '../components/ui';
import { displayName, dueLabel, formatDate, formatDateTime, limitCheck, projectProgress, projectStatus, questionStatus } from '../lib/format';

function QuestionRow({ q, project, users, canManage, isAdmin, me, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ text: q.text, assignedToId: q.assignedToId || '', maxLimit: q.maxLimit || '', limitUnit: q.limitUnit || 'words' });
  const [answer, setAnswer] = useState(q.answer || '');
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const st = questionStatus(q);
  const lc = limitCheck(answer, q.maxLimit, q.limitUnit);
  const canAnswer = q.assignedToId === me.id || isAdmin;

  useEffect(() => { setAnswer(q.answer || ''); }, [q.answer]);

  const saveDetails = async () => {
    setSaving(true);
    try {
      await api.put(`/api/projects/questions/${q.id}/details`, { text: edit.text, assignedToId: edit.assignedToId || null, maxLimit: edit.maxLimit || null, limitUnit: edit.limitUnit });
      toast.success('Question updated.');
      setEditing(false);
      onChanged();
    } catch (err) { toast.error(errorMessage(err)); } finally { setSaving(false); }
  };

  const saveAnswer = async (status) => {
    if (status === 'submitted' && !answer.trim()) { toast.error('Write an answer before submitting.'); return; }
    setSaving(true);
    try {
      await api.put(`/api/projects/questions/${q.id}`, { answer, status: status || (q.status === 'pending' ? 'in-progress' : q.status) });
      toast.success(status === 'submitted' ? 'Answer submitted.' : 'Answer saved.');
      onChanged();
    } catch (err) { toast.error(errorMessage(err)); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Delete question', message: 'This removes the question and its answer. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    try { await api.delete(`/api/projects/questions/${q.id}`); toast.success('Question deleted.'); onChanged(); } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <div className="q-card">
      {confirmDialog}
      <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div className="grow">
          <div className="q-text">{q.text}</div>
          <div className="q-meta">
            <span className="row"><Avatar user={q.assignedTo} size="sm" /> {displayName(q.assignedTo)}</span>
            {q.maxLimit ? <span>· {q.maxLimit} {(q.limitUnit || 'words').startsWith('char') ? 'characters' : 'words'} max</span> : null}
            {q.answer && <span className={lc.over ? 'strong' : ''} style={{ color: lc.over ? 'var(--danger)' : undefined }}>· {limitCheck(q.answer, q.maxLimit, q.limitUnit).count} {lc.unit}{lc.over ? ' (over)' : ''}</span>}
          </div>
        </div>
        <div className="row"><Badge tone={st.tone}>{st.label}</Badge><span className="muted">{open ? '▴' : '▾'}</span></div>
      </div>

      {open && !editing && (
        <div className="mt-2">
          {canAnswer ? (
            <>
              <Textarea rows={6} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="No answer yet. Write one here…" />
              <div className={`count-hint ${lc.over ? 'over' : lc.limit ? 'ok' : ''}`}>{lc.count} {lc.unit}{lc.limit ? ` of ${lc.limit}` : ''}{lc.over ? ' · over the limit' : ''}</div>
            </>
          ) : (
            <div className="q-answer">{q.answer || <span className="faint">No answer yet.</span>}</div>
          )}
          <div className="row wrap mt-2" style={{ justifyContent: 'flex-end' }}>
            {canManage && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit question</Button>}
            {isAdmin && <Button variant="danger" size="sm" onClick={remove}>Delete</Button>}
            {canAnswer && (q.status === 'submitted' ? (
              <Button variant="secondary" size="sm" onClick={() => saveAnswer('in-progress')} loading={saving}>Reopen</Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => saveAnswer()} loading={saving}>Save</Button>
                <Button size="sm" onClick={() => saveAnswer('submitted')} loading={saving}>Submit</Button>
              </>
            ))}
          </div>
          {q.assignmentLogs && q.assignmentLogs.length > 0 && (
            <div className="tiny faint mt-2">Assigned to {displayName(q.assignmentLogs[0].assignedTo)} by {displayName(q.assignmentLogs[0].assignedBy) === 'Unassigned' ? 'system' : displayName(q.assignmentLogs[0].assignedBy)}</div>
          )}
        </div>
      )}

      {open && editing && (
        <div className="mt-2">
          <Field label="Question"><Textarea rows={2} value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} /></Field>
          <div className="row wrap">
            <Select className="select-sm" value={edit.assignedToId} onChange={e => setEdit({ ...edit, assignedToId: e.target.value })} style={{ maxWidth: 220 }}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
            </Select>
            <Input className="input-sm" type="number" min="0" placeholder="Limit" value={edit.maxLimit} onChange={e => setEdit({ ...edit, maxLimit: e.target.value })} style={{ width: 90 }} />
            <Select className="select-sm" value={edit.limitUnit} onChange={e => setEdit({ ...edit, limitUnit: e.target.value })} style={{ width: 130 }}>
              <option value="words">words</option>
              <option value="characters">characters</option>
            </Select>
          </div>
          <div className="form-actions">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={saveDetails} loading={saving}>Save question</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [versions, setVersions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [confirm, confirmDialog] = useConfirm();
  const tab = params.get('tab') || 'questions';
  const setTab = (t) => setParams({ tab: t });

  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [newQ, setNewQ] = useState({ text: '', assignedToId: '', maxLimit: '', limitUnit: 'words' });
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approverId, setApproverId] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    api.get(`/api/projects/${id}`).then(res => setProject(res.data)).catch(err => setError(errorMessage(err, 'Could not load this project.')));
    api.get(`/api/projects/${id}/versions`).then(res => setVersions(res.data)).catch(() => {});
    api.get('/api/ai/reviews', { params: { projectId: id } }).then(res => setReviews(res.data)).catch(() => {});
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => { api.get('/api/users').then(r => setUsers(r.data)).catch(() => {}); }, []);

  if (error) return <ErrorBlock message={error} retry={load} />;
  if (!project) return <Loading />;

  const isOwner = project.ownerId === user.id;
  const canManage = isOwner || isAdmin;
  const st = projectStatus(project);
  const prog = projectProgress(project);
  const due = dueLabel(project.deadlineDate);
  const approvers = users.filter(u => u.role === 'approver');
  const latestApproval = project.approvalRequests && project.approvalRequests[0];
  const allSubmitted = prog.total > 0 && prog.done === prog.total;

  const openEdit = () => {
    setEdit({ name: project.name, description: project.description || '', deadlineDate: project.deadlineDate ? project.deadlineDate.slice(0, 10) : '', themeAngle: project.details?.themeAngle || '', possiblePartnership: project.details?.possiblePartnership || '' });
    setEditOpen(true);
  };
  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.put(`/api/projects/${id}`, { name: edit.name, description: edit.description, deadlineDate: edit.deadlineDate || null, details: { ...(project.details || {}), themeAngle: edit.themeAngle, possiblePartnership: edit.possiblePartnership } });
      toast.success('Project updated.'); setEditOpen(false); load();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const addQuestion = async () => {
    if (!newQ.text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/projects/${id}/questions`, { text: newQ.text, assignedToId: newQ.assignedToId || null, maxLimit: newQ.maxLimit || null, limitUnit: newQ.limitUnit });
      toast.success('Question added.'); setAddOpen(false); setNewQ({ text: '', assignedToId: '', maxLimit: '', limitUnit: 'words' }); load();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const requestApproval = async () => {
    if (!approverId) return;
    setBusy(true);
    try { await api.post(`/api/projects/${id}/request-approval`, { approverId }); toast.success('Approval requested.'); setApprovalOpen(false); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const act = async (label, fn, opts) => {
    if (opts && !(await confirm(opts))) return;
    setBusy(true);
    try { await fn(); toast.success(label); load(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const merge = () => act('Narrative merged from all answers.', () => api.post(`/api/projects/${id}/compile`), project.narrative ? { title: 'Re-merge narrative', message: 'This replaces the existing narrative with the current answers.', confirmLabel: 'Re-merge' } : null);

  const tabs = [
    { id: 'questions', label: 'Questions', count: prog.total },
    { id: 'narrative', label: 'Narrative' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'approvals', label: 'Approvals', count: project.approvalRequests?.length || 0 },
    { id: 'reviews', label: 'AI reviews', count: reviews.length },
    { id: 'versions', label: 'History', count: versions.length },
  ];

  return (
    <div>
      {confirmDialog}
      <div className="mb-2"><Link to="/app/projects" className="small">← All projects</Link></div>
      <div className="page-header">
        <div className="grow">
          <div className="row wrap"><h1 className="mb-0">{project.name}</h1><Badge tone={st.tone}>{st.label}</Badge>{due && !project.isCompleted && <Badge tone={due.tone}>{due.text}</Badge>}{project.isArchived && <Badge tone="gray">Archived</Badge>}</div>
          <p>Owned by {displayName(project.owner)}{project.deadlineDate && ` · Due ${formatDate(project.deadlineDate)}`} · Created {formatDate(project.createdAt)}</p>
        </div>
        <div className="row wrap">
          {canManage && !project.isCompleted && <Button variant="secondary" onClick={openEdit}>Edit details</Button>}
          {canManage && !project.isCompleted && project.status !== 'pending_approval' && <Button variant="accent" onClick={() => { setApproverId(approvers[0]?.id || ''); setApprovalOpen(true); }}>Request approval</Button>}
          {isAdmin && project.status === 'pending_approval' && <Button variant="secondary" onClick={() => act('Approval request withdrawn.', () => api.put(`/api/projects/${id}/rescind-approval`))}>Withdraw request</Button>}
          {canManage && !project.isCompleted && <Button variant="secondary" onClick={() => act('Project marked complete.', () => api.put(`/api/projects/${id}`, { isCompleted: true }), { title: 'Mark as completed', message: 'Completed projects move to Past proposals and become read-only for answers.', confirmLabel: 'Mark complete' })}>Mark complete</Button>}
          {canManage && (project.isArchived
            ? <Button variant="secondary" onClick={() => act('Project restored.', () => api.put(`/api/projects/${id}/unarchive`))}>Restore</Button>
            : <Button variant="secondary" onClick={() => act('Project archived.', () => api.put(`/api/projects/${id}/archive`), { title: 'Archive project', message: 'Archived projects are hidden from the main list but can be restored.', confirmLabel: 'Archive' })}>Archive</Button>)}
          {isAdmin && <Button variant="danger" onClick={() => act('Project deleted.', async () => { await api.delete(`/api/projects/${id}`); navigate('/app/projects'); }, { title: 'Delete project', message: 'This permanently deletes the project, its questions, answers, and history.', confirmLabel: 'Delete forever', danger: true })}>Delete</Button>}
        </div>
      </div>

      {project.status === 'rejected' && latestApproval?.comments && (
        <div className="callout callout-danger mb-3"><strong>Changes requested by {displayName(latestApproval.approver)}:</strong> {latestApproval.comments}</div>
      )}
      {project.status === 'pending_approval' && latestApproval && (
        <div className="callout callout-gold mb-3">Waiting on {displayName(latestApproval.approver)} to approve. Requested {formatDateTime(latestApproval.requestedAt)}.</div>
      )}

      <div className="grid-3 mb-3">
        <Card className="stat"><div className="stat-label">Progress</div><div className="row mt-1"><div className="grow"><Progress value={prog.pct} /></div><span className="small strong">{prog.pct}%</span></div><div className="stat-sub">{prog.done} of {prog.total} answers submitted</div></Card>
        <Card className="stat"><div className="stat-label">Description</div><div className="small mt-1 pre-wrap">{project.description || <span className="faint">No description</span>}</div></Card>
        <Card className="stat"><div className="stat-label">Angle &amp; partners</div><div className="small mt-1">{project.details?.themeAngle || <span className="faint">No theme set</span>}</div><div className="small muted">{project.details?.possiblePartnership}</div></Card>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'questions' && (
        <div>
          <div className="row-between mb-2">
            <span className="small muted">Click a question to read or write its answer.</span>
            {canManage && !project.isCompleted && <Button size="sm" onClick={() => setAddOpen(true)}>+ Add question</Button>}
          </div>
          {project.questions.length === 0 ? (
            <Card><EmptyState icon="✎" title="No questions yet" action={canManage && <Button size="sm" onClick={() => setAddOpen(true)}>Add the first question</Button>}>Add the questions from the funder's application so teammates can start writing.</EmptyState></Card>
          ) : project.questions.map(q => <QuestionRow key={q.id} q={q} project={project} users={users} canManage={canManage && !project.isCompleted} isAdmin={isAdmin} me={user} onChanged={load} />)}
        </div>
      )}

      {tab === 'narrative' && (
        <Card>
          <div className="card-header">
            <div><h3>Merged narrative</h3><div className="tiny muted">{project.narrative ? `Last merged ${formatDateTime(project.narrative.updatedAt || project.narrative.createdAt)}` : 'Combine every submitted answer into one document.'}</div></div>
            <div className="row">
              {project.narrative && <CopyButton text={project.narrative.content} label="Copy text" />}
              {canManage && <Button size="sm" onClick={merge} loading={busy} disabled={prog.total === 0}>{project.narrative ? 'Re-merge' : 'Merge answers'}</Button>}
            </div>
          </div>
          <div className="card-body">
            {!allSubmitted && prog.total > 0 && <div className="callout callout-gold mb-2 small">{prog.total - prog.done} question{prog.total - prog.done === 1 ? ' is' : 's are'} not submitted yet. You can still merge, but unanswered questions will be marked as missing.</div>}
            {project.narrative ? <div className="pre-wrap" style={{ lineHeight: 1.7 }}>{project.narrative.content}</div> : <EmptyState icon="▤" title="No narrative yet">Once answers are in, merge them here to get a single document you can paste into the application.</EmptyState>}
          </div>
        </Card>
      )}

      {tab === 'compliance' && (
        <Card>
          <div className="card-header"><h3>Limit check</h3><span className="small muted">{project.questions.filter(q => limitCheck(q.answer, q.maxLimit, q.limitUnit).over).length} over limit</span></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Question</th><th>Limit</th><th>Current</th><th>Status</th></tr></thead>
            <tbody>
              {project.questions.map(q => { const c = limitCheck(q.answer, q.maxLimit, q.limitUnit); return (
                <tr key={q.id}><td className="strong" style={{ color: 'var(--navy)', maxWidth: 420 }}>{q.text}</td><td>{c.limit ? `${c.limit} ${c.unit}` : <span className="faint">none</span>}</td><td>{c.count} {c.unit}</td><td>{!q.answer ? <Badge tone="gray">No answer</Badge> : c.over ? <Badge tone="danger">Over by {c.count - c.limit}</Badge> : <Badge tone="green">Within limit</Badge>}</td></tr>
              ); })}
            </tbody>
          </table></div>
        </Card>
      )}

      {tab === 'approvals' && (
        <Card>
          <div className="card-header"><h3>Approval history</h3></div>
          {!project.approvalRequests?.length ? <EmptyState icon="✓" title="No approval requests yet">When the proposal is ready, request approval from an approver on your team.</EmptyState> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Requested</th><th>By</th><th>Approver</th><th>Outcome</th><th>Comments</th></tr></thead>
              <tbody>{project.approvalRequests.map(a => (
                <tr key={a.id}><td>{formatDateTime(a.requestedAt)}</td><td>{displayName(a.requestedBy)}</td><td>{displayName(a.approver)}</td><td><Badge tone={a.status === 'approved' ? 'green' : a.status === 'rejected' ? 'danger' : a.status === 'pending' ? 'gold' : 'gray'}>{a.status}</Badge></td><td className="small">{a.comments || '—'}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'reviews' && (
        <Card>
          <div className="card-header"><h3>AI reviews</h3><Button size="sm" to={`/app/ai-review?project=${id}`}>Run a new review</Button></div>
          {reviews.length === 0 ? <EmptyState icon="✦" title="No reviews yet">Point the AI reviewer at the funder's website to get strengths, weaknesses, and recommendations.</EmptyState> : (
            <div className="table-wrap"><table className="table"><tbody>{reviews.map(r => (
              <tr key={r.id} className="clickable" onClick={() => navigate(`/app/ai-review/${r.id}`)}><td><div className="strong" style={{ color: 'var(--navy)' }}>{formatDateTime(r.reviewedAt)}</div><div className="tiny muted">by {displayName(r.reviewedBy)}</div></td><td className="small muted truncate" style={{ maxWidth: 360 }}>{r.grantWebsite}</td></tr>
            ))}</tbody></table></div>
          )}
        </Card>
      )}

      {tab === 'versions' && (
        <Card>
          <div className="card-header"><h3>Change history</h3><span className="small muted">A snapshot is saved each time project details change.</span></div>
          {versions.length === 0 ? <EmptyState icon="◷" title="No history yet" /> : (
            <div className="table-wrap"><table className="table"><tbody>{versions.map(v => (
              <tr key={v.id}><td><span className="badge badge-navy">v{v.versionNumber}</span></td><td>{formatDateTime(v.createdAt)}</td><td>{displayName(v.createdBy)}</td><td style={{ textAlign: 'right' }}><Button variant="ghost" size="sm" onClick={() => setSnapshot(v)}>View</Button></td></tr>
            ))}</tbody></table></div>
          )}
        </Card>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit project details" footer={<><Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={saveEdit} loading={busy}>Save changes</Button></>}>
        <Field label="Project name"><Input value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Description"><Textarea rows={3} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field>
        <div className="grid-2">
          <Field label="Due date"><Input type="date" value={edit.deadlineDate || ''} onChange={e => setEdit({ ...edit, deadlineDate: e.target.value })} /></Field>
          <Field label="Theme or angle"><Input value={edit.themeAngle || ''} onChange={e => setEdit({ ...edit, themeAngle: e.target.value })} /></Field>
        </div>
        <Field label="Possible partnership"><Input value={edit.possiblePartnership || ''} onChange={e => setEdit({ ...edit, possiblePartnership: e.target.value })} /></Field>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a question" footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={addQuestion} loading={busy} disabled={!newQ.text.trim()}>Add question</Button></>}>
        <Field label="Question"><Textarea rows={3} value={newQ.text} onChange={e => setNewQ({ ...newQ, text: e.target.value })} autoFocus /></Field>
        <div className="grid-2">
          <Field label="Assign to"><Select value={newQ.assignedToId} onChange={e => setNewQ({ ...newQ, assignedToId: e.target.value })}><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}</Select></Field>
          <Field label="Limit"><div className="row"><Input type="number" min="0" value={newQ.maxLimit} onChange={e => setNewQ({ ...newQ, maxLimit: e.target.value })} placeholder="None" /><Select value={newQ.limitUnit} onChange={e => setNewQ({ ...newQ, limitUnit: e.target.value })}><option value="words">words</option><option value="characters">characters</option></Select></div></Field>
        </div>
      </Modal>

      <Modal open={approvalOpen} onClose={() => setApprovalOpen(false)} title="Request approval" footer={<><Button variant="secondary" onClick={() => setApprovalOpen(false)}>Cancel</Button><Button variant="accent" onClick={requestApproval} loading={busy} disabled={!approverId}>Send request</Button></>}>
        {approvers.length === 0 ? (
          <div className="callout callout-gold">Nobody on your team has the <strong>approver</strong> role yet. {isAdmin ? <>Assign one on the <Link to="/app/team">Team</Link> page.</> : 'Ask an admin to assign one.'}</div>
        ) : (
          <>
            {!allSubmitted && <div className="callout callout-gold mb-2 small">Not every answer is submitted yet. The approver will see the proposal as it is now.</div>}
            <Field label="Approver"><Select value={approverId} onChange={e => setApproverId(e.target.value)}>{approvers.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}</Select></Field>
          </>
        )}
      </Modal>

      <Modal open={Boolean(snapshot)} onClose={() => setSnapshot(null)} title={snapshot ? `Version ${snapshot.versionNumber}` : ''} size="lg">
        {snapshot && (
          <div className="stack">
            <div><span className="label">Name</span><div>{snapshot.snapshot.name}</div></div>
            <div><span className="label">Description</span><div className="pre-wrap">{snapshot.snapshot.description || <span className="faint">None</span>}</div></div>
            <div><span className="label">Due date</span><div>{snapshot.snapshot.deadlineDate ? formatDate(snapshot.snapshot.deadlineDate) : <span className="faint">None</span>}</div></div>
            <div><span className="label">Details</span><pre className="callout pre-wrap" style={{ margin: 0 }}>{JSON.stringify(snapshot.snapshot.details || {}, null, 2)}</pre></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
