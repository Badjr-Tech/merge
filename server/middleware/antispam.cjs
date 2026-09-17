// Lightweight spam protection for public forms: honeypot field, minimum fill time, and a per-IP rate limit.
const buckets = new Map();

function ip(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
}

function rateLimit({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  return (req, res, next) => {
    const key = `${req.path}:${ip(req)}`;
    const now = Date.now();
    const b = buckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
    b.count += 1;
    buckets.set(key, b);
    if (buckets.size > 5000) { for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k); }
    if (b.count > max) return res.status(429).json({ msg: 'Too many attempts. Please wait a few minutes and try again.' });
    next();
  };
}

// Bots fill hidden fields and submit instantly. Humans don't.
function honeypot(req, res, next) {
  if (req.body && typeof req.body.website === 'string' && req.body.website.trim()) {
    return res.json({ msg: 'Thanks.' }); // pretend success so bots learn nothing
  }
  if (req.body && typeof req.body.t === 'number' && req.body.t >= 0 && req.body.t < 1500) {
    return res.status(400).json({ msg: 'That was quick. Please try again.' });
  }
  next();
}

module.exports = { rateLimit, honeypot };
