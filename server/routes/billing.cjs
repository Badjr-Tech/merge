const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { stripe, configured, PRICE_BY_PLAN, PLAN_BY_PRICE, PORTAL_CONFIG, perSeat } = require('../utils/stripe.cjs');
const { PLANS, publicPlan } = require('../utils/plans.cjs');
const { appUrl, sendEmail, layout, button } = require('../utils/email.cjs');
const referrals = require('./referrals.cjs');

async function seatCount(companyId) {
  return Math.max(1, await prisma.user.count({ where: { companyId, isApproved: true } }));
}

// GET /api/billing/status
router.get('/status', auth, async (req, res) => {
  try {
    const c = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { plan: true, kind: true, trialEndsAt: true, compedUntil: true, isStaff: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } });
    const seats = await seatCount(req.user.companyId);
    let billedSeats = null;
    if (c.stripeSubscriptionId && perSeat(c.plan) && configured()) {
      try {
        const sub = await stripe().subscriptions.retrieve(c.stripeSubscriptionId);
        billedSeats = sub.items.data[0].quantity;
      } catch (err) { /* status should still render without Stripe */ }
    }
    res.json({ configured: configured(), hasSubscription: Boolean(c.stripeSubscriptionId), subscriptionStatus: c.subscriptionStatus, currentPeriodEnd: c.currentPeriodEnd, cancelAtPeriodEnd: c.cancelAtPeriodEnd, seats, billedSeats, plan: publicPlan(c) });
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

// PUT /api/billing/auto-reload  { on, qty } — admins choose automatic or manual top-ups
router.put('/auto-reload', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Only admins can change billing settings.' });
  try {
    const data = {};
    if (req.body.on !== undefined) data.reviewAutoReload = Boolean(req.body.on);
    if (req.body.qty !== undefined) data.reviewReloadQty = Math.min(20, Math.max(1, parseInt(req.body.qty, 10) || 5));
    const c = await prisma.company.update({ where: { id: req.user.companyId }, data, select: { reviewAutoReload: true, reviewReloadQty: true, reviewReloadCap: true } });
    res.json({ on: c.reviewAutoReload, qty: c.reviewReloadQty, cap: c.reviewReloadCap });
  } catch (err) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /api/billing/extra-review  { quantity } -> { url }
// Buy extra AI reviewer runs when the plan's allowance is spent. A one-time Checkout payment
// against a fixed price; the credit is granted by the webhook once Stripe confirms payment.
router.post('/extra-review', auth, async (req, res) => {
  if (!configured()) return res.status(503).json({ msg: 'Billing is not set up yet.' });
  if (!PRICE_EXTRA_REVIEW) return res.status(503).json({ msg: 'Extra reviewer runs are not on sale yet. Email merge@badjrtech.com and we will add the run for you.' });
  const quantity = Math.min(20, Math.max(1, parseInt(req.body.quantity, 10) || 1));
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { id: true, name: true, stripeCustomerId: true } });
    if (!company) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });

    let customerId = company.stripeCustomerId;
    if (!customerId) {
      const cust = await stripe().customers.create({ email: user.email, name: company.name, metadata: { companyId: company.id } });
      customerId = cust.id;
      await prisma.company.update({ where: { id: company.id }, data: { stripeCustomerId: customerId } });
    }
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: PRICE_EXTRA_REVIEW, quantity }],
      success_url: appUrl('/app/ai-review?purchased=1'),
      cancel_url: appUrl('/app/ai-review'),
      metadata: { companyId: company.id, kind: 'extra_review', quantity: String(quantity) },
      payment_intent_data: { metadata: { companyId: company.id, kind: 'extra_review', quantity: String(quantity) } },
    });
    res.json({ url: session.url, quantity });
  } catch (err) {
    console.error('Extra review checkout error:', err.message);
    res.status(500).json({ msg: 'Could not start that purchase. Try again.' });
  }
});

// One row per purchased run. Keyed on the Checkout session so a replayed webhook cannot double-grant.
async function grantReviewCredits(companyId, quantity, sessionId) {
  if (!companyId) return;
  const already = await prisma.aiUsage.count({ where: { companyId, feature: 'credit:review', projectId: sessionId } });
  if (already) return;
  await prisma.aiUsage.createMany({ data: Array.from({ length: quantity }, () => ({ companyId, feature: 'credit:review', projectId: sessionId })) });
  console.log(`Granted ${quantity} extra AI review(s) to ${companyId}`);
}

