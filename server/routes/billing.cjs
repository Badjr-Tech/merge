const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { stripe, configured, PRICE_BY_PLAN, PLAN_BY_PRICE, PORTAL_CONFIG, perSeat } = require('../utils/stripe.cjs');
const { PLANS, publicPlan } = require('../utils/plans.cjs');
const { appUrl } = require('../utils/email.cjs');
const referrals = require('./referrals.cjs');

async function seatCount(companyId) {
  return Math.max(1, await prisma.user.count({ where: { companyId, isApproved: true } }));
}

// GET /api/billing/status
router.get('/status', auth, async (req, res) => {
  try {
    const c = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { plan: true, kind: true, trialEndsAt: true, compedUntil: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } });
    res.json({ configured: configured(), hasSubscription: Boolean(c.stripeSubscriptionId), subscriptionStatus: c.subscriptionStatus, currentPeriodEnd: c.currentPeriodEnd, cancelAtPeriodEnd: c.cancelAtPeriodEnd, seats: await seatCount(req.user.companyId), plan: publicPlan(c) });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/billing/checkout  { plan } -> { url }
router.post('/checkout', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Only admins can change the plan.' });
  if (!configured()) return res.status(503).json({ msg: 'Billing is not set up yet.' });
  const plan = String(req.body.plan || '');
  const price = PRICE_BY_PLAN[plan];
  if (!price || !PLANS[plan]) return res.status(400).json({ msg: 'Unknown plan.' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, include: { _count: { select: { users: true } } } });
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true } });
    if (PLANS[plan].track !== 'both' && PLANS[plan].track !== company.kind) return res.status(400).json({ msg: `${PLANS[plan].name} is for ${PLANS[plan].track === 'writer' ? 'grant writer' : 'organization'} workspaces. Switch the workspace type in Settings first.` });
    const seats = perSeat(plan) ? await seatCount(company.id) : 1;
    if (PLANS[plan].limits.seats !== null && seats > PLANS[plan].limits.seats) return res.status(400).json({ msg: `${PLANS[plan].name} allows up to ${PLANS[plan].limits.seats} people and your workspace has ${seats}.` });

    // Existing subscription: change it in place rather than starting a second one
    if (company.stripeSubscriptionId) {
      const sub = await stripe().subscriptions.retrieve(company.stripeSubscriptionId);
      if (['active', 'trialing', 'past_due'].includes(sub.status)) {
        await stripe().subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, price, quantity: seats }], proration_behavior: 'create_prorations', cancel_at_period_end: false, metadata: { companyId: company.id, plan } });
        await prisma.company.update({ where: { id: company.id }, data: { plan, trialEndsAt: null, cancelAtPeriodEnd: false } });
        return res.json({ updated: true, plan });
      }
    }

    let customerId = company.stripeCustomerId;
    if (!customerId) {
      const cust = await stripe().customers.create({ email: user.email, name: company.name, metadata: { companyId: company.id } });
      customerId = cust.id;
      await prisma.company.update({ where: { id: company.id }, data: { stripeCustomerId: customerId } });
    }
    const discounts = company.referredByCode && !company.stripeSubscriptionId ? [{ coupon: referrals.REFERRED_COUPON }] : undefined;
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: seats }],
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      success_url: appUrl('/app/settings?billing=success'),
      cancel_url: appUrl('/app/settings?billing=cancel'),
      subscription_data: { metadata: { companyId: company.id, plan } },
      metadata: { companyId: company.id, plan },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ msg: 'Could not start checkout. Try again.' });
  }
});

// POST /api/billing/portal -> { url }
router.post('/portal', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Only admins can manage billing.' });
  if (!configured()) return res.status(503).json({ msg: 'Billing is not set up yet.' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { stripeCustomerId: true } });
    if (!company.stripeCustomerId) return res.status(400).json({ msg: 'No billing account yet. Pick a plan first.' });
    const session = await stripe().billingPortal.sessions.create({ customer: company.stripeCustomerId, configuration: PORTAL_CONFIG, return_url: appUrl('/app/settings') });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err.message);
    res.status(500).json({ msg: 'Could not open billing. Try again.' });
  }
});

