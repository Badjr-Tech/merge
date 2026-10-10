// Read-only audit: does every live Stripe subscription match what Merge thinks it is?
// Checks the price is one of ours, the workspace's stored plan agrees, the seat quantity matches
// the people actually in the workspace, and the amount equals the advertised price.
require('dotenv').config();
const prisma = require('../utils/prisma.cjs');
const { stripe, configured, PLAN_BY_PRICE, perSeat } = require('../utils/stripe.cjs');
const { PLANS, normalizeKey } = require('../utils/plans.cjs');

async function main() {
  if (!configured()) { console.log('STRIPE_SECRET_KEY is not set.'); process.exit(1); }
  const subs = [];
  for await (const s of stripe().subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer'] })) subs.push(s);
  if (!subs.length) { console.log('No subscriptions in this Stripe account yet.'); return; }

  const problems = [];
  console.log(`${subs.length} subscription(s)\n`);
  for (const sub of subs) {
    const item = sub.items.data[0];
    const priceId = item && item.price && item.price.id;
    const planKey = PLAN_BY_PRICE[priceId];
    const company = await prisma.company.findFirst({ where: { stripeSubscriptionId: sub.id }, select: { id: true, name: true, plan: true } });
    const name = company ? company.name : (sub.customer && sub.customer.name) || sub.customer;
    const notes = [];

    if (!planKey) notes.push(`price ${priceId} is not one of Merge's plan prices`);
    if (!company) notes.push('no workspace in the database points at this subscription');
    else if (planKey && normalizeKey(company.plan) !== planKey) notes.push(`workspace is stored as "${company.plan}" but is billed for "${planKey}"`);

    if (planKey && ['active', 'trialing', 'past_due'].includes(sub.status)) {
      const def = PLANS[planKey];
      const expected = Math.round(def.price * 100);
      if (item.price.unit_amount !== expected) notes.push(`charges $${(item.price.unit_amount / 100).toFixed(2)}, the site says $${def.price.toFixed(2)}`);
      if (company && perSeat(planKey)) {
        const seats = await prisma.user.count({ where: { companyId: company.id, isApproved: true } });
        if (item.quantity < seats) notes.push(`billed for ${item.quantity} seats but ${seats} people are in the workspace`);
        else if (item.quantity > seats) notes.push(`billed for ${item.quantity} seats, ${seats} in use — expected if someone was removed mid-period`);
      }
      if (def.limits.seats !== null && company) {
        const seats = await prisma.user.count({ where: { companyId: company.id, isApproved: true } });
        if (seats > def.limits.seats) notes.push(`${seats} people on a plan that allows ${def.limits.seats}`);
      }
    }

    const money = item ? `$${((item.price.unit_amount * (item.quantity || 1)) / 100).toFixed(2)}/mo` : '—';
    console.log(`${String(name).slice(0, 26).padEnd(28)}${(planKey ? PLANS[planKey].name : 'UNKNOWN PLAN').padEnd(15)}${sub.status.padEnd(10)}${String(item && item.quantity || 1).padStart(3)} seat(s)${money.padStart(12)}${notes.length ? '  <-- see below' : ''}`);
    notes.forEach(n => problems.push(`${name}: ${n}`));
  }

  if (problems.length) { console.log('\nMismatches:'); problems.forEach(p => console.log(' - ' + p)); process.exitCode = 1; }
  else console.log('\nEvery subscription matches the plan table and the seats in its workspace.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
