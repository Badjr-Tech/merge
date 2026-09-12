// Plan definitions. Feature keys are checked on the server (requireFeature) and mirrored to the client.
const PLANS = {
  starter: {
    name: 'Starter', price: 8.99,
    features: ['projects', 'answer_bank', 'file_cabinet', 'calendar', 'assistant', 'exports', 'team'],
    limits: { approvalsPerMonth: 5, seats: 5 },
  },
  premium: {
    name: 'Premium', price: 22.99,
    features: ['projects', 'answer_bank', 'file_cabinet', 'calendar', 'assistant', 'exports', 'team', 'partners', 'past_proposals', 'narrative_editing', 'ai_reviewer'],
    limits: { approvalsPerMonth: null, seats: 25 },
  },
  enterprise: {
    name: 'Enterprise', price: 49.99,
    features: ['projects', 'answer_bank', 'file_cabinet', 'calendar', 'assistant', 'exports', 'team', 'partners', 'past_proposals', 'narrative_editing', 'ai_reviewer', 'multi_workspace', 'priority_support'],
    limits: { approvalsPerMonth: null, seats: null },
  },
  custom: {
    name: 'Custom', price: null,
    features: ['projects', 'answer_bank', 'file_cabinet', 'calendar', 'assistant', 'exports', 'team', 'partners', 'past_proposals', 'narrative_editing', 'ai_reviewer', 'multi_workspace', 'priority_support', 'custom_branding'],
    limits: { approvalsPerMonth: null, seats: null },
  },
};

const FEATURE_LABELS = {
  partners: 'Partners directory',
  past_proposals: 'Past proposals library',
  narrative_editing: 'Editable merged narrative with version history',
  ai_reviewer: 'AI reviewer',
  multi_workspace: 'Multiple workspaces',
};

function planFor(company) {
  const key = company && PLANS[company.plan] ? company.plan : 'starter';
  return { key, ...PLANS[key] };
}

function hasFeature(company, feature) {
  return planFor(company).features.includes(feature);
}

// Express middleware factory: loads the company and rejects with 402 when the plan lacks the feature.
function requireFeature(prisma, feature) {
  return async (req, res, next) => {
    try {
      const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { plan: true } });
      if (!hasFeature(company, feature)) {
        return res.status(402).json({ msg: `${FEATURE_LABELS[feature] || 'This feature'} is available on Premium and above.`, feature, upgrade: true });
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
  return { key: p.key, name: p.name, price: p.price, features: p.features, limits: p.limits };
}

module.exports = { PLANS, FEATURE_LABELS, planFor, hasFeature, requireFeature, publicPlan };
