const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { planFor, hasFeature, COMPANY_PLAN_SELECT, TRIAL_PLAN_BY_KIND } = require('../utils/plans.cjs');
const jwt = require('jsonwebtoken');

const TOKEN_TTL = '7d';
const MAX_WORKSPACES = 25; // a guard against runaway creation, not a plan limit

// Rebuilt on every switch so the token always carries the workspace actually being viewed.
function signToken(user, company) {
  return jwt.sign({
    user: {
      id: user.id,
      role: user.role,
      username: user.username,
      name: user.name,
      email: user.email,
      companyId: company ? company.id : null,
      companyName: company ? company.name : null,
    },
  }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// GET /api/workspaces — every workspace this person can open, active one flagged
router.get('/', auth, async (req, res) => {
  try {
    const rows = await prisma.membership.findMany({
      where: { userId: req.user.id },
      select: { role: true, company: { select: { id: true, name: true, kind: true, ...COMPANY_PLAN_SELECT } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rows
      .filter(r => r.company)
      .map(r => ({
        id: r.company.id,
        name: r.company.name,
        role: r.role,
        planName: planFor(r.company).name,
        active: r.company.id === req.user.companyId,
      })));
  } catch (err) {
    console.error('Workspace list error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/workspaces/switch — move the active pointer, after checking they belong there.
// This is the only new trust boundary: everything else still scopes by req.user.companyId,
// so if this check is right the rest of the app is already correct.
router.post('/switch', auth, async (req, res) => {
  const companyId = String(req.body.companyId || '');
  try {
    const member = await prisma.membership.findUnique({
      where: { userId_companyId: { userId: req.user.id, companyId } },
      select: { role: true, company: { select: { id: true, name: true } } },
    });
    // 404 rather than 403, so this does not confirm whether a workspace id exists.
    if (!member || !member.company) return res.status(404).json({ msg: 'Workspace not found' });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { companyId: member.company.id, role: member.role },
      select: { id: true, role: true, username: true, name: true, email: true },
    });
    res.json({ token: signToken(user, member.company), companyId: member.company.id, name: member.company.name });
  } catch (err) {
    console.error('Workspace switch error:', err.message);
    res.status(500).json({ msg: 'Could not switch workspace.' });
  }
});

// POST /api/workspaces — start another workspace under the same login.
// Gated on the plan that sells it, and checked against the plan they hold right now.
router.post('/', auth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const kind = req.body.kind === 'writer' ? 'writer' : 'team';
  if (!name) return res.status(400).json({ msg: 'Workspace name is required.' });
  try {
    const current = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: COMPANY_PLAN_SELECT });
    if (!current || !hasFeature(current, 'multi_workspace')) {
      return res.status(402).json({ msg: 'Running more than one workspace is included in Professional and Large Teams and above.', feature: 'multi_workspace', upgrade: true });
    }
    const count = await prisma.membership.count({ where: { userId: req.user.id } });
    if (count >= MAX_WORKSPACES) return res.status(400).json({ msg: `You can run up to ${MAX_WORKSPACES} workspaces.` });

    const company = await prisma.$transaction(async (tx) => {
      // A new workspace starts on its own trial; it is a separate organization, billed
      // separately, not an extension of the one they are in.
      const c = await tx.company.create({
        data: { name, kind, plan: TRIAL_PLAN_BY_KIND[kind], trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000) },
      });
      await tx.membership.create({ data: { userId: req.user.id, companyId: c.id, role: 'admin' } });
      return c;
    });
    res.json({ id: company.id, name: company.name });
  } catch (err) {
    console.error('Workspace create error:', err.message);
    res.status(500).json({ msg: 'Could not create that workspace.' });
  }
});

module.exports = router;
