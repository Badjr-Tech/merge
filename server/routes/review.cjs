const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma.cjs');

async function load(token) {
  return prisma.project.findUnique({
    where: { reviewToken: token },
    include: { company: { select: { name: true } }, owner: { select: { name: true, username: true } }, narrative: true, questions: { orderBy: { createdAt: 'asc' }, select: { text: true, answer: true } } },
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
    const p = await prisma.project.findUnique({ where: { reviewToken: req.params.token } });
    if (!p) return res.status(404).json({ msg: 'This review link is not valid or was withdrawn.' });
    await prisma.project.update({
      where: { id: p.id },
      data: { reviewStatus: decision, reviewerName: name || p.reviewerName, reviewComments: comments, reviewRespondedAt: new Date(), status: decision === 'approved' ? 'approved' : 'rejected' },
    });
    res.json({ msg: decision === 'approved' ? 'Approved. Thank you!' : 'Sent back with your notes.' });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
