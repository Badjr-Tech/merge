const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { PLANS, publicPlan } = require('../utils/plans.cjs');

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

module.exports = router;
