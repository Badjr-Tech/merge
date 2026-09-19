const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { PLANS, publicPlan, planFor } = require('../utils/plans.cjs');
const { stripe, configured } = require('../utils/stripe.cjs');

// Merge staff: emails listed in STAFF_EMAILS (comma-separated). They can comp any workspace.
function isStaff(req) {
  const list = (process.env.STAFF_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(req.user.email || '').toLowerCase());
}

router.get('/access', auth, (req, res) => res.json({ staff: isStaff(req) }));

// GET /api/staff/workspaces?q= — find a workspace by name or admin email
router.get('/workspaces', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  const q = String(req.query.q || '').trim();
  try {
    const rows = await prisma.company.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { users: { some: { email: { contains: q, mode: 'insensitive' } } } }] } : {},
      orderBy: { createdAt: 'desc' }, take: 30,
      select: { id: true, name: true, kind: true, plan: true, trialEndsAt: true, compedUntil: true, compNote: true, createdAt: true, stripeSubscriptionId: true, users: { where: { role: 'admin' }, select: { email: true, name: true }, take: 3 }, _count: { select: { users: true, projects: true } } },
    });
    res.json(rows.map(r => ({ ...r, planInfo: publicPlan(r) })));
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/staff/workspaces/:id/comp  { plan, months, note }  — months 0 = remove comp
router.post('/workspaces/:id/comp', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  const plan = String(req.body.plan || '');
  const months = Number(req.body.months);
  const note = req.body.note ? String(req.body.note).slice(0, 300) : null;
  try {
    const c = await prisma.company.findUnique({ where: { id: req.params.id }, select: { id: true, kind: true } });
    if (!c) return res.status(404).json({ msg: 'Workspace not found.' });
    if (months === 0) {
      const u = await prisma.company.update({ where: { id: c.id }, data: { compedUntil: null, compNote: null }, select: { id: true, name: true, plan: true, kind: true, trialEndsAt: true, compedUntil: true } });
      return res.json({ msg: 'Comp removed.', planInfo: publicPlan(u) });
    }
    if (!PLANS[plan] || plan === 'free') return res.status(400).json({ msg: 'Pick a paid plan to comp.' });
    if (PLANS[plan].track !== c.kind) return res.status(400).json({ msg: `${PLANS[plan].name} is a ${PLANS[plan].track} plan; this is a ${c.kind} workspace.` });
    const until = new Date(); until.setMonth(until.getMonth() + (Number.isFinite(months) && months > 0 ? months : 120));
    const u = await prisma.company.update({ where: { id: c.id }, data: { plan, compedUntil: until, compNote: note, trialEndsAt: null }, select: { id: true, name: true, plan: true, kind: true, trialEndsAt: true, compedUntil: true, compNote: true } });
    res.json({ msg: `${u.name} is on ${PLANS[plan].name}, complimentary until ${until.toDateString()}.`, planInfo: publicPlan(u) });
  } catch (err) { console.error(err); res.status(500).json({ msg: 'Server error' }); }
});


