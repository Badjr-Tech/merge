import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../api';
import logo from '../merge1.png';
import { Badge, Button, Card, Field, Input, Loading, Textarea } from '../components/ui';
import { formatDate, formatDateTime } from '../lib/format';

export default function Review() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    api.get(`/api/review/${token}`).then(r => { setData(r.data); setName(r.data.reviewerName || ''); }).catch(err => setError(errorMessage(err, 'This review link is not valid.')));
  }, [token]);

  const respond = async (decision) => {
    setBusy(decision);
    try {
      const res = await api.post(`/api/review/${token}/respond`, { decision, name, comments });
      setDone(res.data.msg);
      setData(d => ({ ...d, reviewStatus: decision, reviewComments: comments, reviewRespondedAt: new Date().toISOString() }));
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(''); }
  };

  if (error && !data) return <div className="review-page"><img src={logo} alt="Merge" style={{ height: 36 }} /><div className="callout callout-danger mt-3">{error}</div></div>;
  if (!data) return <div className="review-page"><Loading /></div>;

  const responded = data.reviewStatus === 'approved' || data.reviewStatus === 'changes';

  return (
    <div className="review-page">
      <div className="row-between mb-3"><img src={logo} alt="Merge" style={{ height: 36 }} /><span className="tiny muted">Shared for review · no account needed</span></div>
      <h1 style={{ marginBottom: 4 }}>{data.name}</h1>
      <p className="muted">{data.organization} · prepared by {data.owner}{data.deadlineDate ? ` · due ${formatDate(data.deadlineDate)}` : ''}</p>
      {data.description && <p>{data.description}</p>}
      {responded && (
        <div className={`callout ${data.reviewStatus === 'approved' ? 'callout-green' : 'callout-gold'} mb-3`}>
          <strong>{data.reviewStatus === 'approved' ? 'Approved' : 'Changes requested'}</strong>{data.reviewerName ? ` by ${data.reviewerName}` : ''}{data.reviewRespondedAt ? ` on ${formatDateTime(data.reviewRespondedAt)}` : ''}.{data.reviewComments && <div className="mt-1 pre-wrap">{data.reviewComments}</div>}
        </div>
      )}
      <Card pad className="review-doc mb-3">
        {data.narrative ? <div className="pre-wrap">{data.narrative}</div> : data.questions.map((q, i) => (
          <div key={i}><h3>{i + 1}. {q.text}</h3><div className="pre-wrap">{q.answer || <span className="faint">[No answer yet]</span>}</div></div>
        ))}
      </Card>
      {done ? <div className="form-success">{done}</div> : !responded && (
        <Card pad className="review-actions" style={{ position: 'static' }}>
          <h3>Your review</h3>
          {error && <div className="form-error">{error}</div>}
          <Field label="Your name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Notes for the writer" hint="Required if you request changes."><Textarea rows={4} value={comments} onChange={e => setComments(e.target.value)} /></Field>
          <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
            <Button variant="danger" onClick={() => respond('changes')} loading={busy === 'changes'}>Request changes</Button>
            <Button onClick={() => respond('approved')} loading={busy === 'approved'}>Approve</Button>
          </div>
        </Card>
      )}
      {responded && !done && <p className="tiny muted">Already reviewed. If you need to change your answer, ask the writer to send a new link.</p>}
      <p className="tiny faint mt-3"><Badge tone="gray">Merge</Badge> Grant proposals, written together. Powered by Badjr.</p>
    </div>
  );
}
