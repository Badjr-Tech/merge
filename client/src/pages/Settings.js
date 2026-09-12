import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui';
import { formatDate } from '../lib/format';

export default function Settings() {
  const { user, isAdmin, updateUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [company, setCompany] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
  const [busy, setBusy] = useState('');
  const [profile, setProfile] = useState({ mission: '', philosophy: '', programs: '', audience: '', impact: '', website: '', tone: '', notes: '' });
  const [importUrl, setImportUrl] = useState('');
  const canEditProfile = isAdmin || user?.role === 'editor';

  useEffect(() => { api.get('/api/companies/mine').then(r => { setCompany(r.data); setCompanyName(r.data.name); setProfile(p => ({ ...p, ...(r.data.profile || {}) })); setImportUrl((r.data.profile && r.data.profile.website) || ''); }).catch(() => {}); }, []);

  const saveProfile2 = async () => {
    setBusy('org');
    try { await api.put('/api/companies/mine/profile', profile); toast.success('Organization profile saved. The assistant will use it right away.'); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };
  const importProfile = async () => {
    setBusy('import');
    try {
      const res = await api.post('/api/companies/mine/profile/import', { url: importUrl });
      const draft = res.data.profile;
      setProfile(p => { const next = { ...p }; Object.keys(draft).forEach(k => { if (draft[k]) next[k] = draft[k]; }); return next; });
      toast.success('Drafted from your website. Review the fields, then save.');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };
  const pf = (k) => (e) => setProfile(p => ({ ...p, [k]: e.target.value }));

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
      <PageHeader title="Settings" subtitle="Your profile, your workspace, and what the writing assistant knows about your organization." />
      <Card className="mb-3" id="organization">
        <div className="card-header">
          <div><h3>Organization profile</h3><div className="tiny muted">The writing assistant uses this to give advice in your voice. Everyone in the workspace shares it.</div></div>
        </div>
        <div className="card-body">
          {canEditProfile && (
            <div className="callout callout-indigo mb-3">
              <div className="label mb-1">Start from your website</div>
              <div className="row wrap">
                <Input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://yourorganization.org/about" className="grow" style={{ minWidth: 220 }} />
                <Button variant="accent" onClick={importProfile} loading={busy === 'import'} disabled={!importUrl.trim()}>Draft from website</Button>
              </div>
              <div className="tiny muted mt-1">Reads the page and drafts the fields below. You can edit everything before saving.</div>
            </div>
          )}
          <Field label="Mission" hint="What the organization exists to do."><Textarea rows={2} value={profile.mission} onChange={pf('mission')} disabled={!canEditProfile} /></Field>
          <Field label="Philosophy and values" hint="The beliefs and approach behind the work. The assistant will suggest weaving these into answers."><Textarea rows={3} value={profile.philosophy} onChange={pf('philosophy')} disabled={!canEditProfile} /></Field>
          <div className="grid-2">
            <Field label="Programs and services"><Textarea rows={3} value={profile.programs} onChange={pf('programs')} disabled={!canEditProfile} /></Field>
            <Field label="Who you serve"><Textarea rows={3} value={profile.audience} onChange={pf('audience')} disabled={!canEditProfile} /></Field>
          </div>
          <Field label="Impact, results, and history" hint="Numbers, milestones, awards, years in operation. Only facts you can back up."><Textarea rows={3} value={profile.impact} onChange={pf('impact')} disabled={!canEditProfile} /></Field>
          <div className="grid-2">
            <Field label="Website"><Input value={profile.website} onChange={pf('website')} disabled={!canEditProfile} /></Field>
            <Field label="Writing tone" hint="e.g. warm, direct, evidence-based"><Input value={profile.tone} onChange={pf('tone')} disabled={!canEditProfile} /></Field>
          </div>
          <Field label="Anything else the assistant should know"><Textarea rows={2} value={profile.notes} onChange={pf('notes')} disabled={!canEditProfile} /></Field>
          {canEditProfile ? <div className="form-actions"><Button onClick={saveProfile2} loading={busy === 'org'}>Save organization profile</Button></div> : <p className="tiny faint">Admins and editors can edit this profile.</p>}
        </div>
      </Card>
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
