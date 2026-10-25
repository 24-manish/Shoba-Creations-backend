import { AppError } from './async-handler.js';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 20;

// Small in-process limiter. Sufficient for a single-node deployment; a shared
// store such as Redis is required when the API runs on more than one instance.
export const createRateLimiter = ({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  keyGenerator = (req) => req.ip
} = {}) => {
  const hits = new Map();

  const sweep = () => {
    const cutoff = Date.now() - windowMs;

    for (const [key, entry] of hits) {
      if (entry.startedAt <= cutoff) {
        hits.delete(key);
      }
    }
  };

  const limiter = (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator(req);
    const entry = hits.get(key);

    if (!entry || entry.startedAt <= now - windowMs) {
      hits.set(key, { startedAt: now, count: 1 });
    } else {
      entry.count += 1;
    }

    if (hits.size > 5000) {
      sweep();
    }

    const current = hits.get(key);
    const remaining = Math.max(0, max - current.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (current.count > max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      next(new AppError(429, 'Too many requests. Please try again shortly.', 'RATE_LIMITED'));
      return;
    }

    next();
  };

  // Exposed so a test suite sharing one process can clear the window between
  // files instead of inheriting another file's request count.
  limiter.reset = () => hits.clear();

  return limiter;
};

// Credential endpoints are limited by email as well as IP so a single attacker
// cannot lock a known account out by spraying passwords from many addresses.
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300
});

export const resetRateLimiters = () => {
  authRateLimiter.reset();
  apiRateLimiter.reset();
};