// GET /api/staff/overview — the numbers a founder checks every morning
router.get('/overview', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  try {
    const now = new Date();
    const d7 = new Date(now - 7 * 864e5); const d30 = new Date(now - 30 * 864e5);
    const companies = await prisma.company.findMany({ select: { id: true, name: true, kind: true, plan: true, trialEndsAt: true, compedUntil: true, stripeSubscriptionId: true, subscriptionStatus: true, cancelAtPeriodEnd: true, currentPeriodEnd: true, createdAt: true, referredByCode: true, _count: { select: { users: true, projects: true } } } });
    const seatsByCompany = Object.fromEntries((await prisma.user.groupBy({ by: ['companyId'], where: { isApproved: true, companyId: { not: null } }, _count: { _all: true } })).map(g => [g.companyId, g._count._all]));

    let mrr = 0; const byPlan = {}; let paying = 0, trialing = 0, comped = 0, free = 0, cancelling = 0, pastDue = 0;
    const paid = ['active', 'trialing', 'past_due'];
    for (const c of companies) {
      const p = planFor(c);
      const isPaid = c.stripeSubscriptionId && paid.includes(c.subscriptionStatus);
      if (isPaid) {
        paying += 1;
        const qty = p.per === 'person' ? (seatsByCompany[c.id] || 1) : 1;
        const amt = (p.price || 0) * qty;
        mrr += amt; byPlan[p.name] = (byPlan[p.name] || 0) + amt;
        if (c.cancelAtPeriodEnd) cancelling += 1;
        if (c.subscriptionStatus === 'past_due') pastDue += 1;
      } else if (p.comped) comped += 1;
      else if (p.trialing) trialing += 1;
      else free += 1;
    }
    const [signups7, signups30, users, projects, answers, projects7, reviewsSent, referrals] = await Promise.all([
      prisma.company.count({ where: { createdAt: { gte: d7 } } }),
      prisma.company.count({ where: { createdAt: { gte: d30 } } }),
      prisma.user.count({ where: { isApproved: true } }),
      prisma.project.count(),
      prisma.question.count({ where: { answer: { not: null } } }),
      prisma.project.count({ where: { createdAt: { gte: d7 } } }),
      prisma.project.count({ where: { reviewSentAt: { not: null } } }),
      prisma.referral.count(),
    ]);
    const trialsEnded30 = companies.filter(c => c.trialEndsAt && c.trialEndsAt < now && c.trialEndsAt > d30);
    const converted30 = trialsEnded30.filter(c => c.stripeSubscriptionId && paid.includes(c.subscriptionStatus)).length;

    // Stripe: actual cash in the last 30 days and upcoming renewals
    let stripeSummary = null;
    if (configured()) {
      try {
        const since = Math.floor(d30.getTime() / 1000);
        const charges = await stripe().charges.list({ limit: 100, created: { gte: since } });
        const collected = charges.data.filter(ch => ch.paid && !ch.refunded).reduce((a, ch) => a + ch.amount, 0) / 100;
        const refunded = charges.data.reduce((a, ch) => a + (ch.amount_refunded || 0), 0) / 100;
        const bal = await stripe().balance.retrieve();
        stripeSummary = { collected30: collected, refunded30: refunded, charges30: charges.data.length, available: (bal.available || []).reduce((a, b) => a + b.amount, 0) / 100, pending: (bal.pending || []).reduce((a, b) => a + b.amount, 0) / 100 };
      } catch (err) { stripeSummary = { error: err.message }; }
    }

    const recent = companies.sort((a, b) => b.createdAt - a.createdAt).slice(0, 12).map(c => ({ id: c.id, name: c.name, kind: c.kind, plan: publicPlan(c).name, status: publicPlan(c).comped ? 'comped' : publicPlan(c).trialing ? 'trial' : (c.stripeSubscriptionId && paid.includes(c.subscriptionStatus)) ? 'paying' : 'free', createdAt: c.createdAt, users: c._count.users, projects: c._count.projects, referred: Boolean(c.referredByCode) }));

    res.json({
      revenue: { mrr: Math.round(mrr * 100) / 100, arr: Math.round(mrr * 12 * 100) / 100, byPlan, paying, cancelling, pastDue, stripe: stripeSummary },
      workspaces: { total: companies.length, trialing, comped, free, signups7, signups30, trialsEnded30: trialsEnded30.length, converted30, conversionRate30: trialsEnded30.length ? Math.round((converted30 / trialsEnded30.length) * 100) : null },
      usage: { users, projects, projects7, answers, reviewsSent, referrals },
      recent,
    });
  } catch (err) { console.error(err); res.status(500).json({ msg: 'Server error' }); }
});


// GET /api/staff/tickets?status=
router.get('/tickets', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  const status = String(req.query.status || '');
  try {
    const where = status && status !== 'all' ? { status } : {};
    const [items, counts] = await Promise.all([
      prisma.feedbackTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 }),
      prisma.feedbackTicket.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    res.json({ items, counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])) });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});
router.put('/tickets/:id', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  const data = {};
  if (['open', 'in_progress', 'resolved'].includes(req.body.status)) data.status = req.body.status;
  if (req.body.notes !== undefined) data.notes = String(req.body.notes).slice(0, 5000);
  try { res.json(await prisma.feedbackTicket.update({ where: { id: req.params.id }, data })); } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /api/staff/users?q=
router.get('/users', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  const q = String(req.query.q || '').trim();
  try {
    const users = await prisma.user.findMany({
      where: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, email: true, name: true, username: true, role: true, isApproved: true, createdAt: true, company: { select: { id: true, name: true, plan: true, kind: true } }, _count: { select: { projects: true, assignedQuestions: true } } },
    });
    res.json(users);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /api/staff/workspaces/:id — one workspace in depth
router.get('/workspaces/:id', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  try {
    const c = await prisma.company.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, kind: true, plan: true, trialEndsAt: true, compedUntil: true, compNote: true, createdAt: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, referralCode: true, referredByCode: true, profile: true,
        users: { select: { id: true, email: true, name: true, username: true, role: true, isApproved: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        projects: { select: { id: true, name: true, status: true, isCompleted: true, isArchived: true, deadlineDate: true, createdAt: true, _count: { select: { questions: true } } }, orderBy: { createdAt: 'desc' }, take: 50 },
        _count: { select: { files: true, partners: true, assistantMessages: true } } },
    });
    if (!c) return res.status(404).json({ msg: 'Not found' });
    const tickets = await prisma.feedbackTicket.findMany({ where: { companyId: c.id }, orderBy: { createdAt: 'desc' }, take: 20 });
    res.json({ ...c, planInfo: publicPlan(c), tickets });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/staff/impersonate-link/:userId — a one-time sign-in link for support (logged)
router.post('/users/:id/reset-link', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ msg: 'User not found.' });
    const crypto = require('crypto');
    await prisma.passwordReset.deleteMany({ where: { userId: target.id, usedAt: null } });
    const reset = await prisma.passwordReset.create({ data: { userId: target.id, token: crypto.randomBytes(24).toString('hex'), expiresAt: new Date(Date.now() + 2 * 3600 * 1000) } });
    const { appUrl } = require('../utils/email.cjs');
    res.json({ link: appUrl(`/reset-password/${reset.token}`), expiresAt: reset.expiresAt });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
