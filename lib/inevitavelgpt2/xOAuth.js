import { randomToken, sha256Base64Url } from './crypto.js';

const AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const ME_URL = 'https://api.x.com/2/users/me';

export const X_OAUTH_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'media.write',
  'offline.access',
];

function getBaseUrl(req) {
  const configured = process.env.IGPT2_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${req.headers.host}`;
}

export function getRedirectUri(req) {
  return `${getBaseUrl(req)}/api/inevitavelgpt2/oauth/callback`;
}

export function buildAuthorizationUrl(req) {
  const state = randomToken(24);
  const codeVerifier = randomToken(64);
  const codeChallenge = sha256Base64Url(codeVerifier);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID || '',
    redirect_uri: getRedirectUri(req),
    scope: X_OAUTH_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    state,
    codeVerifier,
    url: `${AUTH_URL}?${params.toString()}`,
  };
}

export async function exchangeCodeForTokens(req, code, codeVerifier) {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error('Missing env var: X_CLIENT_ID');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(req),
    code_verifier: codeVerifier,
    client_id: clientId,
  });

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (process.env.X_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`;
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers,
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X token exchange failed: ${response.status} ${JSON.stringify(data).slice(0, 240)}`);
  }

  return data;
}

export async function fetchXMe(accessToken) {
  const response = await fetch(`${ME_URL}?user.fields=profile_image_url,username,name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X user lookup failed: ${response.status} ${JSON.stringify(data).slice(0, 240)}`);
  }
  return data.data;
}
