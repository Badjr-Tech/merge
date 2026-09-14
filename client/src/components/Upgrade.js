import React from 'react';
import { Link } from 'react-router-dom';
import { usePlan } from '../context/PlanContext';
import { useAuth } from '../context/AuthContext';
import { Card } from './ui';

export const FEATURE_COPY = {
  unlimited_projects: { title: 'Unlimited grants', min: { writer: 'Starter', team: 'Solo Writer' }, text: 'Free includes one grant with every solo feature. Paid plans remove the cap.' },
  answer_bank: { title: 'Answer bank', min: { writer: 'Starter', team: 'Solo Writer' }, text: 'Every answer you write becomes searchable and reusable, with similar-answer suggestions while you write.' },
  assistant: { title: 'Ask Merge', min: { writer: 'Premium', team: 'Solo Writer' }, text: 'A writing assistant that knows your organization, your partners, and the project you have open.' },
  external_review: { title: 'Send for review', min: { writer: 'Starter', team: 'Solo Writer' }, text: 'Share a read-only link so an executive director or board member can approve or send back notes. No account needed.' },
  team: { title: 'Teammates', min: { writer: 'an organization workspace', team: 'Small Teams' }, text: 'Invite people, assign questions, and write together.' },
  approvals: { title: 'Approvals', min: { writer: 'an organization workspace', team: 'Small Teams' }, text: 'Route a finished proposal to an approver and track sign-off.' },
  partners: { title: 'Partners directory', min: { writer: 'Premium', team: 'Solo Writer' }, text: 'Keep the organizations you collaborate with in one place and let Ask Merge recommend which ones fit a grant.' },
  past_proposals: { title: 'Past proposals library', min: { writer: 'Premium', team: 'Solo Writer' }, text: 'Store finished applications, including ones written before Merge, and search them when the next grant comes around.' },
  narrative_editing: { title: 'Editable document', min: { writer: 'Premium', team: 'Solo Writer' }, text: 'Polish the merged document as one piece of writing, with every edit saved to version history.' },
  ai_reviewer: { title: 'AI reviewer', min: { writer: 'Premium', team: 'Solo Writer' }, text: 'Get a funder\'s-eye critique of a proposal before you submit it.' },
};

export default function UpgradeGate({ feature, children }) {
  const { has, plan } = usePlan();
  const { isAdmin } = useAuth();
  if (has(feature)) return children;
  const raw = FEATURE_COPY[feature] || { title: 'Paid feature', text: 'This feature is included in paid plans.' };
  const kind = plan?.kind === 'writer' ? 'writer' : 'team';
  const copy = { ...raw, min: typeof raw.min === 'object' ? raw.min[kind] : raw.min };
  return (
    <Card pad className="upgrade-card">
      <div className="badge badge-gold mb-1">{copy.min ? `${copy.min} and above` : 'Paid plans'}</div>
      <h3>{copy.title}</h3>
      <p className="muted">{copy.text}</p>
      <p className="small muted">Your workspace is on the <strong>{plan?.name || 'Free'}</strong> plan.</p>
      {isAdmin ? <Link to="/app/settings#plan" className="btn btn-primary">See plans</Link> : <span className="small muted">Ask a workspace admin to upgrade.</span>}
    </Card>
  );
}
