import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBlock, Input, Loading, PageHeader, Progress, Select, Tabs } from '../components/ui';
import { displayName, dueLabel, projectStatus, projectProgress } from '../lib/format';

export default function Projects() {
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [users, setUsers] = useState([]);
  const [owner, setOwner] = useState('');

  useEffect(() => { api.get('/api/users').then(r => setUsers(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    setProjects(null);
    setError('');
    const url = tab === 'archived' ? '/api/projects/archived' : tab === 'completed' ? '/api/projects/completed' : '/api/projects';
    const params = tab === 'active' ? { name: q, status, ownerId: owner, sortBy: sort } : {};
    api.get(url, { params }).then(res => { if (!cancelled) setProjects(res.data); }).catch(err => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [tab, q, status, owner, sort]);

  const filtered = (projects || []).filter(p => tab === 'active' || !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Projects" subtitle="Every grant application your team is working on." actions={canEdit && <Button to="/app/projects/new">+ New project</Button>} />
      <Tabs active={tab} onChange={setTab} tabs={[{ id: 'active', label: 'Active' }, { id: 'completed', label: 'Completed' }, { id: 'archived', label: 'Archived' }]} />

      <div className="row wrap mb-3">
        <Input placeholder="Search by name…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        {tab === 'active' && (
          <>
            <Select value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 190 }}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Awaiting approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Needs changes</option>
            </Select>
            <Select value={owner} onChange={e => setOwner(e.target.value)} style={{ maxWidth: 190 }}>
              <option value="">All owners</option>
              {users.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
            </Select>
            <Select value={sort} onChange={e => setSort(e.target.value)} style={{ maxWidth: 190 }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="dueDate_asc">Due soonest</option>
              <option value="dueDate_desc">Due latest</option>
            </Select>
          </>
        )}
      </div>

      {error && <ErrorBlock message={error} />}
      {!projects && !error && <Loading />}
      {projects && filtered.length === 0 && (
        <Card>
          <EmptyState icon="▤" title={tab === 'active' ? 'No active projects' : `No ${tab} projects`} action={tab === 'active' && canEdit && <Button to="/app/projects/new">Create a project</Button>}>
            {tab === 'active' ? 'Create a project from a grant application to get your team started.' : 'Projects will appear here as their status changes.'}
          </EmptyState>
        </Card>
      )}

      {projects && filtered.length > 0 && (
        <div className="stack">
          {filtered.map(p => {
            const st = projectStatus(p);
            const prog = projectProgress(p);
            const due = dueLabel(p.deadlineDate);
            return (
              <Card key={p.id} pad onClick={() => navigate(`/app/projects/${p.id}`)}>
                <div className="row-between">
                  <div className="grow">
                    <div className="row wrap"><h3 className="mb-0">{p.name}</h3><Badge tone={st.tone}>{st.label}</Badge>{due && !p.isCompleted && <Badge tone={due.tone}>{due.text}</Badge>}</div>
                    {p.description && <p className="muted small mt-1 mb-0 truncate" style={{ maxWidth: 640 }}>{p.description}</p>}
                  </div>
                  <div className="row" style={{ minWidth: 200, justifyContent: 'flex-end' }}>
                    <Avatar user={p.owner} size="sm" /><span className="small muted">{displayName(p.owner)}</span>
                  </div>
                </div>
                {p.questions && p.questions.length > 0 && (
                  <div className="row mt-2"><div className="grow"><Progress value={prog.pct} /></div><span className="tiny muted">{prog.done}/{prog.total} submitted</span></div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {tab === 'active' && projects && (
        <p className="tiny faint mt-3">Looking for finished work? See <Link to="/app/past-proposals">Past proposals</Link>.</p>
      )}
    </div>
  );
}
