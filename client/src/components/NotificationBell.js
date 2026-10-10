import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, PenLine, CheckCheck, FileText, Mail, Clock, Undo2, CircleCheck, Gauge, Dot } from 'lucide-react';
import api from '../api';

// The second channel. Everything that sends an email also lands here, so closing your inbox
// doesn't mean missing work.
const ICON = {
  assigned: PenLine, approval_requested: CheckCheck, approval_decided: CheckCheck,
  ready_to_merge: FileText, review_responded: Mail, deadline: Clock, reopened: Undo2,
  completed: CircleCheck, ai_limit: Gauge,
};

function ago(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const ref = useRef();

  const load = useCallback(() => {
    api.get('/api/notifications').then(r => setData(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const markAll = async () => {
    await api.post('/api/notifications/read').catch(() => {});
    load();
  };

  const go = async (n) => {
    setOpen(false);
    if (!n.readAt) await api.post('/api/notifications/read', { id: n.id }).catch(() => {});
    load();
    if (n.link) navigate(n.link);
  };

  return (
    <div className="bell-wrap" ref={ref}>
      <button type="button" className="bell" onClick={() => setOpen(o => !o)} aria-label={data.unread ? `Notifications, ${data.unread} unread` : 'Notifications'}>
        <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
        {data.unread > 0 && <span className="bell-dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {data.unread > 0 && <button type="button" className="link-button tiny" onClick={markAll}>Mark all read</button>}
          </div>
          <div className="bell-list">
            {data.items.length === 0 && <p className="small muted" style={{ padding: '18px 14px', margin: 0 }}>Nothing yet. Assignments, approvals, and deadline reminders show up here.</p>}
            {data.items.map(n => (
              <button type="button" key={n.id} className={`bell-item ${n.readAt ? '' : 'unread'}`} onClick={() => go(n)}>
                <span className="bell-icon" aria-hidden="true">{React.createElement(ICON[n.type] || Dot, { size: 15, strokeWidth: 1.8 })}</span>
                <span className="grow">
                  <span className="bell-title">{n.title}</span>
                  {n.body && <span className="bell-body">{n.body}</span>}
                  <span className="bell-time">{ago(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
