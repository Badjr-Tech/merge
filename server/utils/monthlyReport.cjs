// The numbers behind the monthly owner email. Covers one calendar month, plus where things stand
// at the moment it runs. Revenue is computed from plans and seats, the same way the staff console
// does it; AI spend is priced from measured token counts (utils/aicost.cjs).
const prisma = require('./prisma.cjs');
const { PLANS, planFor, normalizeKey } = require('./plans.cjs');
const { costOf, METERED } = require('./aicost.cjs');

const PAID = ['active', 'trialing', 'past_due'];

async function monthlySummary(monthStart, monthEnd) {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, kind: true, plan: true, trialEndsAt: true, compedUntil: true, isStaff: true, stripeSubscriptionId: true, subscriptionStatus: true, createdAt: true, referredByCode: true },
  });
  const seatRows = await prisma.user.groupBy({ by: ['companyId'], where: { isApproved: true, companyId: { not: null } }, _count: { _all: true } });
  const seats = Object.fromEntries(seatRows.map(r => [r.companyId, r._count._all]));

  let mrr = 0, paying = 0, trialing = 0, comped = 0, free = 0;
  for (const c of companies) {
    const p = planFor(c);
    if (p.comped || p.staff) { comped += 1; continue; }
    if (p.trialing) { trialing += 1; continue; }
    const isPaying = c.stripeSubscriptionId && PAID.includes(c.subscriptionStatus);
    if (!isPaying) { free += 1; continue; }
    paying += 1;
    const def = PLANS[normalizeKey(c.plan)];
    if (def) mrr += def.per === 'person' ? def.price * Math.max(1, seats[c.id] || 1) : def.price;
  }

  const inMonth = { gte: monthStart, lt: monthEnd };
  const newCompanies = companies.filter(c => c.createdAt >= monthStart && c.createdAt < monthEnd);
  const [projects, answers, tickets, aiRows, spenderRows] = await Promise.all([
    prisma.project.count({ where: { createdAt: inMonth } }),
    prisma.question.count({ where: { status: 'submitted', updatedAt: inMonth } }),
    prisma.feedbackTicket.count({ where: { createdAt: inMonth } }),
    prisma.aiUsage.groupBy({ by: ['feature'], where: { feature: { in: METERED }, createdAt: inMonth }, _count: { _all: true } }),
    prisma.aiUsage.groupBy({ by: ['companyId', 'feature'], where: { feature: { in: METERED }, createdAt: inMonth }, _count: { _all: true } }),
  ]);

  const byFeature = {}; let aiSpend = 0, aiActions = 0;
  for (const r of aiRows) {
    const spend = costOf(r.feature) * r._count._all;
    byFeature[r.feature] = { actions: r._count._all, spend };
    aiSpend += spend; aiActions += r._count._all;
  }
  const perCompany = {};
  for (const r of spenderRows) perCompany[r.companyId] = (perCompany[r.companyId] || 0) + costOf(r.feature) * r._count._all;
  const nameById = Object.fromEntries(companies.map(c => [c.id, c.name]));
  const topSpenders = Object.entries(perCompany).map(([id, spend]) => ({ name: nameById[id] || 'unknown', spend }))
    .sort((a, b) => b.spend - a.spend).slice(0, 5);

  // Trials that ran out during the month, and how many of those are now paying
  const endedTrials = companies.filter(c => c.trialEndsAt && c.trialEndsAt >= monthStart && c.trialEndsAt < monthEnd);
  const converted = endedTrials.filter(c => c.stripeSubscriptionId && PAID.includes(c.subscriptionStatus)).length;

  return {
    mrr, paying, trialing, comped, free,
    totalWorkspaces: companies.length,
    newWorkspaces: newCompanies.length,
    newWriter: newCompanies.filter(c => c.kind === 'writer').length,
    newTeam: newCompanies.filter(c => c.kind !== 'writer').length,
    referred: newCompanies.filter(c => c.referredByCode).length,
    endedTrials: endedTrials.length, converted,
    conversionRate: endedTrials.length ? Math.round((converted / endedTrials.length) * 100) : null,
    projects, answers, tickets,
    aiSpend, aiActions, byFeature, topSpenders,
    marginAfterAi: mrr - aiSpend,
  };
}

module.exports = { monthlySummary };
