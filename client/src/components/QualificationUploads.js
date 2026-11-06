import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import api, { errorMessage, API_URL } from '../api';
import { upload as blobUpload } from '@vercel/blob/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Input, Progress, useConfirm } from './ui';
import { formatDate } from '../lib/format';

const CATEGORY = 'qualification';
const fmtSize = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);

// Documents that establish what the organization is and what it is qualified to do: the
// determination letter, audited financials, accreditations, a capability statement. The text
// is pulled out when the file lands, which is what lets the assistant quote from them — so
// the list says plainly whether a document could be read, since a scanned PDF cannot.
export default function QualificationUploads({ canEdit }) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const fileRef = useRef();
  const [files, setFiles] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [limits, setLimits] = useState({ maxFileBytes: 4 * 1024 * 1024, maxFileLabel: '4 MB', direct: false });
  const [confirm, confirmDialog] = useConfirm();

  const load = () => { api.get(`/api/files?category=${CATEGORY}`).then(r => setFiles(r.data)).catch(() => setFiles([])); };
  useEffect(() => { load(); api.get('/api/files/limits').then(r => setLimits(r.data)).catch(() => {}); }, []);

  const reset = () => { setSelected(null); setNotes(''); if (fileRef.current) fileRef.current.value = ''; };

  const send = async () => {
    if (!selected) return;
    if (selected.size > limits.maxFileBytes) { toast.error(`That file is ${fmtSize(selected.size)}. The maximum is ${limits.maxFileLabel}.`); return; }
    setUploading(true); setProgress(0);
    try {
      let res;
      if (limits.direct) {
        const token = localStorage.getItem('token') || '';
        const result = await blobUpload(`files/${user.companyId}/${Date.now()}-${selected.name}`, selected, {
          access: 'private',
          handleUploadUrl: `${API_URL}/api/files/upload-token`,
          headers: { 'x-auth-token': token },
          onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
        });
        res = await api.post('/api/files/record', { pathname: result.pathname, filename: selected.name, category: CATEGORY, notes });
      } else {
        const fd = new FormData();
        fd.append('file', selected);
        fd.append('newFilename', selected.name);
        fd.append('category', CATEGORY);
        fd.append('notes', notes);
        res = await api.post('/api/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      toast[res.data.textChars ? 'success' : 'error'](res.data.textChars
        ? 'Uploaded. Merge can read this one and will use it when it writes.'
        : 'Uploaded, but Merge could not find any text in it. A scanned PDF has no text layer, so it will not be used when writing.');
      reset(); load();
    } catch (err) { toast.error(errorMessage(err, 'Upload failed.')); } finally { setUploading(false); setProgress(0); }
  };

  const remove = async (f) => {
    if (!(await confirm({ title: 'Remove document', message: `Remove "${f.filename}"? Merge will stop using it when it writes.`, confirmLabel: 'Remove', danger: true }))) return;
    try { await api.delete(`/api/files/${f.id}`); toast.success('Document removed.'); load(); } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <>
      {confirmDialog}
      {canEdit && (
        <div className="callout mb-3">
          <div className="row wrap" style={{ gap: 8 }}>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={e => setSelected(e.target.files[0] || null)} />
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="What this document shows (optional)" className="grow" style={{ minWidth: 200 }} />
            <Button onClick={send} loading={uploading} disabled={!selected}>Upload</Button>
          </div>
          <div className="tiny muted mt-1">PDF, Word, or text, up to {limits.maxFileLabel}. Merge reads the words in the file, so a scanned document with no text layer will not work.</div>
          {uploading && <div className="mt-1"><Progress value={progress} /></div>}
        </div>
      )}
      {files === null ? <p className="tiny faint">Loading…</p> : files.length === 0 ? (
        <p className="tiny faint">Nothing yet. Good ones to start with: your IRS determination letter, most recent audited financials or Form 990, accreditations or licences, a capability statement, staff and board bios.</p>
      ) : (
        <div className="table-wrap"><table className="table"><tbody>
          {files.map(f => (
            <tr key={f.id}>
              <td>
                <div className="strong">{f.filename}</div>
                <div className="tiny muted">{f.notes ? `${f.notes} · ` : ''}{fmtSize(f.size)} · added {formatDate(f.createdAt)}</div>
              </td>
              <td className="tiny" style={{ whiteSpace: 'nowrap' }}>
                {f.textChars
                  ? <span className="muted">Merge reads this</span>
                  : <span style={{ color: 'var(--danger, #b4232a)' }}>No readable text</span>}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {(isAdmin || f.uploadedBy?.id === user.id) && (
                  <Button variant="danger" size="sm" onClick={() => remove(f)} aria-label={`Remove ${f.filename}`}>
                    <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </>
  );
}
