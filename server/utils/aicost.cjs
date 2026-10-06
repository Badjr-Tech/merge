// What one AI action costs us, so the staff dashboard reports money rather than counts.
// Gemini 2.5 Flash paid tier, verified 2026-10-06: $0.30 per 1M input tokens, $2.50 per 1M output.
// Token counts are measured from the prompts Merge actually builds (see DEVELOPMENT.md).
const RATE = { input: 0.30 / 1e6, output: 2.50 / 1e6 };

// output = what replies actually run at, not the cap — measured across sample questions
const TOKENS = {
  chat:    { input: 2265, output: 120 },
  draft:   { input: 2165, output: 875 },
  review:  { input: 3800, output: 700 },
  profile: { input: 5000, output: 400 },
};

function costOf(feature) {
  const t = TOKENS[feature];
  if (!t) return 0;
  return t.input * RATE.input + t.output * RATE.output;
}

// rows: [{ feature, _count }] from a groupBy
function spendFrom(rows) {
  return rows.reduce((sum, r) => sum + costOf(r.feature) * (r._count ? r._count._all ?? r._count : r.count || 0), 0);
}

module.exports = { RATE, TOKENS, costOf, spendFrom };
