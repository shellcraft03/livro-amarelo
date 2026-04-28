// In-memory fallback store
const stores = new Map();

let redis = null;
let usingRedis = false;
try {
  const IORedis = require('ioredis');
  if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
    usingRedis = true;
  }
} catch (e) {
  // ioredis not installed or failed to initialize; fall back to memory
  usingRedis = false;
}

// checkRateLimit: uses Redis when REDIS_URL is provided, otherwise in-memory map.
// Returns: { ok, remaining, resetSeconds, count }
export async function checkRateLimit(ip, max = 30, duration = 60) {
  const key = (ip || 'global').replace(/[:\/\s]/g, '_');
  if (usingRedis && redis) {
    const rkey = `rl:${key}`;
    // INCR the counter atomically
    const cur = await redis.incr(rkey);
    if (cur === 1) {
      // set expiry in seconds
      await redis.expire(rkey, duration);
    }
    const ttl = await redis.ttl(rkey);
    const remaining = Math.max(0, max - cur);
    return { ok: cur <= max, remaining, resetSeconds: ttl >= 0 ? ttl : duration, count: cur };
  }

  // In-memory fallback (same behaviour as before)
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
