import crypto from 'crypto';

const COOKIE_NAME = 'ia_session';
const SESSION_TTL_SECONDS = 60 * 60;

function getSecret() {
  return process.env.APP_SESSION_SECRET;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const idx = part.indexOf('=');
        if (idx === -1) return [part, ''];
        try {
          return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
        } catch {
          return [part.slice(0, idx), ''];
        }
      })
  );
}

function shouldUseSecureCookie(req) {
  const rawHost = String(req?.headers?.host || '').toLowerCase();
  const host = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.split(':')[0];
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return false;

  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https' || process.env.NODE_ENV === 'production';
}

export function setHumanSessionCookie(req, res) {
  const secret = getSecret();
  if (!secret) throw new Error('Missing env var: APP_SESSION_SECRET');

  const payload = base64url(JSON.stringify({
    v: 1,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }));
  const value = `${payload}.${sign(payload, secret)}`;
  const secure = shouldUseSecureCookie(req) ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`
  );
}

export function hasValidHumanSession(req) {
  const secret = getSecret();
  if (!secret) return false;

  const value = parseCookies(req)[COOKIE_NAME];
  if (!value) return false;

  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;

  const expected = sign(payload, secret);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.v === 1 && Number.isFinite(data.exp) && data.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
