import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../api';
import useSeo from '../lib/seo';
import logo from '../merge1.png';
import { Badge, Button, Card, Field, Input, Loading, Textarea } from '../components/ui';
import { formatDate, formatDateTime } from '../lib/format';

function NoteBox({ label, onSave, disabled }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (disabled) return null;
  if (!open) return <button type="button" className="link-button small" onClick={() => setOpen(true)}>+ {label}</button>;
  return (
    <div className="mt-1">
      <Textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Your note on this section…" autoFocus />
      <div className="row mt-1" style={{ justifyContent: 'flex-end' }}>
        <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setText(''); }}>Cancel</Button>
        <Button size="sm" loading={busy} disabled={!text.trim()} onClick={async () => { setBusy(true); try { await onSave(text.trim()); setText(''); setOpen(false); } finally { setBusy(false); } }}>Add note</Button>
      </div>
    </div>
  );
}

export default function Review() {
  useSeo({ title: 'Review a proposal', noindex: true });
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    api.get(`/api/review/${token}`).then(r => { setData(r.data); setName(r.data.reviewerName || ''); setNotes(r.data.comments || []); }).catch(err => setError(errorMessage(err, 'This review link is not valid.')));
  }, [token]);

  const addNote = async (questionId, body) => {
    try {
      const res = await api.post(`/api/review/${token}/comments`, { questionId, body, name });
      setNotes(n => [...n, res.data]);
    } catch (err) { setError(errorMessage(err)); }
  };

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
  const notesFor = (qid) => notes.filter(n => n.questionId === qid);
  const generalNotes = notes.filter(n => !n.questionId);

  return (
    <div className="review-page">
      <div className="row-between mb-3"><img src={logo} alt="Merge" style={{ height: 36 }} /><span className="tiny muted">Shared for review · no account needed</span></div>
      <h1 style={{ marginBottom: 4 }}>{data.name}</h1>
      <p className="muted">{data.organization} · prepared by {data.owner}{data.deadlineDate ? ` · due ${formatDate(data.deadlineDate)}` : ''}</p>
      {data.description && <p>{data.description}</p>}
      {!responded && (
        <div className="callout callout-indigo mb-3 small">
          <strong>How this works:</strong> read each section, add a note wherever you have one, then approve or request changes at the bottom. Your notes go straight to {data.owner}.
          <div className="mt-1"><Field label="Your name" htmlFor="rname"><Input id="rname" value={name} onChange={e => setName(e.target.value)} placeholder="So the writer knows who reviewed" style={{ maxWidth: 320 }} /></Field></div>
        </div>
      )}
      {responded && (
        <div className={`callout ${data.reviewStatus === 'approved' ? 'callout-green' : 'callout-gold'} mb-3`}>
          <strong>{data.reviewStatus === 'approved' ? 'Approved' : 'Changes requested'}</strong>{data.reviewerName ? ` by ${data.reviewerName}` : ''}{data.reviewRespondedAt ? ` on ${formatDateTime(data.reviewRespondedAt)}` : ''}.{data.reviewComments && <div className="mt-1 pre-wrap">{data.reviewComments}</div>}
        </div>
      )}

      <Card pad className="review-doc mb-3">
        {data.questions.map((q, i) => (
          <div key={q.id} className="review-section">
            <h3>{i + 1}. {q.text}</h3>
            <div className="pre-wrap">{q.answer || <span className="faint">[No answer yet]</span>}</div>
            {notesFor(q.id).map(n => <div key={n.id} className="review-note"><strong>{n.reviewerName || 'Reviewer'}:</strong> <span className="pre-wrap">{n.body}</span></div>)}
            <NoteBox label="Add a note on this section" onSave={(b) => addNote(q.id, b)} disabled={responded} />
          </div>
        ))}
        {data.questions.length === 0 && data.narrative && <div className="pre-wrap">{data.narrative}</div>}
      </Card>

      {generalNotes.length > 0 && <Card pad className="mb-3"><h3>General notes</h3>{generalNotes.map(n => <div key={n.id} className="review-note"><strong>{n.reviewerName || 'Reviewer'}:</strong> <span className="pre-wrap">{n.body}</span></div>)}</Card>}

      {done ? <div className="form-success">{done}</div> : !responded && (
        <Card pad className="review-actions" style={{ position: 'static' }}>
          <h3>Your decision</h3>
          {error && <div className="form-error">{error}</div>}
          <Field label="Overall notes for the writer" hint={notes.length ? `You left ${notes.length} note${notes.length === 1 ? '' : 's'} above. Add anything else here.` : 'Required if you request changes.'}><Textarea rows={4} value={comments} onChange={e => setComments(e.target.value)} /></Field>
          <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
            <Button variant="danger" onClick={() => respond('changes')} loading={busy === 'changes'}>Request changes</Button>
            <Button onClick={() => respond('approved')} loading={busy === 'approved'}>Approve</Button>
          </div>
        </Card>
      )}
      {responded && !done && <p className="tiny muted">Already reviewed. If you need to change your answer, ask the writer to send a new link.</p>}
      <p className="tiny faint mt-3"><Badge tone="gray">Merge</Badge> Merge your workspace. Merge your teamwork. Powered by Badjr.</p>
    </div>
  );
}
