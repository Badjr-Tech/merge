// Stripe helpers. Price IDs default to the live prices created on 2026-09-17; override with env vars if they change.
const Stripe = require('stripe');
const { PLANS, normalizeKey } = require('./plans.cjs');

const PRICE_BY_PLAN = {
  writer: process.env.STRIPE_PRICE_WRITER || 'price_1UGom2JQCQqMQG9fTrI1RORJ',
  writer_pro: process.env.STRIPE_PRICE_WRITER_PRO || 'price_1UGom3JQCQqMQG9fN7kPFfGo',
  professional: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_1UGom3JQCQqMQG9fUy7jtv1R',
  org_solo: process.env.STRIPE_PRICE_ORG_SOLO || 'price_1UGom4JQCQqMQG9feDrpPHmh',
  small_team: process.env.STRIPE_PRICE_SMALL_TEAM || 'price_1UGom4JQCQqMQG9fz5GpSAaz',
  large_team: process.env.STRIPE_PRICE_LARGE_TEAM || 'price_1UGom5JQCQqMQG9fSHmB0b6h',
  company: process.env.STRIPE_PRICE_COMPANY || 'price_1UGom5JQCQqMQG9fBDwMf92v',
};
const PLAN_BY_PRICE = Object.fromEntries(Object.entries(PRICE_BY_PLAN).map(([k, v]) => [v, k]));
const PORTAL_CONFIG = process.env.STRIPE_PORTAL_CONFIG || 'bpc_1UGom8JQCQqMQG9fwkJXfcwP';

let client = null;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured');
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  return client;
}
function configured() { return Boolean(process.env.STRIPE_SECRET_KEY); }
function perSeat(planKey) { return PLANS[planKey] && PLANS[planKey].per === 'person'; }

module.exports = { stripe, configured, PRICE_BY_PLAN, PLAN_BY_PRICE, PORTAL_CONFIG, perSeat, normalizeKey };
