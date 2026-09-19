import React, { useRef, useState } from 'react';
import api, { errorMessage } from '../api';
import useSeo from '../lib/seo';
import { Button, Card, Field, Input, Select, Textarea } from '../components/ui';

export default function Contact() {
  useSeo({ title: 'Contact', description: 'Questions about Merge, pricing, or your account. We reply within one business day.', path: '/contact' });
  const [form, setForm] = useState({ name: '', email: '', topic: 'sales', message: '' });
  const [website, setWebsite] = useState('');
  const openedAt = useRef(Date.now());
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { const r = await api.post('/api/feedback/contact', { ...form, website, t: Date.now() - openedAt.current }); setDone(r.data.msg); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <div className="legal" style={{ maxWidth: 640 }}>
      <h1>Contact us</h1>
      <p className="muted">Questions about Merge, pricing, a demo, or your account. We reply by email within one business day.</p>
      <Card pad>
        {done ? <div className="form-success">{done}</div> : (
          <form onSubmit={submit} noValidate>
            {error && <div className="form-error">{error}</div>}
            <div className="grid-2">
              <Field label="Your name" htmlFor="cn"><Input id="cn" value={form.name} onChange={set('name')} required /></Field>
              <Field label="Email" htmlFor="ce"><Input id="ce" type="email" value={form.email} onChange={set('email')} required /></Field>
            </div>
            <Field label="What's this about?" htmlFor="ct"><Select id="ct" value={form.topic} onChange={set('topic')}><option value="sales">Pricing or a demo</option><option value="support">Help using Merge</option><option value="billing">Billing</option><option value="partnership">Partnership</option><option value="other">Something else</option></Select></Field>
            <Field label="Message" htmlFor="cm"><Textarea id="cm" rows={6} value={form.message} onChange={set('message')} required /></Field>
            <div className="hp" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></div>
            <Button type="submit" block size="lg" loading={busy}>Send message</Button>
          </form>
        )}
      </Card>
      <p className="tiny muted mt-3">Prefer email? <a href="mailto:merge@badjrtech.com">merge@badjrtech.com</a></p>
    </div>
  );
}