// POST /api/billing/cancel — cancel at period end, no portal round-trip. Keeps access until the paid period ends.
router.post('/cancel', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Only admins can cancel the plan.' });
  try {
    const c = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { stripeSubscriptionId: true, plan: true, trialEndsAt: true } });
    if (!c.stripeSubscriptionId) {
      // No paid subscription (trial or free): drop to Free immediately
      await prisma.company.update({ where: { id: req.user.companyId }, data: { plan: 'free', trialEndsAt: null } });
      return res.json({ msg: 'Your workspace is now on the Free plan.', immediate: true });
    }
    const sub = await stripe().subscriptions.update(c.stripeSubscriptionId, { cancel_at_period_end: true });
    const ends = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
    await prisma.company.update({ where: { id: req.user.companyId }, data: { cancelAtPeriodEnd: true, currentPeriodEnd: ends } });
    res.json({ msg: `Cancelled. You keep full access until ${ends ? ends.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'the end of the billing period'}, then move to Free. No further charges.`, endsAt: ends });
  } catch (err) {
    console.error('Cancel error:', err.message);
    res.status(500).json({ msg: 'Could not cancel right now. Email merge@badjrtech.com and we will do it for you.' });
  }
});

// POST /api/billing/resume — undo a pending cancellation
router.post('/resume', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Only admins can change the plan.' });
  try {
    const c = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { stripeSubscriptionId: true } });
    if (!c.stripeSubscriptionId) return res.status(400).json({ msg: 'No subscription to resume.' });
    await stripe().subscriptions.update(c.stripeSubscriptionId, { cancel_at_period_end: false });
    await prisma.company.update({ where: { id: req.user.companyId }, data: { cancelAtPeriodEnd: false } });
    res.json({ msg: 'Your plan will continue.' });
  } catch (err) { res.status(500).json({ msg: 'Could not resume. Try again.' }); }
});

// POST /api/billing/sync-seats — called after invites/removals so per-seat subscriptions stay accurate
async function syncSeats(companyId) {
  try {
    const c = await prisma.company.findUnique({ where: { id: companyId }, select: { plan: true, stripeSubscriptionId: true } });
    if (!c || !c.stripeSubscriptionId || !perSeat(c.plan) || !configured()) return;
    const sub = await stripe().subscriptions.retrieve(c.stripeSubscriptionId);
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) return;
    const seats = await seatCount(companyId);
    if (sub.items.data[0].quantity !== seats) await stripe().subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, quantity: seats }], proration_behavior: 'create_prorations' });
  } catch (err) { console.error('Seat sync error:', err.message); }
}

// Webhook (raw body required; mounted before express.json in server.cjs)
async function applySubscription(sub) {
  const companyId = sub.metadata && sub.metadata.companyId;
  const priceId = sub.items && sub.items.data[0] && sub.items.data[0].price.id;
  const plan = (sub.metadata && sub.metadata.plan) || PLAN_BY_PRICE[priceId];
  let company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  if (!company) company = await prisma.company.findUnique({ where: { stripeCustomerId: sub.customer } });
  if (!company) { console.warn('Webhook: no company for subscription', sub.id); return; }
  const active = ['active', 'trialing', 'past_due'].includes(sub.status);
  const wasUnpaid = !company.stripeSubscriptionId;
  await prisma.company.update({
    where: { id: company.id },
    data: {
      stripeCustomerId: sub.customer,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      plan: active && plan && PLANS[plan] ? plan : 'free',
      trialEndsAt: active ? null : company.trialEndsAt,
    },
  });
  if (active && wasUnpaid && company.referredByCode) referrals.onReferredPaid(company.id, stripe()).catch(() => {});
}

async function webhook(req, res) {
  if (!configured()) return res.status(503).end();
  let event;
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    event = secret ? stripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret) : JSON.parse(req.body.toString());
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.mode === 'subscription' && s.subscription) applySubscription(await stripe().subscriptions.retrieve(s.subscription));
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object);
        break;
      case 'invoice.payment_failed': {
        const inv = event.data.object;
        if (inv.subscription) await applySubscription(await stripe().subscriptions.retrieve(inv.subscription));
        break;
      }
      default: break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ msg: 'Webhook failed' });
  }
}

module.exports = { router, webhook, syncSeats };
