// Checks (and with --apply, fixes) the Stripe catalog against server/utils/plans.cjs.
//
// Merge never creates products or prices at checkout: every subscription charges one of the
// seven fixed price IDs in utils/stripe.cjs. This script confirms each of those prices still
// exists, is active, and costs what the app advertises, and keeps the product's name,
// description, and metadata in step with the plan table.
//
//   node scripts/stripe-catalog.cjs           # report only
//   node scripts/stripe-catalog.cjs --apply   # also write names/descriptions/metadata
require('dotenv').config();
const { PLANS } = require('../utils/plans.cjs');
const { stripe, PRICE_BY_PLAN, perSeat } = require('../utils/stripe.cjs');

const APPLY = process.argv.includes('--apply');

// Fallback copy, only used for a product that has no description at all.
const BLURB = {
  writer: 'For one grant writer. Unlimited grants, answer bank, file cabinet, grant calendar, and send-for-review links.',
  writer_pro: 'Everything in Starter plus Ask Merge, the AI reviewer, partners, past proposals, and an editable document with version history.',
  professional: 'Everything in Premium plus multiple workspaces (one per client), integrations, higher AI limits, and priority support.',
  org_solo: 'For a one-person organization. Unlimited grants, Ask Merge, the AI reviewer, partners, past proposals, and send-for-review links.',
  small_team: 'For teams up to 5. Assign questions, track progress, run approvals, and merge every answer into one narrative.',
  large_team: 'For teams up to 20. Everything in Small Teams plus multiple workspaces.',
  company: 'For unlimited people. Everything in Large Teams plus integrations, custom branding, and priority support.',
};

function money(cents) { return `$${(cents / 100).toFixed(2)}`; }

async function main() {
  const problems = [];
  for (const [key, priceId] of Object.entries(PRICE_BY_PLAN)) {
    const plan = PLANS[key];
    const label = `${plan.name} (${key})`;
    let price;
    try {
      price = await stripe().prices.retrieve(priceId, { expand: ['product'] });
    } catch (err) {
      problems.push(`${label}: price ${priceId} not found in this Stripe account — ${err.message}`);
      continue;
    }
    const expected = Math.round(plan.price * 100);
    const notes = [];
    if (!price.active) notes.push('price is archived');
    if (price.unit_amount !== expected) notes.push(`charges ${money(price.unit_amount)}, app advertises ${money(expected)}`);
    if (!price.recurring || price.recurring.interval !== 'month') notes.push('is not a monthly recurring price');
    const wantsSeats = perSeat(key);
    if (wantsSeats && price.recurring && price.recurring.usage_type !== 'licensed') notes.push('per-seat plan needs a licensed (quantity-based) price');
    if (notes.length) problems.push(`${label}: ${notes.join('; ')}`);

    // Only flag what is actually missing — hand-written product copy in Stripe is left alone.
    const product = price.product;
    const missing = [];
    if (!product.name) missing.push('name');
    if (!product.description) missing.push('description');
    if (product.metadata.plan !== key) missing.push(`metadata.plan=${key}`);
    if (!product.active) missing.push('product is archived');
    console.log(`${label.padEnd(28)} ${priceId}  ${money(price.unit_amount)}${wantsSeats ? '/person' : ''}/mo  ${price.active ? 'active' : 'ARCHIVED'}  ${missing.length ? (APPLY ? `→ filling in ${missing.join(', ')}` : `missing ${missing.join(', ')}`) : 'product ok'}`);
    if (missing.length && APPLY) {
      await stripe().products.update(product.id, {
        name: product.name || `Merge ${plan.name}`,
        description: product.description || BLURB[key],
        metadata: { ...product.metadata, plan: key },
      });
    }
  }
  if (problems.length) {
    console.log('\nProblems:');
    problems.forEach(p => console.log(' - ' + p));
    process.exitCode = 1;
  } else {
    console.log('\nEvery plan maps to a live price that matches the app. No products or prices are created at checkout.');
  }
  if (!APPLY) console.log('Report only. Re-run with --apply to fill in anything missing (existing copy is never overwritten).');
}

main().catch(err => { console.error(err.message); process.exit(1); });
