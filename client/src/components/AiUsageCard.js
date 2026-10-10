import React, { useEffect, useState } from 'react';
import api from '../api';
import { Button, Card, Select } from './ui';
import { useToast } from '../context/ToastContext';

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
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/api/ai/usage').then(r => setData(r.data)).catch(() => setData(false));
  useEffect(() => { load(); }, []);
  if (!data) return null;

  const rows = ORDER.map(k => [k, data.features[k]]).filter(([, f]) => f && f.allowed);
  if (!rows.length) return null;

  const ar = data.autoReload || {};
  const setAuto = async (patch) => {
    setBusy(true);
    try { const r = await api.put('/api/billing/auto-reload', patch); setData(d => ({ ...d, autoReload: { ...d.autoReload, ...r.data } })); }
    catch (err) { toast.error('Could not save that.'); } finally { setBusy(false); }
  };
  const buy = async () => {
    setBusy(true);
    try { const r = await api.post('/api/billing/extra-review', { quantity: ar.qty || 5 }); window.location.href = r.data.url; }
    catch (err) { toast.error(err.response?.data?.msg || 'Could not start that purchase.'); setBusy(false); }
  };

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

      {data.features.review && data.features.review.allowed && (
        <div className="ai-usage-row">
          <div className="row-between">
            <span className="strong" style={{ color: 'var(--navy)' }}>Extra AI reviewer runs</span>
            <span className="small muted">{data.credits?.review ? `${data.credits.review} in hand` : 'None in hand'} · ${ar.price?.toFixed(2) || '1.99'} each</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>When your allowance runs out you can keep going by buying more runs.</div>
          <div className="row wrap mt-1" style={{ gap: 8 }}>
            <Select className="select-sm" value={ar.on ? 'auto' : 'manual'} onChange={e => setAuto({ on: e.target.value === 'auto' })} disabled={busy} style={{ maxWidth: 220 }}>
              <option value="manual">Ask me each time</option>
              <option value="auto">Buy more automatically</option>
            </Select>
            {ar.on && (
              <Select className="select-sm" value={String(ar.qty || 5)} onChange={e => setAuto({ qty: Number(e.target.value) })} disabled={busy} style={{ width: 150 }}>
                {[3, 5, 10, 20].map(n => <option key={n} value={n}>{n} at a time</option>)}
              </Select>
            )}
            <Button variant="secondary" size="sm" onClick={buy} loading={busy}>Buy {ar.qty || 5} now</Button>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {ar.on
              ? `Merge will charge the card on file for ${ar.qty || 5} runs ($${(((ar.qty || 5) * (ar.price || 1.99))).toFixed(2)}) whenever you run out, at most ${ar.cap || 4} times a month. You get an email every time.`
              : 'Nothing is charged automatically. When you run out, Merge asks first.'}
          </div>
        </div>
      )}
    </Card>
  );
}
