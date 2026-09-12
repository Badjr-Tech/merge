import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../layout/AuthLayout';
import { Button, Field, Input, Loading } from '../components/ui';

export default function ResetPassword() {
  const { token } = useParams();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, email: null, error: '' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/api/auth/reset-password/${token}`)
      .then(res => setState({ loading: false, email: res.data.email, error: '' }))
      .catch(err => setState({ loading: false, email: null, error: errorMessage(err, 'This reset link is no longer valid.') }));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/api/auth/reset-password/${token}`, { password });
      signIn(res.data.token, res.data.user);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (state.loading) return <AuthLayout title="One moment…"><Loading /></AuthLayout>;
  if (!state.email) return <AuthLayout title="Link not valid" lead={state.error} footer={<Link to="/forgot-password">Request a new link</Link>} />;

  return (
    <AuthLayout title="Choose a new password" lead={`For ${state.email}`}>
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error">{error}</div>}
        <Field label="New password" htmlFor="pw" hint="At least 8 characters."><Input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required autoFocus /></Field>
        <Field label="Confirm password" htmlFor="pw2"><Input id="pw2" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required /></Field>
        <Button type="submit" block size="lg" loading={saving}>Save password and sign in</Button>
      </form>
    </AuthLayout>
  );
}
