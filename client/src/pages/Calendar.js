import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Badge, Card, EmptyState, PageHeader } from '../components/ui';
import { dueLabel, formatDate } from '../lib/format';

const EMBED = 'https://calendar.google.com/calendar/embed?src=c_48158deb317d0fd30228dfa41770decac6f0e4620348a2c5d39952a81b92e306%40group.calendar.google.com&ctz=America%2FNew_York';

export default function Calendar() {
  const navigate = useNavigate();
  const [deadlines, setDeadlines] = useState([]);
  useEffect(() => { api.get('/api/projects/deadlines').then(r => setDeadlines(r.data)).catch(() => {}); }, []);
  return (
    <div>
      <PageHeader title="Grant calendar" subtitle="Your project deadlines alongside the shared funding calendar." />
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 2fr' }}>
        <Card>
          <div className="card-header"><h3>Project deadlines</h3></div>
          {deadlines.length === 0 ? <EmptyState icon="▦" title="No deadlines set">Add a due date to a project and it will show here.</EmptyState> : (
            <div className="table-wrap"><table className="table"><tbody>{deadlines.map(d => { const due = dueLabel(d.deadlineDate); return (
              <tr key={d.id} className="clickable" onClick={() => navigate(`/app/projects/${d.id}`)}><td><div className="strong" style={{ color: 'var(--navy)' }}>{d.name}</div><div className="tiny muted">{formatDate(d.deadlineDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div></td><td style={{ textAlign: 'right' }}>{due && <Badge tone={due.tone}>{due.text}</Badge>}</td></tr>
            ); })}</tbody></table></div>
          )}
        </Card>
        <Card style={{ overflow: 'hidden' }}>
          <iframe src={EMBED} title="Grant calendar" style={{ border: 0, width: '100%', height: 620, display: 'block' }} />
        </Card>
      </div>
    </div>
  );
}
