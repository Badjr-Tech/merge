const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { requireFeature, planFor, aiLimit, AI_FEATURE_LABELS } = require('../utils/plans.cjs');
const gemini = require('../utils/gemini.cjs');
const { generateText } = gemini;


// @route   POST api/ai/review
// @desc    Send a project for AI review
// @access  Private
router.post('/review', auth, requireFeature(prisma, 'ai_reviewer'), async (req, res) => {
  const { projectId, grantWebsite, grantPurposeStatement } = req.body;

  try {
    const gate = await checkAi(req, 'review', { projectId });
    if (!gate.ok) return res.status(gate.status).json(gate.body);
    // Ensure GEMINI_API_KEY is set
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ msg: 'Google Gemini API Key not configured on server.' });
    }

    // Fetch project details from the database
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { owner: { select: { username: true } } },
    });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Basic authorization
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.companyId !== project.companyId) {
      return res.status(401).json({ msg: 'User not authorized to review this project' });
    }

    // Build the prompt and ask Gemini (model chosen with fallback)
    const prompt = `You are an expert grant reviewer. Review the following project proposal in the context of a grant application.\nProject Name: ${project.name}\nProject Description: ${project.description || 'No description provided.'}\nProject Details: ${JSON.stringify(project.details || {})}\n\nGrant Website: ${grantWebsite}\nGrant Purpose Statement: ${grantPurposeStatement}\n\nPlease review the grant website and information about previous winners (if available) to understand the grant's priorities. Based on this information, review the provided project proposal.\nno extra attachements will be viewable, so please do not critique lack of attachments. if the grant notes a special attachment needed, please reference it in the reccomendation list\nFormat your response as a markdown document with the following sections: 5 Highlights, 5 Critiques, Strengths, Weaknesses, and a Recommendation List with a short summary beneath. Keep your commentary under 500 words. Prioritize the recommendations and include a section on how to make the application stand out.`;

    const text = await generateText(prompt);

    // Save the AI review to the database
    await recordAi(req.user.companyId, req.user.id, 'review', projectId);
    await prisma.aIReviewLog.create({
      data: {
        projectId: project.id,
        reviewedById: req.user.id,
        aiResponse: text,
        grantWebsite: grantWebsite,
        grantPurposeStatement: grantPurposeStatement,
      },
    });

    res.json({ review: text });
  } catch (err) {
    console.error('AI Review Error:', err);
    res.status(500).json({ msg: err.message || 'Server Error during AI review.' });
  }
});

// @route   GET api/ai/reviews
// @desc    Get all AI review logs for the logged-in user's company
// @access  Private
router.get('/reviews', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const { projectId, reviewedById, sortBy } = req.query;
    const where = {
      project: { // Filter by project's companyId
        companyId: user.companyId,
      },
    };

    if (projectId) {
      where.projectId = projectId;
    }

    if (reviewedById) {
      where.reviewedById = reviewedById;
    }

    const orderBy = {};
    if (sortBy === 'oldest') {
      orderBy.reviewedAt = 'asc';
    } else if (sortBy === 'dueDate_asc') {
      orderBy.project = { deadlineDate: 'asc' };
    } else if (sortBy === 'dueDate_desc') {
      orderBy.project = { deadlineDate: 'desc' };
    } else {
      orderBy.reviewedAt = 'desc';
    }

    const reviews = await prisma.aIReviewLog.findMany({
      where: {
        ...where,
        isArchived: false, // Only fetch non-archived reviews by default
      },
      include: {
        project: {
          select: { name: true, deadlineDate: true },
        },
        reviewedBy: {
          select: { username: true },
        },
      },
      orderBy,
    });

    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/ai/reviews/:id/archive
// @desc    Archive an AI review
// @access  Private (admin only)
router.put('/reviews/:id/archive', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Authorization denied. Not an admin.' });
  }

  try {
    const review = await prisma.aIReviewLog.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });

    if (!review) {
      return res.status(404).json({ msg: 'Review not found' });
    }

    res.json({ msg: 'Review archived successfully', review });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/ai/reviews/:id
