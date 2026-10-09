const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');

// GET /api/notifications — the bell: recent items plus the unread count
router.get('/', auth, async (req, res) => {
  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);
    res.json({ items, unread });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/notifications/read — mark one, or everything
router.post('/read', auth, async (req, res) => {
  try {
    const where = { userId: req.user.id, readAt: null };
    if (req.body.id) where.id = String(req.body.id);
    await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
