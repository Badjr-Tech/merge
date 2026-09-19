import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Field, Loading, PageHeader, Select, Textarea } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { Link } from 'react-router-dom';

const S = { open: ['Open', 'gold'], in_progress: ['In progress', 'indigo'], resolved: ['Resolved', 'green'] };

export default function Support() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [type, setType] = useState('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/api/feedback/mine').then(r => setRows(r.data)).catch(err => toast.error(errorMessage(err)));
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    if (!message.trim()) { toast.error('Describe the issue first.'); return; }
    setBusy(true);
    try { await api.post('/api/feedback', { type, message, page: '/app/support' }); toast.success('Ticket submitted. We reply by email.'); setMessage(''); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Support" subtitle="Report an issue, ask a question, or suggest something. Track everything you've sent." actions={<Link to="/faq" className="btn btn-secondary" target="_blank" rel="noopener noreferrer">Help &amp; FAQ</Link>} />
      <div className="grid-2" style={{ gridTemplateColumns: '2fr 3fr' }}>
        <Card pad>
          <h3>New ticket</h3>
          <Field label="Type"><Select value={type} onChange={e => setType(e.target.value)}><option value="bug">Something isn't working</option><option value="question">I have a question</option><option value="idea">Feature request</option><option value="praise">Just saying thanks</option></Select></Field>
          <Field label="Details" hint="What happened, what you expected, and where."><Textarea rows={7} value={message} onChange={e => setMessage(e.target.value)} /></Field>
          <Button block onClick={submit} loading={busy}>Submit ticket</Button>
          <p className="tiny muted mt-2 mb-0">Or email <a href="mailto:merge@badjrtech.com">merge@badjrtech.com</a>.</p>
        </Card>
        <Card>
          <div className="card-header"><h3>Your tickets</h3></div>
          {!rows ? <Loading /> : rows.length === 0 ? <EmptyState icon="✉" title="No tickets yet">Anything you send shows up here with its status.</EmptyState> : (
            <div className="table-wrap"><table className="table"><tbody>{rows.map(t => (
              <tr key={t.id}><td><div className="small" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.message}</div><div className="tiny muted">{t.type} · {formatDateTime(t.createdAt)}</div></td><td style={{ textAlign: 'right' }}><Badge tone={S[t.status][1]}>{S[t.status][0]}</Badge></td></tr>
            ))}</tbody></table></div>
          )}
        </Card>
      </div>
    </div>
  );
}
