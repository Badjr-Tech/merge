const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma.cjs');
const { sendEmail, appUrl, layout, button } = require('../utils/email.cjs');
const { TRIAL_PLAN } = require('../utils/plans.cjs');

// Vercel Cron calls this daily (see server/vercel.json). Protected by CRON_SECRET.
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}` || req.query.key === secret;
}

async function adminsOf(companyId) {
  return prisma.user.findMany({ where: { companyId, role: 'admin', isApproved: true }, select: { email: true, name: true, username: true } });
}

router.get('/trial-emails', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ msg: 'Unauthorized' });
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  let reminders = 0; let ended = 0;
  try {
    const reminderDue = await prisma.company.findMany({ where: { plan: TRIAL_PLAN, trialEndsAt: { gt: now, lte: soon }, trialReminderSentAt: null }, select: { id: true, name: true, trialEndsAt: true } });
    for (const c of reminderDue) {
      const admins = await adminsOf(c.id);
      for (const a of admins) {
        await sendEmail({
          to: a.email,
          subject: `Your Merge Premium trial ends in 3 days`,
          html: layout('3 days left on your Premium trial', `<p>Hi ${a.name || a.username}, your trial for <strong>${c.name}</strong> ends on ${new Date(c.trialEndsAt).toDateString()}.</p><p>After that, your workspace moves to the Free plan: one person, two active projects, and downloads. Teammates, approvals, the answer bank, and Ask Merge pause until you choose a plan.</p>${button(appUrl('/app/settings#plan'), 'Choose a plan')}`),
          text: `Your Merge Premium trial for ${c.name} ends on ${new Date(c.trialEndsAt).toDateString()}. Choose a plan: ${appUrl('/app/settings#plan')}`,
        });
      }
      await prisma.company.update({ where: { id: c.id }, data: { trialReminderSentAt: now } });
      reminders += 1;
    }

    const endedDue = await prisma.company.findMany({ where: { plan: TRIAL_PLAN, trialEndsAt: { lte: now }, trialEndedSentAt: null }, select: { id: true, name: true } });
    for (const c of endedDue) {
      const admins = await adminsOf(c.id);
      for (const a of admins) {
        await sendEmail({
          to: a.email,
          subject: `Your Merge trial has ended — you're on the Free plan`,
          html: layout('Your trial has ended', `<p>Hi ${a.name || a.username}, the Premium trial for <strong>${c.name}</strong> is over and the workspace is now on the Free plan.</p><p>Everything you wrote is still there. You can keep writing and downloading up to two active projects. To bring back teammates, approvals, the answer bank, and Ask Merge, pick a plan any time.</p>${button(appUrl('/app/settings#plan'), 'See plans')}`),
          text: `Your Merge trial for ${c.name} has ended. The workspace is on the Free plan. See plans: ${appUrl('/app/settings#plan')}`,
        });
      }
      await prisma.company.update({ where: { id: c.id }, data: { trialEndedSentAt: now } });
      ended += 1;
    }
    res.json({ reminders, ended });
  } catch (err) {
    console.error('Cron error:', err);
    res.status(500).json({ msg: 'Cron failed' });
  }
});

module.exports = router;
