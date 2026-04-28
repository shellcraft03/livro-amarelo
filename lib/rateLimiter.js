const stores = new Map();

export function checkRateLimit(ip, max = 30, duration = 60) {
  const now = Date.now();
  const key = ip || 'global';
  const entry = stores.get(key) || { count: 0, reset: now + duration * 1000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + duration * 1000;
  }
  entry.count += 1;
  stores.set(key, entry);
  const remaining = Math.max(0, max - entry.count);
  const resetSeconds = Math.ceil((entry.reset - now) / 1000);
  return { ok: entry.count <= max, remaining, resetSeconds, count: entry.count };
}
