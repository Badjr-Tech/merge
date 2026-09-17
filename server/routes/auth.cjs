const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../utils/prisma.cjs');
const auth = require('../middleware/auth');
const { sendEmail, emailConfigured, appUrl, layout, button } = require('../utils/email.cjs');
const { planFor, TRIAL_DAYS, TRIAL_PLAN_BY_KIND, PLANS } = require('../utils/plans.cjs');
const { rateLimit, honeypot } = require('../middleware/antispam.cjs');

const TOKEN_TTL = '7d';
const INVITE_TTL_DAYS = 7;
const RESET_TTL_HOURS = 2;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function signToken(user) {
  const payload = {
    user: {
      id: user.id,
      role: user.role,
      username: user.username,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      companyName: user.company ? user.company.name : null,
    },
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    company: user.company ? { id: user.company.id, name: user.company.name } : null,
    createdAt: user.createdAt,
  };
}

async function uniqueUsername(base) {
  let candidate = base.replace(/[^a-z0-9._-]/gi, '').toLowerCase() || 'user';
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const name = n === 0 ? candidate : `${candidate}${n}`;
    const exists = await prisma.user.findUnique({ where: { username: name } });
    if (!exists) return name;
    n += 1;
  }
}

function validatePassword(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

// POST /api/auth/signup — create a workspace (company) and its first admin
router.post('/signup', rateLimit({ max: 5 }), honeypot, async (req, res) => {
  const { companyName, name, password } = req.body;
  const email = normalizeEmail(req.body.email);
  const kind = req.body.kind === 'writer' ? 'writer' : 'team';

  if (!companyName || !companyName.trim()) return res.status(400).json({ msg: 'Workspace name is required.' });
  if (!name || !name.trim()) return res.status(400).json({ msg: 'Your name is required.' });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ msg: 'A valid email is required.' });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ msg: pwError });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ msg: 'An account with that email already exists. Try signing in.' });

    const companyExists = await prisma.company.findUnique({ where: { name: companyName.trim() } });
    if (companyExists) return res.status(400).json({ msg: 'That workspace name is taken. Try another.' });

    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const username = await uniqueUsername(email.split('@')[0]);

    const user = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: companyName.trim(), kind, plan: TRIAL_PLAN_BY_KIND[kind], trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000) } });
      return tx.user.create({
        data: {
          username,
          email,
          name: name.trim(),
          password: hashed,
          role: 'admin',
          isApproved: true,
          companyId: company.id,
        },
        include: { company: true },
      });
    });

    sendEmail({
      to: email,
      subject: `Welcome to Merge — your ${TRIAL_DAYS}-day ${PLANS[TRIAL_PLAN_BY_KIND[kind]].name} trial has started`,
      html: layout(`Welcome, ${name.trim().split(' ')[0]}!`, `<p>Your workspace <strong>${companyName.trim()}</strong> is ready, and you have full ${PLANS[TRIAL_PLAN_BY_KIND[kind]].name} access for the next ${TRIAL_DAYS} days.</p><p>Three things to do first:</p><ol><li>Create a project from a grant application.</li><li>Fill in your organization profile under Settings so Ask Merge writes in your voice.</li>${kind === 'team' ? '<li>Invite a teammate from the Team page.</li>' : '<li>Add a past proposal so the answer bank has something to suggest.</li>'}</ol>${button(appUrl('/app'), 'Open Merge')}`),
      text: `Welcome to Merge. Your ${TRIAL_DAYS}-day trial has started. Open Merge: ${appUrl('/app')}`,
    }).catch(() => {});
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ msg: 'Could not create your workspace. Please try again.' });
  }
});

