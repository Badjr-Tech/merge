import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api';
import AuthLayout from '../layout/AuthLayout';
import { Button, Field, Input } from '../components/ui';
import useSeo from '../lib/seo';

export default function ForgotPassword() {
  useSeo({ title: 'Reset password', noindex: true });
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const openedAt = React.useRef(Date.now());
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/forgot-password', { email, website, t: Date.now() - openedAt.current });
      setDone(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset your password" lead="Enter your email and we'll send you a link to choose a new one." footer={<Link to="/login">Back to sign in</Link>}>
      {done ? (
        <div>
          <div className="form-success">{done.msg}</div>
          {done.emailConfigured === false && (
            <div className="callout callout-gold small">Email delivery isn't set up on this server yet. Ask your workspace admin to generate a reset link for you from the Team page.</div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          {error && <div className="form-error">{error}</div>}
          <Field label="Email" htmlFor="email"><Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></Field>
          <div className="hp" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></div>
          <Button type="submit" block size="lg" loading={loading}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