// @desc    Get a single AI review by ID
// @access  Private
router.get('/reviews/:id', auth, async (req, res) => {
  try {
    const review = await prisma.aIReviewLog.findUnique({
      where: { id: req.params.id },
      include: {
        project: { select: { name: true } },
        reviewedBy: { select: { id: true, username: true, name: true } },
      },
    });

    if (!review) {
      return res.status(404).json({ msg: 'Review not found' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const project = await prisma.project.findUnique({ where: { id: review.projectId } });

    if (!user || user.companyId !== project.companyId) {
      return res.status(401).json({ msg: 'User not authorized to view this review' });
    }

    res.json(review);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/ai/archived-reviews
// @desc    Get all archived AI review logs for the logged-in user's company
// @access  Private (admin only)
router.get('/archived-reviews', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Authorization denied. Not an admin.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const reviews = await prisma.aIReviewLog.findMany({
      where: {
        project: {
          companyId: user.companyId,
        },
        isArchived: true, // Only fetch archived reviews
      },
      include: {
        project: {
          select: { name: true, deadlineDate: true },
        },
        reviewedBy: {
          select: { username: true },
        },
      },
      orderBy: {
        reviewedAt: 'desc',
      },
    });

    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ---------- Writing assistant (workspace chat) ----------

const CHAT_HISTORY = 10; // turns of context sent back to Gemini — the older ones rarely change an answer

function profileBlock(company) {
  const p = company.profile || {};
  const lines = [];
  const label = { mission: 'Mission', philosophy: 'Philosophy and values', programs: 'Programs and services', audience: 'Who we serve', impact: 'Impact, results, and history', website: 'Website', tone: 'Preferred writing tone', notes: 'Other notes' };
  Object.keys(label).forEach(k => { if (p[k]) lines.push(`${label[k]}: ${p[k]}`); });
  return lines.length ? lines.join('\n') : '(The organization profile is empty. Suggest the user fill it in under Settings so answers can be specific.)';
}

function projectBlock(project) {
  if (!project) return '';
  const d = project.details || {};
  const qs = (project.questions || []).map((q, i) => {
    const lim = q.maxLimit ? ` [limit: ${q.maxLimit} ${(q.limitUnit || 'words').startsWith('char') ? 'characters' : 'words'}]` : '';
    const ans = q.answer ? `\n   Current draft: ${q.answer.slice(0, 1500)}` : '\n   Current draft: (none yet)';
    return `${i + 1}. ${q.text}${lim} — status: ${q.status}${ans}`;
  }).join('\n');
  return `\nCURRENT PROJECT: ${project.name}\nDescription: ${project.description || '(none)'}\nTheme or angle: ${d.themeAngle || '(none)'}\nPossible partnership: ${d.possiblePartnership || '(none)'}\nDeadline: ${project.deadlineDate ? new Date(project.deadlineDate).toDateString() : '(none)'}\nQuestions:\n${qs || '(no questions yet)'}\n`;
}

// POST /api/ai/draft — stream a first-draft answer for one question
// Grounded in the organization profile, the rest of the project, the question's limit, and the
// workspace's own past answers, so the draft sounds like them rather than like a chatbot.
router.post('/draft', auth, requireFeature(prisma, 'assistant'), async (req, res) => {
  const questionId = String(req.body.questionId || '');
  const instruction = String(req.body.instruction || '').trim().slice(0, 500);
  if (!questionId) return res.status(400).json({ msg: 'Which question?' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ msg: 'AI is not configured on the server.' });

  const gate = await checkAi(req, 'draft');
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  try {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { project: { select: { id: true, companyId: true, name: true, description: true, details: true, questions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { text: true, answer: true, section: true, maxLimit: true, limitUnit: true } } } } },
    });
    if (!question || question.project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Question not found' });
    if (question.type === 'upload') return res.status(400).json({ msg: 'This question asks for a file, not a written answer.' });

    const [company, partners] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.user.companyId }, select: { name: true, profile: true } }),
      prisma.partner.findMany({ where: { companyId: req.user.companyId }, orderBy: { name: 'asc' }, take: 40 }),
    ]);

    // Past answers to similar questions, as voice and fact reference.
    let priorBlock = '';
    try {
      const { answeredQuestions, similarity } = require('./projects.cjs');
      const rows = await answeredQuestions(req.user.companyId, question.id);
      const close = rows
        .map(r => ({ ...r, score: similarity(question.text, r.text) }))
        .filter(r => r.score >= 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (close.length) {
        priorBlock = `\nHOW THIS ORGANIZATION HAS ANSWERED SIMILAR QUESTIONS BEFORE (reuse the facts and the voice; do not copy word for word):\n${close.map(r => `Q: ${r.text}\nA: ${String(r.answer).slice(0, 1200)}`).join('\n\n')}\n`;
      }
    } catch (err) { /* the draft is still useful without the answer bank */ }

    const unit = (question.limitUnit || 'words').startsWith('char') ? 'characters' : 'words';
    const limitLine = question.maxLimit
      ? `Hard limit: ${question.maxLimit} ${unit}. Stay comfortably under it — aim for about ${Math.floor(question.maxLimit * 0.9)} ${unit}.`
      : 'No stated limit. Two to four tight paragraphs is usually right.';
    const siblings = (question.project.questions || [])
      .filter(q => q.text !== question.text)
      .slice(0, 25)
      .map(q => `- ${q.section ? `[${q.section}] ` : ''}${q.text}${q.answer ? ' (already answered)' : ''}`)
      .join('\n');

    const partnerLine = partners.length ? `\nPARTNERS (only name one if the question calls for it):\n${partners.map(p => `- ${p.name}${p.location ? ` (${p.location})` : ''}: ${p.description || ''}`).join('\n')}\n` : '';

    const system = `You are drafting a grant application answer for ${company.name}. Write the answer itself — no preamble, no "Here's a draft", no headings unless the question asks for sections.

Rules:
- Write in the organization's voice, using the profile below. ${(company.profile || {}).tone ? `Preferred tone: ${(company.profile || {}).tone}.` : ''}
- ${limitLine}
- Never invent numbers, dates, names, partners, or outcomes. Where a specific fact is needed and you do not have it, write a placeholder in square brackets like [number of families served in 2025] so the writer can fill it in.
- Answer only the question asked. Other questions in this application are listed so you do not repeat their content.
- Plain prose. No markdown bold or bullet lists unless the question asks for a list.

ORGANIZATION PROFILE:
${profileBlock(company)}
${partnerLine}
THIS APPLICATION: ${question.project.name}${question.project.description ? `\n${question.project.description}` : ''}
${siblings ? `\nOTHER QUESTIONS IN THIS APPLICATION:\n${siblings}\n` : ''}${priorBlock}`;

    const prompt = `Question to answer${question.section ? ` (section: ${question.section})` : ''}:\n${question.text}${question.answer && question.answer.trim() ? `\n\nThe writer already has this draft. Improve on it rather than ignoring it:\n${question.answer.slice(0, 2000)}` : ''}${instruction ? `\n\nExtra instruction from the writer: ${instruction}` : ''}`;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const emit = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); if (typeof res.flush === 'function') res.flush(); };

    let draft = '';
    try {
      // Allow the question's limit plus room to finish the sentence; ~1.5 tokens a word, 1.4 for slack.
      const cap = question.maxLimit
        ? Math.min(4000, Math.ceil((unit === 'characters' ? question.maxLimit / 4 : question.maxLimit * 1.5) * 1.4))
        : 900;
      draft = await gemini.chatReplyStream({ systemInstruction: system, history: [], message: prompt, onChunk: t => emit('chunk', t), generationConfig: { maxOutputTokens: cap, temperature: 0.7 } });
    } catch (err) {
      console.error('Draft error:', err);
      emit('error', { msg: err.status === 429 ? err.message : 'The assistant could not write a draft. Try again.' });
      return res.end();
    }
    // Counts against the monthly cap like a chat message does.
    await recordAi(req.user.companyId, req.user.id, 'draft', question.project.id);
    emit('done', { length: draft.length });
    res.end();
  } catch (err) {
    console.error('Draft error:', err);
    if (res.headersSent) return res.end();
    res.status(500).json({ msg: 'The assistant could not write a draft. Try again.' });
  }
});

