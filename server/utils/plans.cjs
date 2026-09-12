// Plan definitions. Feature keys are checked on the server (requireFeature) and mirrored to the client.
const CORE = ['projects', 'exports', 'file_cabinet', 'calendar'];
const SOLO = [...CORE, 'unlimited_projects', 'answer_bank', 'assistant'];
const TEAM = [...SOLO, 'team', 'approvals', 'partners', 'past_proposals', 'narrative_editing', 'ai_reviewer'];

const PLANS = {
  free:       { name: 'Free',       price: 0,     per: 'workspace', features: CORE, limits: { seats: 1, activeProjects: 2 } },
  starter:    { name: 'Starter',    price: 8.99,  per: 'month',     features: SOLO, limits: { seats: 1, activeProjects: null } },
  premium:    { name: 'Premium',    price: 22.99, per: 'person',    features: TEAM, limits: { seats: 5, activeProjects: null } },
  enterprise: { name: 'Enterprise', price: 49.99, per: 'person',    features: [...TEAM, 'multi_workspace', 'priority_support'], limits: { seats: 20, activeProjects: null } },
  custom:     { name: 'Custom',     price: null,  per: 'custom',    features: [...TEAM, 'multi_workspace', 'priority_support', 'custom_branding'], limits: { seats: null, activeProjects: null } },
};

const TRIAL_DAYS = 14;
const TRIAL_PLAN = 'premium';

const FEATURE_LABELS = {
  unlimited_projects: 'Unlimited projects',
  answer_bank: 'Answer bank',
  assistant: 'Ask Merge writing assistant',
  team: 'Teammates',
  approvals: 'Approvals',
  partners: 'Partners directory',
  past_proposals: 'Past proposals library',
  narrative_editing: 'Editable merged narrative with version history',
  ai_reviewer: 'AI reviewer',
  multi_workspace: 'Multiple workspaces',
};
const FEATURE_MIN_PLAN = {
  unlimited_projects: 'Starter', answer_bank: 'Starter', assistant: 'Starter',
  team: 'Premium', approvals: 'Premium', partners: 'Premium', past_proposals: 'Premium', narrative_editing: 'Premium', ai_reviewer: 'Premium',
  multi_workspace: 'Enterprise',
};

// A company on a trial is treated as Premium until trialEndsAt, then as Free.
function planFor(company) {
  const now = new Date();
  const trialing = Boolean(company && company.trialEndsAt && new Date(company.trialEndsAt) > now && company.plan === TRIAL_PLAN);
  let key = company && PLANS[company.plan] ? company.plan : 'free';
  const trialExpired = Boolean(company && company.trialEndsAt && new Date(company.trialEndsAt) <= now && company.plan === TRIAL_PLAN);
  if (trialExpired) key = 'free';
  const daysLeft = trialing ? Math.max(1, Math.ceil((new Date(company.trialEndsAt) - now) / 86400000)) : null;
  return { key, ...PLANS[key], trialing, trialEndsAt: company ? company.trialEndsAt : null, trialDaysLeft: daysLeft, trialExpired };
}

function hasFeature(company, feature) {
  return planFor(company).features.includes(feature);
}

function upgradeMessage(feature) {
  return `${FEATURE_LABELS[feature] || 'This feature'} is included in ${FEATURE_MIN_PLAN[feature] || 'Premium'} and above.`;
}

// Express middleware factory: loads the company and rejects with 402 when the plan lacks the feature.
function requireFeature(prisma, feature) {
  return async (req, res, next) => {
    try {
      const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { plan: true, trialEndsAt: true } });
      if (!hasFeature(company, feature)) {
        return res.status(402).json({ msg: upgradeMessage(feature), feature, upgrade: true });
      }
      req.plan = planFor(company);
      next();
    } catch (err) {
      res.status(500).json({ msg: 'Server error' });
    }
  };
}

function publicPlan(company) {
  const p = planFor(company);
  return { key: p.key, name: p.name, price: p.price, per: p.per, features: p.features, limits: p.limits, trialing: p.trialing, trialEndsAt: p.trialEndsAt, trialDaysLeft: p.trialDaysLeft, trialExpired: p.trialExpired };
}

module.exports = { PLANS, TRIAL_DAYS, TRIAL_PLAN, FEATURE_LABELS, FEATURE_MIN_PLAN, planFor, hasFeature, requireFeature, publicPlan, upgradeMessage };
