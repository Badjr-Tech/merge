import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, MessageSquarePlus, Paperclip, Pencil, Undo2 } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, ErrorBlock, Field, Loading, Textarea } from '../components/ui';
import { ConflictModal, LockedNotice } from '../components/AnswerLock';
import UpgradeGate from '../components/Upgrade';
import useQuestionLock from '../lib/useQuestionLock';
import { displayName, formatDate, formatDateTime, wordCount } from '../lib/format';

// The approver's own view of a proposal. Sending them to the project page put them in the
// writers' workspace -- progress bars, assignment controls, one collapsed question at a time --
// when the job in front of them is to read the thing end to end and say yes or no. This page is
// the proposal itself: every answer in order, editable in place for the small fixes that are
// faster to make than to describe, with notes for everything else.

// A note you have just sent is the one you most want to fix: the sentence came out wrong, or you
// hit save mid-thought. Rewriting is the author's own, and the note carries an "edited" marker
// afterwards so the writer knows the words moved.
function Note({ n, mine, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.body);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(n.body); }, [n.body]);

  return (
    <div className={`review-note ${n.resolved ? 'resolved' : ''}`}>
      {n.quote && <div className="review-quote">“{n.quote}”</div>}
      {editing ? (
        <>
          <Textarea rows={3} value={text} onChange={e => setText(e.target.value)} autoFocus />
          <div className="row mt-1" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={() => { setText(n.body); setEditing(false); }}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!text.trim() || text.trim() === n.body} onClick={async () => {
              setBusy(true);
              try { await onSave(n, text.trim()); setEditing(false); } finally { setBusy(false); }
            }}>Save note</Button>
          </div>
        </>
      ) : (
        <>
          <strong>{n.reviewerName || 'Reviewer'}:</strong> <span className="pre-wrap">{n.body}</span>
          <div className="row-between mt-1">
            <span className="tiny muted">{formatDateTime(n.createdAt)}{n.editedAt ? ' · edited' : ''}</span>
            {mine && <button type="button" className="link-button tiny" onClick={() => setEditing(true)}>Edit</button>}
          </div>
        </>
      )}
    </div>
  );
}

function NoteList({ notes, meId, onSaveNote }) {
  if (!notes.length) return null;
  return (
    <div className="mt-2">
      {notes.map(n => <Note key={n.id} n={n} mine={Boolean(meId) && n.authorId === meId} onSave={onSaveNote} />)}
    </div>
  );
}

// Writes a note against one question, optionally quoting the sentence that prompted it.
function NoteComposer({ quote, onClear, onSave, open, setOpen }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (open && ref.current) ref.current.focus(); }, [open, quote]);

  if (!open) return null;
  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await onSave(text.trim(), quote || null); setText(''); setOpen(false); onClear(); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-2">
      {quote && (
        <div className="review-quote row-between">
          <span>“{quote}”</span>
          <button type="button" className="link-button tiny" onClick={onClear}>Drop the quote</button>
        </div>
      )}
      <Textarea ref={ref} rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={quote ? 'What should change about this sentence?' : 'Your note on this answer…'} />
      <div className="row mt-1" style={{ justifyContent: 'flex-end' }}>
        <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setText(''); onClear(); }}>Cancel</Button>
        <Button size="sm" loading={busy} disabled={!text.trim()} onClick={save}>Add note</Button>
      </div>
    </div>
  );
}