// --- AI metering ---------------------------------------------------------
// Each feature is limited on its own window (see AI_LIMITS in utils/plans.cjs). Staff and comped
// workspaces are unmetered. AI_MONTHLY_CAP, if set, overrides every monthly limit.
const AI_CAP_OVERRIDE = process.env.AI_MONTHLY_CAP ? Number(process.env.AI_MONTHLY_CAP) : null;

function startOfMonth() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); }
function startOfDay() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function startOfWeek() { const d = startOfDay(); const back = (d.getDay() + 6) % 7; return new Date(d.getTime() - back * 86400000); } // Monday

// Returns { ok } or { ok: false, status, body } ready to send.
// Extra AI reviewer runs are purchasable; say the price wherever the limit is reported.
function extra(rule) { return rule.extraPrice ? ` Extra runs are $${rule.extraPrice.toFixed(2)} each.` : ''; }

async function checkAi(req, feature, opts = {}) {
  const companyId = req.user.companyId;
  if (!companyId) return { ok: false, status: 400, body: { msg: 'You are not attached to a workspace.' } };
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { plan: true, kind: true, trialEndsAt: true, compedUntil: true, isStaff: true } });
  const plan = planFor(company);
  if (plan.comped || plan.staff) return { ok: true, plan, unmetered: true };

  const seats = await prisma.user.count({ where: { companyId, isApproved: true } });
  const rule = aiLimit(plan.key, feature, seats);
  const label = AI_FEATURE_LABELS[feature] || feature;
  if (!rule.allowed) {
    return { ok: false, status: 402, body: { msg: `${label} is not included in ${plan.name}.`, feature, upgrade: true } };
  }

  const where = { companyId, feature };
  // Lifetime
  if (rule.once) {
    const used = await prisma.aiUsage.count({ where });
    if (used >= 1) return { ok: false, status: 429, body: { msg: `${label} is available once on ${plan.name}, and this workspace has used it. Upgrade to run it again.`, feature, upgrade: true } };
  }
  // Cooldown
  if (rule.everyDays) {
    const last = await prisma.aiUsage.findFirst({ where, orderBy: { createdAt: 'desc' } });
    if (last) {
      const next = new Date(new Date(last.createdAt).getTime() + rule.everyDays * 86400000);
      if (next > new Date()) {
        return { ok: false, status: 429, body: { msg: `${label} can run once every ${rule.everyDays} days on ${plan.name}. You can run it again on ${next.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`, feature, retryAt: next } };
      }
    }
  }
  // Monthly
  const monthCap = AI_CAP_OVERRIDE !== null && rule.month ? AI_CAP_OVERRIDE : rule.month;
  if (monthCap) {
    const used = await prisma.aiUsage.count({ where: { ...where, createdAt: { gte: startOfMonth() } } });
    if (used >= monthCap) return { ok: false, status: 429, body: { msg: `Your workspace has used its ${monthCap.toLocaleString()} ${label} actions for this month on ${plan.name}. It resets on the 1st.${extra(rule)}`, feature, used, cap: monthCap, upgrade: true, extraPrice: rule.extraPrice } };
  }
  // Burst guard — one account cannot drain the shared pool in an afternoon
  if (rule.perDayPerUser) {
    const used = await prisma.aiUsage.count({ where: { ...where, userId: req.user.id, createdAt: { gte: startOfDay() } } });
    if (used >= rule.perDayPerUser) return { ok: false, status: 429, body: { msg: `You have used ${rule.perDayPerUser} ${label} actions today. This resets at midnight — the workspace's monthly pool is untouched.`, feature, used, cap: rule.perDayPerUser, perUser: true } };
  }
  // Per person per month — a heavy writer is bounded without penalising them for having teammates
  if (rule.monthPerUser) {
    const used = await prisma.aiUsage.count({ where: { ...where, userId: req.user.id, createdAt: { gte: startOfMonth() } } });
    if (used >= rule.monthPerUser) {
      return { ok: false, status: 429, body: { msg: `You have used your ${rule.monthPerUser.toLocaleString()} ${label} actions for this month on ${plan.name}. It resets on the 1st.${extra(rule)}`, feature, used, cap: rule.monthPerUser, perUser: true, extraPrice: rule.extraPrice } };
    }
  }
  // Per day, whole workspace
  if (rule.perDay) {
    const used = await prisma.aiUsage.count({ where: { ...where, createdAt: { gte: startOfDay() } } });
    if (used >= rule.perDay) return { ok: false, status: 429, body: { msg: `${label} can run ${rule.perDay} times a day on ${plan.name}, and today's runs are used. It resets at midnight.${extra(rule)}`, feature, used, cap: rule.perDay, extraPrice: rule.extraPrice } };
  }
  // Per calendar week
  if (rule.perWeek) {
    const used = await prisma.aiUsage.count({ where: { ...where, createdAt: { gte: startOfWeek() } } });
    if (used >= rule.perWeek) return { ok: false, status: 429, body: { msg: `${label} runs ${rule.perWeek} times a week on ${plan.name}, and this week's runs are used. It resets Monday.${extra(rule)}`, feature, used, cap: rule.perWeek, extraPrice: rule.extraPrice } };
  }
  // Per day, per grant
  if (rule.perDayPerProject && opts.projectId) {
    const used = await prisma.aiUsage.count({ where: { ...where, projectId: opts.projectId, createdAt: { gte: startOfDay() } } });
    if (used >= rule.perDayPerProject) {
      const times = rule.perDayPerProject === 1 ? 'once' : `${rule.perDayPerProject} times`;
      return { ok: false, status: 429, body: { msg: `${label} runs ${times} a day per grant on ${plan.name}. This grant's run is used — it resets at midnight.${extra(rule)}`, feature, used, cap: rule.perDayPerProject, extraPrice: rule.extraPrice } };
    }
  }
  return { ok: true, plan, rule };
}

