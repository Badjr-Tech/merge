const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { publicPlan, PLANS, catalogue, normalizeKey } = require('../utils/plans.cjs');

// GET /api/companies/mine — the caller's workspace with a few stats
router.get('/mine', auth, async (req, res) => {
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: {
        id: true, name: true, createdAt: true, profile: true, plan: true, kind: true, trialEndsAt: true, compedUntil: true, compNote: true,
        _count: { select: { users: true, projects: true, files: true } },
      },
    });
    const totalProjects = await prisma.project.count({ where: { companyId: req.user.companyId } });
    res.json({ ...company, planInfo: publicPlan(company), usage: { totalProjects, seats: company._count.users } });
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

    const { generateText } = require('../utils/gemini.cjs');
    const prompt = `You are helping a nonprofit set up its grant-writing profile. Read this text from their website and fill in the JSON fields below using only information that is actually present. Leave a field as an empty string if the site does not say. Write in plain, specific sentences (2-5 each), in the organization's own voice.\n\nFields:\n- mission: what the organization exists to do\n- philosophy: values, beliefs, or approach that guide the work\n- programs: the main programs or services offered\n- audience: who they serve and where\n- impact: concrete results, numbers, history, or milestones mentioned\n- tone: 3-6 adjectives describing how the site is written\n\nReturn JSON with exactly those keys.\n\nWEBSITE TEXT:\n${text}`;
    const raw = await generateText(prompt, { generationConfig: { responseMimeType: 'application/json' } });
    let draft = {};
    try { draft = JSON.parse(raw); } catch { return res.status(500).json({ msg: 'The AI returned an unexpected format. Try again.' }); }
    res.json({ profile: { ...cleanProfile(draft), website: url } });
  } catch (err) {
    console.error('Profile import error:', err.message);
    res.status(500).json({ msg: err.name === 'AbortError' ? 'That site took too long to respond.' : 'Could not import from that website.' });
  }
});

// PUT /api/companies/mine/plan — change plan (admin). Billing is not wired yet; this is the switch Stripe will flip later.
router.put('/mine/plan', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  const plan = normalizeKey(String(req.body.plan || ''));
  if (!PLANS[plan]) return res.status(400).json({ msg: 'Pick one of the listed plans.' });
  const billing = require('../utils/stripe.cjs');
  if (billing.configured() && plan !== 'free') return res.status(400).json({ msg: 'Paid plans are set up through checkout.', checkout: true });
  try {
    const current = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { kind: true } });
    const kind = current.kind === 'writer' ? 'writer' : 'team';
    if (plan !== 'free' && PLANS[plan].track !== kind) return res.status(400).json({ msg: `${PLANS[plan].name} is a ${PLANS[plan].track} plan. Switch your workspace type first.` });
    const before = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { stripeSubscriptionId: true } });
    if (plan === 'free' && before.stripeSubscriptionId && billing.configured()) {
      try { await billing.stripe().subscriptions.update(before.stripeSubscriptionId, { cancel_at_period_end: true }); } catch (e) { console.error('Cancel error:', e.message); }
      const company = await prisma.company.update({ where: { id: req.user.companyId }, data: { cancelAtPeriodEnd: true }, select: { id: true, plan: true, trialEndsAt: true, kind: true } });
      return res.json({ ...company, planInfo: publicPlan(company), msg: 'Your plan will end at the close of the current billing period.' });
    }
    // Picking a plan ends the trial; the chosen plan applies immediately.
    const company = await prisma.company.update({ where: { id: req.user.companyId }, data: { plan, trialEndsAt: null }, select: { id: true, plan: true, trialEndsAt: true, kind: true } });
    res.json({ ...company, planInfo: publicPlan(company) });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /api/companies/plans — public catalogue for the pricing page and upgrade prompts
router.get('/plans', (req, res) => {
  res.json(catalogue());
});

// PUT /api/companies/mine/kind — switch between a writer workspace and a team workspace (admin)
router.put('/mine/kind', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admins only.' });
  const kind = req.body.kind === 'writer' ? 'writer' : 'team';
  try {
    const current = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { kind: true, plan: true, trialEndsAt: true, _count: { select: { users: true } } } });
    if (kind === 'writer' && current._count.users > 1) return res.status(400).json({ msg: 'A writer workspace is for one person. Remove other members on the Team page first.' });
    // Keep a paid plan only if it belongs to the new track; otherwise fall back to Free (trial ends).
    const keep = current.plan && PLANS[normalizeKey(current.plan)] && PLANS[normalizeKey(current.plan)].track === kind && normalizeKey(current.plan) !== 'free';
    const data = { kind };
    if (!keep) { data.plan = 'free'; data.trialEndsAt = null; }
    const company = await prisma.company.update({ where: { id: req.user.companyId }, data, select: { id: true, kind: true, plan: true, trialEndsAt: true } });
    res.json({ ...company, planInfo: publicPlan(company) });
  } catch (err) { console.error(err); res.status(500).json({ msg: 'Server error' }); }
});

module.exports = router;

