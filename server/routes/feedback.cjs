const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { sendEmail, layout } = require('../utils/email.cjs');

const TYPES = ['bug', 'idea', 'question', 'praise'];
const STATUSES = ['new', 'seen', 'planned', 'done', 'closed'];
// Merge staff who can see every workspace's feedback. Comma-separated emails in FEEDBACK_ADMINS.
function isStaff(req) {
  const list = (process.env.FEEDBACK_ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(req.user.email || '').toLowerCase());
}
function notifyTo() { return (process.env.FEEDBACK_NOTIFY || process.env.FEEDBACK_ADMINS || '').split(',').map(s => s.trim()).filter(Boolean); }

// POST /api/feedback — anyone signed in
router.post('/', auth, async (req, res) => {
  const type = TYPES.includes(req.body.type) ? req.body.type : 'idea';
  const message = String(req.body.message || '').trim().slice(0, 5000);
  const page = req.body.page ? String(req.body.page).slice(0, 300) : null;
  const rating = Number.isInteger(req.body.rating) && req.body.rating >= 1 && req.body.rating <= 5 ? req.body.rating : null;
  if (!message) return res.status(400).json({ msg: 'Tell us a little more first.' });
  let screenshot = null;
  if (req.body.screenshot && typeof req.body.screenshot === 'string' && req.body.screenshot.startsWith('data:image/')) {
    const b64 = req.body.screenshot.split(',')[1] || '';
    const buf = Buffer.from(b64, 'base64');
    if (buf.length <= 2 * 1024 * 1024) screenshot = buf;
  }
  try {
    const [user, company] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, username: true, email: true } }),
      prisma.company.findUnique({ where: { id: req.user.companyId }, select: { name: true, plan: true, kind: true } }),
    ]);
    const fb = await prisma.feedback.create({
      data: { companyId: req.user.companyId, userId: req.user.id, type, message, page, rating, screenshot, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) },
      select: { id: true, createdAt: true },
    });
    const to = notifyTo();
    if (to.length) {
      const who = `${user.name || user.username} <${user.email}> · ${company.name} (${company.kind}, ${company.plan})`;
      sendEmail({
        to: to.join(','),
        subject: `[Merge feedback] ${type}: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`,
        html: layout(`New ${type} from ${company.name}`, `<p><strong>${who}</strong></p><p style="white-space:pre-wrap">${message.replace(/</g, '&lt;')}</p><p style="font-size:12px;color:#888">Page: ${page || 'n/a'}${rating ? ` · Rating: ${rating}/5` : ''}${screenshot ? ' · Screenshot attached in the admin inbox' : ''}</p>`),
        text: `${who}\n\n${message}\n\nPage: ${page || 'n/a'}`,
      }).catch(() => {});
    }
    res.json({ msg: 'Thanks! We read every message.', id: fb.id });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ msg: 'Could not send feedback. Try again.' });
  }
});

// GET /api/feedback/mine — the sender's own submissions
router.get('/mine', auth, async (req, res) => {
  try {
    const rows = await prisma.feedback.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, type: true, message: true, status: true, createdAt: true, page: true } });
    res.json(rows);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// ---- Staff inbox ----
router.get('/admin', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  const { status, type, q } = req.query;
  try {
    const where = {};
    if (status && STATUSES.includes(status)) where.status = status;
    if (type && TYPES.includes(type)) where.type = type;
    if (q) where.message = { contains: String(q), mode: 'insensitive' };
    const rows = await prisma.feedback.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 300,
      select: { id: true, type: true, message: true, page: true, rating: true, status: true, adminNotes: true, createdAt: true, userAgent: true, user: { select: { name: true, username: true, email: true } }, company: { select: { id: true, name: true, plan: true, kind: true } } },
    });
    const withShot = await prisma.feedback.findMany({ where: { id: { in: rows.map(r => r.id) }, screenshot: { not: null } }, select: { id: true } });
    const shotIds = new Set(withShot.map(x => x.id));
    const counts = await prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } });
    res.json({ items: rows.map(r => ({ ...r, hasScreenshot: shotIds.has(r.id) })), counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])) });
  } catch (err) { console.error(err); res.status(500).json({ msg: 'Server error' }); }
});

router.get('/admin/:id/screenshot', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  try {
    const fb = await prisma.feedback.findUnique({ where: { id: req.params.id }, select: { screenshot: true } });
    if (!fb || !fb.screenshot) return res.status(404).json({ msg: 'No screenshot' });
    res.set('Content-Type', 'image/png');
    res.send(fb.screenshot);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

router.put('/admin/:id', auth, async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ msg: 'Staff only.' });
  const data = {};
  if (STATUSES.includes(req.body.status)) data.status = req.body.status;
  if (req.body.adminNotes !== undefined) data.adminNotes = String(req.body.adminNotes).slice(0, 5000);
  try {
    const fb = await prisma.feedback.update({ where: { id: req.params.id }, data, select: { id: true, status: true, adminNotes: true } });
    res.json(fb);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

router.get('/admin/access', auth, (req, res) => res.json({ staff: isStaff(req) }));

module.exports = router;
