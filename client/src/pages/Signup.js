import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../layout/AuthLayout';
import { Button, Field, Input } from '../components/ui';

export default function Signup() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ companyName: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const res = await api.post('/api/auth/signup', form);
      signIn(res.data.token, res.data.user);
      navigate('/app?welcome=1', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not create your workspace.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your workspace" lead="You'll be the admin. Invite your team once you're in." footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
      side={{ title: 'Set up in two minutes.', text: 'Name your workspace, add your first project, and invite the people who help you write.' }}>
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error">{error}</div>}
        <Field label="Organization or workspace name" htmlFor="companyName" hint="Your team will see this name.">
          <Input id="companyName" value={form.companyName} onChange={set('companyName')} placeholder="Riverside Community Foundation" required autoFocus />
        </Field>
        <Field label="Your name" htmlFor="name">
          <Input id="name" value={form.name} onChange={set('name')} autoComplete="name" required />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
        </Field>
        <Button type="submit" block size="lg" loading={loading}>Create workspace</Button>
        <p className="tiny faint mt-2" style={{ textAlign: 'center' }}>By continuing you agree to use Merge responsibly and keep your team's data private.</p>
      </form>
    </AuthLayout>
  );
}
