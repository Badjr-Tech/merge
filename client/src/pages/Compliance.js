import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { Badge, Card, EmptyState, ErrorBlock, Loading, PageHeader, Select } from '../components/ui';
import { limitCheck } from '../lib/format';

export default function Compliance() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/api/projects').then(r => { setProjects(r.data); if (r.data[0]) setProjectId(r.data[0].id); }).catch(err => setError(errorMessage(err))); }, []);
  useEffect(() => { if (!projectId) return; setProject(null); api.get(`/api/projects/${projectId}`).then(r => setProject(r.data)).catch(err => setError(errorMessage(err))); }, [projectId]);

  const qs = project?.questions || [];
  const over = qs.filter(q => limitCheck(q.answer, q.maxLimit, q.limitUnit).over);
  const unanswered = qs.filter(q => !q.answer);

  return (
    <div>
      <PageHeader title="Compliance check" subtitle="See every answer against its word or character limit at a glance." />
      {error && <ErrorBlock message={error} />}
      <div className="row wrap mb-3">
        <Select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ maxWidth: 360 }}>
          {projects.length === 0 && <option value="">No active projects</option>}
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        {project && <Link to={`/app/projects/${project.id}`} className="small">Open project →</Link>}
      </div>
      {projectId && !project && !error && <Loading />}
      {project && (
        <>
          <div className="grid-3 mb-3">
            <Card className="stat"><div className="stat-label">Questions</div><div className="stat-value">{qs.length}</div></Card>
            <Card className="stat"><div className="stat-label">Over limit</div><div className="stat-value" style={{ color: over.length ? 'var(--danger)' : 'var(--green-dark)' }}>{over.length}</div></Card>
            <Card className="stat"><div className="stat-label">Unanswered</div><div className="stat-value">{unanswered.length}</div></Card>
          </div>
          {qs.length === 0 ? <Card><EmptyState icon="☑" title="No questions in this project" /></Card> : (
            <div className="stack">{qs.map(q => { const c = limitCheck(q.answer, q.maxLimit, q.limitUnit); return (
              <Card key={q.id} pad style={{ borderLeft: `4px solid ${!q.answer ? 'var(--gray)' : c.over ? 'var(--danger)' : 'var(--green)'}` }}>
                <div className="row-between"><div className="q-text">{q.text}</div>{!q.answer ? <Badge tone="gray">No answer</Badge> : c.over ? <Badge tone="danger">Over by {c.count - c.limit} {c.unit}</Badge> : <Badge tone="green">{c.count}{c.limit ? ` / ${c.limit}` : ''} {c.unit}</Badge>}</div>
                {q.answer && <div className="q-answer small muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{q.answer}</div>}
              </Card>
            ); })}</div>
          )}
        </>
      )}
    </div>
  );
}
