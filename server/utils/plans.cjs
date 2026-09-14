// Plan definitions for two tracks: "writer" (one person, no collaboration layer) and "team".
// Feature keys are checked on the server (requireFeature) and mirrored to the client.
const CORE = ['projects', 'exports', 'notes'];
const W_STARTER = [...CORE, 'unlimited_projects', 'answer_bank', 'external_review', 'file_cabinet', 'calendar'];
const W_PREMIUM = [...W_STARTER, 'assistant', 'ai_reviewer', 'partners', 'past_proposals', 'narrative_editing'];
const W_PRO = [...W_PREMIUM, 'multi_workspace', 'integrations', 'priority_support'];
const TEAM = [...W_PREMIUM, 'team', 'approvals'];

const ORG_SOLO = [...W_PREMIUM, 'external_review'];
const ORG_TEAM = [...W_PREMIUM, 'team', 'approvals'];

const PLANS = {
  free:         { track: 'writer', name: 'Free',         price: 0,     per: 'workspace', features: CORE,      limits: { seats: 1, totalProjects: 1, questionsPerProject: 10 } },
  writer:       { track: 'writer', name: 'Starter',      price: 6.99,  per: 'month',     features: W_STARTER, limits: { seats: 1, totalProjects: null, questionsPerProject: null } },
  writer_pro:   { track: 'writer', name: 'Premium',      price: 21.99, per: 'month',     features: W_PREMIUM, limits: { seats: 1, totalProjects: null, questionsPerProject: null } },
  professional: { track: 'writer', name: 'Professional', price: 59.99, per: 'month',     features: W_PRO,     limits: { seats: 1, totalProjects: null, questionsPerProject: null } },
  org_solo:     { track: 'team',   name: 'Solo Writer',  price: 14.99, per: 'month',     features: ORG_SOLO,  limits: { seats: 1, totalProjects: null, questionsPerProject: null } },
  small_team:   { track: 'team',   name: 'Small Teams',  price: 12.99, per: 'person',    features: ORG_TEAM,  limits: { seats: 5, totalProjects: null, questionsPerProject: null } },
  large_team:   { track: 'team',   name: 'Large Teams',  price: 21.99, per: 'person',    features: [...ORG_TEAM, 'multi_workspace'], limits: { seats: 20, totalProjects: null, questionsPerProject: null } },
  company:      { track: 'team',   name: 'Companies',    price: 29.99, per: 'person',    features: [...ORG_TEAM, 'multi_workspace', 'integrations', 'priority_support', 'custom_branding'], limits: { seats: null, totalProjects: null, questionsPerProject: null } },
};
// Older plan keys still stored on some workspaces
const ALIASES = { starter: 'writer', premium: 'small_team', team: 'small_team', enterprise: 'large_team', custom: 'company' };
// Free on the team track is the same Free plan

const TRIAL_DAYS = 14;
const TRIAL_PLAN_BY_KIND = { writer: 'writer_pro', team: 'small_team' };

const FEATURE_LABELS = {
  unlimited_projects: 'Unlimited projects', answer_bank: 'Answer bank', assistant: 'Ask Merge writing assistant',
  file_cabinet: 'File cabinet', calendar: 'Grant calendar', team: 'Teammates', approvals: 'Approvals',
  partners: 'Partners directory', past_proposals: 'Past proposals library', narrative_editing: 'Editable document with version history',
  ai_reviewer: 'AI reviewer', multi_workspace: 'Multiple workspaces', integrations: 'Integrations', external_review: 'Send for review', notes: 'Grant notes',
};

function normalizeKey(key) { return ALIASES[key] || key; }

function minPlanFor(feature, kind) {
  const order = kind === 'writer' ? ['free', 'writer', 'writer_pro', 'professional'] : ['free', 'org_solo', 'small_team', 'large_team', 'company'];
  const k = order.find(k => PLANS[k].features.includes(feature));
  return k ? PLANS[k].name : 'a higher plan';
}

// A company on a trial is treated as its trial plan until trialEndsAt, then as Free.
function planFor(company) {
  const now = new Date();
  const kind = company && company.kind === 'writer' ? 'writer' : 'team';
  let key = company && PLANS[normalizeKey(company.plan)] ? normalizeKey(company.plan) : 'free';
  const trialPlan = TRIAL_PLAN_BY_KIND[kind];
  const onTrialPlan = key === trialPlan && company && company.trialEndsAt;
  const trialing = Boolean(onTrialPlan && new Date(company.trialEndsAt) > now);
  const trialExpired = Boolean(onTrialPlan && new Date(company.trialEndsAt) <= now);
  if (trialExpired) key = 'free';
  const daysLeft = trialing ? Math.max(1, Math.ceil((new Date(company.trialEndsAt) - now) / 86400000)) : null;
  return { key, kind, ...PLANS[key], trialing, trialEndsAt: company ? company.trialEndsAt : null, trialDaysLeft: daysLeft, trialExpired };
}

function hasFeature(company, feature) { return planFor(company).features.includes(feature); }

function upgradeMessage(feature, company) {
  const kind = company && company.kind === 'writer' ? 'writer' : 'team';
  return `${FEATURE_LABELS[feature] || 'This feature'} is included in ${minPlanFor(feature, kind)} and above.`;
}

function requireFeature(prisma, feature) {
  return async (req, res, next) => {
    try {
      const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { plan: true, kind: true, trialEndsAt: true } });
      if (!hasFeature(company, feature)) return res.status(402).json({ msg: upgradeMessage(feature, company), feature, upgrade: true });
      req.plan = planFor(company);
      next();
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
  };
}

function publicPlan(company) {
  const p = planFor(company);
  return { key: p.key, kind: p.kind, track: p.track, name: p.name, price: p.price, per: p.per, features: p.features, limits: p.limits, trialing: p.trialing, trialEndsAt: p.trialEndsAt, trialDaysLeft: p.trialDaysLeft, trialExpired: p.trialExpired };
}

function catalogue() {
  return Object.entries(PLANS).map(([key, p]) => ({ key, track: p.track, name: p.name, price: p.price, per: p.per, features: p.features, limits: p.limits }));
}

module.exports = { PLANS, ALIASES, TRIAL_DAYS, TRIAL_PLAN_BY_KIND, FEATURE_LABELS, planFor, hasFeature, requireFeature, publicPlan, upgradeMessage, catalogue, normalizeKey };