function Section({ q, index, notes, meId, onAddNote, onSaveNote, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState(q.answer || '');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [quote, setQuote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const bodyRef = useRef(null);

  // The lock is only claimed once they actually open the answer for editing. Claiming on render
  // would lock every question in the proposal the moment this page loaded.
  const lock = useQuestionLock(q.id, editing);
  const lockedOut = Boolean(lock.blockedBy);

  useEffect(() => { setAnswer(q.answer || ''); }, [q.answer]);

  // A note usually starts from one sentence that reads wrong. Selecting it inside this answer
  // carries the words into the note, so the writer does not have to hunt for what was meant.
  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = String(sel.toString()).trim();
    if (!text || text.length < 3) return;
    if (bodyRef.current && sel.anchorNode && bodyRef.current.contains(sel.anchorNode)) {
      setQuote(text.slice(0, 600));
      setNoteOpen(true);
    }
  }, []);

  const save = async (force = false) => {
    setSaving(true);
    try {
      await api.put(`/api/projects/questions/${q.id}`, {
        answer,
        ...(force || !lock.base ? {} : { baseUpdatedAt: lock.base }),
      });
      toast.success('Answer saved.');
      setEditing(false);
      setConflict(null);
      onChanged();
    } catch (err) {
      const d = (err.response && err.response.data) || {};
      if (err.response && err.response.status === 409 && d.conflict) setConflict(d);
      else toast.error(errorMessage(err));
    } finally { setSaving(false); }
  };

  const isUpload = q.type === 'upload';
  const unanswered = !q.answer || !q.answer.trim();

  return (
    <div className="review-section" id={`q-${q.id}`}>
      <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <h3 className="grow mb-0">{index + 1}. {q.text}</h3>
        <div className="row tiny muted" style={{ flexShrink: 0, alignItems: 'center' }}>
          {q.assignedTo && <span>{displayName(q.assignedTo)}</span>}
          {!unanswered && !isUpload && <span>{wordCount(q.answer)} words</span>}
        </div>
      </div>

      {editing ? (
        <div className="mt-2">
          {lockedOut && <LockedNotice lockedBy={lock.blockedBy} />}
          <Textarea rows={Math.min(24, Math.max(6, Math.ceil((answer.length || 0) / 90) + 2))} value={answer} onChange={e => { setAnswer(e.target.value); lock.touch(); }} onFocus={() => lock.touch()} readOnly={lockedOut} autoFocus />
          <div className="row mt-1" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={() => { setAnswer(q.answer || ''); setEditing(false); }}><Undo2 size={14} /> Cancel</Button>
            <Button size="sm" loading={saving} disabled={lockedOut} onClick={() => save(false)}>Save answer</Button>
          </div>
        </div>
      ) : isUpload ? (
        <div className="review-answer">
          {q.file ? <span><Paperclip size={14} /> {q.file.filename}</span> : <span className="faint">[Nothing uploaded yet]</span>}
        </div>
      ) : (
        <div ref={bodyRef} className="pre-wrap review-answer" onMouseUp={captureSelection}>
          {unanswered ? <span className="faint">[No answer yet]</span> : q.answer}
        </div>
      )}

      {!editing && (
        <>
          <div className="row mt-1">
            {!isUpload && <button type="button" className="link-button small" onClick={() => setEditing(true)}><Pencil size={14} /> Edit this answer</button>}
            {!noteOpen && <button type="button" className="link-button small" onClick={() => setNoteOpen(true)}><MessageSquarePlus size={14} /> Add a note</button>}
            {!isUpload && !noteOpen && !unanswered && <span className="tiny faint">Select a sentence to quote it in a note.</span>}
          </div>
          <NoteComposer open={noteOpen} setOpen={setNoteOpen} quote={quote} onClear={() => setQuote('')} onSave={(body, qt) => onAddNote(q.id, body, qt)} />
        </>
      )}

      <NoteList notes={notes} meId={meId} onSaveNote={onSaveNote} />

      <ConflictModal
        open={Boolean(conflict)}
        onClose={() => setConflict(null)}
        onOverwrite={() => save(true)}
        busy={saving}
        onRefresh={() => { setConflict(null); lock.retry(); onChanged(); }}
      />
    </div>
  );
}

export default function ApprovalReview() {
  // Approvals are a plan feature, and this page is part of them: without the gate the review
  // view would be a way around the one on the approvals list.
  return <UpgradeGate feature="approvals" title="Approvals" subtitle="Read a proposal end to end, fix what needs fixing, and sign it off."><InnerApprovalReview /></UpgradeGate>;
}

function InnerApprovalReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isApprover } = useAuth();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get(`/api/projects/${id}`).then(r => setProject(r.data)).catch(err => setError(errorMessage(err)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const addNote = async (questionId, body, quote) => {
    try {
      const r = await api.post(`/api/projects/${id}/review-comments`, { questionId, body, quote });
      setProject(p => ({ ...p, reviewComments2: [...(p.reviewComments2 || []), r.data] }));
      toast.success('Note added.');
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const notesFor = useCallback((qid) => (project?.reviewComments2 || []).filter(n => n.questionId === qid), [project]);
  const openNotes = useMemo(() => (project?.reviewComments2 || []).filter(n => !n.resolved), [project]);

  const saveNote = async (note, body) => {
    try {
      const r = await api.put(`/api/projects/${id}/review-comments/${note.id}`, { body });
      setProject(p => ({ ...p, reviewComments2: (p.reviewComments2 || []).map(n => (n.id === note.id ? r.data : n)) }));
      toast.success('Note updated.');
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const respond = async (approvalStatus) => {
    if (approvalStatus === 'rejected' && !comments.trim() && !openNotes.length) {
      toast.error('Say what needs to change, either here or as a note on an answer.');
      return;
    }
    setBusy(approvalStatus);
    try {
      await api.put(`/api/projects/${id}/respond-approval`, { approvalStatus, comments: comments.trim() || undefined });
      toast.success(approvalStatus === 'approved' ? 'Approved.' : 'Sent back with your notes.');
      navigate('/app/approvals');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  if (error) return <ErrorBlock message={error} retry={load} />;
  if (!project) return <Loading />;

  const pending = (project.approvalRequests || []).find(a => a.status === 'pending');
  const mine = pending && pending.approverId === user?.id;
  const questions = project.questions || [];
  const unanswered = questions.filter(q => !q.answer || !q.answer.trim()).length;

  return (
    <div className="approval-review">
      <div className="row-between mb-2">
        <Link to="/app/approvals" className="link-button small"><ArrowLeft size={14} /> Back to approvals</Link>
        <Link to={`/app/projects/${project.id}`} className="link-button small">Open the full project workspace</Link>
      </div>

      <h1 className="mb-1">{project.name}</h1>
      <p className="muted mb-2">
        {project.company?.name}{project.owner ? ` · written by ${displayName(project.owner)}` : ''}
        {project.deadlineDate ? ` · due ${formatDate(project.deadlineDate)}` : ''}
        {pending ? ` · sent for approval ${formatDateTime(pending.requestedAt)}` : ''}
      </p>
      <div className="row mb-3">
        <Badge tone="gold">For your approval</Badge>
        <span className="small muted">{questions.length} question{questions.length === 1 ? '' : 's'}{unanswered ? ` · ${unanswered} with no answer yet` : ' · all answered'}</span>
      </div>

      {project.description && <Card pad className="mb-3"><div className="small muted mb-1">What this grant is for</div><div className="pre-wrap">{project.description}</div></Card>}
      {project.details?.themeAngle && <Card pad className="mb-3"><div className="small muted mb-1">The angle every answer follows</div><div className="pre-wrap">{project.details.themeAngle}</div></Card>}

      {!mine && (
        <div className="callout callout-gold mb-3 small">
          {pending
            ? <>This proposal is waiting on {displayName(pending.approver)}, not you. You can read it and leave notes, but the decision is theirs.</>
            : <>Nobody has this proposal out for approval right now. You can read it and leave notes.</>}
        </div>
      )}

      <Card pad className="review-doc mb-3">
        {questions.length === 0 && <p className="muted mb-0">This proposal has no questions yet.</p>}
        {questions.map((q, i) => <React.Fragment key={q.id}>
          {q.section && (i === 0 || questions[i - 1].section !== q.section) && <div className="q-section-head"><span>{q.section}</span></div>}
          <Section q={q} index={i} notes={notesFor(q.id)} meId={user?.id} onAddNote={addNote} onSaveNote={saveNote} onChanged={load} />
        </React.Fragment>)}
      </Card>

      {mine && isApprover && (
        <Card pad className="mb-3">
          <h3 className="mt-0">Your decision</h3>
          <p className="small muted">
            Approving tells {displayName(project.owner)} to merge the answers and finalize the proposal.
            Requesting changes sends it back with your notes{openNotes.length ? `, including the ${openNotes.length} you left above` : ''}.
          </p>
          <Field label="Notes for the writer" hint={openNotes.length ? 'The notes you left on individual answers go with this.' : 'Required if you are requesting changes.'}>
            <Textarea rows={4} value={comments} onChange={e => setComments(e.target.value)} />
          </Field>
          <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
            <Button variant="danger" loading={busy === 'rejected'} onClick={() => respond('rejected')}>Request changes</Button>
            <Button loading={busy === 'approved'} onClick={() => respond('approved')}><Check size={16} /> Approve</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
