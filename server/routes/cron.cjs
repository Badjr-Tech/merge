const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma.cjs');
const { sendEmail, appUrl, layout, button, unsubscribeFooter } = require('../utils/email.cjs');
const { notify } = require('../utils/notify.cjs');
const { TRIAL_PLAN_BY_KIND } = require('../utils/plans.cjs');
const TRIAL_PLANS = Object.values(TRIAL_PLAN_BY_KIND);

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
    const reminderDue = await prisma.company.findMany({ where: { plan: { in: TRIAL_PLANS }, trialEndsAt: { gt: now, lte: soon }, trialReminderSentAt: null, OR: [{ compedUntil: null }, { compedUntil: { lte: now } }] }, select: { id: true, name: true, trialEndsAt: true } });
    for (const c of reminderDue) {
      const admins = await adminsOf(c.id);
      for (const a of admins) {
        await sendEmail({
          to: a.email,
          subject: `Your Merge trial ends in 3 days`,
          html: layout('3 days left on your trial', `<p>Hi ${a.name || a.username}, your trial for <strong>${c.name}</strong> ends on ${new Date(c.trialEndsAt).toDateString()}.</p><p>After that, your workspace moves to the Free plan: one grant, no AI. Teammates, approvals, Ask Merge, and the AI reviewer pause until you choose a plan.</p>${button(appUrl('/app/settings#plan'), 'Choose a plan')}`),
          text: `Your Merge Premium trial for ${c.name} ends on ${new Date(c.trialEndsAt).toDateString()}. Choose a plan: ${appUrl('/app/settings#plan')}`,
        });
      }
      await prisma.company.update({ where: { id: c.id }, data: { trialReminderSentAt: now } });
      reminders += 1;
    }

    const endedDue = await prisma.company.findMany({ where: { plan: { in: TRIAL_PLANS }, trialEndsAt: { lte: now }, trialEndedSentAt: null, OR: [{ compedUntil: null }, { compedUntil: { lte: now } }] }, select: { id: true, name: true } });
    for (const c of endedDue) {
      const admins = await adminsOf(c.id);
      for (const a of admins) {
        await sendEmail({
          to: a.email,
          subject: `Your Merge trial has ended — you're on the Free plan`,
          html: layout('Your trial has ended', `<p>Hi ${a.name || a.username}, the trial for <strong>${c.name}</strong> is over and the workspace is now on the Free plan.</p><p>Everything you wrote is still there. You keep your one grant and can download it. To bring back AI, teammates, approvals, and unlimited grants, pick a plan any time.</p>${button(appUrl('/app/settings#plan'), 'See plans')}`),
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

// --- Deadline reminders -------------------------------------------------
// One email per person per milestone, counting down to a project's due date. Recipients are the
// owner and anyone holding an unsubmitted question, so nobody is told about work that is not theirs.
const MILESTONES = [30, 14, 7, 3, 1, 0];

// Question text and project names are user-written, so escape before they go into an email body.
function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function daysUntil(date, now) {
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / 86400000);
}

function dueWording(days, when) {
  if (days === 0) return { subject: 'is due today', heading: 'Due today' };
  if (days === 1) return { subject: 'is due tomorrow', heading: 'Due tomorrow' };
  return { subject: `is due in ${days} days`, heading: `Due in ${days} days — ${when}` };
}

async function runDeadlineReminders(now) {
  const horizon = new Date(now.getTime() + (MILESTONES[0] + 1) * 86400000);
  const projects = await prisma.project.findMany({
    where: {
      deadlineDate: { not: null, lte: horizon, gte: new Date(now.getTime() - 86400000) },
      isCompleted: false,
      isArchived: false,
      companyId: { not: null },
    },
    select: {
      id: true, name: true, deadlineDate: true, deadlineReminderDay: true, companyId: true,
      owner: { select: { id: true, companyId: true, email: true, name: true, username: true, deadlineEmails: true } },
      questions: {
        select: {
          text: true, status: true, answer: true,
          assignedTo: { select: { id: true, companyId: true, email: true, name: true, username: true, deadlineEmails: true } },
        },
      },
      company: { select: { kind: true } },
    },
  });

  let sent = 0; let projectsNotified = 0;
  for (const p of projects) {
    const days = daysUntil(new Date(p.deadlineDate), now);
    if (days < 0) continue;
    // The tightest milestone we have reached and not already sent for this project. MILESTONES runs
    // high to low, so the last match is the closest one — a project 2 days out jumps straight to the
    // 3-day notice rather than working through 7 first.
    const reached = MILESTONES.filter(m => days <= m && (p.deadlineReminderDay === null || m < p.deadlineReminderDay));
    if (!reached.length) continue;
    const milestone = reached[reached.length - 1];

    const writerMode = p.company && p.company.kind === 'writer';
    const isOpen = q => (writerMode ? !(q.answer && q.answer.trim()) : q.status !== 'submitted');
    const open = p.questions.filter(isOpen);
    const total = p.questions.length;

    // The owner always hears about it; teammates only when they are holding something.
    const byUser = new Map();
    if (p.owner && p.owner.deadlineEmails !== false) byUser.set(p.owner.id, { user: p.owner, mine: [] });
    for (const q of open) {
      const u = q.assignedTo;
      if (!u || u.deadlineEmails === false) continue;
      if (!byUser.has(u.id)) byUser.set(u.id, { user: u, mine: [] });
      byUser.get(u.id).mine.push(q.text);
    }
    if (p.owner && byUser.has(p.owner.id)) {
      byUser.get(p.owner.id).mine = open.filter(q => q.assignedTo && q.assignedTo.id === p.owner.id).map(q => q.text);
    }

    const when = new Date(p.deadlineDate).toDateString();
    const words = dueWording(days, when); // wording uses the real day count, not the milestone
    const link = appUrl(`/app/projects/${p.id}`);

    for (const { user, mine } of byUser.values()) {
      const state = total === 0
        ? '<p>No questions have been added to it yet.</p>'
        : open.length === 0
          ? `<p>Good news: all ${total} answers are in.</p>`
          : `<p><strong>${open.length}</strong> of ${total} answers ${open.length === 1 ? 'is' : 'are'} still open.</p>`;
      const yours = mine.length
        ? `<p>Assigned to you:</p><ul>${mine.slice(0, 8).map(t => `<li>${esc(t.length > 120 ? `${t.slice(0, 117)}…` : t)}</li>`).join('')}</ul>${mine.length > 8 ? `<p>…and ${mine.length - 8} more.</p>` : ''}`
        : '';
      await notify({
        user, companyId: p.companyId, type: 'deadline',
        title: `${p.name} ${words.subject}`,
        body: open.length ? `${open.length} of ${total} answers still open${mine.length ? ` · ${mine.length} assigned to you` : ''}.` : 'All answers are in.',
        link: `/app/projects/${p.id}`,
        list: 'deadlines',
        email: {
        because: 'you own this grant or have a question assigned to you',
        subject: `${p.name} ${words.subject}`,
        html: layout(words.heading, `<p>Hi ${esc(user.name || user.username)},</p><p><strong>${esc(p.name)}</strong> is due ${when}.</p>${state}${yours}${button(link, 'Open the project')}`),
        text: `${p.name} is due ${when}. ${open.length ? `${open.length} of ${total} answers still open.` : 'All answers are in.'} ${link}`,
        },
      });
      sent += 1;
    }

    await prisma.project.update({ where: { id: p.id }, data: { deadlineReminderDay: milestone } });
    projectsNotified += 1;
  }
  return { projects: projectsNotified, emails: sent };
}

router.get('/deadline-reminders', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ msg: 'Unauthorized' });
  try {
    res.json(await runDeadlineReminders(new Date()));
  } catch (err) {
    console.error('Deadline reminder cron error:', err);
    res.status(500).json({ msg: 'Cron failed' });
  }
});

