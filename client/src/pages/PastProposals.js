import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, EmptyState, ErrorBlock, Field, Input, Loading, Modal, PageHeader, Textarea } from '../components/ui';
import UpgradeGate from '../components/Upgrade';
import { displayName, formatDate } from '../lib/format';

function InnerPastProposals() {
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
  const [reading, setReading] = useState(false);
  const [imported, setImported] = useState(null);   // { source, count, truncated }
  const fileRef = useRef();

  const load = () => { setError(''); api.get('/api/projects/completed').then(r => setProjects(r.data)).catch(err => setError(errorMessage(err))); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Read a finished proposal and fill the form with what it found. Nothing is saved until they
  // look it over and press Save, so a bad extraction costs them a glance, not a bad record.
  const readDocument = async (file) => {
    if (!file) return;
    setReading(true);
    setImported(null);
    const body = new FormData();
    body.append('document', file);
    try {
      const r = await api.post('/api/projects/past-proposals/extract', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      const found = r.data.pairs || [];
      if (!found.length) {
        toast.error('Merge could not find any questions and answers in that file. You can still type them in.');
      } else {
        setPairs(found.map(p => ({ question: p.question, answer: p.answer, section: p.section || '' })));
        setForm(f => ({ ...f, projectTitle: f.projectTitle || r.data.title || '' }));
        setImported({ source: r.data.source, count: found.length, truncated: r.data.truncated });
        toast.success(`Found ${found.length} question${found.length === 1 ? '' : 's'}. Check them over before saving.`);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not read that document.'));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!form.projectTitle.trim()) { toast.error('Give the proposal a title.'); return; }
    setSaving(true);
    try {
      await api.post('/api/projects/manual-project', { ...form, qaPairs: pairs });
      toast.success('Past proposal saved.'); setOpen(false); setImported(null); setForm({ projectTitle: '', projectDescription: '' }); setPairs([{ question: '', answer: '' }]); load();
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
            <div className="tiny muted">{displayName(p.owner)} · {formatDate(p.createdAt)} · {(p.questions || []).length} question{(p.questions || []).length === 1 ? '' : 's'}</div>
            {p.description && <p className="small muted mt-1 mb-0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
          </Card>
        ))}</div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a past proposal" size="lg" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={saving}>Save proposal</Button></>}>
        <div className="callout mb-3">
          <div className="row-between wrap" style={{ gap: 8 }}>
            <div>
              <div className="strong" style={{ color: 'var(--navy)' }}>Start from the finished document</div>
              <div className="tiny muted">Upload the proposal as a PDF, Word file or text and Merge pulls out each question with its answer. PDF, .docx, .txt — up to 15MB.</div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current && fileRef.current.click()} loading={reading}>{reading ? 'Reading…' : 'Upload a proposal'}</Button>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.rtf" onChange={e => readDocument(e.target.files[0])} style={{ display: 'none' }} />
          {imported && (
            <div className="tiny mt-2" style={{ color: 'var(--green-dark)' }}>
              Read {imported.count} question{imported.count === 1 ? '' : 's'} from {imported.source}. Check the wording below — the text comes from the document, not from Merge.
              {imported.truncated ? ' That file was long, so only the first part was read.' : ''}
            </div>
          )}
        </div>
        <Field label="Title"><Input value={form.projectTitle} onChange={e => setForm({ ...form, projectTitle: e.target.value })} autoFocus /></Field>
        <Field label="Description"><Textarea rows={2} value={form.projectDescription} onChange={e => setForm({ ...form, projectDescription: e.target.value })} /></Field>
        <div className="label mb-1">Questions and answers</div>
        {pairs.map((pr, i) => (
          <div className="q-card" key={i}>
            {pr.section && <div className="tiny muted mb-1">{pr.section}</div>}
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

export default function PastProposals() {
  return <UpgradeGate feature="past_proposals" title="Past proposals" subtitle="Finished applications you can search and reuse."><InnerPastProposals /></UpgradeGate>;
}
