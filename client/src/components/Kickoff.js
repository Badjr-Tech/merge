import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Button, Card, EmptyState, Field, Input, Loading, Textarea, useConfirm } from './ui';
import { displayName, formatDateTime, kickoffCalendarUrl, kickoffIcsDataUrl } from '../lib/format';

// Her list, in the order a kickoff call tends to go through them.
const CHECKLIST = [
  { key: 'theme', label: 'Agreed what this grant argues', hint: 'The thread every answer follows. Write it below.' },
  { key: 'requirements', label: 'Read the funder\u2019s requirements', hint: 'Eligibility, who can apply, what they fund and what they will not.' },
  { key: 'website', label: 'Got the link to the grant', hint: 'The funder\u2019s own page for this opportunity.' },
  { key: 'deadline', label: 'Confirmed the deadline', hint: 'The date, the time, and whose time zone it is in.' },
  { key: 'submission', label: 'Checked the submission terms', hint: 'Format, page and word limits, required attachments, which portal.' },
  { key: 'whoWrites', label: 'Decided who writes what', hint: 'Assign the questions once the rest of this is settled.' },
];

// The start of a grant: when the team talks it through, and what each person thinks it should
// argue. Everything written here goes into every answer Merge drafts for this project, which
// is why it sits on the project rather than in someone's own notes.
export default function Kickoff({ project, canManage }) {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [when, setWhen] = useState('');
  const [funder, setFunder] = useState({ grantUrl: '', funderName: '' });
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    api.get(`/api/projects/${project.id}/kickoff`)
      .then(r => {
        setData(r.data);
        // datetime-local wants the viewer's own clock, not UTC.
        if (r.data.kickoffAt) {
          const d = new Date(r.data.kickoffAt);
          const pad = (n) => String(n).padStart(2, '0');
          setWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        } else setWhen('');
        setFunder({ grantUrl: r.data.grantUrl || '', funderName: r.data.funderName || '' });
        setChecked(Object.fromEntries(Object.keys(r.data.checklist || {}).map(k => [k, true])));
      })
      .catch(() => setData({ kickoffAt: null, notes: [] }));
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!draft.trim()) return;
    setBusy('add');
    try { await api.post(`/api/projects/${project.id}/kickoff/notes`, { body: draft }); setDraft(''); toast.success('Added. Merge will follow this when it drafts answers for this grant.'); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  const saveEdit = async (n) => {
    setBusy(n.id);
    try { await api.put(`/api/projects/${project.id}/kickoff/notes/${n.id}`, { body: editText }); setEditing(null); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  const remove = async (n) => {
    if (!(await confirm({ title: 'Remove note', message: 'Remove this note? Merge will stop using it when it drafts answers for this grant.', confirmLabel: 'Remove', danger: true }))) return;
    try { await api.delete(`/api/projects/${project.id}/kickoff/notes/${n.id}`); load(); }
    catch (err) { toast.error(errorMessage(err)); }
  };

  const saveFunder = async () => {
    setBusy('funder');
    try { const res = await api.put(`/api/projects/${project.id}/kickoff`, funder); setFunder({ grantUrl: res.data.grantUrl || '', funderName: res.data.funderName || '' }); toast.success('Saved. Merge uses the funder page when it drafts.'); }
    catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  const toggleItem = async (key) => {
    const next = { ...checked, [key]: !checked[key] };
    setChecked(next);
    try { const res = await api.put(`/api/projects/${project.id}/kickoff`, { checklist: next }); setData(d => ({ ...d, checklist: res.data.checklist })); }
    catch (err) { setChecked(checked); toast.error(errorMessage(err)); }
  };

  const saveWhen = async () => {
    setBusy('when');
    // Sent as an instant so everyone sees the same moment wherever they are.
    try {
      const res = await api.put(`/api/projects/${project.id}/kickoff`, { kickoffAt: when ? new Date(when).toISOString() : null });
      setData(d => ({ ...d, kickoffAt: res.data.kickoffAt }));
      toast.success(res.data.kickoffAt ? 'Kickoff time saved.' : 'Kickoff time cleared.');
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  if (!data) return <Loading />;
  const gcal = kickoffCalendarUrl(project, data.kickoffAt);
  const ics = kickoffIcsDataUrl(project, data.kickoffAt);

  return (
    <>
      {confirmDialog}
      <Card pad className="mb-3">
        <h3>The kickoff call</h3>
        <p className="small muted" style={{ marginTop: -4 }}>
          Set a time, invite the people working on this grant, and talk through what it should argue before
          anyone writes an answer.
        </p>
        <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Field label="When">
            <Input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} disabled={!canManage} />
          </Field>
          {canManage && <Button variant="secondary" onClick={saveWhen} loading={busy === 'when'}>Save time</Button>}
        </div>
        {data.kickoffAt && (
          <div className="row wrap mt-2" style={{ gap: 8, alignItems: 'center' }}>
            <span className="small strong">{formatDateTime(data.kickoffAt)}</span>
            <a className="btn btn-secondary btn-sm" href={gcal} target="_blank" rel="noreferrer"><CalendarPlus size={14} strokeWidth={1.9} aria-hidden="true" /> Google Calendar</a>
            <a className="btn btn-secondary btn-sm" href={ics} download={`kickoff-${project.id}.ics`}>Download invite</a>
          </div>
        )}
      </Card>

      <Card pad className="mb-3">
        <h3>Before anyone writes</h3>
        <p className="small muted" style={{ marginTop: -4 }}>
          Settle these first. Each one is a day lost if it turns up after someone has written eight hundred
          words.
        </p>
        <div className="stack" style={{ gap: 4 }}>
          {CHECKLIST.map(item => {
            const done = data.checklist && data.checklist[item.key];
            return (
              <label key={item.key} className="row" style={{ gap: 8, alignItems: 'flex-start', padding: '5px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={Boolean(checked[item.key])} onChange={() => toggleItem(item.key)} style={{ marginTop: 4 }} />
                <span style={{ minWidth: 0 }}>
                  <span className="small strong" style={{ color: 'var(--navy)' }}>{item.label}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {item.hint}{done && done.by ? ` \u00b7 ticked by ${done.by}` : ''}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="grid-2 mt-3">
          <Field label="Funder" hint="Who is giving the money.">
            <Input value={funder.funderName} onChange={e => setFunder(f => ({ ...f, funderName: e.target.value }))} placeholder="e.g. The Hartley Foundation" disabled={!canManage} />
          </Field>
          <Field label="Link to the grant" hint="The funder's page for this opportunity. Merge reads it when it drafts, so answers can speak to what this funder asks for.">
            <Input value={funder.grantUrl} onChange={e => setFunder(f => ({ ...f, grantUrl: e.target.value }))} placeholder="https://funder.org/grants/community-fund" disabled={!canManage} />
          </Field>
        </div>
        {canManage && <Button variant="secondary" onClick={saveFunder} loading={busy === 'funder'}>Save funder details</Button>}
      </Card>

      <Card pad>
        <h3>What this grant should argue</h3>
        <p className="small muted" style={{ marginTop: -4 }}>
          Everyone on the grant writes their own thinking here: the story to tell, what this funder cares
          about, what to lead with, anything to avoid. Merge reads all of it before every answer it drafts for
          this grant, so the whole application follows one line rather than answering each question cold.
        </p>

        <Field label="Your notes">
          <Textarea rows={6} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What do you think this proposal is really about? What should every answer come back to?" />
        </Field>
        <Button onClick={add} loading={busy === 'add'} disabled={!draft.trim()}>Add my notes</Button>

        <div className="mt-3">
          {data.notes.length === 0 ? (
            <EmptyState icon="&#9998;" title="Nothing from the team yet">
              The first note sets the direction. Anyone working on this grant can add theirs.
            </EmptyState>
          ) : data.notes.map(n => {
            const mine = n.author?.id === user.id;
            return (
              <div key={n.id} className="callout mb-2">
                <div className="row-between">
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <Avatar user={n.author} size={24} />
                    <span className="small strong">{displayName(n.author)}</span>
                    <span className="tiny muted">{formatDateTime(n.createdAt)}{n.updatedAt && n.updatedAt !== n.createdAt ? ' · edited' : ''}</span>
                  </div>
                  {(mine || isAdmin) && editing !== n.id && (
                    <div className="row" style={{ gap: 6 }}>
                      <Button variant="secondary" size="sm" onClick={() => { setEditing(n.id); setEditText(n.body); }}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => remove(n)} aria-label="Remove note"><Trash2 size={14} strokeWidth={1.9} aria-hidden="true" /></Button>
                    </div>
                  )}
                </div>
                {editing === n.id ? (
                  <div className="mt-1">
                    <Textarea rows={6} value={editText} onChange={e => setEditText(e.target.value)} />
                    <div className="row mt-1" style={{ gap: 6 }}>
                      <Button size="sm" onClick={() => saveEdit(n)} loading={busy === n.id} disabled={!editText.trim()}>Save</Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : <div className="small mt-1 pre-wrap">{n.body}</div>}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
