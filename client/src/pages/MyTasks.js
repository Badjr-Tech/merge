import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Loading, PageHeader, Textarea } from '../components/ui';
import { dueLabel, limitCheck, questionStatus } from '../lib/format';

function TaskCard({ q, project, onSaved }) {
  const toast = useToast();
  const [answer, setAnswer] = useState(q.answer || '');
  const [saving, setSaving] = useState(false);
  const dirty = answer !== (q.answer || '');
  const lc = limitCheck(answer, q.maxLimit, q.limitUnit);
  const st = questionStatus(q);

  const save = async (status) => {
    if (status === 'submitted' && !answer.trim()) { toast.error('Write an answer before submitting.'); return; }
    setSaving(true);
    try {
      await api.put(`/api/projects/questions/${q.id}`, { answer, status: status || (q.status === 'pending' ? 'in-progress' : q.status) });
      toast.success(status === 'submitted' ? 'Answer submitted.' : 'Draft saved.');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save.'));
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
      <Textarea className="mt-2" rows={5} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Write your answer here…" disabled={q.status === 'submitted' && !dirty && false} />
      <div className={`count-hint ${lc.over ? 'over' : lc.limit ? 'ok' : ''}`}>{lc.count} {lc.unit}{lc.limit ? ` of ${lc.limit}` : ''}{lc.over ? ' · over the limit' : ''}</div>
      <div className="row mt-1" style={{ justifyContent: 'flex-end' }}>
        {q.status === 'submitted' && !dirty ? (
          <Button variant="secondary" size="sm" onClick={() => save('in-progress')} loading={saving}>Reopen</Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => save()} loading={saving} disabled={!dirty && q.status !== 'pending'}>Save draft</Button>
            <Button size="sm" onClick={() => save('submitted')} loading={saving}>Submit answer</Button>
          </>
        )}
      </div>
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
  useEffect(load, []);

  const visible = (groups || []).map(p => ({ ...p, mine: (p.questions || []).filter(q => q.assignedToId === user.id) })).filter(p => p.mine.length);
  const open = visible.reduce((n, p) => n + p.mine.filter(q => q.status !== 'submitted').length, 0);

  return (
    <div className="content-narrow">
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
              {p.mine.map(q => <TaskCard key={q.id} q={q} project={p} onSaved={load} />)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
