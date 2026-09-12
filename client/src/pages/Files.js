import React, { useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, Loading, PageHeader, Select, useConfirm } from '../components/ui';
import { useAuth } from '../context/AuthContext';

import { displayName, formatDate } from '../lib/format';

const CATEGORIES = [
  { value: 'past-grant', label: 'Past grant application' },
  { value: 'rfp', label: 'RFP or funder guidelines' },
  { value: 'org-doc', label: 'Organization document' },
  { value: 'budget', label: 'Budget or financial' },
  { value: 'boilerplate', label: 'Boilerplate text' },
  { value: 'other', label: 'Other' },
];
const catLabel = (v) => (CATEGORIES.find(c => c.value === v) || {}).label || 'Uncategorized';

export default function Files() {
  const toast = useToast();
  const fileRef = useRef();
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('other');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState('');
  const [limits, setLimits] = useState({ maxFileBytes: 4 * 1024 * 1024, maxFileLabel: '4 MB' });
  useEffect(() => { api.get('/api/files/limits').then(r => setLimits(r.data)).catch(() => {}); }, []);
  const tooBig = selected && selected.size > limits.maxFileBytes;
  const fmtSize = (b) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
  const { user, isAdmin } = useAuth();
  const [confirm, confirmDialog] = useConfirm();

  const remove = async (f) => {
    if (!(await confirm({ title: 'Delete file', message: `Delete "${f.filename}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    try { await api.delete(`/api/files/${f.id}`); toast.success('File deleted.'); load(); } catch (err) { toast.error(errorMessage(err)); }
  };

  const load = () => { setError(''); api.get('/api/files').then(r => setFiles(r.data)).catch(err => setError(errorMessage(err))); };
  useEffect(load, []);

  const upload = async () => {
    if (!selected) return;
    if (selected.size > limits.maxFileBytes) { toast.error(`That file is ${fmtSize(selected.size)}. The maximum is ${limits.maxFileLabel}.`); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selected);
      fd.append('newFilename', name.trim() || selected.name);
      fd.append('category', category);
      fd.append('notes', notes);
      await api.post('/api/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('File uploaded.'); setSelected(null); setName(''); setNotes(''); if (fileRef.current) fileRef.current.value = ''; load();
    } catch (err) { toast.error(errorMessage(err, 'Upload failed.')); } finally { setUploading(false); }
  };

  const download = async (f) => {
    try {
      const res = await api.get(`/api/files/${f.id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] }));
      const a = document.createElement('a'); a.href = url; a.download = f.filename; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (err) { toast.error(errorMessage(err, 'Download failed.')); }
  };

  const filtered = (files || []).filter(f => (!q || f.filename.toLowerCase().includes(q.toLowerCase()) || (f.notes || '').toLowerCase().includes(q.toLowerCase())) && (!filter || (f.category || 'other') === filter));

  return (
    <div>
      {confirmDialog}
      <PageHeader title="File cabinet" subtitle="Shared documents for your workspace: past grant applications, funder guidelines, 501(c)(3) letters, budgets, boilerplate." />
      <div className="grid-2 mb-3" style={{ gridTemplateColumns: '1fr 2fr' }}>
        <Card pad>
          <h3>Upload a file</h3>
          <Field label="File" hint={`Up to ${limits.maxFileLabel} per file.`} error={tooBig ? `This file is ${fmtSize(selected.size)}. The maximum is ${limits.maxFileLabel}. Compress it or upload a smaller version.` : ''}>
            <input ref={fileRef} type="file" onChange={e => { const f = e.target.files[0]; setSelected(f || null); setName(f ? f.name : ''); }} />
            {selected && !tooBig && <span className="tiny muted">{fmtSize(selected.size)}</span>}
          </Field>
          <Field label="Save as"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Filename" /></Field>
          <Field label="Category"><Select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
          <Field label="Notes" hint="e.g. funder, year, outcome"><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
          <Button onClick={upload} loading={uploading} disabled={!selected || tooBig} block>Upload</Button>
        </Card>
        <Card>
          <div className="card-header"><h3>Files</h3><div className="row"><Select className="select-sm" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 200 }}><option value="">All categories</option>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</Select><Input className="input-sm" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 180 }} /></div></div>
          {error && <div className="card-body"><ErrorBlock message={error} retry={load} /></div>}
          {!files && !error && <Loading />}
          {files && filtered.length === 0 && <EmptyState icon="▣" title={q ? 'No matches' : 'No files yet'}>{q ? '' : 'Upload the documents your proposals reuse most.'}</EmptyState>}
          {files && filtered.length > 0 && (
            <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Category</th><th>Uploaded</th><th /></tr></thead><tbody>{filtered.map(f => (
              <tr key={f.id}><td><div className="strong" style={{ color: 'var(--navy)' }}>{f.filename}</div>{f.notes && <div className="tiny muted">{f.notes}</div>}</td><td><Badge tone={f.category === 'past-grant' ? 'green' : f.category === 'rfp' ? 'indigo' : 'gray'}>{catLabel(f.category)}</Badge></td><td className="small muted">{displayName(f.uploadedBy)} · {formatDate(f.createdAt)}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><Button variant="secondary" size="sm" onClick={() => download(f)}>Download</Button>{(isAdmin || f.uploadedBy?.id === user.id) && <Button variant="danger" size="sm" onClick={() => remove(f)}>Delete</Button>}</td></tr>
            ))}</tbody></table></div>
          )}
        </Card>
      </div>
    </div>
  );
}
