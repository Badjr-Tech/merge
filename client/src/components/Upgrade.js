import React from 'react';
import { Link } from 'react-router-dom';
import { usePlan } from '../context/PlanContext';
import { useAuth } from '../context/AuthContext';
import { Card } from './ui';

export const FEATURE_COPY = {
  partners: { title: 'Partners directory', text: 'Keep the organizations you collaborate with in one place and let Ask Merge recommend which ones fit a grant.' },
  past_proposals: { title: 'Past proposals library', text: 'Store finished applications, including ones written before Merge, and search them when the next grant comes around.' },
  narrative_editing: { title: 'Editable merged narrative', text: 'Polish the merged document as one piece of writing, with every edit saved to version history.' },
  ai_reviewer: { title: 'AI reviewer', text: 'Get a funder\'s-eye critique of a proposal before you submit it.' },
  approvals: { title: 'Unlimited approvals', text: 'Starter includes 5 approval requests per month. Premium removes the cap.' },
};

export default function UpgradeGate({ feature, children }) {
  const { has, plan } = usePlan();
  const { isAdmin } = useAuth();
  if (has(feature)) return children;
  const copy = FEATURE_COPY[feature] || { title: 'Premium feature', text: 'This feature is included in Premium and above.' };
  return (
    <Card pad className="upgrade-card">
      <div className="badge badge-gold mb-1">Premium</div>
      <h3>{copy.title}</h3>
      <p className="muted">{copy.text}</p>
      <p className="small muted">Your workspace is on the <strong>{plan?.name || 'Starter'}</strong> plan.</p>
      {isAdmin ? <Link to="/app/settings#plan" className="btn btn-primary">See plans</Link> : <span className="small muted">Ask a workspace admin to upgrade.</span>}
    </Card>
  );
}
