import crypto from 'crypto';

const SESSION_COOKIE = 'igpt2_session';
const OAUTH_COOKIE = 'igpt2_oauth';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_TTL_SECONDS = 10 * 60;

function getSecret() {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) throw new Error('Missing env var: APP_SESSION_SECRET');
  return secret;
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function encode(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(value) {
  const [payload, signature] = String(value || '').split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isFinite(data.exp) || data.exp <= Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
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
  const host = String(req?.headers?.host || '').toLowerCase().split(':')[0];
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return false;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https' || process.env.NODE_ENV === 'production';
}

function cookieHeader(req, name, value, maxAge) {
  const secure = shouldUseSecureCookie(req) ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function appendSetCookie(res, header) {
  const current = res.getHeader('Set-Cookie');
  if (!current) return res.setHeader('Set-Cookie', header);
  res.setHeader('Set-Cookie', Array.isArray(current) ? [...current, header] : [current, header]);
}

export function setUserSessionCookie(req, res, userId) {
  const value = encode({
    v: 1,
    userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
  appendSetCookie(res, cookieHeader(req, SESSION_COOKIE, value, SESSION_TTL_SECONDS));
}

export function clearUserSessionCookie(req, res) {
  appendSetCookie(res, cookieHeader(req, SESSION_COOKIE, '', 0));
}

export function getUserSession(req) {
  const value = parseCookies(req)[SESSION_COOKIE];
  const data = decode(value);
  return data?.v === 1 && data.userId ? data : null;
}

export function setOAuthStateCookie(req, res, state, codeVerifier) {
  const value = encode({
    v: 1,
    state,
    codeVerifier,
    exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS,
  });
  appendSetCookie(res, cookieHeader(req, OAUTH_COOKIE, value, OAUTH_TTL_SECONDS));
}

export function consumeOAuthState(req, res) {
  const value = parseCookies(req)[OAUTH_COOKIE];
  appendSetCookie(res, cookieHeader(req, OAUTH_COOKIE, '', 0));
  const data = decode(value);
  return data?.v === 1 && data.state && data.codeVerifier ? data : null;
}