// Auto-reload: charge the card on file for another batch of AI reviewer runs. Only ever called for
// a workspace that opted in, never on a manual plan. Capped per month so a runaway loop cannot
// empty someone's account, and every charge is emailed.
async function autoReloadReviews(companyId) {
  if (!configured() || !PRICE_EXTRA_REVIEW) return { ok: false, reason: 'not_configured' };
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, stripeCustomerId: true, reviewAutoReload: true, reviewReloadQty: true, reviewReloadCap: true } });
  if (!company || !company.reviewAutoReload) return { ok: false, reason: 'off' };
  if (!company.stripeCustomerId) return { ok: false, reason: 'no_customer' };

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const reloads = await prisma.aiUsage.count({ where: { companyId, feature: 'reload:review', createdAt: { gte: monthStart } } });
  if (reloads >= company.reviewReloadCap) return { ok: false, reason: 'cap_reached', cap: company.reviewReloadCap };

  const qty = Math.min(20, Math.max(1, company.reviewReloadQty || 5));
  try {
    const customer = await stripe().customers.retrieve(company.stripeCustomerId);
    let method = customer.invoice_settings && customer.invoice_settings.default_payment_method;
    if (!method) {
      const methods = await stripe().paymentMethods.list({ customer: company.stripeCustomerId, type: 'card', limit: 1 });
      method = methods.data[0] && methods.data[0].id;
    }
    if (!method) return { ok: false, reason: 'no_card' };

    // Bill the catalogue item, not a bare amount: the customer's invoice then reads
    // "Merge — Extra AI reviewer run x5" instead of an unexplained charge.
    await stripe().invoiceItems.create({
      customer: company.stripeCustomerId,
      price: PRICE_EXTRA_REVIEW,
      quantity: qty,
      metadata: { companyId, kind: 'extra_review_autoreload' },
    });
    const draft = await stripe().invoices.create({
      customer: company.stripeCustomerId,
      collection_method: 'charge_automatically',
      default_payment_method: method,
      auto_advance: false,
      description: 'Extra AI reviewer runs',
      metadata: { companyId, kind: 'extra_review_autoreload', quantity: String(qty) },
    });
    const invoice = await stripe().invoices.pay(draft.id, { off_session: true });
    if (invoice.status !== 'paid') return { ok: false, reason: 'declined' };

    await prisma.aiUsage.createMany({ data: Array.from({ length: qty }, () => ({ companyId, feature: 'credit:review', projectId: invoice.id })) });
    await prisma.aiUsage.create({ data: { companyId, feature: 'reload:review', projectId: invoice.id } });

    const admins = await prisma.user.findMany({ where: { companyId, role: 'admin', isApproved: true }, select: { email: true, name: true, username: true } });
    const total = (invoice.amount_paid / 100).toFixed(2);
    for (const a of admins) {
      await sendEmail({
        to: a.email,
        subject: `Merge added ${qty} AI reviewer run${qty === 1 ? '' : 's'} — $${total}`,
        html: layout('Auto-reload', `<p>Hi ${a.name || a.username},</p><p><strong>${company.name}</strong> ran out of AI reviewer runs, so Merge bought ${qty} more at $1.99 each — <strong>$${total}</strong> charged to the card on file.</p><p>You can switch this off or change how many are bought at a time under Settings.</p>${button(appUrl('/app/settings#ai-usage'), 'Review the setting')}`),
        text: `Merge bought ${qty} more AI reviewer runs for ${company.name} at $1.99 each ($${total}). Change or switch off auto-reload: ${appUrl('/app/settings#ai-usage')}`,
      });
    }
    return { ok: true, quantity: qty };
  } catch (err) {
    console.error('Auto-reload failed:', err.message);
    return { ok: false, reason: 'error' };
  }
}

// Seat billing policy: a seat you add is charged right away (prorated for the rest of the month);
// a seat you remove stays paid through the end of the billing period it was removed in. So the
// Stripe quantity only ever goes UP mid-period. Removals are applied at renewal by
// applySeatsAtRenewal(), which the invoice webhook calls once the new period has started.
async function syncSeats(companyId) {
  try {
    const c = await prisma.company.findUnique({ where: { id: companyId }, select: { plan: true, stripeSubscriptionId: true } });
    if (!c || !c.stripeSubscriptionId || !perSeat(c.plan) || !configured()) return;
    const sub = await stripe().subscriptions.retrieve(c.stripeSubscriptionId);
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) return;
    const seats = await seatCount(companyId);
    const billed = sub.items.data[0].quantity;
    if (seats <= billed) return; // removals wait for the renewal
    await stripe().subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, quantity: seats }], proration_behavior: 'create_prorations' });
  } catch (err) { console.error('Seat sync error:', err.message); }
}

// At renewal the billed quantity drops to the seats actually in use. No proration: the new period
// simply starts at the real number.
async function applySeatsAtRenewal(subscriptionId) {
  try {
    if (!configured()) return;
    const sub = await stripe().subscriptions.retrieve(subscriptionId);
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) return;
    const company = await prisma.company.findFirst({ where: { stripeSubscriptionId: sub.id }, select: { id: true, plan: true } });
    if (!company || !perSeat(company.plan)) return;
    const seats = await seatCount(company.id);
    const billed = sub.items.data[0].quantity;
    if (seats >= billed) return;
    await stripe().subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, quantity: seats }], proration_behavior: 'none' });
  } catch (err) { console.error('Seat renewal error:', err.message); }
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
        if (s.mode === 'payment' && s.metadata && s.metadata.kind === 'extra_review' && s.payment_status === 'paid') {
          await grantReviewCredits(s.metadata.companyId, parseInt(s.metadata.quantity, 10) || 1, s.id);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const inv = event.data.object;
        // A renewal invoice means a new period started — drop to the seats actually in use.
        if (inv.subscription && inv.billing_reason === 'subscription_cycle') await applySeatsAtRenewal(inv.subscription);
        break;
      }
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

module.exports = { router, webhook, syncSeats, applySeatsAtRenewal, autoReloadReviews };
