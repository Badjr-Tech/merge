import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../layout/AuthLayout';
import { Button, Field, Input } from '../components/ui';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', { email, password });
      signIn(res.data.token, res.data.user);
      navigate(location.state?.from || '/app', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" lead="Sign in to your workspace." footer={<>New to Merge? <Link to="/signup">Create a workspace</Link></>}>
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error">{error}</div>}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@organization.org" required autoFocus />
        </Field>
        <Field label={<span className="row-between"><span>Password</span><Link to="/forgot-password" className="tiny" style={{ fontWeight: 500 }}>Forgot password?</Link></span>} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" block size="lg" loading={loading}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}
