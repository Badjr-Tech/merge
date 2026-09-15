import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Button, Field, Textarea } from './ui';

const TYPES = [
  { id: 'bug', label: 'Something broke', icon: '🐞' },
  { id: 'idea', label: 'I have an idea', icon: '💡' },
  { id: 'question', label: 'I have a question', icon: '❓' },
  { id: 'praise', label: 'This is great', icon: '💚' },
];

export default function FeedbackWidget() {
  const toast = useToast();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('idea');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [shot, setShot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef();

  useEffect(() => { if (!open) { setDone(false); } }, [open]);

  const pickShot = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error('Screenshot must be under 2 MB.'); return; }
    const r = new FileReader(); r.onload = () => setShot(r.result); r.readAsDataURL(f);
  };

  const submit = async () => {
    if (!message.trim()) { toast.error('Tell us a little more first.'); return; }
    setBusy(true);
    try {
      await api.post('/api/feedback', { type, message, rating: rating || null, page: location.pathname, screenshot: shot });
      setDone(true); setMessage(''); setRating(0); setShot(null); if (fileRef.current) fileRef.current.value = '';
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <>
      <button className="feedback-tab" onClick={() => setOpen(true)} aria-label="Send feedback">Feedback</button>
      {open && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal" role="dialog" aria-label="Send feedback" style={{ maxWidth: 480 }}>
            <div className="modal-header"><h3>Send feedback</h3><button className="close-x" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
            <div className="modal-body">
              {done ? (
                <div>
                  <div className="form-success">Thanks! We read every message and reply by email when there's news.</div>
                  <Button block onClick={() => setOpen(false)}>Done</Button>
                </div>
              ) : (
                <>
                  <div className="feedback-types">
                    {TYPES.map(t => <button key={t.id} type="button" className={`feedback-type ${type === t.id ? 'active' : ''}`} onClick={() => setType(t.id)}><span>{t.icon}</span>{t.label}</button>)}
                  </div>
                  <Field label={type === 'bug' ? 'What happened, and what did you expect?' : type === 'question' ? 'What would you like to know?' : 'Tell us about it'}>
                    <Textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} autoFocus placeholder={type === 'bug' ? 'I clicked … and then …' : ''} />
                  </Field>
                  <div className="row-between mb-2">
                    <div className="feedback-stars" aria-label="How is Merge working for you?">
                      <span className="tiny muted">How's Merge so far?</span>
                      {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={n <= rating ? 'on' : ''} onClick={() => setRating(n === rating ? 0 : n)} aria-label={`${n} of 5`}>★</button>)}
                    </div>
                    <label className="link-button tiny" style={{ cursor: 'pointer' }}>
                      {shot ? 'Screenshot added ✓' : 'Attach screenshot'}
                      <input ref={fileRef} type="file" accept="image/*" onChange={pickShot} style={{ display: 'none' }} />
                    </label>
                  </div>
                  <p className="tiny faint">We'll include the page you're on ({location.pathname}) so we can find it faster.</p>
                  <Button block onClick={submit} loading={busy}>Send</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
