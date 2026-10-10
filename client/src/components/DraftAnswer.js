import React, { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { API_URL, errorMessage } from '../api';
import { usePlan } from '../context/PlanContext';
import { useToast } from '../context/ToastContext';
import { Button } from './ui';

// "Help me answer this" — streams a first draft for one question, written from the organization
// profile, the rest of the application, the question's limit, and the workspace's own past answers.
// The draft lands in the answer box as it arrives; nothing is saved until the writer saves it.
export default function DraftAnswer({ questionId, currentAnswer, onDraft, disabled }) {
  const { has } = usePlan();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);

  if (!has('assistant')) return null;

  const stop = () => { if (abortRef.current) abortRef.current.abort(); };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const prefix = currentAnswer && currentAnswer.trim() ? `${currentAnswer.trim()}\n\n` : '';
    let draft = '';
    try {
      const res = await fetch(`${API_URL}/api/ai/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') || '' },
        body: JSON.stringify({ questionId }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
        let msg = 'The assistant could not write a draft.';
        try { const d = await res.json(); msg = d.msg || msg; } catch (_) { /* keep the default */ }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (frame.match(/^event: (.*)$/m) || [])[1];
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (ev === 'chunk') { draft += data; onDraft(prefix + draft); }
          else if (ev === 'error') throw new Error(data.msg);
        }
      }
      if (draft.trim()) toast.success('Draft written. Edit it before you submit — check anything in [brackets].');
    } catch (err) {
      if (err.name !== 'AbortError') toast.error(errorMessage(err, err.message));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return busy
    ? <Button variant="secondary" size="sm" onClick={stop}>Stop writing</Button>
    : <Button variant="secondary" size="sm" onClick={run} disabled={disabled}><Sparkles size={14} strokeWidth={1.9} aria-hidden="true" /> {currentAnswer && currentAnswer.trim() ? 'Help me improve this' : 'Help me answer this'}</Button>;
}