// --- Monthly owner report ------------------------------------------------
// Runs on the 1st and reports the month that just finished.
const { monthlySummary } = require('../utils/monthlyReport.cjs');
const FEATURE = { chat: 'Ask Merge', draft: 'Help me answer this', review: 'AI reviewer', profile: 'Profile import' };
const money = (n) => `$${(Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function reportHtml(s, label) {
  const row = (k, v, note) => `<tr><td style="padding:6px 16px 6px 0;color:#6b6b6e;white-space:nowrap">${k}</td><td style="padding:6px 0;font-weight:600;color:#0b2d65">${v}</td><td style="padding:6px 0 6px 12px;color:#9a9a9e;font-size:13px">${note || ''}</td></tr>`;
  const feats = Object.entries(s.byFeature).sort((a, b) => b[1].spend - a[1].spend)
    .map(([k, v]) => `<li>${FEATURE[k] || k}: ${v.actions.toLocaleString()} actions, ${money(v.spend)}</li>`).join('') || '<li>No AI used this month.</li>';
  const spenders = s.topSpenders.length
    ? `<p style="margin-top:18px"><strong>Costliest workspaces</strong></p><ul>${s.topSpenders.map(w => `<li>${w.name}: ${money(w.spend)}</li>`).join('')}</ul>`
    : '';
  return `<p>Here is how ${label} went.</p>
