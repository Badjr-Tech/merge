import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

// The second channel. Everything that sends an email also lands here, so closing your inbox
// doesn't mean missing work.
const ICON = { assigned: '✎', approval_requested: '✓', approval_decided: '✓', ready_to_merge: '◆', review_responded: '✉', deadline: '◷' };

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
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ display: 'block' }}>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
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
                <span className="bell-icon" aria-hidden="true">{ICON[n.type] || '•'}</span>
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
