const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma.cjs');
const { sendEmail, appUrl, layout, button } = require('../utils/email.cjs');

async function load(token) {
  return prisma.project.findUnique({
    where: { reviewToken: token },
    include: { company: { select: { name: true } }, owner: { select: { name: true, username: true } }, narrative: true, questions: { orderBy: { createdAt: 'asc' }, select: { id: true, text: true, answer: true } }, reviewComments2: { orderBy: { createdAt: 'asc' } } },
  });
}

// GET /api/review/:token — read-only proposal for an outside reviewer
router.get('/:token', async (req, res) => {
  try {
    const p = await load(req.params.token);
    if (!p) return res.status(404).json({ msg: 'This review link is not valid or was withdrawn.' });
    res.json({
      name: p.name, organization: p.company.name, owner: p.owner.name || p.owner.username, description: p.description, deadlineDate: p.deadlineDate,
      reviewStatus: p.reviewStatus, reviewerName: p.reviewerName, reviewComments: p.reviewComments, reviewRespondedAt: p.reviewRespondedAt, reviewSentAt: p.reviewSentAt,
      narrative: p.narrative ? p.narrative.content : null,
      questions: p.questions,
      comments: p.reviewComments2.map(c => ({ id: c.id, questionId: c.questionId, reviewerName: c.reviewerName, body: c.body, createdAt: c.createdAt })),
    });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/review/:token/respond — approve or request changes
router.post('/:token/respond', async (req, res) => {
  const decision = req.body.decision === 'approved' ? 'approved' : req.body.decision === 'changes' ? 'changes' : null;
  const name = req.body.name ? String(req.body.name).trim().slice(0, 120) : null;
  const comments = req.body.comments ? String(req.body.comments).trim().slice(0, 4000) : null;
  if (!decision) return res.status(400).json({ msg: 'Choose approve or request changes.' });
  if (decision === 'changes' && !comments) return res.status(400).json({ msg: 'Add a note so the writer knows what to change.' });
  try {
    const p = await prisma.project.findUnique({ where: { reviewToken: req.params.token }, include: { owner: { select: { email: true, name: true, username: true } }, reviewComments2: { select: { id: true } } } });
    if (!p) return res.status(404).json({ msg: 'This review link is not valid or was withdrawn.' });
    const who = name || p.reviewerName || 'Your reviewer';
    const n = p.reviewComments2.length;
    sendEmail({
      to: p.owner.email,
      subject: `${who} ${decision === 'approved' ? 'approved' : 'requested changes on'} "${p.name}"`,
      html: layout(decision === 'approved' ? 'Approved' : 'Changes requested', `<p>${who} ${decision === 'approved' ? 'approved' : 'sent back'} <strong>${p.name}</strong>.</p>${comments ? `<blockquote style="border-left:3px solid #7fab61;margin:12px 0;padding:6px 12px">${comments.replace(/</g, '&lt;')}</blockquote>` : ''}${n ? `<p>${n} note${n === 1 ? '' : 's'} on specific questions are waiting in the project.</p>` : ''}${button(appUrl(`/app/projects/${p.id}`), 'Open the project')}`),
      text: `${who} ${decision === 'approved' ? 'approved' : 'requested changes on'} "${p.name}". ${comments || ''} ${appUrl(`/app/projects/${p.id}`)}`,
    }).catch(() => {});
    await prisma.project.update({
      where: { id: p.id },
      data: { reviewStatus: decision, reviewerName: name || p.reviewerName, reviewComments: comments, reviewRespondedAt: new Date(), status: decision === 'approved' ? 'approved' : 'rejected' },
    });
    res.json({ msg: decision === 'approved' ? 'Approved. Thank you!' : 'Sent back with your notes.' });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/review/:token/comments — leave a note on one question or on the whole proposal
router.post('/:token/comments', async (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 4000);
  const name = req.body.name ? String(req.body.name).trim().slice(0, 120) : null;
  const questionId = req.body.questionId ? String(req.body.questionId) : null;
  if (!body) return res.status(400).json({ msg: 'Write a note first.' });
  try {
    const p = await prisma.project.findUnique({ where: { reviewToken: req.params.token }, select: { id: true } });
    if (!p) return res.status(404).json({ msg: 'This review link is not valid or was withdrawn.' });
    if (questionId) {
      const q = await prisma.question.findUnique({ where: { id: questionId }, select: { projectId: true } });
      if (!q || q.projectId !== p.id) return res.status(400).json({ msg: 'Unknown question.' });
    }
    const c = await prisma.reviewComment.create({ data: { projectId: p.id, questionId, reviewerName: name, body } });
    if (name) await prisma.project.update({ where: { id: p.id }, data: { reviewerName: name } });
    res.json({ id: c.id, questionId: c.questionId, reviewerName: c.reviewerName, body: c.body, createdAt: c.createdAt });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