<table style="font-size:14px;border-collapse:collapse">
${row('Monthly recurring', money(s.mrr), `${s.paying} paying`)}
${row('AI spend', money(s.aiSpend), `${s.aiActions.toLocaleString()} actions`)}
${row('Margin after AI', money(s.marginAfterAi), s.mrr > 0 ? `${Math.round((s.aiSpend / s.mrr) * 1000) / 10}% of MRR went to AI` : '')}
${row('New workspaces', s.newWorkspaces, `${s.newWriter} writer · ${s.newTeam} organization${s.referred ? ` · ${s.referred} referred` : ''}`)}
${row('Trials ended', s.endedTrials, s.conversionRate === null ? 'none' : `${s.converted} converted (${s.conversionRate}%)`)}
${row('Workspaces total', s.totalWorkspaces, `${s.trialing} on trial · ${s.free} free · ${s.comped} comped`)}
${row('Grants started', s.projects, `${s.answers.toLocaleString()} answers submitted`)}
${row('Support tickets', s.tickets, '')}
</table>
<p style="margin-top:18px"><strong>AI by feature</strong></p><ul>${feats}</ul>${spenders}
<p style="font-size:12px;color:#9a9a9e">AI spend is priced from measured token counts at Gemini rates — our estimate, not a Google invoice.</p>`;
}

async function runMonthlyReport(now) {
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);          // start of the current month
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);    // start of the one that just ended
  const label = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const s = await monthlySummary(monthStart, monthEnd);
  const to = process.env.OWNER_NOTIFY || process.env.SIGNUP_NOTIFY || 'dakotah@badjrtech.com';
  await sendEmail({
    to,
    subject: `Merge in ${label}: ${money(s.mrr)} MRR, ${s.newWorkspaces} new workspace${s.newWorkspaces === 1 ? '' : 's'}`,
    html: layout(`Merge · ${label}`, reportHtml(s, label) + button(appUrl('/app/staff/overview'), 'Open the overview')),
    text: `Merge in ${label}\nMRR ${money(s.mrr)} (${s.paying} paying)\nAI spend ${money(s.aiSpend)} over ${s.aiActions} actions\nMargin after AI ${money(s.marginAfterAi)}\nNew workspaces ${s.newWorkspaces}\nTrials ended ${s.endedTrials}, converted ${s.converted}\nGrants started ${s.projects}, answers ${s.answers}`,
  });
  return { month: label, ...s };
}

router.get('/monthly-report', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ msg: 'Unauthorized' });
  try {
    res.json(await runMonthlyReport(new Date()));
  } catch (err) {
    console.error('Monthly report error:', err);
    res.status(500).json({ msg: 'Cron failed' });
  }
});

module.exports = router;
