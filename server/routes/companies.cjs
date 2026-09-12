const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { publicPlan, PLANS } = require('../utils/plans.cjs');

// GET /api/companies/mine — the caller's workspace with a few stats
router.get('/mine', auth, async (req, res) => {
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: {
        id: true, name: true, createdAt: true, profile: true, plan: true, trialEndsAt: true,
        _count: { select: { users: true, projects: true, files: true } },
      },
    });
    const activeProjects = await prisma.project.count({ where: { companyId: req.user.companyId, isArchived: false, isCompleted: false } });
    res.json({ ...company, planInfo: publicPlan(company), usage: { activeProjects, seats: company._count.users } });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/companies — kept for compatibility; only returns the caller's own workspace
router.get('/', auth, async (req, res) => {
  try {
    if (!req.user.companyId) return res.json([]);
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { id: true, name: true, isArchived: true } });
    res.json(company ? [company] : []);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/companies/mine — rename the workspace (admin)
router.put('/mine', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ msg: 'Workspace name is required.' });
  try {
    const taken = await prisma.company.findUnique({ where: { name } });
    if (taken && taken.id !== req.user.companyId) return res.status(400).json({ msg: 'That workspace name is taken.' });
    const company = await prisma.company.update({ where: { id: req.user.companyId }, data: { name }, select: { id: true, name: true } });
    res.json(company);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

const PROFILE_FIELDS = ['mission', 'philosophy', 'programs', 'audience', 'impact', 'website', 'tone', 'notes'];

function cleanProfile(input) {
  const out = {};
  PROFILE_FIELDS.forEach(k => { if (input && typeof input[k] === 'string') out[k] = input[k].trim().slice(0, 4000); });
  return out;
}

// PUT /api/companies/mine/profile — organization profile used by the assistant (admin or editor)
router.put('/mine/profile', auth, async (req, res) => {
  if (!['admin', 'editor'].includes(req.user.role)) return res.status(403).json({ msg: 'Only admins and editors can edit the organization profile.' });
  try {
    const company = await prisma.company.update({ where: { id: req.user.companyId }, data: { profile: cleanProfile(req.body) }, select: { id: true, profile: true } });
    res.json(company);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/companies/mine/profile/import — read the organization's website and draft profile fields
router.post('/mine/profile/import', auth, async (req, res) => {
  if (!['admin', 'editor'].includes(req.user.role)) return res.status(403).json({ msg: 'Only admins and editors can import a profile.' });
  let url = String(req.body.url || '').trim();
  if (!url) return res.status(400).json({ msg: 'Enter your website address.' });
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ msg: 'AI is not configured on the server.' });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const pageRes = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MergeBot/1.0)' }, redirect: 'follow' });
    clearTimeout(timer);
    if (!pageRes.ok) return res.status(400).json({ msg: `Could not load that page (status ${pageRes.status}).` });
    const html = await pageRes.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim().slice(0, 20000);
    if (text.length < 200) return res.status(400).json({ msg: 'That page has very little readable text. Try the About page.' });

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite', generationConfig: { responseMimeType: 'application/json' } });
    const prompt = `You are helping a nonprofit set up its grant-writing profile. Read this text from their website and fill in the JSON fields below using only information that is actually present. Leave a field as an empty string if the site does not say. Write in plain, specific sentences (2-5 each), in the organization's own voice.\n\nFields:\n- mission: what the organization exists to do\n- philosophy: values, beliefs, or approach that guide the work\n- programs: the main programs or services offered\n- audience: who they serve and where\n- impact: concrete results, numbers, history, or milestones mentioned\n- tone: 3-6 adjectives describing how the site is written\n\nReturn JSON with exactly those keys.\n\nWEBSITE TEXT:\n${text}`;
    const result = await model.generateContent(prompt);
    let draft = {};
    try { draft = JSON.parse(result.response.text()); } catch { return res.status(500).json({ msg: 'The AI returned an unexpected format. Try again.' }); }
    res.json({ profile: { ...cleanProfile(draft), website: url } });
  } catch (err) {
    console.error('Profile import error:', err.message);
    res.status(500).json({ msg: err.name === 'AbortError' ? 'That site took too long to respond.' : 'Could not import from that website.' });
  }
});

// PUT /api/companies/mine/plan — change plan (admin). Billing is not wired yet; this is the switch Stripe will flip later.
router.put('/mine/plan', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  const plan = String(req.body.plan || '');
  if (!PLANS[plan] || plan === 'custom') return res.status(400).json({ msg: 'Choose Free, Starter, Premium, or Enterprise. Contact us for Custom.' });
  try {
    // Picking a plan ends the trial; the chosen plan applies immediately.
    const company = await prisma.company.update({ where: { id: req.user.companyId }, data: { plan, trialEndsAt: null }, select: { id: true, plan: true, trialEndsAt: true } });
    res.json({ ...company, planInfo: publicPlan(company) });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /api/companies/plans — public catalogue for the pricing page and upgrade prompts
router.get('/plans', (req, res) => {
  res.json(Object.entries(PLANS).map(([key, p]) => ({ key, name: p.name, price: p.price, per: p.per, features: p.features, limits: p.limits })));
});

module.exports = router;

