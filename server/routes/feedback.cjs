const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { sendEmail, emailConfigured, layout } = require('../utils/email.cjs');
const { rateLimit } = require('../middleware/antispam.cjs');

const TYPES = ['bug', 'idea', 'question', 'praise'];
const TO = () => (process.env.FEEDBACK_NOTIFY || 'feedback@badjrtech.com').split(',').map(s => s.trim()).filter(Boolean);

// POST /api/feedback — emails the message to the feedback address. Nothing is stored.
router.post('/', auth, rateLimit({ max: 10 }), async (req, res) => {
  const type = TYPES.includes(req.body.type) ? req.body.type : 'idea';
  const message = String(req.body.message || '').trim().slice(0, 5000);
  const page = req.body.page ? String(req.body.page).slice(0, 300) : 'n/a';
  const rating = Number.isInteger(req.body.rating) && req.body.rating >= 1 && req.body.rating <= 5 ? req.body.rating : null;
  if (!message) return res.status(400).json({ msg: 'Tell us a little more first.' });
  if (!emailConfigured()) return res.status(503).json({ msg: 'Feedback email is not set up yet. Please email feedback@badjrtech.com directly.' });

  const attachments = [];
  if (req.body.screenshot && typeof req.body.screenshot === 'string' && req.body.screenshot.startsWith('data:image/')) {
    const [head, b64] = req.body.screenshot.split(',');
    if (b64 && Buffer.from(b64, 'base64').length <= 2 * 1024 * 1024) {
      const ext = (head.match(/image\/(\w+)/) || [])[1] || 'png';
      attachments.push({ name: `screenshot.${ext}`, content: b64 });
    }
  }

  try {
    const [user, company] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, username: true, email: true } }),
      prisma.company.findUnique({ where: { id: req.user.companyId }, select: { name: true, plan: true, kind: true } }),
    ]);
    const who = `${user.name || user.username} <${user.email}>`;
    const ok = await sendEmail({
      to: TO().join(','),
      replyTo: user.email,
      subject: `[Merge feedback] ${type}: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`,
      html: layout(`New ${type} from ${company.name}`, `<p><strong>${who}</strong><br>${company.name} · ${company.kind} workspace · ${company.plan} plan</p><p style="white-space:pre-wrap">${message.replace(/</g, '&lt;')}</p><p style="font-size:12px;color:#888">Page: ${page}${rating ? ` · Rating: ${rating}/5` : ''}<br>${String(req.headers['user-agent'] || '').slice(0, 200)}</p><p style="font-size:12px;color:#888">Reply to this email to answer them directly.</p>`),
      text: `${who}\n${company.name} · ${company.kind} · ${company.plan}\n\n${message}\n\nPage: ${page}${rating ? ` · Rating ${rating}/5` : ''}`,
      attachments,
    });
    if (!ok) return res.status(502).json({ msg: 'Could not send right now. Please email feedback@badjrtech.com directly.' });
    res.json({ msg: 'Thanks! We read every message.' });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ msg: 'Could not send feedback. Try again.' });
  }
});

module.exports = router;
