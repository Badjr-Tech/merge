const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma.cjs');
const { unsubscribeToken } = require('../utils/email.cjs');

// One-click unsubscribe. No login: the signed token proves the link came from an email we sent, and
// it can only ever turn a flag off. GET renders a page for a human; POST is what mail clients call
// for the native "Unsubscribe" button (RFC 8058 List-Unsubscribe-Post).
const LISTS = {
  deadlines: { field: 'deadlineEmails', label: 'deadline reminders' },
  assignments: { field: 'assignmentEmails', label: 'emails about questions assigned to you' },
};

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Merge</title></head>
<body style="margin:0;background:#fffcf0;font-family:Helvetica,Arial,sans-serif;color:#3b3b3d">
<div style="max-width:520px;margin:64px auto;background:#fff;border:1px solid #eee;border-radius:12px;padding:32px">
<div style="font-size:28px;font-weight:700;color:#476c2e;margin-bottom:16px">merge</div>
<h1 style="font-size:20px;color:#0b2d65;margin:0 0 12px">${title}</h1>${body}</div></body></html>`;
}

async function applyUnsubscribe(req) {
  const email = String(req.query.e || '').trim().toLowerCase();
  const list = String(req.query.l || '');
  const token = String(req.query.t || '');
  const spec = LISTS[list];
  if (!email || !spec) return { ok: false, msg: 'That unsubscribe link is not valid.' };
  if (token !== unsubscribeToken(email, list)) return { ok: false, msg: 'That unsubscribe link has expired or was changed.' };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { ok: true, spec }; // say yes either way: never confirm whether an address exists
  await prisma.user.update({ where: { id: user.id }, data: { [spec.field]: false } });
  return { ok: true, spec };
}

router.get('/', async (req, res) => {
  try {
    const r = await applyUnsubscribe(req);
    if (!r.ok) return res.status(400).send(page('Link not valid', `<p>${r.msg}</p><p>You can change email settings under <a href="/app/settings" style="color:#3e51b5">Settings</a>.</p>`));
    res.send(page('Unsubscribed', `<p>You will not get ${r.spec.label} from Merge any more.</p><p>Everything else about your account is unchanged, and you can turn these back on any time under <a href="/app/settings" style="color:#3e51b5">Settings → Profile</a>.</p>`));
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).send(page('Something went wrong', '<p>Try again, or email merge@badjrtech.com and we will do it for you.</p>'));
  }
});

// Mail clients POST here; they want a 2xx and nothing else.
router.post('/', async (req, res) => {
  try {
    const r = await applyUnsubscribe(req);
    res.status(r.ok ? 200 : 400).json({ ok: r.ok });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
