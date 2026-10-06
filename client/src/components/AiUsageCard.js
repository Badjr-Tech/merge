import React, { useEffect, useState } from 'react';
import api from '../api';
import { Card } from './ui';

// What this workspace is allowed and how close it is. Shown to admins in Settings.
const ORDER = ['chat', 'draft', 'review', 'profile'];

function Bar({ used, cap }) {
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const tone = pct >= 90 ? 'var(--danger)' : pct >= 70 ? '#b58100' : 'var(--green-dark)';
  return (
    <div className="ai-bar" title={`${used} of ${cap}`}>
      <span style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

function windowLabel(f) {
  if (f.month) return 'this month';
  if (f.perWeek) return 'this week';
  if (f.perDay) return 'today';
  return '';
}

export default function AiUsageCard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/api/ai/usage').then(r => setData(r.data)).catch(() => setData(false)); }, []);
  if (!data) return null;

  const rows = ORDER.map(k => [k, data.features[k]]).filter(([, f]) => f && f.allowed);
  if (!rows.length) return null;

  return (
    <Card pad className="mb-3" id="ai-usage">
      <h3>AI usage</h3>
      <p className="small muted">What this workspace can use on {data.plan}, and how much is left. {data.unmetered ? 'This workspace is not metered.' : 'Monthly allowances reset on the 1st.'}</p>
      {rows.map(([key, f]) => {
        const cap = f.month || f.perWeek || f.perDay || null;
        const used = f.usedThisMonth ?? f.usedThisWeek ?? f.usedToday ?? null;
        return (
          <div key={key} className="ai-usage-row">
            <div className="row-between">
              <span className="strong" style={{ color: 'var(--navy)' }}>{f.label}</span>
              <span className="small muted">
                {cap === null
                  ? (f.everyDays ? `once every ${f.everyDays} days` : f.once ? 'once' : '')
                  : `${(used || 0).toLocaleString()} of ${cap.toLocaleString()} ${windowLabel(f)}`}
              </span>
            </div>
            {cap !== null && <Bar used={used || 0} cap={cap} />}
            <div className="tiny muted">
              {f.perDayPerUser ? `Up to ${f.perDayPerUser} per person per day${f.usedByYouToday ? ` · you've used ${f.usedByYouToday} today` : ''}. ` : ''}
              {f.nextAvailableAt ? `Available again ${new Date(f.nextAvailableAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. ` : ''}
              {f.extraPrice ? `Extra runs are $${f.extraPrice.toFixed(2)} each.` : ''}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
