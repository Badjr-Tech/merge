import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../layout/AuthLayout';
import { Button, Field, Input } from '../components/ui';
import useSeo from '../lib/seo';

export default function Signup() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  useSeo({ title: 'Create your workspace', description: 'Start a free 14-day trial of Merge, grant-writing software for writers and teams. No credit card required.', path: '/signup' });
  const [form, setForm] = useState({ companyName: '', name: '', email: '', password: '', kind: 'writer' });
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
    <AuthLayout title="Create your workspace" lead={form.kind === 'writer' ? 'Starts with a free 14-day Writer Pro trial.' : "You'll be the admin. Starts with a free 14-day Team trial."} footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
      side={{ title: 'Set up in two minutes.', text: 'Name your workspace, add your first project, and invite the people who help you write.' }}>
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error">{error}</div>}
        <Field label="How will you use Merge?">
          <div className="kind-picker">
            <button type="button" className={`kind-option ${form.kind === 'writer' ? 'active' : ''}`} onClick={() => setForm(f => ({ ...f, kind: 'writer' }))}><strong>I write grants myself</strong><span>One writer. Write, send for review, download.</span></button>
            <button type="button" className={`kind-option ${form.kind === 'team' ? 'active' : ''}`} onClick={() => setForm(f => ({ ...f, kind: 'team' }))}><strong>We write as a team</strong><span>Assign questions, approvals, shared library.</span></button>
          </div>
        </Field>
        <Field label={form.kind === 'writer' ? 'Workspace name' : 'Organization or workspace name'} htmlFor="companyName" hint={form.kind === 'writer' ? 'Your name or business name works fine.' : 'Your team will see this name.'}>
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
