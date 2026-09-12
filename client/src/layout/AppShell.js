import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import logo from '../merge1.png';
import { Avatar } from '../components/ui';
import { displayName } from '../lib/format';

const I = {
  home: '⌂', projects: '▤', tasks: '✎', approvals: '✓', past: '◷', files: '▣', ai: '✦', compliance: '☑', calendar: '▦', team: '☺', settings: '⚙', menu: '☰',
};

export default function AppShell() {
  const { user, isAdmin, isApprover, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/projects/dashboard/summary').then(res => { if (!cancelled) setCounts(res.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [location.pathname]);

  const link = (to, label, icon, count) => (
    <NavLink to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={to === '/app'}>
      <span className="nav-icon">{icon}</span>{label}
      {count > 0 && <span className="nav-count">{count}</span>}
    </NavLink>
  );

  return (
    <div className="shell">
      <div className={`sidebar-scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Link to="/app"><img src={logo} alt="Merge" /></Link>
        </div>
        <div className="sidebar-workspace">
          <div className="name truncate">{user?.company?.name || 'Workspace'}</div>
          <div className="role">{user?.role}</div>
        </div>
        <nav className="sidebar-nav">
          {link('/app', 'Home', I.home)}
          {link('/app/projects', 'Projects', I.projects)}
          {link('/app/tasks', 'My tasks', I.tasks, counts.myOpenQuestions)}
          {link('/app/approvals', 'Approvals', I.approvals, isApprover ? counts.awaitingMyApproval : counts.pendingApproval)}
          <div className="nav-section">Tools</div>
          {link('/app/ai-review', 'AI reviewer', I.ai)}
          {link('/app/compliance', 'Compliance check', I.compliance)}
          {link('/app/past-proposals', 'Past proposals', I.past)}
          {link('/app/files', 'File cabinet', I.files)}
          {link('/app/calendar', 'Grant calendar', I.calendar)}
          <div className="nav-section">Workspace</div>
          {isAdmin && link('/app/team', 'Team', I.team)}
          {link('/app/settings', 'Settings', I.settings)}
        </nav>
        <div className="sidebar-footer">
          <Link to="/app/settings" className="user-chip">
            <Avatar user={user} />
            <div className="who">
              <div className="n truncate">{displayName(user)}</div>
              <div className="e truncate">{user?.email}</div>
            </div>
          </Link>
          <button className="nav-link" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }} onClick={signOut}>
            <span className="nav-icon">⇥</span>Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-secondary btn-icon menu-btn" onClick={() => setOpen(o => !o)} aria-label="Menu">{I.menu}</button>
          <span className="crumbs">{user?.company?.name}</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
