const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { requireFeature } = require('../utils/plans.cjs');
const gemini = require('../utils/gemini.cjs');
const { generateText } = gemini;


// @route   POST api/ai/review
// @desc    Send a project for AI review
// @access  Private
router.post('/review', auth, requireFeature(prisma, 'ai_reviewer'), async (req, res) => {
  const { projectId, grantWebsite, grantPurposeStatement } = req.body;

  try {
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

const CHAT_HISTORY = 16;

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
const AI_MONTHLY_CAP = Number(process.env.AI_MONTHLY_CAP || 1000);
router.post('/chat', auth, requireFeature(prisma, 'assistant'), async (req, res) => {
  const message = String(req.body.message || '').trim().slice(0, 4000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const used = await prisma.assistantMessage.count({ where: { companyId: req.user.companyId, role: 'user', createdAt: { gte: monthStart } } });
  if (used >= AI_MONTHLY_CAP) return res.status(429).json({ msg: `Your workspace has used its ${AI_MONTHLY_CAP} assistant messages for this month. It resets on the 1st. Email merge@badjrtech.com if you need more.` });
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

How to help:
- Give concrete, usable guidance: what points to make, how to structure the answer, what funders look for, and example sentences in the organization's voice.
- Draw on the ORGANIZATION PROFILE below. Remind the user to include the mission, philosophy, programs, and impact where they strengthen an answer.
- If a CURRENT PROJECT is provided, tailor advice to its questions, limits, and existing drafts. Keep suggested text within the question's limit.
- Never invent statistics, names, dates, or partners. When a fact is missing, write a placeholder in square brackets like [number of families served] and say what the user should fill in.
- Be concise. Use short paragraphs and bullet points. Use Markdown headings only for longer answers.
- If the profile is empty, still help, but suggest filling it in under Settings so advice can be specific.
- When asked which partners to include, pick from the PARTNERS DIRECTORY, match them to the grant's purpose and questions, and say what role each could play. Never invent partners.

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
      reply = await gemini.chatReplyStream({ systemInstruction: system, history: past, message, onChunk: t => emit('chunk', t) });
    } catch (err) {
      console.error('Assistant error:', err);
      emit('error', { msg: err.status === 429 ? err.message : err.message && err.message.includes('API key') ? 'The AI key on the server is not valid.' : 'The assistant could not answer. Try again.' });
      return res.end();
    }

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
