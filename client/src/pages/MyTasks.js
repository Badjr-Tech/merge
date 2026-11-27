import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Loading, PageHeader, Textarea } from '../components/ui';
import { dueLabel, limitCheck, questionStatus } from '../lib/format';
import SimilarAnswers from '../components/SimilarAnswers';
import DraftAnswer from '../components/DraftAnswer';
import Placeholders from '../components/Placeholders';
import { ConflictModal, LockedNotice } from '../components/AnswerLock';
import useQuestionLock from '../lib/useQuestionLock';

function TaskCard({ q, project, onSaved }) {
  const toast = useToast();
  const [answer, setAnswer] = useState(q.answer || '');
  const answerRef = React.useRef();
  // Puts the cursor on the placeholder in the answer box, so "where is it" stops being a hunt.
  const locate = (needle) => {
    const el = answerRef.current;
    if (!el) return;
    const i = el.value.indexOf(needle);
    if (i < 0) return;
    el.focus();
    el.setSelectionRange(i, i + needle.length);
    el.blur(); el.focus();
  };
  // The card keeps its identity across a reload, so without this the box would still show the
  // old draft after "Show me the latest" in the conflict popup.
  useEffect(() => { setAnswer(q.answer || ''); }, [q.answer]);
  const [saving, setSaving] = useState(false);
  const dirty = answer !== (q.answer || '');
  const lc = limitCheck(answer, q.maxLimit, q.limitUnit);
  const st = questionStatus(q);
  // Every task on this page renders its answer box at once, so claiming on render would lock a
  // dozen questions the moment the page loads. The claim waits until someone puts the cursor in
  // one, which always happens before they can type a character.
  const [engaged, setEngaged] = useState(false);
  const lock = useQuestionLock(q.id, engaged);
  const [conflict, setConflict] = useState(null);
  const lockedOut = Boolean(lock.blockedBy);

  // `force` is the deliberate overwrite offered by the conflict popup. Without it the save
  // carries the version this person loaded, so the server can refuse one that would bury an
  // answer written while they were typing.
  const save = async (status, force = false) => {
    if (status === 'submitted' && !answer.trim()) { toast.error('Write an answer before submitting.'); return; }
    setSaving(true);
    try {
      const r = await api.put(`/api/projects/questions/${q.id}`, {
        answer,
        status: status || (q.status === 'pending' ? 'in-progress' : q.status),
        ...(force || !lock.base ? {} : { baseUpdatedAt: lock.base }),
      });
      if (r.data && r.data.updatedAt) lock.setBase(r.data.updatedAt);
      setConflict(null);
      toast.success(status === 'submitted' ? 'Answer submitted.' : 'Draft saved.');
      // Saved and no longer in the box means done, so the question goes back to the team now
      // rather than at the end of the idle window. Typing in it again reclaims it.
      if (document.activeElement !== answerRef.current) lock.release();
      onSaved();
    } catch (err) {
      const d = (err.response && err.response.data) || {};
      if (err.response && err.response.status === 409 && d.conflict) setConflict({ status });
      else toast.error(errorMessage(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="q-card">
      <div className="row-between">
        <div className="q-text">{q.text}</div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="q-meta">
        {q.maxLimit ? <span>Limit: {q.maxLimit} {lc.unit}</span> : <span>No limit</span>}
      </div>
      <LockedNotice lockedBy={lock.blockedBy} />
      {!lockedOut && q.status !== 'submitted' && <SimilarAnswers questionId={q.id} onUse={(text) => { setAnswer(a => a.trim() ? `${a}\n\n${text}` : text); toast.success('Added to your draft. Edit it, then save or submit.'); }} />}
      <Textarea ref={answerRef} className="mt-2" rows={5} value={answer} onChange={e => { setAnswer(e.target.value); lock.touch(); }} onFocus={() => { setEngaged(true); lock.touch(); }} onBlur={() => { if (!dirty) lock.release(); }} readOnly={lockedOut} placeholder={lockedOut ? 'Read-only while someone else is writing.' : 'Write your answer here…'} />
      <div className={`count-hint ${lc.over ? 'over' : lc.limit ? 'ok' : ''}`}>{lc.count} {lc.unit}{lc.limit ? ` of ${lc.limit}` : ''}{lc.over ? ' · over the limit' : ''}</div>
      {!lockedOut && <Placeholders text={answer} onChange={setAnswer} onLocate={locate} projectId={project?.id} />}
      <div className="row mt-1" style={{ justifyContent: 'flex-end' }}>
        {q.status !== 'submitted' && !lockedOut && <DraftAnswer questionId={q.id} currentAnswer={answer} onDraft={setAnswer} disabled={saving} />}
        {q.status === 'submitted' && !dirty ? (
          <Button variant="secondary" size="sm" onClick={() => save('in-progress')} loading={saving} disabled={lockedOut}>Reopen</Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => save()} loading={saving} disabled={lockedOut || (!dirty && q.status !== 'pending')}>Save draft</Button>
            <Button size="sm" onClick={() => save('submitted')} loading={saving} disabled={lockedOut}>Submit answer</Button>
          </>
        )}
      </div>
      <ConflictModal
        open={Boolean(conflict)}
        onClose={() => setConflict(null)}
        busy={saving}
        onRefresh={() => { setConflict(null); lock.retry(); onSaved(); }}
        onOverwrite={() => { const st2 = conflict && conflict.status; setConflict(null); save(st2, true); }}
      />
    </div>
  );
}

export default function MyTasks() {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.get('/api/projects/with-assigned-questions').then(res => setGroups(res.data)).catch(err => setError(errorMessage(err)));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = (groups || []).map(p => ({ ...p, mine: (p.questions || []).filter(q => q.assignedToId === user.id) })).filter(p => p.mine.length);
  const open = visible.reduce((n, p) => n + p.mine.filter(q => q.status !== 'submitted').length, 0);

  return (
    <div>
      <PageHeader title="My tasks" subtitle={groups ? (open ? `${open} question${open === 1 ? '' : 's'} waiting on you.` : 'You are all caught up.') : ' '} />
      {error && <ErrorBlock message={error} retry={load} />}
      {!groups && !error && <Loading />}
      {groups && visible.length === 0 && (
        <Card><EmptyState icon="✎" title="No questions assigned to you">When a project owner assigns you a question, it shows up here with its word limit and a place to write.</EmptyState></Card>
      )}
      {visible.map(p => {
        const due = dueLabel(p.deadlineDate);
        return (
          <Card key={p.id} className="mb-3">
            <div className="card-header">
              <div><h3><Link to={`/app/projects/${p.id}`} style={{ color: 'var(--navy)' }}>{p.name}</Link></h3><div className="tiny muted">{p.mine.filter(q => q.status === 'submitted').length}/{p.mine.length} of your questions submitted</div></div>
              {due && <Badge tone={due.tone}>{due.text}</Badge>}
            </div>
            <div className="card-body">
              {/* The thread for the grant, where the writing happens. Without it on this page an
                  approver or a writer answered each question with no idea what the grant argues. */}
              {(p.details?.themeAngle || p._count?.kickoffNotes > 0) && (
                <div className="callout callout-indigo mb-3">
                  <div className="label mb-1">What this grant argues</div>
                  {p.details?.themeAngle && <div className="small pre-wrap">{p.details.themeAngle}</div>}
                  <div className="tiny muted mt-1">
                    {p._count?.kickoffNotes > 0
                      ? <>Your answers should follow this. <Link to={`/app/projects/${p.id}`}>{p._count.kickoffNotes} kickoff note{p._count.kickoffNotes === 1 ? '' : 's'}</Link> from the team add to it.</>
                      : 'Your answers should follow this.'}
                  </div>
                </div>
              )}
              {p.mine.map(q => <TaskCard key={q.id} q={q} project={p} onSaved={load} />)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
