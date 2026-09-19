import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, Loading, Modal, PageHeader, Textarea, useConfirm } from '../components/ui';
import UpgradeGate from '../components/Upgrade';

const blank = { name: '', location: '', description: '', website: '', contactName: '', contactEmail: '', tags: '', notes: '' };

function InnerPartners() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | partner
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const load = () => { setError(''); api.get('/api/partners').then(r => setPartners(r.data)).catch(err => setError(errorMessage(err))); };
  useEffect(load, []);

  const open = (p) => { setForm(p ? { ...blank, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v || ''])) } : blank); setEditing(p || 'new'); };
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Give the partner a name.'); return; }
    setBusy(true);
    try {
      if (editing === 'new') await api.post('/api/partners', form); else await api.put(`/api/partners/${editing.id}`, form);
      toast.success(editing === 'new' ? 'Partner added.' : 'Partner updated.'); setEditing(null); load();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const remove = async (p) => {
    if (!(await confirm({ title: 'Remove partner', message: `Remove ${p.name} from your directory?`, confirmLabel: 'Remove', danger: true }))) return;
    try { await api.delete(`/api/partners/${p.id}`); toast.success('Partner removed.'); load(); } catch (err) { toast.error(errorMessage(err)); }
  };

  const term = q.toLowerCase();
  const filtered = (partners || []).filter(p => !term || [p.name, p.location, p.description, p.tags, p.notes].some(v => (v || '').toLowerCase().includes(term)));

  return (
    <div>
      {confirmDialog}
      <PageHeader title="Partners" subtitle="Organizations you collaborate with. Keep their details here so they're ready to drop into a proposal, and ask the assistant which partners fit a grant." actions={canEdit && <Button onClick={() => open(null)}>+ Add partner</Button>} />
      <Input placeholder="Search partners by name, location, or what they do…" value={q} onChange={e => setQ(e.target.value)} className="mb-3" style={{ maxWidth: 480 }} />
      {error && <ErrorBlock message={error} retry={load} />}
      {!partners && !error && <Loading />}
      {partners && filtered.length === 0 && <Card><EmptyState icon="☍" title={q ? 'No matching partners' : 'No partners yet'} action={!q && canEdit && <Button onClick={() => open(null)}>Add your first partner</Button>}>{q ? 'Try another search.' : 'Add the schools, agencies, nonprofits, and businesses you work with.'}</EmptyState></Card>}
      {partners && filtered.length > 0 && (
        <div className="grid-2">{filtered.map(p => (
          <Card key={p.id} pad>
            <div className="row-between">
              <div className="grow">
                <h3 className="mb-0">{p.name}</h3>
                <div className="tiny muted">{[p.location, p.website && <a key="w" href={/^https?:/i.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\//, '')}</a>].filter(Boolean).reduce((acc, x, i) => i ? [...acc, ' · ', x] : [x], [])}</div>
              </div>
              {canEdit && <div className="row"><Button variant="ghost" size="sm" onClick={() => open(p)}>Edit</Button><Button variant="danger" size="sm" onClick={() => remove(p)}>Remove</Button></div>}
            </div>
            {p.description && <p className="small mt-1 mb-1">{p.description}</p>}
            {p.tags && <div className="row wrap mb-1">{p.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => <Badge key={t} tone="periwinkle">{t}</Badge>)}</div>}
            {(p.contactName || p.contactEmail) && <div className="tiny muted">Contact: {p.contactName}{p.contactEmail && <> · <a href={`mailto:${p.contactEmail}`}>{p.contactEmail}</a></>}</div>}
            {p.notes && <div className="tiny muted mt-1">{p.notes}</div>}
          </Card>
        ))}</div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a partner' : 'Edit partner'} size="lg" footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={busy}>Save partner</Button></>}>
        <div className="grid-2">
          <Field label="Name"><Input value={form.name} onChange={set('name')} autoFocus /></Field>
          <Field label="Location" hint="City, state, or service area"><Input value={form.location} onChange={set('location')} /></Field>
        </div>
        <Field label="What they do" hint="The assistant uses this to match partners to grants."><Textarea rows={3} value={form.description} onChange={set('description')} /></Field>
        <div className="grid-2">
          <Field label="Website"><Input value={form.website} onChange={set('website')} placeholder="example.org" /></Field>
          <Field label="Tags" hint="Comma-separated, e.g. youth, housing, health"><Input value={form.tags} onChange={set('tags')} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Contact name"><Input value={form.contactName} onChange={set('contactName')} /></Field>
          <Field label="Contact email"><Input type="email" value={form.contactEmail} onChange={set('contactEmail')} /></Field>
        </div>
        <Field label="Notes" hint="History with this partner, past grants together, MOUs on file"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </Modal>
    </div>
  );
}

export default function Partners() {
  return <UpgradeGate feature="partners" title="Partners" subtitle="Organizations you collaborate with."><InnerPartners /></UpgradeGate>;
}
