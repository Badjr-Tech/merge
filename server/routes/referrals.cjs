const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { planFor } = require('../utils/plans.cjs');
const { appUrl } = require('../utils/email.cjs');

// Referral program lives on the top two tiers of each track.
const ELIGIBLE = new Set(['writer_pro', 'professional', 'large_team', 'company']);
const REFERRED_COUPON = 'MERGE_REFERRED_10';   // 10% off first 3 months
const REFERRER_COUPON = 'MERGE_REFERRER_5';    // $5 off once, per paid referral

function makeCode(name) {
  const base = (name || 'MERGE').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6) || 'MERGE';
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${rand}`;
}

function eligible(company) {
  const p = planFor(company);
  return ELIGIBLE.has(p.key) && !p.trialing;
}

// GET /api/referrals/mine
router.get('/mine', auth, async (req, res) => {
  try {
    let c = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { id: true, name: true, plan: true, kind: true, trialEndsAt: true, referralCode: true } });
    const ok = eligible(c);
    if (ok && !c.referralCode) {
      let code; let tries = 0;
      do { code = makeCode(c.name); tries += 1; } while (tries < 5 && await prisma.company.findUnique({ where: { referralCode: code } }));
      c = await prisma.company.update({ where: { id: c.id }, data: { referralCode: code }, select: { id: true, name: true, plan: true, kind: true, trialEndsAt: true, referralCode: true } });
    }
    const referrals = await prisma.referral.findMany({ where: { referrerId: c.id }, orderBy: { createdAt: 'desc' } });
    const referredNames = referrals.length ? await prisma.company.findMany({ where: { id: { in: referrals.map(r => r.referredId) } }, select: { id: true, name: true } }) : [];
    const nameById = Object.fromEntries(referredNames.map(x => [x.id, x.name]));
    res.json({
      eligible: ok,
      code: ok ? c.referralCode : null,
      link: ok ? appUrl(`/signup?ref=${c.referralCode}`) : null,
      reward: { referrer: '$5 off your next invoice for every referral that becomes a paying customer', referred: '10% off their first 3 months' },
      referrals: referrals.map(r => ({ id: r.id, workspace: nameById[r.referredId] || 'A workspace', status: r.status, createdAt: r.createdAt, paidAt: r.paidAt, rewardedAt: r.rewardedAt })),
      earned: referrals.filter(r => r.status === 'rewarded').length * 5,
      pending: referrals.filter(r => r.status === 'signed_up').length,
    });
  } catch (err) { console.error(err); res.status(500).json({ msg: 'Server error' }); }
});

// GET /api/referrals/check/:code (public) — used by the signup page to confirm a code
router.get('/check/:code', async (req, res) => {
  try {
    const c = await prisma.company.findUnique({ where: { referralCode: String(req.params.code).toUpperCase() }, select: { name: true, plan: true, kind: true, trialEndsAt: true } });
    if (!c || !eligible(c)) return res.status(404).json({ msg: 'That referral code is not valid.' });
    res.json({ valid: true, from: c.name, discount: '10% off your first 3 months' });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// Called from signup: record the referral (no reward until the referred workspace pays)
async function recordReferral(referredCompanyId, code) {
  if (!code) return;
  const referrer = await prisma.company.findUnique({ where: { referralCode: String(code).toUpperCase() }, select: { id: true, plan: true, kind: true, trialEndsAt: true } });
  if (!referrer || !eligible(referrer) || referrer.id === referredCompanyId) return;
  await prisma.company.update({ where: { id: referredCompanyId }, data: { referredByCode: String(code).toUpperCase() } });
  await prisma.referral.create({ data: { referrerId: referrer.id, referredId: referredCompanyId } }).catch(() => {});
}

// Called from the webhook when a subscription becomes active: apply the referrer's reward once
async function onReferredPaid(referredCompanyId, stripe) {
  const ref = await prisma.referral.findUnique({ where: { referredId: referredCompanyId } });
  if (!ref || ref.status !== 'signed_up') return;
  const referrer = await prisma.company.findUnique({ where: { id: ref.referrerId }, select: { stripeCustomerId: true, stripeSubscriptionId: true } });
  await prisma.referral.update({ where: { id: ref.id }, data: { status: 'paid', paidAt: new Date() } });
  if (referrer && referrer.stripeCustomerId) {
    try {
      // Stripe: a customer-level balance credit is the simplest "$5 off next invoice"
      await stripe.customers.createBalanceTransaction(referrer.stripeCustomerId, { amount: -500, currency: 'usd', description: 'Merge referral reward: $5 off' });
      await prisma.referral.update({ where: { id: ref.id }, data: { status: 'rewarded', rewardedAt: new Date() } });
    } catch (err) { console.error('Referral reward error:', err.message); }
  }
}

module.exports = { router, recordReferral, onReferredPaid, REFERRED_COUPON, REFERRER_COUPON };
