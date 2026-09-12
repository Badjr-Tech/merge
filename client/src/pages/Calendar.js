import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, EmptyState, ErrorBlock, Loading, PageHeader } from '../components/ui';
import { dueLabel, formatDate, projectStatus, googleCalendarUrl, icsDataUrl } from '../lib/format';

function AddToCalendar({ project, size }) {
  return (
    <span className="row" style={{ gap: 6 }} onClick={e => e.stopPropagation()}>
      <a className={`btn btn-secondary ${size === 'sm' ? 'btn-sm' : ''}`} href={googleCalendarUrl(project)} target="_blank" rel="noopener noreferrer" title="Add the due date to Google Calendar">+ Google Calendar</a>
      <a className={`btn btn-ghost ${size === 'sm' ? 'btn-sm' : ''}`} href={icsDataUrl(project)} download={`${project.name.replace(/[^a-z0-9]+/gi, '-')}-deadline.ics`} title="Download for Apple Calendar or Outlook">.ics</a>
    </span>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function Calendar() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [deadlines, setDeadlines] = useState(null);
  const [error, setError] = useState('');
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(null);

  useEffect(() => { api.get('/api/projects/deadlines').then(r => setDeadlines(r.data)).catch(err => setError(errorMessage(err))); }, []);

  const byDay = useMemo(() => {
    const map = {};
    (deadlines || []).forEach(d => { const k = key(new Date(d.deadlineDate)); (map[k] = map[k] || []).push(d); });
    return map;
  }, [deadlines]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const upcoming = (deadlines || []).filter(d => !d.isCompleted && new Date(d.deadlineDate) >= new Date(today.getFullYear(), today.getMonth(), today.getDate())).sort((a, b) => new Date(a.deadlineDate) - new Date(b.deadlineDate)).slice(0, 8);
  const selectedList = selected ? (byDay[key(selected)] || []) : [];

  return (
    <div>
      <PageHeader title="Grant calendar" subtitle="Every project deadline on one calendar. Add a due date to a project and it appears here." actions={canEdit && <Button to="/app/projects/new" variant="secondary">+ New project</Button>} />
      {error && <ErrorBlock message={error} />}
      {!deadlines && !error && <Loading />}
      {deadlines && (
        <div className="grid-2" style={{ gridTemplateColumns: '3fr 1.2fr' }}>
          <Card>
            <div className="card-header">
              <div className="row">
                <Button variant="secondary" size="sm" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">‹</Button>
                <h3 style={{ minWidth: 170, textAlign: 'center' }}>{monthLabel}</h3>
                <Button variant="secondary" size="sm" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">›</Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}>Today</Button>
            </div>
            <div className="cal">
              {DAYS.map(d => <div key={d} className="cal-dow">{d}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} className="cal-cell empty" />;
                const items = byDay[key(d)] || [];
                const isToday = key(d) === key(today);
                const isSel = selected && key(d) === key(selected);
                return (
                  <div key={key(d)} className={`cal-cell ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : ''}`} onClick={() => setSelected(d)}>
                    <div className="cal-num">{d.getDate()}</div>
                    <div className="cal-items">
                      {items.slice(0, 3).map(it => (
                        <button key={it.id} className={`cal-chip ${it.isCompleted ? 'done' : new Date(it.deadlineDate) < today && !isToday ? 'past' : ''}`} title={it.name} onClick={(e) => { e.stopPropagation(); navigate(`/app/projects/${it.id}`); }}>{it.name}</button>
                      ))}
                      {items.length > 3 && <div className="tiny muted">+{items.length - 3} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="stack">
            {selected && (
              <Card>
                <div className="card-header"><h3>{formatDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</h3><button className="link-button tiny" onClick={() => setSelected(null)}>Clear</button></div>
                {selectedList.length === 0 ? <div className="card-body small muted">No deadlines this day.</div> : (
                  <div className="card-body stack">{selectedList.map(it => { const st = projectStatus(it); return (
                    <div key={it.id}><Link to={`/app/projects/${it.id}`} className="strong">{it.name}</Link><div className="tiny muted mb-1">{it.done}/{it.total} submitted · <Badge tone={st.tone}>{st.label}</Badge></div><AddToCalendar project={it} size="sm" /></div>
                  ); })}</div>
                )}
              </Card>
            )}
            <Card>
              <div className="card-header"><h3>Coming up</h3></div>
              {upcoming.length === 0 ? <EmptyState icon="▦" title="No upcoming deadlines">{canEdit ? 'Set a due date on a project to see it here.' : 'Deadlines will appear once projects have due dates.'}</EmptyState> : (
                <div className="table-wrap"><table className="table"><tbody>{upcoming.map(it => { const due = dueLabel(it.deadlineDate); return (
                  <tr key={it.id} className="clickable" onClick={() => navigate(`/app/projects/${it.id}`)}><td><div className="strong" style={{ color: 'var(--navy)' }}>{it.name}</div><div className="tiny muted mb-1">{formatDate(it.deadlineDate, { weekday: 'short', month: 'short', day: 'numeric' })} · {it.done}/{it.total} submitted {due && <Badge tone={due.tone}>{due.text}</Badge>}</div><AddToCalendar project={it} size="sm" /></td></tr>
                ); })}</tbody></table></div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
