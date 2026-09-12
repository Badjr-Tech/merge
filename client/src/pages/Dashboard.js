import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Loading, PageHeader, Progress } from '../components/ui';
import { displayName, dueLabel, projectStatus, projectProgress, formatDate } from '../lib/format';

export default function Dashboard() {
  const { user, isAdmin, isApprover, canEdit } = useAuth();
  const { plan } = usePlan();
  const writerMode = plan?.kind === 'writer';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.get('/api/projects/dashboard/summary').then(res => setData(res.data)).catch(err => setError(errorMessage(err)));
  };
  useEffect(load, []);

  const first = (user?.name || user?.username || '').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader title={`${greeting}, ${first}`} subtitle={formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={canEdit && <Button to="/app/projects/new">+ New project</Button>} />

      {params.get('welcome') && (
        <div className="callout callout-green mb-3">
          <strong>Your workspace is ready.</strong> Start by creating a project from a grant application, then invite teammates from the <Link to="/app/team">Team</Link> page.
        </div>
      )}

      {error && <ErrorBlock message={error} retry={load} />}
      {!data && !error && <Loading />}

      {data && (
        <>
          <div className="grid-4 mb-3">
            <Card className="stat"><div className="stat-label">Active projects</div><div className="stat-value">{data.active}</div></Card>
            <Card className="stat"><div className="stat-label">{writerMode ? 'Unanswered questions' : 'My open questions'}</div><div className="stat-value">{data.myOpenQuestions}</div>{!writerMode && <div className="stat-sub"><Link to="/app/tasks">Go to my tasks</Link></div>}</Card>
            <Card className="stat"><div className="stat-label">{writerMode ? 'Out for review' : isApprover ? 'Awaiting my approval' : 'Awaiting approval'}</div><div className="stat-value">{isApprover && !writerMode ? data.awaitingMyApproval : data.pendingApproval}</div>{!writerMode && <div className="stat-sub"><Link to="/app/approvals">View approvals</Link></div>}</Card>
            <Card className="stat"><div className="stat-label">Next deadline</div><div className="stat-value" style={{ fontSize: 20 }}>{data.upcoming[0] ? formatDate(data.upcoming[0].deadlineDate, { month: 'short', day: 'numeric' }) : '—'}</div><div className="stat-sub truncate">{data.upcoming[0]?.name || 'No upcoming deadlines'}</div></Card>
          </div>

          <div className="grid-2">
            <Card>
              <div className="card-header"><h3>Upcoming deadlines</h3><Link to="/app/calendar" className="small">Calendar</Link></div>
              {data.upcoming.length === 0 ? (
                <EmptyState icon="▦" title="Nothing due soon">Projects with a due date will show up here.</EmptyState>
              ) : (
                <div className="table-wrap"><table className="table">
                  <tbody>
                    {data.upcoming.map(p => {
                      const due = dueLabel(p.deadlineDate);
                      const prog = projectProgress(p);
                      return (
                        <tr key={p.id} className="clickable" onClick={() => navigate(`/app/projects/${p.id}`)}>
                          <td><div className="strong" style={{ color: 'var(--navy)' }}>{p.name}</div><div className="tiny muted">{prog.done}/{prog.total} questions submitted</div></td>
                          <td style={{ width: 120 }}><Progress value={prog.pct} /></td>
                          <td style={{ textAlign: 'right' }}>{due && <Badge tone={due.tone}>{due.text}</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </Card>

            <Card>
              <div className="card-header"><h3>Recent projects</h3><Link to="/app/projects" className="small">All projects</Link></div>
              {data.recent.length === 0 ? (
                <EmptyState icon="▤" title="No projects yet" action={canEdit && <Button to="/app/projects/new" size="sm">Create your first project</Button>}>
                  A project is one grant application, broken into the questions the funder asks.
                </EmptyState>
              ) : (
                <div className="table-wrap"><table className="table">
                  <tbody>
                    {data.recent.map(p => {
                      const st = projectStatus(p);
                      return (
                        <tr key={p.id} className="clickable" onClick={() => navigate(`/app/projects/${p.id}`)}>
                          <td><div className="strong" style={{ color: 'var(--navy)' }}>{p.name}</div><div className="tiny muted">{displayName(p.owner)} · {formatDate(p.createdAt)}</div></td>
                          <td style={{ textAlign: 'right' }}><Badge tone={st.tone}>{st.label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </Card>
          </div>

          {isAdmin && data.active === 0 && (
            <Card pad className="mt-3">
              <h3>Getting started</h3>
              <ol style={{ margin: '8px 0 0', paddingLeft: 20 }} className="stack">
                <li><Link to="/app/projects/new">Create a project</Link> and paste in the funder's questions.</li>
                {writerMode ? <li>Fill in your <Link to="/app/settings">organization profile</Link> so suggestions use your real details.</li> : <li><Link to="/app/team">Invite teammates</Link> and assign each question to someone.</li>}
                <li>Track progress here, then request approval and merge the narrative.</li>
              </ol>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
