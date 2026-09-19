const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma.cjs');
const { planFor } = require('../utils/plans.cjs');

const ROLES = ['viewer', 'editor', 'admin', 'approver'];
const userSelect = { id: true, username: true, name: true, email: true, role: true, isApproved: true, createdAt: true, company: { select: { id: true, name: true } } };

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
  next();
}

// GET /api/admin/users — everyone in the caller's workspace
router.get('/users', auth, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({ where: { companyId: req.user.companyId }, select: userSelect, orderBy: { createdAt: 'asc' } });
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/admin/users/pending — legacy self-registered accounts awaiting approval
router.get('/users/pending', auth, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({ where: { isApproved: false, OR: [{ companyId: req.user.companyId }, { companyId: null }] }, select: userSelect });
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/admin/users/:id/approve
router.put('/users/:id/approve', auth, requireAdmin, async (req, res) => {
  const { role } = req.body;
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || (target.companyId && target.companyId !== req.user.companyId)) return res.status(404).json({ msg: 'User not found.' });
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isApproved: true, companyId: req.user.companyId, role: ROLES.includes(role) ? role : target.role },
      select: userSelect,
    });
    await prisma.approvedLog.create({ data: { approvedUserId: user.id, approvedByUserId: req.user.id, roleAssigned: user.role, companyAssignedId: req.user.companyId } });
    res.json({ msg: 'User approved', user });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/admin/users/:id/update — change a teammate's role
router.put('/users/:id/update', auth, requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!ROLES.includes(role)) return res.status(400).json({ msg: 'Invalid role.' });
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.companyId !== req.user.companyId) return res.status(404).json({ msg: 'User not found.' });
    if (target.id === req.user.id && role !== 'admin') {
      const otherAdmins = await prisma.user.count({ where: { companyId: req.user.companyId, role: 'admin', id: { not: target.id } } });
      if (otherAdmins === 0) return res.status(400).json({ msg: 'You are the only admin. Make someone else an admin first.' });
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role }, select: userSelect });
    res.json({ msg: 'User updated', user });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/admin/users/:id — remove a teammate from the workspace
router.delete('/users/:id', auth, requireAdmin, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.companyId !== req.user.companyId) return res.status(404).json({ msg: 'User not found.' });
    if (target.id === req.user.id) return res.status(400).json({ msg: 'You cannot remove yourself.' });
    // Detach rather than delete so history (projects, answers, logs) stays intact.
    await prisma.question.updateMany({ where: { assignedToId: target.id, project: { companyId: req.user.companyId } }, data: { assignedToId: null } });
    await prisma.user.update({ where: { id: target.id }, data: { companyId: null, isApproved: false } });
    require('./billing.cjs').syncSeats(req.user.companyId);
    res.json({ msg: 'Teammate removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/admin/users — create a teammate directly with a password (admin)
router.post('/users', auth, requireAdmin, async (req, res) => {
  const { name, password, role } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !password) return res.status(400).json({ msg: 'Email and password are required.' });
  if (password.length < 8) return res.status(400).json({ msg: 'Password must be at least 8 characters.' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { plan: true, kind: true, trialEndsAt: true, compedUntil: true } });
    const plan = planFor(company);
    if (!plan.features.includes('team')) return res.status(402).json({ msg: plan.kind === 'writer' ? 'Writer workspaces are for one person. Switch to a team workspace in Settings to add people.' : `Adding teammates is included in Small Teams and above. Your workspace is on ${plan.name}.`, feature: 'team', upgrade: true });
    if (plan.limits.seats !== null && (await prisma.user.count({ where: { companyId: req.user.companyId } })) >= plan.limits.seats) return res.status(402).json({ msg: `${plan.name} includes up to ${plan.limits.seats} people. Upgrade to add more.`, feature: 'seats', upgrade: true });
    if (await prisma.user.findUnique({ where: { email } })) return res.status(400).json({ msg: 'That email already has an account.' });
    let username = email.split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase() || 'user';
    let n = 0;
    while (await prisma.user.findUnique({ where: { username: n ? `${username}${n}` : username } })) n += 1;
    username = n ? `${username}${n}` : username;
    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const user = await prisma.user.create({
      data: { username, email, name: name ? String(name).trim() : null, password: hashed, role: ROLES.includes(role) ? role : 'editor', companyId: req.user.companyId, isApproved: true },
      select: userSelect,
    });
    require('./billing.cjs').syncSeats(req.user.companyId);
    res.json({ msg: 'User created', user });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/admin/approvals/history — account approval log for this workspace
router.get('/approvals/history', auth, requireAdmin, async (req, res) => {
  try {
    const history = await prisma.approvedLog.findMany({
      where: { companyAssignedId: req.user.companyId },
      include: { approvedUser: { select: { username: true, name: true, email: true } }, approvedBy: { select: { username: true, name: true, email: true } }, companyAssigned: { select: { name: true } } },
      orderBy: { approvedAt: 'desc' },
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
