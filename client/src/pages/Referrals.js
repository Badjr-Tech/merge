import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api';
import { Badge, Card, CopyButton, EmptyState, ErrorBlock, Loading, PageHeader } from '../components/ui';
import { formatDate } from '../lib/format';

const STATUS = { signed_up: ['Signed up', 'gray'], paid: ['Paid', 'indigo'], rewarded: ['Rewarded', 'green'] };

export default function Referrals() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/api/referrals/mine').then(r => setData(r.data)).catch(err => setError(errorMessage(err))); }, []);

  return (
    <div>
      <PageHeader title="Refer a friend" subtitle="Know another grant writer or organization? Send them Merge. They save, and so do you." />
      {error && <ErrorBlock message={error} />}
      {!data && !error && <Loading />}
      {data && !data.eligible && (
        <Card pad className="upgrade-card">
          <div className="badge badge-gold mb-1">Premium, Professional, Large Teams, and Companies</div>
          <h3>Referral rewards unlock on the top two tiers</h3>
          <p className="muted">Upgrade and you'll get a personal link. Every friend who becomes a paying customer earns you $5 off, and they get 10% off their first 3 months.</p>
          <Link to="/app/settings#plan" className="btn btn-primary">See plans</Link>
        </Card>
      )}
      {data && data.eligible && (
        <>
          <Card pad className="mb-3">
            <div className="grid-2">
              <div><div className="stat-label">You get</div><div className="strong" style={{ color: 'var(--navy)', fontSize: 18 }}>$5 off your next invoice</div><div className="small muted">for every referral that becomes a paying customer</div></div>
              <div><div className="stat-label">They get</div><div className="strong" style={{ color: 'var(--navy)', fontSize: 18 }}>10% off their first 3 months</div><div className="small muted">applied automatically at checkout</div></div>
            </div>
            <div className="divider" />
            <div className="label mb-1">Your referral link</div>
            <div className="callout row-between"><code className="truncate" style={{ maxWidth: 420 }}>{data.link}</code><CopyButton text={data.link} /></div>
            <div className="tiny muted mt-1">Or share the code <strong>{data.code}</strong>. They enter it on the signup page.</div>
          </Card>
          <div className="grid-3 mb-3">
            <Card className="stat"><div className="stat-label">Earned</div><div className="stat-value">${data.earned}</div></Card>
            <Card className="stat"><div className="stat-label">Pending</div><div className="stat-value">{data.pending}</div><div className="stat-sub">signed up, not paid yet</div></Card>
            <Card className="stat"><div className="stat-label">Total referrals</div><div className="stat-value">{data.referrals.length}</div></Card>
          </div>
          <Card>
            <div className="card-header"><h3>Your referrals</h3></div>
            {data.referrals.length === 0 ? <EmptyState icon="☍" title="No referrals yet">Share your link. Each one shows up here when they sign up.</EmptyState> : (
              <div className="table-wrap"><table className="table"><tbody>{data.referrals.map(r => (
                <tr key={r.id}><td className="strong">{r.workspace}</td><td className="small muted">Signed up {formatDate(r.createdAt)}{r.paidAt ? ` · paid ${formatDate(r.paidAt)}` : ''}</td><td style={{ textAlign: 'right' }}><Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge></td></tr>
              ))}</tbody></table></div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
