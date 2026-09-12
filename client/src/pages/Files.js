import React, { useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../api';
import { useToast } from '../context/ToastContext';
import { Button, Card, EmptyState, ErrorBlock, Field, Input, Loading, PageHeader } from '../components/ui';
import { displayName, formatDate } from '../lib/format';

export default function Files() {
  const toast = useToast();
  const fileRef = useRef();
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState('');

  const load = () => { setError(''); api.get('/api/files').then(r => setFiles(r.data)).catch(err => setError(errorMessage(err))); };
  useEffect(load, []);

  const upload = async () => {
    if (!selected) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selected);
      fd.append('newFilename', name.trim() || selected.name);
      await api.post('/api/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('File uploaded.'); setSelected(null); setName(''); if (fileRef.current) fileRef.current.value = ''; load();
    } catch (err) { toast.error(errorMessage(err, 'Upload failed.')); } finally { setUploading(false); }
  };

  const download = async (f) => {
    try {
      const res = await api.get(`/api/files/${f.id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] }));
      const a = document.createElement('a'); a.href = url; a.download = f.filename; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (err) { toast.error(errorMessage(err, 'Download failed.')); }
  };

  const filtered = (files || []).filter(f => !q || f.filename.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="File cabinet" subtitle="Shared documents for your workspace: 501(c)(3) letters, budgets, board lists, boilerplate." />
      <div className="grid-2 mb-3" style={{ gridTemplateColumns: '1fr 2fr' }}>
        <Card pad>
          <h3>Upload a file</h3>
          <Field label="File" hint="Up to 5 MB."><input ref={fileRef} type="file" onChange={e => { const f = e.target.files[0]; setSelected(f || null); setName(f ? f.name : ''); }} /></Field>
          <Field label="Save as"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Filename" /></Field>
          <Button onClick={upload} loading={uploading} disabled={!selected} block>Upload</Button>
        </Card>
        <Card>
          <div className="card-header"><h3>Files</h3><Input className="input-sm" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }} /></div>
          {error && <div className="card-body"><ErrorBlock message={error} retry={load} /></div>}
          {!files && !error && <Loading />}
          {files && filtered.length === 0 && <EmptyState icon="▣" title={q ? 'No matches' : 'No files yet'}>{q ? '' : 'Upload the documents your proposals reuse most.'}</EmptyState>}
          {files && filtered.length > 0 && (
            <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Uploaded</th><th /></tr></thead><tbody>{filtered.map(f => (
              <tr key={f.id}><td className="strong" style={{ color: 'var(--navy)' }}>{f.filename}</td><td className="small muted">{displayName(f.uploadedBy)} · {formatDate(f.createdAt)}</td><td style={{ textAlign: 'right' }}><Button variant="secondary" size="sm" onClick={() => download(f)}>Download</Button></td></tr>
            ))}</tbody></table></div>
          )}
        </Card>
      </div>
    </div>
  );
}
