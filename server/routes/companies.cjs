const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');

// GET /api/companies/mine — the caller's workspace with a few stats
router.get('/mine', auth, async (req, res) => {
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: {
        id: true, name: true, createdAt: true,
        _count: { select: { users: true, projects: true, files: true } },
      },
    });
    res.json(company);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/companies — kept for compatibility; only returns the caller's own workspace
router.get('/', auth, async (req, res) => {
  try {
    if (!req.user.companyId) return res.json([]);
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { id: true, name: true, isArchived: true } });
    res.json(company ? [company] : []);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/companies/mine — rename the workspace (admin)
router.put('/mine', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ msg: 'Workspace name is required.' });
  try {
    const taken = await prisma.company.findUnique({ where: { name } });
    if (taken && taken.id !== req.user.companyId) return res.status(400).json({ msg: 'That workspace name is taken.' });
    const company = await prisma.company.update({ where: { id: req.user.companyId }, data: { name }, select: { id: true, name: true } });
    res.json(company);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
