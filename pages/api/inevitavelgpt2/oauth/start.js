import { buildAuthorizationUrl } from '../../../../lib/inevitavelgpt2/xOAuth.js';
import { setOAuthStateCookie } from '../../../../lib/inevitavelgpt2/session.js';
import { hasValidHumanSession } from '../../../../lib/session.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasValidHumanSession(req)) return res.redirect(302, '/');
  if (!process.env.X_CLIENT_ID) return res.status(500).json({ error: 'Missing X OAuth configuration' });

  try {
    const auth = buildAuthorizationUrl(req);
    setOAuthStateCookie(req, res, auth.state, auth.codeVerifier);
    return res.redirect(302, auth.url);
  } catch (err) {
    console.error('[igpt2/oauth/start]', err?.message || err);
    return res.status(500).json({ error: 'OAuth start failed' });
  }
}