async function recordAi(companyId, userId, feature, projectId) {
  try { await prisma.aiUsage.create({ data: { companyId, userId: userId || null, feature, projectId: projectId || null } }); }
  catch (err) { console.error('AI usage log failed:', err.message); }
}

// GET /api/ai/usage — what's left this month, per feature
router.get('/usage', auth, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { plan: true, kind: true, trialEndsAt: true, compedUntil: true, isStaff: true } });
    const plan = planFor(company);
    const seats = await prisma.user.count({ where: { companyId, isApproved: true } });
    const out = {};
    for (const feature of Object.keys(AI_FEATURE_LABELS)) {
      const rule = aiLimit(plan.key, feature, seats);
      if (!rule.allowed) { out[feature] = { allowed: false }; continue; }
      const row = { allowed: true, label: AI_FEATURE_LABELS[feature], ...rule };
      if (rule.month) row.usedThisMonth = await prisma.aiUsage.count({ where: { companyId, feature, createdAt: { gte: startOfMonth() } } });
      if (rule.perDayPerUser) row.usedByYouToday = await prisma.aiUsage.count({ where: { companyId, feature, userId: req.user.id, createdAt: { gte: startOfDay() } } });
      if (rule.monthPerUser) row.usedByYouThisMonth = await prisma.aiUsage.count({ where: { companyId, feature, userId: req.user.id, createdAt: { gte: startOfMonth() } } });
      if (rule.perDay) row.usedToday = await prisma.aiUsage.count({ where: { companyId, feature, createdAt: { gte: startOfDay() } } });
      if (rule.perWeek) row.usedThisWeek = await prisma.aiUsage.count({ where: { companyId, feature, createdAt: { gte: startOfWeek() } } });
      if (rule.once || rule.everyDays) {
        const last = await prisma.aiUsage.findFirst({ where: { companyId, feature }, orderBy: { createdAt: 'desc' } });
        row.lastUsedAt = last ? last.createdAt : null;
        if (last && rule.everyDays) row.nextAvailableAt = new Date(new Date(last.createdAt).getTime() + rule.everyDays * 86400000);
      }
      out[feature] = row;
    }
    res.json({ plan: plan.name, unmetered: Boolean(plan.comped || plan.staff), features: out });
  } catch (err) { console.error(err); res.status(500).json({ msg: 'Server error' }); }
});

