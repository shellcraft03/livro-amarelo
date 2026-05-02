import { Redis } from '@upstash/redis';

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// In-memory fallback for local dev without Redis
const stores = new Map();

export async function checkRateLimit(ip, max = 30, duration = 60) {
  const key = `rl:${(ip || 'global').replace(/[:\/\s]/g, '_')}`;

  if (redis) {
    const cur = await redis.incr(key);
    if (cur === 1) await redis.expire(key, duration);
    const ttl = await redis.ttl(key);
    const remaining = Math.max(0, max - cur);
    return { ok: cur <= max, remaining, resetSeconds: ttl >= 0 ? ttl : duration, count: cur };
  }

  const now = Date.now();
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
