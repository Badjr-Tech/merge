const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { requireFeature } = require('../utils/plans.cjs');

router.use(auth, requireFeature(prisma, 'partners'));

const FIELDS = ['name', 'location', 'description', 'website', 'contactName', 'contactEmail', 'tags', 'notes'];
function clean(body) {
  const out = {};
  FIELDS.forEach(k => { if (body[k] !== undefined) out[k] = body[k] === null ? null : String(body[k]).trim().slice(0, 2000) || null; });
  return out;
}
function canEdit(req) { return ['admin', 'editor', 'approver'].includes(req.user.role); }

// GET /api/partners
router.get('/', async (req, res) => {
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const partners = await prisma.partner.findMany({ where: { companyId: req.user.companyId }, orderBy: { name: 'asc' } });
    res.json(partners);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/partners
router.post('/', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ msg: 'Viewers cannot add partners.' });
  const data = clean(req.body);
  if (!data.name) return res.status(400).json({ msg: 'Partner name is required.' });
  try {
    const partner = await prisma.partner.create({ data: { ...data, companyId: req.user.companyId } });
    res.json(partner);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// PUT /api/partners/:id
router.put('/:id', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ msg: 'Viewers cannot edit partners.' });
  try {
    const existing = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Partner not found.' });
    const data = clean(req.body);
    if (data.name === null) delete data.name;
    const partner = await prisma.partner.update({ where: { id: existing.id }, data });
    res.json(partner);
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// DELETE /api/partners/:id
router.delete('/:id', async (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ msg: 'Viewers cannot remove partners.' });
  try {
    const existing = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Partner not found.' });
    await prisma.partner.delete({ where: { id: existing.id } });
    res.json({ msg: 'Partner removed.' });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;
