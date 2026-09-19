import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { Badge, Card, ErrorBlock, Loading, PageHeader } from '../components/ui';
import { formatDate } from '../lib/format';

const money = (n) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE = { paying: 'green', trial: 'indigo', comped: 'gold', free: 'gray' };

export default function StaffOverview() {
  const [access, setAccess] = useState(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/api/staff/access').then(r => setAccess(r.data.staff)).catch(() => setAccess(false)); }, []);
  useEffect(() => { if (access) api.get('/api/staff/overview').then(r => setD(r.data)).catch(err => setError(errorMessage(err))); }, [access]);
  if (access === null) return <Loading />;
  if (access === false) return <Navigate to="/app" replace />;
  return (
    <div>
      <PageHeader title="Merge overview" subtitle="Revenue, signups, and usage across every workspace. Staff only." actions={<Link to="/app/staff" className="btn btn-secondary">Workspaces &amp; comps</Link>} />
      {error && <ErrorBlock message={error} />}
      {!d && !error && <Loading />}
      {d && (
        <>
          <h3 className="mb-1">Revenue</h3>
          <div className="grid-4 mb-3">
            <Card className="stat"><div className="stat-label">Monthly recurring</div><div className="stat-value">{money(d.revenue.mrr)}</div><div className="stat-sub">{money(d.revenue.arr)} annualized</div></Card>
            <Card className="stat"><div className="stat-label">Paying workspaces</div><div className="stat-value">{d.revenue.paying}</div><div className="stat-sub">{d.revenue.cancelling} cancelling · {d.revenue.pastDue} past due</div></Card>
            <Card className="stat"><div className="stat-label">Collected, last 30 days</div><div className="stat-value">{d.revenue.stripe && !d.revenue.stripe.error ? money(d.revenue.stripe.collected30) : '—'}</div><div className="stat-sub">{d.revenue.stripe && !d.revenue.stripe.error ? `${d.revenue.stripe.charges30} charges · ${money(d.revenue.stripe.refunded30)} refunded` : d.revenue.stripe?.error || 'Stripe not connected'}</div></Card>
            <Card className="stat"><div className="stat-label">Stripe balance</div><div className="stat-value">{d.revenue.stripe && !d.revenue.stripe.error ? money(d.revenue.stripe.available) : '—'}</div><div className="stat-sub">{d.revenue.stripe && !d.revenue.stripe.error ? `${money(d.revenue.stripe.pending)} pending payout` : ''}</div></Card>
          </div>
          {Object.keys(d.revenue.byPlan).length > 0 && (
            <Card pad className="mb-3"><div className="stat-label mb-1">MRR by plan</div><div className="row wrap">{Object.entries(d.revenue.byPlan).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Badge key={k} tone="green">{k}: {money(v)}</Badge>)}</div></Card>
          )}

          <h3 className="mb-1">Workspaces</h3>
          <div className="grid-4 mb-3">
            <Card className="stat"><div className="stat-label">Total</div><div className="stat-value">{d.workspaces.total}</div><div className="stat-sub">{d.workspaces.trialing} on trial · {d.workspaces.comped} comped · {d.workspaces.free} free</div></Card>
            <Card className="stat"><div className="stat-label">New, last 7 days</div><div className="stat-value">{d.workspaces.signups7}</div><div className="stat-sub">{d.workspaces.signups30} in the last 30</div></Card>
            <Card className="stat"><div className="stat-label">Trial conversion, 30 days</div><div className="stat-value">{d.workspaces.conversionRate30 === null ? '—' : `${d.workspaces.conversionRate30}%`}</div><div className="stat-sub">{d.workspaces.converted30} of {d.workspaces.trialsEnded30} trials that ended went paid</div></Card>
            <Card className="stat"><div className="stat-label">Referrals</div><div className="stat-value">{d.usage.referrals}</div><div className="stat-sub">workspaces that came from a referral code</div></Card>
          </div>

          <h3 className="mb-1">Usage</h3>
          <div className="grid-4 mb-3">
            <Card className="stat"><div className="stat-label">People</div><div className="stat-value">{d.usage.users}</div></Card>
            <Card className="stat"><div className="stat-label">Grants</div><div className="stat-value">{d.usage.projects}</div><div className="stat-sub">{d.usage.projects7} created this week</div></Card>
            <Card className="stat"><div className="stat-label">Answers written</div><div className="stat-value">{d.usage.answers}</div></Card>
            <Card className="stat"><div className="stat-label">Sent for review</div><div className="stat-value">{d.usage.reviewsSent}</div></Card>
          </div>

          <Card>
            <div className="card-header"><h3>Newest workspaces</h3><Link to="/app/staff" className="small">See all</Link></div>
            <div className="table-wrap"><table className="table"><thead><tr><th>Workspace</th><th>Plan</th><th>People / grants</th><th>Joined</th></tr></thead><tbody>{d.recent.map(w => (
              <tr key={w.id}><td><div className="strong">{w.name}</div><div className="tiny muted">{w.kind}{w.referred ? ' · referred' : ''}</div></td><td><Badge tone={TONE[w.status]}>{w.plan}{w.status !== 'free' ? ` · ${w.status}` : ''}</Badge></td><td className="small muted">{w.users} / {w.projects}</td><td className="small muted">{formatDate(w.createdAt)}</td></tr>
            ))}</tbody></table></div>
          </Card>
        </>
      )}
    </div>
  );
}
