import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { parseQuestions } from '../lib/parseQuestions';
import { useToast } from '../context/ToastContext';
import { usePlan } from '../context/PlanContext';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';
import { displayName } from '../lib/format';

const blankQ = () => ({ text: '', section: '', type: 'text', assignedToId: '', maxLimit: '', limitUnit: 'words' });

export default function NewProject() {
  const navigate = useNavigate();
  const toast = useToast();
  const { plan } = usePlan();
  const writerMode = plan?.kind === 'writer';
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', deadlineDate: '', themeAngle: '', possiblePartnership: '' });
  const [questions, setQuestions] = useState([blankQ()]);
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/api/users').then(r => setUsers(r.data)).catch(() => {}); }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setQ = (i, k, v) => setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [k]: v } : q));

  const addFromBulk = () => {
    const parsed = parseQuestions(bulk);
    if (!parsed.length) return;
    setQuestions(qs => [...qs.filter(q => q.text.trim()), ...parsed.map(q => ({ ...blankQ(), text: q.text, section: q.section || '', type: q.type || 'text', maxLimit: q.maxLimit ? String(q.maxLimit) : '', limitUnit: q.limitUnit || 'words' }))]);
    setBulk('');
    setShowBulk(false);
    const sections = new Set(parsed.map(q => q.section).filter(Boolean));
    toast.success(`Added ${parsed.length} question${parsed.length === 1 ? '' : 's'}${sections.size ? ` in ${sections.size} section${sections.size === 1 ? '' : 's'}` : ''}.`);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const qs = questions.filter(q => q.text.trim());
    setSaving(true);
    try {
      const res = await api.post('/api/projects', {
        name: form.name,
        description: form.description,
        deadlineDate: form.deadlineDate || null,
        details: { themeAngle: form.themeAngle, possiblePartnership: form.possiblePartnership },
        questions: qs.map(q => ({ text: q.text, section: q.section || null, type: q.type || 'text', assignedToId: q.assignedToId || null, maxLimit: q.maxLimit || null, limitUnit: q.limitUnit })),
      });
      toast.success('Project created.');
      navigate(`/app/projects/${res.data.id}`);
    } catch (err) {
      setError(errorMessage(err, 'Could not create the project.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content-full">
      <PageHeader title="New project" subtitle="One project per grant application. Add the questions the funder asks and assign them to your team." />
      <form onSubmit={submit} noValidate>
        {error && <div className="form-error">{error}</div>}
        <Card pad className="mb-3">
          <h3>Grant details</h3>
          <Field label="Project name" htmlFor="name"><Input id="name" value={form.name} onChange={set('name')} placeholder="e.g. Community Health Innovation Fund 2026" required autoFocus /></Field>
          <Field label="Description" htmlFor="desc" hint="What the grant funds and why you're applying."><Textarea id="desc" value={form.description} onChange={set('description')} rows={3} /></Field>
          <div className="grid-2">
            <Field label="Due date" htmlFor="due"><Input id="due" type="date" value={form.deadlineDate} onChange={set('deadlineDate')} /></Field>
            <Field label="Theme or angle" htmlFor="theme"><Input id="theme" value={form.themeAngle} onChange={set('themeAngle')} placeholder="Optional" /></Field>
          </div>
          <Field label="Possible partnership" htmlFor="partner"><Input id="partner" value={form.possiblePartnership} onChange={set('possiblePartnership')} placeholder="Optional" /></Field>
        </Card>

        <Card className="mb-3">
          <div className="card-header">
            <div><h3>Questions</h3><div className="tiny muted">{writerMode ? 'One entry per question or required document. You can add more later.' : 'Each question or required document becomes a task. You can add more later.'}</div></div>
            <Button variant="secondary" size="sm" onClick={() => setShowBulk(s => !s)}>{showBulk ? 'Hide paste box' : 'Paste a list'}</Button>
          </div>
          <div className="card-body">
            {showBulk && (
              <div className="callout mb-3">
                <Field label="Paste the funder's question list" hint="Section headers, numbering, and limits like “(500 words)” are picked up automatically.">
                  <Textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={8} placeholder={'Section 1 — Organizational Overview\n1. Describe your organization. (300 words)\n2. What is the total project budget?\n\nSection 2 — Statement of Need\n3. Describe the community you serve. (500 words)'} />
                </Field>
                <Button size="sm" onClick={addFromBulk}>Add these questions</Button>
              </div>
            )}
            {questions.map((q, i) => (
              <React.Fragment key={i}>
              {q.section && (i === 0 || questions[i - 1].section !== q.section) && (
                <div className="q-section-head"><Input className="input-sm q-section-input" value={q.section} onChange={e => { const v = e.target.value; const old = q.section; setQuestions(qs => qs.map((x, idx) => idx >= i && x.section === old ? { ...x, section: v } : x)); }} aria-label="Section name" /></div>
              )}
              <div className="q-card">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="badge badge-navy" style={{ marginTop: 6 }}>{i + 1}</span>
                  <div className="grow">
                    <Textarea value={q.text} onChange={e => setQ(i, 'text', e.target.value)} rows={2} placeholder={q.type === 'upload' ? 'Document to upload (e.g. IRS determination letter)' : 'Question text'} style={{ minHeight: 60 }} />
                    <div className="row wrap mt-1">
                      <Select className="select-sm" value={q.type} onChange={e => setQ(i, 'type', e.target.value)} style={{ width: 150 }} aria-label="Question type">
                        <option value="text">Written answer</option>
                        <option value="upload">Upload a file</option>
                      </Select>
                      {!writerMode && <Select className="select-sm" value={q.assignedToId} onChange={e => setQ(i, 'assignedToId', e.target.value)} style={{ maxWidth: 200 }}>
                        <option value="">Unassigned</option>
                        {users.map(u => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
                      </Select>}
                      {q.type !== 'upload' && <>
                        <Input className="input-sm" type="number" min="0" placeholder="Limit" value={q.maxLimit} onChange={e => setQ(i, 'maxLimit', e.target.value)} style={{ width: 90 }} />
                        <Select className="select-sm" value={q.limitUnit} onChange={e => setQ(i, 'limitUnit', e.target.value)} style={{ width: 130 }}>
                          <option value="words">words</option>
                          <option value="characters">characters</option>
                        </Select>
                      </>}
                      <button type="button" className="link-button tiny" style={{ color: 'var(--danger)', marginLeft: 'auto' }} onClick={() => setQuestions(qs => qs.length > 1 ? qs.filter((_, idx) => idx !== i) : [blankQ()])}>Remove</button>
                    </div>
                  </div>
                </div>
              </div>
              </React.Fragment>
            ))}
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => setQuestions(qs => [...qs, { ...blankQ(), section: qs.length ? qs[qs.length - 1].section || '' : '' }])}>+ Add question</Button>
          </div>
        </Card>

        <div className="form-actions">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={saving}>Create project</Button>
        </div>
      </form>
    </div>
  );
}
