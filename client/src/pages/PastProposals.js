import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, EmptyState, ErrorBlock, Field, Input, Loading, Modal, PageHeader, Textarea } from '../components/ui';
import { displayName, formatDate } from '../lib/format';

export default function PastProposals() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ projectTitle: '', projectDescription: '' });
  const [pairs, setPairs] = useState([{ question: '', answer: '' }]);
  const [saving, setSaving] = useState(false);

  const load = () => { setError(''); api.get('/api/projects/completed').then(r => setProjects(r.data)).catch(err => setError(errorMessage(err))); };
  useEffect(load, []);

  const save = async () => {
    if (!form.projectTitle.trim()) { toast.error('Give the proposal a title.'); return; }
    setSaving(true);
    try {
      await api.post('/api/projects/manual-project', { ...form, qaPairs: pairs });
      toast.success('Past proposal saved.'); setOpen(false); setForm({ projectTitle: '', projectDescription: '' }); setPairs([{ question: '', answer: '' }]); load();
    } catch (err) { toast.error(errorMessage(err)); } finally { setSaving(false); }
  };

  const term = q.toLowerCase();
  const filtered = (projects || []).filter(p => !term || p.name.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term) || (p.questions || []).some(x => (x.text || '').toLowerCase().includes(term) || (x.answer || '').toLowerCase().includes(term)));

  return (
    <div>
      <PageHeader title="Past proposals" subtitle="Finished applications you can search and reuse." actions={canEdit && <Button onClick={() => setOpen(true)}>+ Add past proposal</Button>} />
      <Input placeholder="Search titles, questions, and answers…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 420 }} className="mb-3" />
      {error && <ErrorBlock message={error} retry={load} />}
      {!projects && !error && <Loading />}
      {projects && filtered.length === 0 && <Card><EmptyState icon="◷" title={q ? 'No matches' : 'No past proposals yet'}>{q ? 'Try a different search term.' : 'Mark a project as complete, or add an older proposal by hand, and it will show up here.'}</EmptyState></Card>}
      {projects && filtered.length > 0 && (
        <div className="grid-2">{filtered.map(p => (
          <Card key={p.id} pad onClick={() => navigate(`/app/projects/${p.id}`)}>
            <h3 className="mb-0">{p.name}</h3>
            <div className="tiny muted">{displayName(p.owner)} · {formatDate(p.createdAt)} · {(p.questions || []).length} answers</div>
            {p.description && <p className="small muted mt-1 mb-0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
          </Card>
        ))}</div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a past proposal" size="lg" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={saving}>Save proposal</Button></>}>
        <Field label="Title"><Input value={form.projectTitle} onChange={e => setForm({ ...form, projectTitle: e.target.value })} autoFocus /></Field>
        <Field label="Description"><Textarea rows={2} value={form.projectDescription} onChange={e => setForm({ ...form, projectDescription: e.target.value })} /></Field>
        <div className="label mb-1">Questions and answers</div>
        {pairs.map((pr, i) => (
          <div className="q-card" key={i}>
            <Input placeholder={`Question ${i + 1}`} value={pr.question} onChange={e => setPairs(ps => ps.map((x, idx) => idx === i ? { ...x, question: e.target.value } : x))} className="mb-1" />
            <Textarea rows={3} placeholder="Answer" value={pr.answer} onChange={e => setPairs(ps => ps.map((x, idx) => idx === i ? { ...x, answer: e.target.value } : x))} />
            {pairs.length > 1 && <button type="button" className="link-button tiny mt-1" style={{ color: 'var(--danger)' }} onClick={() => setPairs(ps => ps.filter((_, idx) => idx !== i))}>Remove</button>}
          </div>
        ))}
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => setPairs(ps => [...ps, { question: '', answer: '' }])}>+ Add another</Button>
      </Modal>
    </div>
  );
}
