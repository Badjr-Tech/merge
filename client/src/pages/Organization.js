import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, Field, Input, Loading, PageHeader, Textarea } from '../components/ui';

const EMPTY = { mission: '', philosophy: '', programs: '', audience: '', impact: '', website: '', tone: '', notes: '', background: '', facts: [], exemplarIds: [] };

// Everything Merge knows about the organization, in one place. This is what the writing
// assistant reads before it drafts anything, so the depth here is the difference between an
// answer full of brackets and one that is nearly finished.
export default function Organization() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const canEdit = isAdmin || user?.role === 'editor';
  const [profile, setProfile] = useState(null);
  const [importUrl, setImportUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    api.get('/api/companies/mine')
      .then(r => {
        const p = { ...EMPTY, ...(r.data.profile || {}) };
        p.facts = Array.isArray(p.facts) ? p.facts : [];
        p.exemplarIds = Array.isArray(p.exemplarIds) ? p.exemplarIds : [];
        setProfile(p);
        setImportUrl(p.website || '');
      })
      .catch(() => setProfile({ ...EMPTY }));
    api.get('/api/projects/answers/bank').then(r => setAnswers(r.data || [])).catch(() => setAnswers([]));
  }, []);

  const pf = (k) => (e) => setProfile(p => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setBusy('save');
    try {
      await api.put('/api/companies/mine/profile', profile);
      toast.success('Saved. Merge will use this on the next answer it writes.');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  const importFromSite = async () => {
    setBusy('import');
    try {
      const res = await api.post('/api/companies/mine/profile/import', { url: importUrl });
      const draft = res.data.profile || {};
      setProfile(p => { const next = { ...p }; Object.keys(draft).forEach(k => { if (draft[k]) next[k] = draft[k]; }); return next; });
      toast.success('Drafted from your website. Check it over, then save.');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  const setFact = (i, key) => (e) => setProfile(p => ({ ...p, facts: p.facts.map((f, idx) => (idx === i ? { ...f, [key]: e.target.value } : f)) }));
  const addFact = () => setProfile(p => ({ ...p, facts: [...p.facts, { label: '', value: '' }] }));
  const removeFact = (i) => setProfile(p => ({ ...p, facts: p.facts.filter((_, idx) => idx !== i) }));
  const toggleExemplar = (id) => setProfile(p => ({
    ...p,
    exemplarIds: p.exemplarIds.includes(id) ? p.exemplarIds.filter(x => x !== id) : [...p.exemplarIds, id].slice(0, 12),
  }));

  if (!profile) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Organization"
        subtitle="Everything Merge knows about you when it writes."
        actions={canEdit && <Button onClick={save} loading={busy === 'save'}>Save</Button>}
      />

      <div className="callout callout-indigo mb-3">
        <strong>Why this page matters.</strong>
        <p className="small mt-1" style={{ marginBottom: 6 }}>
          When Merge drafts an answer it reads this page, the grant you are working on, and your past answers —
          nothing else. Anything it does not find here comes back as a <span className="placeholder-chip" style={{ cursor: 'default' }}>[blank to fill in]</span>,
          which you then have to chase down yourself.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          So the more that lives here, the more finished a first draft arrives. Numbers you repeat in every
          application belong in <strong>Key figures</strong>. Longer material — history, theory of change, staff and board,
          how you evaluate — goes in <strong>Background</strong>. Paste freely; it does not need to be tidy.
        </p>
      </div>

      <Card pad className="mb-3">
        <h3>The basics</h3>
        {canEdit && (
          <div className="callout callout-indigo mb-3">
            <div className="label mb-1">Start from your website</div>
            <div className="row wrap">
              <Input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://yourorganization.org/about" className="grow" style={{ minWidth: 220 }} />
              <Button variant="accent" onClick={importFromSite} loading={busy === 'import'} disabled={!importUrl.trim()}>Draft from website</Button>
            </div>
            <div className="tiny muted mt-1">Reads the page and fills in the fields below. Edit anything before saving.</div>
          </div>
        )}
        <Field label="Mission" hint="What the organization exists to do."><Textarea rows={2} value={profile.mission} onChange={pf('mission')} disabled={!canEdit} /></Field>
        <Field label="Philosophy and values" hint="The beliefs and approach behind the work."><Textarea rows={3} value={profile.philosophy} onChange={pf('philosophy')} disabled={!canEdit} /></Field>
        <div className="grid-2">
          <Field label="Programs and services"><Textarea rows={3} value={profile.programs} onChange={pf('programs')} disabled={!canEdit} /></Field>
          <Field label="Who you serve"><Textarea rows={3} value={profile.audience} onChange={pf('audience')} disabled={!canEdit} /></Field>
        </div>
        <Field label="Impact, results, and history" hint="Milestones, awards, years in operation. Only facts you can back up."><Textarea rows={3} value={profile.impact} onChange={pf('impact')} disabled={!canEdit} /></Field>
        <div className="grid-2">
          <Field label="Website"><Input value={profile.website} onChange={pf('website')} disabled={!canEdit} /></Field>
          <Field label="Writing tone" hint="e.g. warm, direct, evidence-based"><Input value={profile.tone} onChange={pf('tone')} disabled={!canEdit} /></Field>
        </div>
        <Field label="Anything else Merge should know"><Textarea rows={2} value={profile.notes} onChange={pf('notes')} disabled={!canEdit} /></Field>
      </Card>

      <Card pad className="mb-3">
        <h3>Key figures</h3>
        <p className="small muted" style={{ marginTop: -4 }}>
          The numbers you write into application after application. Merge drops these straight into an answer
          instead of leaving a blank. This is the quickest way to cut down how much you have to fill in by hand.
        </p>
        {profile.facts.length === 0 && <p className="tiny faint">Nothing yet. Good ones to start with: people served last year, annual budget, year founded, number of staff, percentage of budget spent on programs.</p>}
        {profile.facts.map((f, i) => (
          <div className="row mb-1" key={i} style={{ gap: 8, alignItems: 'flex-start' }}>
            <Input value={f.label} onChange={setFact(i, 'label')} placeholder="People served last year" disabled={!canEdit} style={{ flex: '1 1 46%' }} />
            <Input value={f.value} onChange={setFact(i, 'value')} placeholder="412" disabled={!canEdit} style={{ flex: '1 1 38%' }} />
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => removeFact(i)} aria-label={`Remove ${f.label || 'this figure'}`}>
                <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}
        {canEdit && <Button variant="secondary" size="sm" className="mt-1" onClick={addFact}><Plus size={14} strokeWidth={2} aria-hidden="true" /> Add a figure</Button>}
      </Card>

      <Card pad className="mb-3">
        <h3>Background</h3>
        <p className="small muted" style={{ marginTop: -4 }}>
          Longer material that does not fit the fields above: your history, theory of change, staff and board,
          how you measure outcomes, the story you tell funders. Paste as much as you like — it does not need
          to be polished, and Merge will pull facts out of it as needed.
        </p>
        <Textarea rows={14} value={profile.background} onChange={pf('background')} disabled={!canEdit} placeholder="Paste anything here — an annual report, a boilerplate description, notes from a board meeting." />
        <div className="count-hint">{(profile.background || '').trim().split(/\s+/).filter(Boolean).length} words</div>
      </Card>

      <Card pad className="mb-3">
        <h3>Answers that represent you</h3>
        <p className="small muted" style={{ marginTop: -4 }}>
          Pick past answers that show the organization at its best. Merge reads these on every draft, not just
          when a question happens to resemble them — so they set the voice and supply facts across the board.
          {profile.exemplarIds.length > 0 && <> <strong>{profile.exemplarIds.length} chosen.</strong></>}
        </p>
        {answers.length === 0 ? (
          <p className="tiny faint">No past answers yet. Once you finish a grant or add a <Link to="/app/past-proposals">past proposal</Link>, you can pick from them here.</p>
        ) : (
          <div className="stack" style={{ gap: 6, maxHeight: 340, overflowY: 'auto' }}>
            {answers.slice(0, 80).map(a => (
              <label key={a.id} className="row" style={{ gap: 8, alignItems: 'flex-start', padding: '6px 2px', cursor: canEdit ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={profile.exemplarIds.includes(a.id)} onChange={() => toggleExemplar(a.id)} disabled={!canEdit} style={{ marginTop: 4 }} />
                <span style={{ minWidth: 0 }}>
                  <span className="small strong" style={{ color: 'var(--navy)' }}>{a.text}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>{a.project?.name} · {(a.answer || '').trim().split(/\s+/).filter(Boolean).length} words</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Card>

      {canEdit
        ? <div className="form-actions"><Button onClick={save} loading={busy === 'save'}>Save</Button></div>
        : <p className="tiny faint">Admins and editors can edit this page.</p>}
    </div>
  );
}
