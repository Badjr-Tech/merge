import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import logo from '../merge1.png';
import { Avatar } from '../components/ui';
import { displayName } from '../lib/format';
import Assistant from '../components/Assistant';
import FeedbackWidget from '../components/FeedbackWidget';
import { usePlan } from '../context/PlanContext';
import useSeo from '../lib/seo';

const I = {
  home: '⌂', projects: '▤', bank: '◫', partners: '☍', tasks: '✎', approvals: '✓', past: '◷', files: '▣', ai: '✦', compliance: '☑', calendar: '▦', team: '☺', settings: '⚙', menu: '☰',
};

export default function AppShell() {
  const { user, isAdmin, isApprover, signOut } = useAuth();
  const { has, plan } = usePlan();
  const writerMode = plan?.kind === 'writer';
  useSeo({ title: user?.company?.name || 'Workspace', path: '/app', noindex: true });
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/projects/dashboard/summary').then(res => { if (!cancelled) setCounts(res.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [location.pathname]);

  const link = (to, label, icon, count, feature) => (
    <NavLink to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={to === '/app'}>
      <span className="nav-icon">{icon}</span>{label}
      {count > 0 && <span className="nav-count">{count}</span>}
      {feature && !has(feature) && <span className="nav-count" title="Premium feature">★</span>}
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
          <div className="role">{user?.role}{plan ? ` · ${plan.name}${plan.trialing ? ' trial' : ''}` : ''}</div>
        </div>
        <nav className="sidebar-nav">
          {link('/app', 'Home', I.home)}
          {link('/app/projects', 'Projects', I.projects)}
          {!writerMode && link('/app/tasks', 'My tasks', I.tasks, counts.myOpenQuestions)}
          {!writerMode && link('/app/approvals', 'Approvals', I.approvals, isApprover ? counts.awaitingMyApproval : counts.pendingApproval)}
          <div className="nav-section">Tools</div>
          {link('/app/answer-bank', 'Answer bank', I.bank)}
          {link('/app/ai-review', 'AI reviewer', I.ai, 0, 'ai_reviewer')}
          {link('/app/compliance', 'Compliance check', I.compliance)}
          {link('/app/past-proposals', 'Past proposals', I.past, 0, 'past_proposals')}
          {link('/app/partners', 'Partners', I.partners, 0, 'partners')}
          {link('/app/files', 'File cabinet', I.files)}
          {link('/app/calendar', 'Grant calendar', I.calendar)}
          <div className="nav-section">Workspace</div>
          {isAdmin && !writerMode && link('/app/team', 'Team', I.team)}
          {link('/app/referrals', 'Refer a friend', '♥')}
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
          <div className="powered-side">Powered by <a href="https://badjr.vercel.app" target="_blank" rel="noopener noreferrer">Badjr</a></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-secondary btn-icon menu-btn" onClick={() => setOpen(o => !o)} aria-label="Menu">{I.menu}</button>
          <span className="crumbs">{user?.company?.name}</span>
          {plan?.trialing && (
            <Link to="/app/settings#plan" className="trial-pill">{plan.name} trial · {plan.trialDaysLeft} day{plan.trialDaysLeft === 1 ? '' : 's'} left · Choose a plan</Link>
          )}
          {plan?.trialExpired && plan.key === 'free' && (
            <Link to="/app/settings#plan" className="trial-pill ended">Trial ended · you're on Free · See plans</Link>
          )}
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <Assistant />
      <FeedbackWidget />
    </div>
  );
}
