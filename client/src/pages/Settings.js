import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';
import { formatDate } from '../lib/format';

export default function Settings() {
  const { user, isAdmin, updateUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [company, setCompany] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
  const [busy, setBusy] = useState('');

  useEffect(() => { api.get('/api/companies/mine').then(r => { setCompany(r.data); setCompanyName(r.data.name); }).catch(() => {}); }, []);

  const saveProfile = async () => {
    setBusy('profile');
    try { const res = await api.put('/api/auth/profile', { name }); localStorage.setItem('token', res.data.token); updateUser(res.data.user); toast.success('Profile saved.'); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };
  const saveCompany = async () => {
    setBusy('company');
    try { await api.put('/api/companies/mine', { name: companyName }); const me = await api.get('/api/auth/me'); localStorage.setItem('token', me.data.token); updateUser(me.data.user); toast.success('Workspace renamed.'); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };
  const savePassword = async () => {
    if (pw.newPassword !== pw.confirmNewPassword) { toast.error('New passwords do not match.'); return; }
    setBusy('pw');
    try { await api.put('/api/auth/change-password', pw); setPw({ oldPassword: '', newPassword: '', confirmNewPassword: '' }); toast.success('Password updated.'); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  return (
    <div className="content-narrow">
      <PageHeader title="Settings" subtitle="Your profile and workspace." />
      <Card pad className="mb-3">
        <h3>Profile</h3>
        <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Email" hint="Email is used to sign in and can't be changed here."><Input value={user?.email || ''} disabled /></Field>
        <div className="form-actions"><Button onClick={saveProfile} loading={busy === 'profile'} disabled={!name.trim()}>Save profile</Button></div>
      </Card>
      <Card pad className="mb-3">
        <h3>Password</h3>
        <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.oldPassword} onChange={e => setPw({ ...pw, oldPassword: e.target.value })} /></Field>
        <div className="grid-2">
          <Field label="New password" hint="At least 8 characters."><Input type="password" autoComplete="new-password" value={pw.newPassword} onChange={e => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw.confirmNewPassword} onChange={e => setPw({ ...pw, confirmNewPassword: e.target.value })} /></Field>
        </div>
        <div className="form-actions"><Button onClick={savePassword} loading={busy === 'pw'} disabled={!pw.oldPassword || !pw.newPassword}>Update password</Button></div>
      </Card>
      <Card pad>
        <h3>Workspace</h3>
        {company && <p className="small muted">Created {formatDate(company.createdAt)} · {company._count.users} people · {company._count.projects} projects · {company._count.files} files</p>}
        <Field label="Workspace name"><Input value={companyName} onChange={e => setCompanyName(e.target.value)} disabled={!isAdmin} /></Field>
        {isAdmin ? <div className="form-actions"><Button onClick={saveCompany} loading={busy === 'company'} disabled={!companyName.trim() || companyName === company?.name}>Rename workspace</Button></div> : <p className="tiny faint">Only admins can rename the workspace.</p>}
      </Card>
    </div>
  );
}
