import React, { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { marked } from 'marked';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button, Textarea } from './ui';
import { usePlan } from '../context/PlanContext';

const STARTERS = [
  'What should I include when describing our organization?',
  'How do I write a strong statement of need?',
  'Help me explain our impact without exaggerating.',
  'Which of our partners should we include in this grant?',
];

export default function Assistant() {
  const { user } = useAuth();
  const { has, plan } = usePlan();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const bodyRef = useRef();

  const m = location.pathname.match(/^\/app\/projects\/([^/]+)$/);
  const projectId = m && m[1] !== 'new' ? m[1] : null;

  useEffect(() => {
    if (!projectId) { setProjectName(''); return; }
    api.get(`/api/projects/${projectId}`).then(r => setProjectName(r.data.name)).catch(() => setProjectName(''));
  }, [projectId]);

  useEffect(() => {
    if (!open || messages !== null) return;
    api.get('/api/ai/chat').then(r => setMessages(r.data)).catch(err => { setError(errorMessage(err)); setMessages([]); });
  }, [open, messages]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending, open]);

  const send = async (text) => {
    const content = (text || input).trim();
    if (!content || sending) return;
    setError('');
    setInput('');
    setSending(true);
    setMessages(ms => [...(ms || []), { id: `tmp-${Date.now()}`, role: 'user', content }]);
    try {
      const res = await api.post('/api/ai/chat', { message: content, projectId });
      setMessages(ms => [...ms.filter(x => !String(x.id).startsWith('tmp-')), res.data.user, res.data.reply]);
    } catch (err) {
      setError(errorMessage(err, 'The assistant could not answer.'));
      setMessages(ms => ms.filter(x => !String(x.id).startsWith('tmp-')));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    try { await api.delete('/api/ai/chat'); setMessages([]); } catch (err) { setError(errorMessage(err)); }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      <button className={`assistant-fab ${open ? 'hidden' : ''}`} onClick={() => setOpen(true)} aria-label="Open writing assistant">
        <span className="assistant-fab-icon">✦</span> Ask Merge
      </button>
      <div className={`assistant-panel ${open ? 'open' : ''}`} role="dialog" aria-label="Writing assistant">
        <div className="assistant-head">
          <div>
            <div className="strong" style={{ color: '#fff' }}>✦ Writing assistant</div>
            <div className="tiny" style={{ color: 'var(--periwinkle)' }}>{projectName ? `Working on: ${projectName}` : 'Ask anything about what to write'}</div>
          </div>
          <div className="row">
            {messages && messages.length > 0 && <button className="assistant-link" onClick={clear}>Clear</button>}
            <button className="close-x" style={{ color: '#fff' }} onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
        </div>
        <div className="assistant-body" ref={bodyRef}>
          {!has('assistant') && (
            <div className="assistant-intro">
              <span className="badge badge-gold mb-1">Starter and above</span>
              <p className="mb-1"><strong>Ask Merge</strong> is a writing assistant that knows your organization profile, your partners, and the project you have open.</p>
              <p className="tiny muted">Your workspace is on {plan?.name || 'Free'}. <Link to="/app/settings#plan" onClick={() => setOpen(false)}>See plans</Link>.</p>
            </div>
          )}
          {has('assistant') && messages === null && <div className="loading-block"><span className="spinner" /></div>}
          {has('assistant') && messages && messages.length === 0 && (
            <div className="assistant-intro">
              <p className="mb-1"><strong>Hi {(user?.name || user?.username || '').split(' ')[0]}.</strong> I know your organization's profile{projectName ? ' and the project you have open' : ''}. Ask me what to write, how to say it, or what a funder is looking for.</p>
              <p className="tiny muted">Tip: fill in your organization profile under <Link to="/app/settings" onClick={() => setOpen(false)}>Settings</Link> so my advice uses your real mission, programs, and impact.</p>
              <div className="assistant-starters">
                {STARTERS.map(s => <button key={s} className="assistant-starter" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {has('assistant') && messages && messages.map(msg => (
            <div key={msg.id} className={`assistant-msg ${msg.role}`}>
              {msg.role === 'assistant'
                ? <div className="prose" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || '') }} />
                : <div className="pre-wrap">{msg.content}</div>}
            </div>
          ))}
          {sending && <div className="assistant-msg assistant"><span className="assistant-typing"><span /><span /><span /></span></div>}
          {error && <div className="callout callout-danger small mt-1">{error}</div>}
        </div>
        <div className="assistant-foot">
          <Textarea rows={2} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} placeholder={projectName ? `Ask about ${projectName}…` : 'Ask what to write…'} style={{ minHeight: 48 }} />
          <Button onClick={() => send()} loading={sending} disabled={!input.trim() || !has('assistant')}>Send</Button>
        </div>
      </div>
    </>
  );
}