// POST /api/auth/login — email (or legacy username) + password
router.post('/login', rateLimit({ max: 20 }), async (req, res) => {
  const identifier = String(req.body.email || req.body.username || '').trim();
  const { password } = req.body;
  if (!identifier || !password) return res.status(400).json({ msg: 'Email and password are required.' });

  try {
    let user = await prisma.user.findUnique({ where: { email: identifier.toLowerCase() }, include: { company: true } });
    if (!user) user = await prisma.user.findUnique({ where: { username: identifier }, include: { company: true } });
    if (!user) return res.status(400).json({ msg: 'Invalid email or password.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid email or password.' });

    if (!user.isApproved) return res.status(403).json({ msg: 'Your account is waiting for an admin to approve it.' });
    if (!user.companyId) return res.status(403).json({ msg: 'Your account is not attached to a workspace yet. Ask your admin for an invite.' });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Legacy: GET /api/auth
router.get('/', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ msg: 'Name is required.' });
  try {
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { name: name.trim() }, include: { company: true } });
    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword, confirmNewPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ msg: 'Please fill in every field.' });
  if (confirmNewPassword !== undefined && newPassword !== confirmNewPassword) return res.status(400).json({ msg: 'New passwords do not match.' });
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ msg: pwError });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Current password is incorrect.' });
    const hashed = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    res.json({ msg: 'Password updated.' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// ---------- Invitations ----------

function inviteLink(token) { return appUrl(`/invite/${token}`); }
function resetLink(token) { return appUrl(`/reset-password/${token}`); }

// POST /api/auth/invitations (admin)
router.post('/invitations', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Only admins can invite teammates.' });
  const email = normalizeEmail(req.body.email);
  const role = ['viewer', 'editor', 'admin', 'approver'].includes(req.body.role) ? req.body.role : 'editor';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ msg: 'A valid email is required.' });

  try {
    const inviter = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!inviter.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });

    const plan = planFor(inviter.company);
    if (!plan.features.includes('team')) return res.status(402).json({ msg: plan.kind === 'writer' ? 'Writer workspaces are for one person. Switch to a team workspace in Settings to invite people.' : `Inviting teammates is included in Small Teams and above. Your workspace is on ${plan.name}.`, feature: 'team', upgrade: true });
    if (plan.limits.seats !== null) {
      const [members, pending] = await Promise.all([
        prisma.user.count({ where: { companyId: inviter.companyId } }),
        prisma.invitation.count({ where: { companyId: inviter.companyId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      ]);
      if (members + pending >= plan.limits.seats) return res.status(402).json({ msg: `${plan.name} includes up to ${plan.limits.seats} people and your workspace is full (counting pending invitations). Upgrade to add more.`, feature: 'seats', upgrade: true });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.companyId === inviter.companyId) return res.status(400).json({ msg: 'That person is already on your team.' });
    if (existing) return res.status(400).json({ msg: 'That email already belongs to an account in another workspace.' });

    // Replace any pending invite for the same email
    await prisma.invitation.deleteMany({ where: { email, companyId: inviter.companyId, acceptedAt: null } });

    const invitation = await prisma.invitation.create({
      data: {
        email,
        role,
        token: crypto.randomBytes(24).toString('hex'),
        companyId: inviter.companyId,
        invitedById: inviter.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000),
      },
    });

    const link = inviteLink(invitation.token);
    const emailed = await sendEmail({
      to: email,
      subject: `${inviter.name || inviter.username} invited you to ${inviter.company.name} on Merge`,
      html: layout(`Join ${inviter.company.name} on Merge`, `<p>${inviter.name || inviter.username} invited you to collaborate on grant proposals in Merge.</p>${button(link, 'Accept invitation')}<p style="font-size:13px;color:#666">This invitation expires in ${INVITE_TTL_DAYS} days.</p>`),
      text: `${inviter.name || inviter.username} invited you to ${inviter.company.name} on Merge. Accept here: ${link}`,
    });

    res.json({ invitation: { id: invitation.id, email, role, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt }, link, emailed });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ msg: 'Could not create the invitation.' });
  }
});

