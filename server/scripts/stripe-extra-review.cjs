// Creates the one-off "Extra AI reviewer run" product in Stripe, once. Safe to re-run: it finds the
// existing product by metadata and prints its price id rather than making a second one. The app only
// ever references this price (STRIPE_PRICE_EXTRA_REVIEW) — it never creates items at checkout.
//
//   node scripts/stripe-extra-review.cjs           # report
//   node scripts/stripe-extra-review.cjs --create  # create it if it does not exist
require('dotenv').config();
const { stripe, configured } = require('../utils/stripe.cjs');

const CREATE = process.argv.includes('--create');

async function main() {
  if (!configured()) { console.log('STRIPE_SECRET_KEY is not set.'); process.exit(1); }
  // products.search is eventually consistent and misses a product created seconds ago, so scan
  // the catalogue instead — it is small and always current.
  const all = await stripe().products.list({ limit: 100, active: true });
  const found = all.data.filter(p => p.metadata && p.metadata.kind === 'extra_review');
  if (found.length) {
    const product = found[0];
    if (found.length > 1) console.log(`WARNING: ${found.length} extra-review products exist — archive the spares in Stripe.`);
    const prices = await stripe().prices.list({ product: product.id, active: true });
    const price = prices.data[0];
    console.log(`Exists: ${product.id} — ${product.name}`);
    console.log(`Price : ${price ? `${price.id} — $${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()} (one-time)` : 'none active'}`);
    console.log(`\nSet STRIPE_PRICE_EXTRA_REVIEW=${price ? price.id : '<price id>'}`);
    const live = process.env.STRIPE_PRICE_EXTRA_REVIEW;
    console.log(live ? (live === (price && price.id) ? 'The env var matches. Nothing to do.' : `WARNING: env var is ${live}, which is not this price.`) : 'The env var is not set, so extra runs are not on sale.');
    return;
  }
  if (!CREATE) { console.log('No extra-review product in this Stripe account. Re-run with --create to make one.'); return; }
  const product = await stripe().products.create({
    name: 'Merge — Extra AI reviewer run',
    description: "One additional AI reviewer run beyond your plan's monthly allowance.",
    metadata: { kind: 'extra_review', plan: 'addon' },
  });
  const price = await stripe().prices.create({
    product: product.id, currency: 'usd', unit_amount: 199,
    nickname: 'Extra AI reviewer run', metadata: { kind: 'extra_review' },
  });
  console.log(`Created ${product.id} with price ${price.id} ($1.99 one-time).`);
  console.log(`Set STRIPE_PRICE_EXTRA_REVIEW=${price.id}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