// GET /api/ai/chat — this user's conversation
router.get('/chat', auth, async (req, res) => {
  try {
    const messages = await prisma.assistantMessage.findMany({
      where: { companyId: req.user.companyId, userId: req.user.id },
      orderBy: { createdAt: 'asc' },
      take: 60,
      select: { id: true, role: true, content: true, projectId: true, createdAt: true },
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/ai/chat — start over
router.delete('/chat', auth, async (req, res) => {
  try {
    await prisma.assistantMessage.deleteMany({ where: { companyId: req.user.companyId, userId: req.user.id } });
    res.json({ msg: 'Conversation cleared' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/ai/chat — send a message
router.post('/chat', auth, requireFeature(prisma, 'assistant'), async (req, res) => {
  const message = String(req.body.message || '').trim().slice(0, 4000);
  const gate = await checkAi(req, 'chat');
  if (!gate.ok) return res.status(gate.status).json(gate.body);
  const projectId = req.body.projectId || null;
  if (!message) return res.status(400).json({ msg: 'Say something first.' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ msg: 'AI is not configured on the server.' });
  if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });

  try {
    const [company, project, history, user, partners] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.user.companyId }, select: { name: true, profile: true } }),
      projectId ? prisma.project.findFirst({ where: { id: projectId, companyId: req.user.companyId }, include: { questions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { text: true, answer: true, status: true, maxLimit: true, limitUnit: true } } } }) : null,
      prisma.assistantMessage.findMany({ where: { companyId: req.user.companyId, userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: CHAT_HISTORY, select: { role: true, content: true } }),
      prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, username: true } }),
      prisma.partner.findMany({ where: { companyId: req.user.companyId }, orderBy: { name: 'asc' }, take: 60 }),
    ]);
    const partnerBlock = partners.length
      ? `\nPARTNERS DIRECTORY (organizations we already work with; suggest the ones that fit a grant and explain why):\n${partners.map(p => `- ${p.name}${p.location ? ` (${p.location})` : ''}: ${p.description || 'no description'}${p.tags ? ` [tags: ${p.tags}]` : ''}${p.notes ? ` Notes: ${p.notes}` : ''}`).join('\n')}\n`
      : '\nPARTNERS DIRECTORY: (empty — suggest adding partners under Tools → Partners so you can recommend them.)\n';

    const system = `You are Merge's writing assistant, a friendly and sharp grant-writing coach for ${company.name}. You help ${user.name || user.username} figure out what to write and how to write it for funding applications.

Answer in as few words as do the job. Most answers are under 120 words.

Length and shape:
- Open with the answer. No preamble, no restating the question, no "Great question" or "Here's a draft".
- When asked for text to use, give the text and stop. Do not explain why it works, label the parts, or add a "why this works" section unless asked.
- No closing offers ("let me know if", "I can also"), no summaries of what you just said, no headings unless the answer runs past about 200 words.
- Bullets only for genuinely parallel items, four at most. Prose otherwise.
- Asked something factual about the organization or the project: answer in a sentence or two.

Substance:
- Be concrete: what points to make, how to structure the answer, what the funder is looking for, sentences in the organization's voice.
- Draw on the ORGANIZATION PROFILE below.
- If a CURRENT PROJECT is given, tailor advice to its questions, limits, and drafts, and keep suggested text within the question's limit.
- Never invent statistics, names, dates, or partners. A missing fact becomes a placeholder like [number of families served].
- If the profile is empty, still help, and say once that filling it in under Settings makes advice specific.
- Partners come from the PARTNERS DIRECTORY only.

ORGANIZATION PROFILE:
${profileBlock(company)}
${partnerBlock}${projectBlock(project)}`;

    const past = history.reverse().map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    // Gemini requires the history to start with a user turn
    while (past.length && past[0].role !== 'user') past.shift();

    // Server-sent events: the client renders each chunk as it arrives, like a chat.
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const emit = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); if (typeof res.flush === 'function') res.flush(); };

    let reply = '';
    try {
      // maxOutputTokens is the hard stop behind the "few words" instruction: 600 tokens is about 450 words.
      reply = await gemini.chatReplyStream({ systemInstruction: system, history: past, message, onChunk: t => emit('chunk', t), generationConfig: { maxOutputTokens: 600, temperature: 0.7 } });
    } catch (err) {
      console.error('Assistant error:', err);
      emit('error', { msg: err.status === 429 ? err.message : err.message && err.message.includes('API key') ? 'The AI key on the server is not valid.' : 'The assistant could not answer. Try again.' });
      return res.end();
    }

    await recordAi(req.user.companyId, req.user.id, 'chat', projectId);
    const saved = await prisma.$transaction([
      prisma.assistantMessage.create({ data: { companyId: req.user.companyId, userId: req.user.id, role: 'user', content: message, projectId } }),
      prisma.assistantMessage.create({ data: { companyId: req.user.companyId, userId: req.user.id, role: 'assistant', content: reply, projectId } }),
    ]);
    emit('done', { reply: { id: saved[1].id, role: 'assistant', content: reply, createdAt: saved[1].createdAt }, user: { id: saved[0].id, role: 'user', content: message, createdAt: saved[0].createdAt } });
    res.end();
  } catch (err) {
    console.error('Assistant error:', err);
    if (res.headersSent) return res.end();
    res.status(err.status === 429 ? 429 : 500).json({ msg: err.status === 429 ? err.message : 'The assistant could not answer. Try again.' });
  }
});

module.exports = router;
module.exports.checkAi = checkAi;
module.exports.recordAi = recordAi;
