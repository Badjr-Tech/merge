import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Badge, Button, Card, CopyButton, EmptyState, ErrorBlock, Field, Input, Loading, Modal, Progress, Select, Tabs, Textarea, useConfirm } from '../components/ui';
import SimilarAnswers from '../components/SimilarAnswers';
import NotesDrawer from '../components/NotesDrawer';
import { usePlan } from '../context/PlanContext';
import { FEATURE_COPY } from '../components/Upgrade';
import { displayName, dueLabel, formatDate, formatDateTime, limitCheck, projectProgress, projectStatus, questionStatus, googleCalendarUrl } from '../lib/format';

function QuestionRow({ q, project, users, canManage, isAdmin, me, onChanged, writerMode, reviewNotes = [], onResolveNote, initiallyOpen = false }) {
  const toast = useToast();
  const [open, setOpen] = useState(initiallyOpen);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ text: q.text, assignedToId: q.assignedToId || '', maxLimit: q.maxLimit || '', limitUnit: q.limitUnit || 'words' });
  const [answer, setAnswer] = useState(q.answer || '');
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const st = questionStatus(q);
  const lc = limitCheck(answer, q.maxLimit, q.limitUnit);
  const canAnswer = q.assignedToId === me.id || isAdmin || writerMode;

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
      await api.put(`/api/projects/questions/${q.id}`, { answer, status: writerMode ? (answer.trim() ? 'submitted' : 'pending') : (status || (q.status === 'pending' ? 'in-progress' : q.status)) });
      toast.success(writerMode ? 'Saved.' : status === 'submitted' ? 'Answer submitted.' : 'Answer saved.');
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
            {!writerMode && <span className="row"><Avatar user={q.assignedTo} size="sm" /> {displayName(q.assignedTo)}</span>}
            {q.maxLimit ? <span>· {q.maxLimit} {(q.limitUnit || 'words').startsWith('char') ? 'characters' : 'words'} max</span> : null}
            {q.answer && <span className={lc.over ? 'strong' : ''} style={{ color: lc.over ? 'var(--danger)' : undefined }}>· {limitCheck(q.answer, q.maxLimit, q.limitUnit).count} {lc.unit}{lc.over ? ' (over)' : ''}</span>}
          </div>
        </div>
        <div className="row">{reviewNotes.filter(n => !n.resolved).length > 0 && <Badge tone="gold">{reviewNotes.filter(n => !n.resolved).length} reviewer note{reviewNotes.filter(n => !n.resolved).length === 1 ? '' : 's'}</Badge>}{writerMode ? (q.answer ? <Badge tone="green">Answered</Badge> : <Badge tone="gray">Empty</Badge>) : <Badge tone={st.tone}>{st.label}</Badge>}<span className="muted">{open ? '▴' : '▾'}</span></div>
      </div>

      {open && !editing && (
        <div className="mt-2">
          {reviewNotes.length > 0 && (
            <div className="mb-2">
              {reviewNotes.map(n => (
                <div key={n.id} className={`review-note ${n.resolved ? 'resolved' : ''}`}>
                  <div className="row-between"><span><strong>{n.reviewerName || 'Reviewer'}:</strong> <span className="pre-wrap">{n.body}</span></span>{onResolveNote && <button type="button" className="link-button tiny" onClick={() => onResolveNote(n)}>{n.resolved ? 'Reopen' : 'Resolve'}</button>}</div>
                </div>
              ))}
            </div>
          )}
          {canAnswer ? (
            <>
              {(writerMode || q.status !== 'submitted') && <SimilarAnswers questionId={q.id} onUse={(text) => { setAnswer(a => a.trim() ? `${a}\n\n${text}` : text); toast.success('Added to your draft. Edit it, then save or submit.'); }} />}
              <Textarea rows={6} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="No answer yet. Write one here…" />
              <div className={`count-hint ${lc.over ? 'over' : lc.limit ? 'ok' : ''}`}>{lc.count} {lc.unit}{lc.limit ? ` of ${lc.limit}` : ''}{lc.over ? ' · over the limit' : ''}</div>
            </>
          ) : (
            <div className="q-answer">{q.answer || <span className="faint">No answer yet.</span>}</div>
          )}
          <div className="row wrap mt-2" style={{ justifyContent: 'flex-end' }}>
            {canManage && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit question</Button>}
            {isAdmin && <Button variant="danger" size="sm" onClick={remove}>Delete</Button>}
            {canAnswer && writerMode && <Button size="sm" onClick={() => saveAnswer()} loading={saving}>Save</Button>}
            {canAnswer && !writerMode && (q.status === 'submitted' ? (
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
            {!writerMode && <Select className="select-sm" value={edit.assignedToId} onChange={e => setEdit({ ...edit, assignedToId: e.target.value })} style={{ maxWidth: 220 }}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
            </Select>}
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
  const { plan, has } = usePlan();
  const writerMode = plan?.kind === 'writer';
  const [project, setProject] = useState(null);
  const [notesOpen, setNotesOpen] = useState(() => new URLSearchParams(window.location.search).get('notes') === '1');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({ reviewerName: '', reviewerEmail: '', message: '' });
  const [reviewResult, setReviewResult] = useState(null);
  const [narrativeEdit, setNarrativeEdit] = useState(null); // null = viewing, string = editing
  const [narrativeVersions, setNarrativeVersions] = useState([]);
  const [showNarrativeHistory, setShowNarrativeHistory] = useState(false);
  const [viewVersion, setViewVersion] = useState(null);
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
    api.get(`/api/projects/${id}/narrative/versions`).then(res => setNarrativeVersions(res.data)).catch(() => setNarrativeVersions([]));
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
  const exportDoc = async (format) => {
    try {
      const res = await api.get(`/api/projects/${id}/export/${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `${project.name.replace(/[^a-z0-9]+/gi, '-')}.${format}`; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (err) { toast.error(errorMessage(err, 'Could not build the document.')); }
  };
  const saveNarrative = async () => {
    setBusy(true);
    try { await api.put(`/api/projects/${id}/narrative`, { content: narrativeEdit }); toast.success('Narrative saved. The previous text is in version history.'); setNarrativeEdit(null); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const restoreVersion = (v) => act(`Restored version ${v.versionNumber}.`, () => api.post(`/api/projects/${id}/narrative/restore/${v.id}`), { title: `Restore version ${v.versionNumber}`, message: 'The current text will be saved as a new version before restoring.', confirmLabel: 'Restore' });
  const canEditNarrative = has('narrative_editing') && canManage && !project?.isCompleted;
  const canMerge = (isOwner || isAdmin) && !project?.isCompleted;
  const approved = project?.status === 'approved';
  const merged = Boolean(project?.narrative);
  const resolveNote = async (n) => {
    try { await api.put(`/api/projects/${id}/review-comments/${n.id}`, { resolved: !n.resolved }); load(); } catch (err) { toast.error(errorMessage(err)); }
  };
  const sendForReview = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/projects/${id}/review-link`, reviewForm);
      setReviewResult(res.data);
      toast.success(res.data.emailed ? 'Review request emailed.' : 'Review link ready.');
      load();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const merge = () => act('Narrative merged from all answers.', () => api.post(`/api/projects/${id}/compile`), project.narrative ? { title: 'Re-merge narrative', message: 'This replaces the existing narrative with the current answers.', confirmLabel: 'Re-merge' } : null);

  const tabs = [
    { id: 'questions', label: 'Questions', count: prog.total },
    { id: 'narrative', label: 'Merged narrative' },
    { id: 'compliance', label: 'Compliance' },
    ...(writerMode ? [] : [{ id: 'approvals', label: 'Approvals', count: project.approvalRequests?.length || 0 }]),
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
          <p>Owned by {displayName(project.owner)}{project.deadlineDate && ` · Due ${formatDate(project.deadlineDate)}`} · Created {formatDate(project.createdAt)}{project.deadlineDate && <> · <a href={googleCalendarUrl(project)} target="_blank" rel="noopener noreferrer">Add due date to Google Calendar</a></>}</p>
        </div>
        <div className="row wrap">
          {canManage && !project.isCompleted && <Button variant="secondary" onClick={openEdit}>Edit details</Button>}
          {canManage && !project.isCompleted && (writerMode || !has('approvals')) && project.reviewStatus !== 'pending' && <Button variant="accent" disabled={!allSubmitted} title={allSubmitted ? '' : 'Every answer must be submitted first'} onClick={() => { setReviewResult(null); setReviewForm({ reviewerName: project.reviewerName || '', reviewerEmail: project.reviewerEmail || '', message: '' }); setReviewOpen(true); }}>Send for review</Button>}
          {canManage && project.reviewStatus === 'pending' && <Button variant="secondary" onClick={() => act('Review request withdrawn.', () => api.delete(`/api/projects/${id}/review-link`))}>Withdraw review</Button>}
          {canManage && !project.isCompleted && !writerMode && has('approvals') && project.status !== 'pending_approval' && <Button variant="accent" disabled={!allSubmitted} title={allSubmitted ? '' : 'Every answer must be submitted first'} onClick={() => { setApproverId(approvers[0]?.id || ''); setApprovalOpen(true); }}>Request approval</Button>}
          {isAdmin && !writerMode && project.status === 'pending_approval' && !project.reviewToken && <Button variant="secondary" onClick={() => act('Approval request withdrawn.', () => api.put(`/api/projects/${id}/rescind-approval`))}>Withdraw request</Button>}
          <Button variant="secondary" onClick={() => setNotesOpen(o => !o)}>{notesOpen ? 'Hide notes' : 'Notes'}</Button>
          {canManage && !project.isCompleted && <Button variant="secondary" onClick={() => act('Project marked complete.', () => api.put(`/api/projects/${id}`, { isCompleted: true }), { title: 'Mark as completed', message: 'Completed projects move to Past proposals and become read-only for answers.', confirmLabel: 'Mark complete' })}>Mark complete</Button>}
          {canManage && (project.isArchived
            ? <Button variant="secondary" onClick={() => act('Project restored.', () => api.put(`/api/projects/${id}/unarchive`))}>Restore</Button>
            : <Button variant="secondary" onClick={() => act('Project archived.', () => api.put(`/api/projects/${id}/archive`), { title: 'Archive project', message: 'Archived projects are hidden from the main list but can be restored.', confirmLabel: 'Archive' })}>Archive</Button>)}
          {isAdmin && <Button variant="danger" onClick={() => act('Project deleted.', async () => { await api.delete(`/api/projects/${id}`); navigate('/app/projects'); }, { title: 'Delete project', message: 'This permanently deletes the project, its questions, answers, and history.', confirmLabel: 'Delete forever', danger: true })}>Delete</Button>}
        </div>
      </div>

      {allSubmitted && !writerMode && project.status !== 'pending_approval' && !approved && !project.isCompleted && (
        <div className="callout callout-green mb-3"><strong>All answers are in.</strong> {canManage ? 'Request approval when you are ready.' : 'The owner can now request approval.'}</div>
      )}
      {approved && !merged && !project.isCompleted && (
        <div className="callout callout-green mb-3 row-between"><span><strong>Approved.</strong> {canMerge ? 'Merge the answers into one narrative, make final edits, and download.' : 'The project owner will merge and finalize.'}</span>{canMerge && <Button size="sm" onClick={merge} loading={busy}>Merge answers</Button>}</div>
      )}
      {!allSubmitted && prog.total > 0 && !project.isCompleted && !writerMode && (
        <div className="callout mb-3 small">{prog.total - prog.done} of {prog.total} answers still open. Approval unlocks once every answer is submitted.</div>
      )}
      {project.reviewStatus === 'pending' && (
        <div className="callout callout-gold mb-3 row-between"><span>Sent for review{project.reviewerName ? ` to ${project.reviewerName}` : ''} {project.reviewSentAt && `on ${formatDateTime(project.reviewSentAt)}`}. Waiting for a response.</span><CopyButton text={`${window.location.origin}/review/${project.reviewToken}`} label="Copy review link" /></div>
      )}
      {project.reviewStatus === 'approved' && (
        <div className="callout callout-green mb-3"><strong>Approved{project.reviewerName ? ` by ${project.reviewerName}` : ''}</strong>{project.reviewRespondedAt && ` on ${formatDateTime(project.reviewRespondedAt)}`}.{project.reviewComments && <div className="mt-1 pre-wrap">{project.reviewComments}</div>}</div>
      )}
      {project.reviewStatus === 'changes' && (
        <div className="callout callout-danger mb-3"><strong>Changes requested{project.reviewerName ? ` by ${project.reviewerName}` : ''}:</strong> <span className="pre-wrap">{project.reviewComments}</span>{(project.reviewComments2 || []).filter(n => !n.questionId && !n.resolved).map(n => <div key={n.id} className="mt-1 small">• {n.body}</div>)}{(project.reviewComments2 || []).some(n => n.questionId && !n.resolved) && <div className="tiny mt-1">Open the questions marked with reviewer notes below.</div>}</div>
      )}
      {!writerMode && project.status === 'rejected' && !project.reviewToken && latestApproval?.comments && (
        <div className="callout callout-danger mb-3"><strong>Changes requested by {displayName(latestApproval.approver)}:</strong> {latestApproval.comments}</div>
      )}
      {!writerMode && project.status === 'pending_approval' && !project.reviewToken && latestApproval && (
        <div className="callout callout-gold mb-3">Waiting on {displayName(latestApproval.approver)} to approve. Requested {formatDateTime(latestApproval.requestedAt)}.</div>
      )}

      <div className="grid-3 mb-3">
        <Card className="stat"><div className="stat-label">Progress</div><div className="row mt-1"><div className="grow"><Progress value={prog.pct} /></div><span className="small strong">{prog.pct}%</span></div><div className="stat-sub">{prog.done} of {prog.total} answers {writerMode ? 'written' : 'submitted'}</div></Card>
        <Card className="stat"><div className="stat-label">Description</div><div className="small mt-1 pre-wrap">{project.description || <span className="faint">No description</span>}</div></Card>
        <Card className="stat"><div className="stat-label">Angle &amp; partners</div><div className="small mt-1">{project.details?.themeAngle || <span className="faint">No theme set</span>}</div><div className="small muted">{project.details?.possiblePartnership}</div></Card>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'questions' && (
        <div>
          <div className="row-between mb-2">
            <span className="small muted">{writerMode ? 'Click a question to write its answer. Answers save when you click Save.' : 'Click a question to read or write its answer.'}</span>
            {canManage && !project.isCompleted && <Button size="sm" onClick={() => setAddOpen(true)}>+ Add question</Button>}
          </div>
          {project.questions.length === 0 ? (
            <Card><EmptyState icon="✎" title="No questions yet" action={canManage && <Button size="sm" onClick={() => setAddOpen(true)}>Add the first question</Button>}>Add the questions from the funder's application so teammates can start writing.</EmptyState></Card>
          ) : project.questions.map(q => <QuestionRow key={q.id} q={q} project={project} users={users} canManage={canManage && !project.isCompleted} isAdmin={isAdmin} me={user} onChanged={load} writerMode={writerMode} reviewNotes={(project.reviewComments2 || []).filter(n => n.questionId === q.id)} onResolveNote={resolveNote} initiallyOpen={params.get('open') === q.id} />)}
        </div>
      )}

      {tab === 'narrative' && (
        <Card>
          <div className="card-header">
            <div><h3>Merged narrative</h3><div className="tiny muted">{project.narrative ? `Merged ${formatDateTime(project.narrative.updatedAt || project.narrative.createdAt)}. Only the owner or an admin edits from here.` : 'Every answer, in question order, as one document.'}</div></div>
            <div className="row wrap">
              {prog.total > 0 && <Button variant="secondary" size="sm" onClick={() => exportDoc('pdf')}>Download PDF</Button>}
              {prog.total > 0 && <Button variant="secondary" size="sm" onClick={() => exportDoc('docx')}>Download Word</Button>}
              {project.narrative && <CopyButton text={project.narrative.content} label="Copy text" />}
              {canMerge && <Button size="sm" onClick={merge} loading={busy} disabled={prog.total === 0 || !allSubmitted} title={allSubmitted ? '' : 'Every answer must be submitted first'}>{project.narrative ? 'Re-merge' : 'Merge answers'}</Button>}
            </div>
          </div>
          <div className="card-body">
            {!allSubmitted && prog.total > 0 && !project.narrative && <div className="callout callout-gold mb-2 small">{prog.total - prog.done} answer{prog.total - prog.done === 1 ? ' is' : 's are'} not submitted yet. Merge unlocks when everything is in.</div>}
            {project.narrative && narrativeEdit === null && (
              <div className="row-between mb-2">
                <span className="small muted">{has('narrative_editing') ? (canEditNarrative ? 'Edit this as one document. Every save keeps the previous version.' : 'Only the project owner or an admin can edit the merged narrative.') : <>{FEATURE_COPY.narrative_editing.title} is a Premium feature. {isAdmin ? <Link to="/app/settings#plan">See plans</Link> : 'Ask an admin to upgrade.'}</>}</span>
                <div className="row">
                  {narrativeVersions.length > 0 && <Button variant="ghost" size="sm" onClick={() => setShowNarrativeHistory(h => !h)}>{showNarrativeHistory ? 'Hide history' : `History (${narrativeVersions.length})`}</Button>}
                  {canEditNarrative && <Button variant="accent" size="sm" onClick={() => setNarrativeEdit(project.narrative.content)}>Edit narrative</Button>}
                </div>
              </div>
            )}
            {showNarrativeHistory && narrativeEdit === null && narrativeVersions.length > 0 && (
              <div className="table-wrap mb-3"><table className="table"><tbody>{narrativeVersions.map(v => (
                <tr key={v.id}><td><span className="badge badge-navy">v{v.versionNumber}</span></td><td className="small">{v.note || 'Edited'}</td><td className="small muted">{formatDateTime(v.createdAt)} · {displayName(v.createdBy)}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><Button variant="ghost" size="sm" onClick={() => setViewVersion(v)}>View</Button>{canEditNarrative && <Button variant="secondary" size="sm" onClick={() => restoreVersion(v)}>Restore</Button>}</td></tr>
              ))}</tbody></table></div>
            )}
            {narrativeEdit !== null ? (
              <div>
                <Textarea className="narrative-editor" value={narrativeEdit} onChange={e => setNarrativeEdit(e.target.value)} />
                <div className="count-hint">{narrativeEdit.trim().split(/\s+/).filter(Boolean).length} words</div>
                <div className="form-actions"><Button variant="secondary" onClick={() => setNarrativeEdit(null)} disabled={busy}>Cancel</Button><Button onClick={saveNarrative} loading={busy} disabled={narrativeEdit === project.narrative.content}>Save narrative</Button></div>
              </div>
            ) : project.narrative ? <div className="pre-wrap" style={{ lineHeight: 1.7 }}>{project.narrative.content}</div> : <EmptyState icon="▤" title="Nothing merged yet">{writerMode ? 'Merge your answers into one document, then edit, finalize, and download.' : 'After approval, the project owner merges the answers here, edits the narrative as one document, and downloads it.'}</EmptyState>}
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
          {!writerMode && <Field label="Assign to"><Select value={newQ.assignedToId} onChange={e => setNewQ({ ...newQ, assignedToId: e.target.value })}><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}</Select></Field>}
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

      <Modal open={Boolean(viewVersion)} onClose={() => setViewVersion(null)} title={viewVersion ? `Narrative version ${viewVersion.versionNumber}` : ''} size="lg" footer={viewVersion && canEditNarrative && <Button onClick={() => { const v = viewVersion; setViewVersion(null); restoreVersion(v); }}>Restore this version</Button>}>
        {viewVersion && <div className="pre-wrap" style={{ lineHeight: 1.7 }}>{viewVersion.content}</div>}
      </Modal>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Send for review" footer={reviewResult ? <Button onClick={() => setReviewOpen(false)}>Done</Button> : <><Button variant="secondary" onClick={() => setReviewOpen(false)}>Cancel</Button><Button variant="accent" onClick={sendForReview} loading={busy}>Create review link</Button></>}>
        {reviewResult ? (
          <div>
            <div className="form-success">{reviewResult.emailed ? `Emailed to ${reviewResult.reviewerEmail}.` : 'Review link created.'}</div>
            <p className="small muted">Anyone with this link can read the proposal and approve it or send it back with notes. No account needed.</p>
            <div className="callout row-between"><code className="truncate" style={{ maxWidth: 360 }}>{reviewResult.link}</code><CopyButton text={reviewResult.link} /></div>
          </div>
        ) : (
          <>
            <p className="small muted">Share the proposal with your executive director, a board member, or anyone who signs off. They'll get a read-only page with Approve and Request changes buttons.</p>
            {!allSubmitted && prog.total > 0 && <div className="callout callout-gold mb-2 small">Not every answer is written yet. The reviewer will see the proposal as it is now.</div>}
            <div className="grid-2">
              <Field label="Reviewer name"><Input value={reviewForm.reviewerName} onChange={e => setReviewForm({ ...reviewForm, reviewerName: e.target.value })} /></Field>
              <Field label="Reviewer email" hint="Optional. We'll email the link if email is set up."><Input type="email" value={reviewForm.reviewerEmail} onChange={e => setReviewForm({ ...reviewForm, reviewerEmail: e.target.value })} /></Field>
            </div>
            <Field label="Message"><Textarea rows={3} value={reviewForm.message} onChange={e => setReviewForm({ ...reviewForm, message: e.target.value })} placeholder="Anything they should focus on?" /></Field>
          </>
        )}
      </Modal>

      <NotesDrawer projectId={id} initialNotes={project.notes} open={notesOpen} onClose={() => setNotesOpen(false)} canEdit={canManage || user.role === 'editor'} />
      {!notesOpen && <button className="notes-toggle" onClick={() => setNotesOpen(true)}>Notes</button>}

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
