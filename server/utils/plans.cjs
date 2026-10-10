// Plan definitions for two tracks: "writer" (one person, no collaboration layer) and "team".
// Feature keys are checked on the server (requireFeature) and mirrored to the client.
const CORE = ['projects', 'exports', 'notes', 'external_review'];
const W_STARTER = [...CORE, 'unlimited_projects', 'answer_bank', 'external_review', 'file_cabinet', 'calendar'];
const W_PREMIUM = [...W_STARTER, 'assistant', 'ai_reviewer', 'partners', 'past_proposals', 'narrative_editing'];
const W_PRO = [...W_PREMIUM, 'multi_workspace', 'integrations', 'priority_support'];
const TEAM = [...W_PREMIUM, 'team', 'approvals'];

const ORG_SOLO = [...W_PREMIUM, 'external_review'];
const ORG_TEAM = [...W_PREMIUM, 'team', 'approvals'];

const PLANS = {
  // Free = the Solo Writer feature set minus AI, capped at one grant. Both tracks land here after a trial.
  free:         { track: 'both',   name: 'Free',         price: 0,     per: 'workspace', features: ORG_SOLO.filter(f => !['assistant', 'ai_reviewer'].includes(f)), limits: { seats: 1, totalProjects: 1, questionsPerProject: null, aiMonthly: 0 } },
  writer:       { track: 'writer', name: 'Starter',      price: 6.99,  per: 'month',     features: W_STARTER, limits: { seats: 1, totalProjects: null, questionsPerProject: null, aiMonthly: 0 } },
  writer_pro:   { track: 'writer', name: 'Premium',      price: 21.99, per: 'month',     features: W_PREMIUM, limits: { seats: 1, totalProjects: null, questionsPerProject: null, aiMonthly: 2000 } },
  professional: { track: 'writer', name: 'Professional', price: 59.99, per: 'month',     features: W_PRO,     limits: { seats: 1, totalProjects: null, questionsPerProject: null, aiMonthly: 5000 } },
  org_solo:     { track: 'team',   name: 'Solo Writer',  price: 14.99, per: 'month',     features: ORG_SOLO,  limits: { seats: 1, totalProjects: null, questionsPerProject: null, aiMonthly: 1500 } },
  small_team:   { track: 'team',   name: 'Small Teams',  price: 12.99, per: 'person',    features: ORG_TEAM,  limits: { seats: 5, totalProjects: null, questionsPerProject: null, aiMonthly: null, aiPerSeat: 750 } },
  large_team:   { track: 'team',   name: 'Large Teams',  price: 21.99, per: 'person',    features: [...ORG_TEAM, 'multi_workspace'], limits: { seats: 20, totalProjects: null, questionsPerProject: null, aiMonthly: null, aiPerSeat: 750 } },
  company:      { track: 'team',   name: 'Companies',    price: 29.99, per: 'person',    features: [...ORG_TEAM, 'multi_workspace', 'integrations', 'priority_support', 'custom_branding'], limits: { seats: null, totalProjects: null, questionsPerProject: null, aiMonthly: null, aiPerSeat: 1000 } },
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


// Per-feature AI limits. Each feature is counted on its own window so a heavy chatter and a heavy
// drafter don't eat each other's allowance.
//   month                 — calendar month, counted across the whole workspace
//   monthPerSeat          — the same, sized by seats: a shared pool anyone can draw from, so a few
//                           people doing the work in a big workspace aren't starved. Set at 75% of
//                           a notional per-person allowance, since not everyone uses theirs.
//   monthPerUser          — a hard per-person month cap (single-seat plans only)
//   perDayPerUser         — burst guard: stops one account draining the pool in an hour
//   perDay / perWeek       — per workspace per calendar day, or per calendar week (resets Monday)
//   perDayPerProject      — per grant per calendar day (the AI reviewer on Premium)
//   everyDays / once      — a cooldown, or once for the lifetime of the workspace
//   extraPrice            — AI reviewer only: what one more run costs (not yet charged; see DEVELOPMENT.md)
// 0 or absent = the feature is not available on that plan.
const AI_LIMITS = {
  free:         { chat: 0, draft: 0, review: 0, profile: { once: true } },
  writer:       { chat: 0, draft: 0, review: 0, profile: { everyDays: 30 } },
  writer_pro:   { chat: { month: 2000 }, draft: { month: 150 }, review: { perDayPerProject: 1, extraPrice: 1.99 }, profile: { everyDays: 30 } },
  professional: { chat: { month: 4000 }, draft: { month: 300 }, review: { perDay: 5, extraPrice: 1.99 }, profile: { everyDays: 7 } },
  // Organization track: placeholders in step with the old pooled numbers, pending their own decision.
  org_solo:     { chat: { month: 2000 }, draft: { month: 20 }, review: { month: 20, extraPrice: 1.99 }, profile: { everyDays: 30 } },
  small_team:   { chat: { monthPerSeat: 750, perDayPerUser: 200 }, draft: { monthPerSeat: 15, perDayPerUser: 20 }, review: { monthPerSeat: 4, perDayPerUser: 5, extraPrice: 1.99 }, profile: { everyDays: 30 } },
  large_team:   { chat: { monthPerSeat: 1000, perDayPerUser: 200 }, draft: { monthPerSeat: 15, perDayPerUser: 20 }, review: { monthPerSeat: 4, perDayPerUser: 5, extraPrice: 1.99 }, profile: { everyDays: 7 } },
  company:      { chat: { monthPerSeat: 1000, perDayPerUser: 200 }, draft: { monthPerSeat: 30, perDayPerUser: 20 }, review: { monthPerSeat: 15, perDayPerUser: 5, extraPrice: 1.99 }, profile: { everyDays: 7 } },
};

const AI_FEATURE_LABELS = { chat: 'Ask Merge', draft: 'Help me answer this', review: 'AI reviewer', profile: 'Build profile from your website' };

// The rule for one feature on one plan, with per-seat counts already resolved.
function aiLimit(planKey, feature, seats) {
  const rule = (AI_LIMITS[planKey] || {})[feature];
  if (!rule || rule === 0) return { allowed: false };
  const r = { ...rule, allowed: true };
  if (r.monthPerSeat) { r.month = r.monthPerSeat * Math.max(1, seats || 1); delete r.monthPerSeat; }
  return r;
}

// The AI allowance for a workspace: a flat monthly number, or per seat on per-person plans.
// null = unlimited (staff and comped workspaces). 0 = no AI on this plan.
function aiAllowance(plan, seats) {
  if (!plan || !plan.limits) return 0;
  const { aiMonthly, aiPerSeat } = plan.limits;
  if (aiPerSeat) return aiPerSeat * Math.max(1, seats || 1);
  return aiMonthly === undefined ? 0 : aiMonthly;
}

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
  // Staff workspace: everything, forever, no billing
  if (company && company.isStaff) {
    const top = kind === 'writer' ? 'professional' : 'company';
    return { key: top, kind, ...PLANS[top], features: [...new Set([...PLANS[top].features, 'team', 'approvals'])], limits: { seats: null, totalProjects: null, questionsPerProject: null, aiMonthly: null }, trialing: false, trialEndsAt: null, trialDaysLeft: null, trialExpired: false, comped: true, staff: true, compedUntil: null };
  }
  // Pilot: free, full access to the pilot plan until it ends, then the workspace lands on
  // pilotRevertsTo. Nothing is billed during a pilot.
  if (company && company.pilotEndsAt && new Date(company.pilotEndsAt) > now) {
    const pk = PLANS[normalizeKey(company.pilotPlan)] ? normalizeKey(company.pilotPlan) : key;
    const daysLeft = Math.max(0, Math.ceil((new Date(company.pilotEndsAt) - now) / 86400000));
    return {
      key: pk, kind, ...PLANS[pk],
      trialing: false, trialEndsAt: null, trialDaysLeft: null, trialExpired: false,
      comped: true, pilot: true, pilotEndsAt: company.pilotEndsAt, pilotDaysLeft: daysLeft,
      pilotRevertsTo: company.pilotRevertsTo && PLANS[normalizeKey(company.pilotRevertsTo)] ? normalizeKey(company.pilotRevertsTo) : 'free',
      pilotRevertsToName: PLANS[normalizeKey(company.pilotRevertsTo || 'free')] ? PLANS[normalizeKey(company.pilotRevertsTo || 'free')].name : 'Free',
      compedUntil: company.pilotEndsAt,
    };
  }
  // Legacy complimentary access, kept so old comps still work
  if (company && company.compedUntil && new Date(company.compedUntil) > now) {
    return { key, kind, ...PLANS[key], trialing: false, trialEndsAt: null, trialDaysLeft: null, trialExpired: false, comped: true, compedUntil: company.compedUntil };
  }
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
      const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { plan: true, kind: true, trialEndsAt: true, compedUntil: true } });
      if (!hasFeature(company, feature)) return res.status(402).json({ msg: upgradeMessage(feature, company), feature, upgrade: true });
      req.plan = planFor(company);
      next();
    } catch (err) { res.status(500).json({ msg: 'Server error' }); }
  };
}

function publicPlan(company) {
  const p = planFor(company);
  return { key: p.key, kind: p.kind, track: p.track, name: p.name, price: p.price, per: p.per, features: p.features, limits: p.limits, trialing: p.trialing, trialEndsAt: p.trialEndsAt, trialDaysLeft: p.trialDaysLeft, trialExpired: p.trialExpired, comped: Boolean(p.comped), staff: Boolean(p.staff), compedUntil: p.compedUntil || null, pilot: Boolean(p.pilot), pilotEndsAt: p.pilotEndsAt || null, pilotDaysLeft: p.pilotDaysLeft ?? null, pilotRevertsToName: p.pilotRevertsToName || null };
}

function catalogue() {
  return Object.entries(PLANS).map(([key, p]) => ({ key, track: p.track, name: p.name, price: p.price, per: p.per, features: p.features, limits: p.limits }));
}

module.exports = { aiAllowance, AI_LIMITS, AI_FEATURE_LABELS, aiLimit, PLANS, ALIASES, TRIAL_DAYS, TRIAL_PLAN_BY_KIND, FEATURE_LABELS, planFor, hasFeature, requireFeature, publicPlan, upgradeMessage, catalogue, normalizeKey };