// GET /api/auth/invitations (admin) — pending invites
router.get('/invitations', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  try {
    const invites = await prisma.invitation.findMany({
      where: { companyId: req.user.companyId, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { invitedBy: { select: { name: true, username: true } } },
    });
    res.json(invites.map(i => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt, expired: i.expiresAt < new Date(), link: inviteLink(i.token), invitedBy: i.invitedBy })));
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/auth/invitations/:id (admin)
router.delete('/invitations/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  try {
    await prisma.invitation.deleteMany({ where: { id: req.params.id, companyId: req.user.companyId } });
    res.json({ msg: 'Invitation revoked.' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/auth/invitations/token/:token (public) — details for the accept page
router.get('/invitations/token/:token', async (req, res) => {
  try {
    const invite = await prisma.invitation.findUnique({
      where: { token: req.params.token },
      include: { company: { select: { name: true } }, invitedBy: { select: { name: true, username: true } } },
    });
    if (!invite) return res.status(404).json({ msg: 'This invitation link is not valid.' });
    if (invite.acceptedAt) return res.status(410).json({ msg: 'This invitation has already been used. Try signing in.' });
    if (invite.expiresAt < new Date()) return res.status(410).json({ msg: 'This invitation has expired. Ask your admin to send a new one.' });
    res.json({ email: invite.email, role: invite.role, companyName: invite.company.name, invitedBy: invite.invitedBy.name || invite.invitedBy.username });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/auth/invitations/token/:token/accept (public)
router.post('/invitations/token/:token/accept', rateLimit({ max: 10 }), async (req, res) => {
  const { name, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ msg: 'Your name is required.' });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ msg: pwError });

  try {
    const invite = await prisma.invitation.findUnique({ where: { token: req.params.token } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return res.status(410).json({ msg: 'This invitation is no longer valid.' });

    const existing = await prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) return res.status(400).json({ msg: 'An account with this email already exists. Try signing in.' });

    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const username = await uniqueUsername(invite.email.split('@')[0]);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          email: invite.email,
          name: name.trim(),
          password: hashed,
          role: invite.role,
          isApproved: true,
          companyId: invite.companyId,
        },
        include: { company: true },
      });
      await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return created;
    });
    require('./billing.cjs').syncSeats(invite.companyId);

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ msg: 'Could not accept the invitation.' });
  }
});

// ---------- Password reset ----------

async function createResetToken(userId) {
  await prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } });
  const reset = await prisma.passwordReset.create({
    data: { userId, token: crypto.randomBytes(24).toString('hex'), expiresAt: new Date(Date.now() + RESET_TTL_HOURS * 3600 * 1000) },
  });
  return reset;
}

// POST /api/auth/forgot-password (public)
router.post('/forgot-password', rateLimit({ max: 5 }), honeypot, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const generic = { msg: 'If an account exists for that email, a reset link has been sent.' };
  if (!email) return res.json(generic);
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const reset = await createResetToken(user.id);
      const link = resetLink(reset.token);
      await sendEmail({
        to: email,
        subject: 'Reset your Merge password',
        html: layout('Reset your password', `<p>Click below to choose a new password. This link expires in ${RESET_TTL_HOURS} hours.</p>${button(link, 'Reset password')}`),
        text: `Reset your Merge password: ${link}`,
      });
    }
    res.json({ ...generic, emailConfigured: emailConfigured() });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.json(generic);
  }
});

// GET /api/auth/reset-password/:token (public) — validate
router.get('/reset-password/:token', async (req, res) => {
  try {
    const reset = await prisma.passwordReset.findUnique({ where: { token: req.params.token }, include: { user: { select: { email: true } } } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) return res.status(410).json({ msg: 'This reset link is no longer valid.' });
    res.json({ email: reset.user.email });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/auth/reset-password/:token (public)
router.post('/reset-password/:token', rateLimit({ max: 10 }), async (req, res) => {
  const { password } = req.body;
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ msg: pwError });
  try {
    const reset = await prisma.passwordReset.findUnique({ where: { token: req.params.token } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) return res.status(410).json({ msg: 'This reset link is no longer valid.' });
    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: reset.userId }, data: { password: hashed, isApproved: true }, include: { company: true } });
      await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      return u;
    });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ msg: 'Could not reset the password.' });
  }
});

// POST /api/auth/users/:id/reset-link (admin) — generate a reset link for a teammate
router.post('/users/:id/reset-link', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.companyId !== req.user.companyId) return res.status(404).json({ msg: 'User not found.' });
    const reset = await createResetToken(target.id);
    const link = resetLink(reset.token);
    const emailed = await sendEmail({
      to: target.email,
      subject: 'Reset your Merge password',
      html: layout('Reset your password', `<p>Your workspace admin generated a password reset link for you. It expires in ${RESET_TTL_HOURS} hours.</p>${button(link, 'Reset password')}`),
      text: `Reset your Merge password: ${link}`,
    });
    res.json({ link, emailed, expiresAt: reset.expiresAt });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = { router, signToken, publicUser };
