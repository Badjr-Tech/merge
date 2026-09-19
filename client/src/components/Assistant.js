import React, { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { marked } from 'marked';
import api, { errorMessage, API_URL } from '../api';
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
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('ask') === '1');
  const [messages, setMessages] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [draft, setDraft] = useState(null); // assistant reply being typed out
  const [copied, setCopied] = useState(null);
  const bodyRef = useRef();
  const abortRef = useRef(null);
  const typer = useRef({ target: '', shown: 0, timer: null, done: false, finish: null });

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
  }, [messages, sending, open, draft]);

  // Reveal the reply a few characters at a time so it reads like someone typing, even if the
  // network delivers it in big chunks. Speeds up when it falls behind so it never lags far.
  const tick = () => {
    const t = typer.current;
    const behind = t.target.length - t.shown;
    if (behind > 0) {
      const step = behind > 400 ? 24 : behind > 120 ? 8 : 3;
      t.shown = Math.min(t.target.length, t.shown + step);
      setDraft(t.target.slice(0, t.shown));
    }
    if (t.done && t.shown >= t.target.length) { t.timer = null; if (t.finish) t.finish(); return; }
    t.timer = setTimeout(tick, 16);
  };
  const feed = (text) => { typer.current.target += text; if (!typer.current.timer) tick(); };

  const send = async (text) => {
    const content = (text || input).trim();
    if (!content || sending) return;
    setError('');
    setInput('');
    setSending(true);
    setMessages(ms => [...(ms || []), { id: `tmp-${Date.now()}`, role: 'user', content }]);
    typer.current = { target: '', shown: 0, timer: null, done: false, finish: null };
    setDraft('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ message: content, projectId }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
        let msg = 'The assistant could not answer.';
        try { const d = await res.json(); msg = d.msg || msg; } catch (_) {}
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let final = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (frame.match(/^event: (.*)$/m) || [])[1];
          const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          const data = JSON.parse(dataLine.slice(6));
          if (ev === 'chunk') feed(data);
          else if (ev === 'error') throw new Error(data.msg);
          else if (ev === 'done') final = data;
        }
      }
      if (!final) throw new Error('The assistant stopped before finishing. Try again.');
      // let the typewriter catch up before swapping in the saved message
      await new Promise(resolve => { typer.current.done = true; typer.current.finish = resolve; if (!typer.current.timer) tick(); });
      setMessages(ms => [...ms.filter(x => !String(x.id).startsWith('tmp-')), final.user, final.reply]);
    } catch (err) {
      if (err.name === 'AbortError') {
        const partial = typer.current.target;
        setMessages(ms => [...ms.filter(x => !String(x.id).startsWith('tmp-')), { id: `local-${Date.now()}`, role: 'user', content }, ...(partial ? [{ id: `local-r-${Date.now()}`, role: 'assistant', content: partial + '\n\n_Stopped._' }] : [])]);
      } else {
        setError(err.message === 'Failed to fetch' ? 'The server did not respond. Please try again in a moment.' : (err.message || 'The assistant could not answer.'));
        setMessages(ms => ms.filter(x => !String(x.id).startsWith('tmp-')));
        setInput(content);
      }
    } finally {
      if (typer.current.timer) clearTimeout(typer.current.timer);
      typer.current.timer = null;
      setDraft(null);
      setSending(false);
      abortRef.current = null;
    }
  };

  const stop = () => { if (abortRef.current) abortRef.current.abort(); };

  const copy = async (msg) => {
    try { await navigator.clipboard.writeText(msg.content); setCopied(msg.id); setTimeout(() => setCopied(null), 1500); } catch (_) {}
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
              {!plan?.staff && <p className="tiny muted">Tip: fill in your organization profile under <Link to="/app/settings" onClick={() => setOpen(false)}>Settings</Link> so my advice uses your real mission, programs, and impact.</p>}
              <div className="assistant-starters">
                {STARTERS.map(s => <button key={s} className="assistant-starter" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {has('assistant') && messages && messages.map(msg => (
            <div key={msg.id} className={`assistant-msg ${msg.role}`}>
              {msg.role === 'assistant'
                ? <>
                    <div className="prose" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || '') }} />
                    <button className="assistant-copy" onClick={() => copy(msg)} aria-label="Copy reply">{copied === msg.id ? 'Copied' : 'Copy'}</button>
                  </>
                : <div className="pre-wrap">{msg.content}</div>}
            </div>
          ))}
          {sending && (
            <div className="assistant-msg assistant streaming">
              {draft
                ? <div className="prose" dangerouslySetInnerHTML={{ __html: marked.parse(draft) + '<span class="assistant-cursor"></span>' }} />
                : <span className="assistant-typing"><span /><span /><span /></span>}
            </div>
          )}
          {error && <div className="callout callout-danger small mt-1">{error}</div>}
        </div>
        <div className="assistant-foot">
          <Textarea rows={2} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} placeholder={projectName ? `Ask about ${projectName}…` : 'Ask what to write…'} style={{ minHeight: 48 }} />
          {sending
            ? <Button variant="secondary" onClick={stop}>Stop</Button>
            : <Button onClick={() => send()} disabled={!input.trim() || !has('assistant')}>Send</Button>}
        </div>
      </div>
    </>
  );
}
