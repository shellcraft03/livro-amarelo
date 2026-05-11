import { checkMinuteLimit, logBlock } from '../../lib/rateLimiter.js';
import { hasValidHumanSession, setHumanSessionCookie } from '../../lib/session.js';
import { verifyTurnstile } from '../../lib/turnstile.js';

function getIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const ip = (forwardedFor || realIp || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  return ip && !['::1', '127.0.0.1', '::ffff:127.0.0.1', 'localhost'].includes(ip) ? ip : 'unknown';
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '4kb' },
  },
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: hasValidHumanSession(req) });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error: 'Unsupported media type' });
  }

  const ip = getIp(req);
  const rl = await checkMinuteLimit(ip);
  if (!rl.ok) {
    await logBlock(ip, 'session-minute');
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { turnstileToken } = req.body || {};
  const okRes = await verifyTurnstile(turnstileToken, { ip, action: 'entry' });
  if (!okRes.ok) {
    console.warn(`[session] turnstile failed reason=${okRes.reason || 'unknown'}`);
    return res.status(403).json({
      error: 'Turnstile verification failed',
      reason: okRes.reason || 'unknown',
    });
  }

  try {
    setHumanSessionCookie(req, res);
  } catch (err) {
    console.error('[session] cookie signing failed:', err?.message || err);
    return res.status(500).json({
      error: 'Session creation failed',
      reason: 'session_cookie_failed',
    });
  }

  return res.status(204).end();
}
