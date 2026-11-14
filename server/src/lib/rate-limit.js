const windows = new Map();

// Lightweight per-process limiter for public endpoints. In a multi-instance
// deployment, move this state to a shared store such as Redis.
export function rateLimit({ windowMs, limit, key = req => req.ip, message = 'Too many requests. Please try again later.' }) {
  return (req, res, next) => {
    const now = Date.now();
    const id = key(req);
    let entry = windows.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(id, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
}, 60_000);
cleanup.unref();
