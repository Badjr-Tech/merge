import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../layout/AuthLayout';
import { Button, Field, Input, Loading } from '../components/ui';
import useSeo from '../lib/seo';

export default function AcceptInvite() {
  useSeo({ title: 'Accept invitation', noindex: true });
  const { token } = useParams();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/api/auth/invitations/token/${token}`)
      .then(res => setInvite(res.data))
      .catch(err => setError(errorMessage(err, 'This invitation link is not valid.')))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await api.post(`/api/auth/invitations/token/${token}/accept`, { name, password });
      signIn(res.data.token, res.data.user);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not accept the invitation.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AuthLayout title="Checking your invitation…"><Loading /></AuthLayout>;
  if (!invite) return <AuthLayout title="Invitation not available" lead={error} footer={<Link to="/login">Go to sign in</Link>} />;

  return (
    <AuthLayout title={`Join ${invite.companyName}`} lead={`${invite.invitedBy} invited you as ${invite.role === 'admin' ? 'an' : 'a'} ${invite.role}. Choose a password to finish.`}
      side={{ title: `You're invited to ${invite.companyName}.`, text: 'Create your account to start answering the questions assigned to you.' }}>
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error">{error}</div>}
        <Field label="Email"><Input value={invite.email} disabled /></Field>
        <Field label="Your name" htmlFor="name"><Input id="name" value={name} onChange={e => setName(e.target.value)} required autoFocus /></Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters."><Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /></Field>
        <Button type="submit" block size="lg" loading={saving}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
