const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const multer = require('multer');
const blob = require('../utils/blob.cjs');

// The browser downscales the picture before sending, so this ceiling is a guard against abuse
// rather than a real constraint: a 256px avatar lands around 30 KB.
const AVATAR_MAX = 1024 * 1024;
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX, files: 1 } });
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// GET /api/users — teammates in the caller's workspace
router.get('/', auth, async (req, res) => {
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const users = await prisma.user.findMany({
      where: { companyId: req.user.companyId, isApproved: true },
      select: { id: true, username: true, name: true, email: true, role: true, avatarKey: true, avatarUpdatedAt: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/users/me/avatar — set your own profile picture
router.post('/me/avatar', auth, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: 'No image uploaded.' });
    if (!IMAGE_TYPES.includes(req.file.mimetype)) return res.status(400).json({ msg: 'Use a PNG, JPEG or WebP image.' });
    if (!blob.configured()) return res.status(503).json({ msg: 'Picture storage is not set up yet.' });

    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarKey: true } });
    const key = await blob.putPrivate(`avatars/${req.user.id}.jpg`, req.file.buffer, req.file.mimetype);
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarKey: key, avatarUpdatedAt: new Date() } });
    // Replace, then drop the old one, so a failure here never leaves them with no picture.
    if (me && me.avatarKey) await blob.remove(me.avatarKey);
    res.json({ msg: 'Picture updated.' });
  } catch (err) {
    console.error('Avatar upload error:', err.message);
    res.status(500).json({ msg: 'Could not save that picture.' });
  }
});

// DELETE /api/users/me/avatar — go back to initials
router.delete('/me/avatar', auth, async (req, res) => {
  try {
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarKey: true } });
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarKey: null, avatarUpdatedAt: new Date() } });
    if (me && me.avatarKey) await blob.remove(me.avatarKey);
    res.json({ msg: 'Picture removed.' });
  } catch (err) {
    res.status(500).json({ msg: 'Could not remove that picture.' });
  }
});

// GET /api/users/:id/avatar — the picture itself, for teammates in the same workspace
router.get('/:id/avatar', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { companyId: true, avatarKey: true } });
    if (!user || !user.avatarKey || user.companyId !== req.user.companyId) return res.status(404).end();
    const got = await blob.getBytes(user.avatarKey);
    if (!got) return res.status(404).end();
    res.set({ 'Content-Type': got.contentType || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
    res.send(got.buffer);
  } catch (err) {
    console.error('Avatar read error:', err.message);
    res.status(500).end();
  }
});

module.exports = router;
