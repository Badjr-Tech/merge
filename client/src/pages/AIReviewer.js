import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { marked } from 'marked';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, Loading, PageHeader, Select, Tabs, Textarea } from '../components/ui';
import UpgradeGate from '../components/Upgrade';
import { displayName, formatDateTime } from '../lib/format';

export function AIReviewer() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('new');
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(params.get('project') || '');
  const [website, setWebsite] = useState('');
  const [purpose, setPurpose] = useState('');
  const [result, setResult] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState(null);
  const [archived, setArchived] = useState(null);

  useEffect(() => { api.get('/api/projects').then(r => { setProjects(r.data); if (!projectId && r.data[0]) setProjectId(r.data[0].id); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'history' && reviews === null) api.get('/api/ai/reviews').then(r => setReviews(r.data)).catch(err => setError(errorMessage(err)));
    if (tab === 'archived' && archived === null) api.get('/api/ai/archived-reviews').then(r => setArchived(r.data)).catch(err => setError(errorMessage(err)));
  }, [tab, reviews, archived]);

  const run = async () => {
    setError(''); setResult(''); setRunning(true);
    try {
      const res = await api.post('/api/ai/review', { projectId, grantWebsite: website, grantPurposeStatement: purpose });
      setResult(res.data.review); setReviews(null);
      toast.success('Review complete and saved to history.');
    } catch (err) { setError(errorMessage(err, 'The review failed.')); } finally { setRunning(false); }
  };

  const list = (items) => items.length === 0 ? <Card><EmptyState icon="✦" title="No reviews here yet" /></Card> : (
    <Card><div className="table-wrap"><table className="table"><thead><tr><th>Project</th><th>Reviewed</th><th>Grant</th></tr></thead><tbody>{items.map(r => (
      <tr key={r.id} className="clickable" onClick={() => navigate(`/app/ai-review/${r.id}`)}><td className="strong" style={{ color: 'var(--navy)' }}>{r.project.name}</td><td className="small muted">{formatDateTime(r.reviewedAt)} · {displayName(r.reviewedBy)}</td><td className="small muted truncate" style={{ maxWidth: 260 }}>{r.grantWebsite}</td></tr>
    ))}</tbody></table></div></Card>
  );

  const tabs = [{ id: 'new', label: 'New review' }, { id: 'history', label: 'History' }];
  if (isAdmin) tabs.push({ id: 'archived', label: 'Archived' });

  return (
    <div>
      <PageHeader title="AI reviewer" subtitle="Get a funder's-eye critique of a proposal before you submit it." />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {error && <ErrorBlock message={error} />}
      {tab === 'new' && (
        <UpgradeGate feature="ai_reviewer"><div className="grid-2" style={{ gridTemplateColumns: '2fr 3fr' }}>
          <Card pad>
            <Field label="Project"><Select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">Select a project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Grant website" hint="The funder's page for this opportunity."><Input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" /></Field>
            <Field label="Grant purpose statement" hint="Paste the funder's stated goals or priorities."><Textarea rows={6} value={purpose} onChange={e => setPurpose(e.target.value)} /></Field>
            <Button block onClick={run} loading={running} disabled={!projectId || !website.trim() || !purpose.trim()}>{running ? 'Reviewing…' : 'Run review'}</Button>
            <p className="tiny faint mt-2 mb-0">Reviews use the project's description and details. Results are saved to History.</p>
          </Card>
          <Card>
            <div className="card-header"><h3>Result</h3>{result && <Badge tone="green">Saved</Badge>}</div>
            <div className="card-body">
              {running && <Loading label="Reading the grant and your proposal…" />}
              {!running && !result && <EmptyState icon="✦" title="No review yet">Fill in the form and run a review. You'll get highlights, critiques, strengths, weaknesses, and a prioritized recommendation list.</EmptyState>}
              {result && <div className="prose" dangerouslySetInnerHTML={{ __html: marked.parse(result) }} />}
            </div>
          </Card>
        </div></UpgradeGate>
      )}
      {tab === 'history' && (reviews === null ? <Loading /> : list(reviews))}
      {tab === 'archived' && (archived === null ? <Loading /> : list(archived))}
    </div>
  );
}

export function AIReviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.get(`/api/ai/reviews/${id}`).then(r => setReview(r.data)).catch(err => setError(errorMessage(err))); }, [id]);

  const archive = async () => {
    try { await api.put(`/api/ai/reviews/${id}/archive`); toast.success('Review archived.'); navigate('/app/ai-review'); } catch (err) { toast.error(errorMessage(err)); }
  };

  if (error) return <ErrorBlock message={error} />;
  if (!review) return <Loading />;
  return (
    <div className="content-full">
      <div className="mb-2"><Link to="/app/ai-review" className="small">← AI reviewer</Link></div>
      <PageHeader title={review.project.name} subtitle={`Reviewed ${formatDateTime(review.reviewedAt)} by ${displayName(review.reviewedBy)}`} actions={isAdmin && !review.isArchived && <Button variant="secondary" onClick={archive}>Archive</Button>} />
      <Card pad className="mb-3 small">
        {review.grantWebsite && <div><span className="label">Grant website</span> <a href={review.grantWebsite} target="_blank" rel="noopener noreferrer">{review.grantWebsite}</a></div>}
        {review.grantPurposeStatement && <div className="mt-1"><span className="label">Purpose statement</span><div className="pre-wrap muted">{review.grantPurposeStatement}</div></div>}
      </Card>
      <Card pad><div className="prose" dangerouslySetInnerHTML={{ __html: marked.parse(review.aiResponse || '') }} /></Card>
    </div>
  );
}
