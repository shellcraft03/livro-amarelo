const DEFAULT_PRODUCTION_HOSTNAMES = ['www.inevitavelgpt.com', 'inevitavelgpt.com'];

function expectedHostnames() {
  if (process.env.TURNSTILE_ALLOWED_HOSTNAMES) {
    return process.env.TURNSTILE_ALLOWED_HOSTNAMES
      .split(',')
      .map(h => h.trim())
      .filter(Boolean);
  }

  if (process.env.NODE_ENV !== 'production') return [];

  return [
    ...DEFAULT_PRODUCTION_HOSTNAMES,
    process.env.VERCEL_URL,
  ].filter(Boolean);
}

export async function verifyTurnstile(token, { ip, action } = {}) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing_token' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (ip && ip !== 'unknown') body.set('remoteip', ip);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    const j = await resp.json();
    if (!j.success) return { ok: false, reason: 'challenge_failed', detail: j };

    const requiredAction = action === false ? null : (action || process.env.TURNSTILE_ACTION);
    if (requiredAction && j.action !== requiredAction) {
      return { ok: false, reason: 'action_mismatch', detail: j };
    }

    const hostnames = expectedHostnames();
    if (hostnames.length > 0 && !hostnames.includes(j.hostname)) {
      return { ok: false, reason: 'hostname_mismatch', detail: j };
    }

    return { ok: true, detail: j };
  } catch (err) {
    const reason = err?.name === 'AbortError' ? 'network_timeout' : 'network_error';
    return { ok: false, reason, error: String(err) };
  } finally {
    clearTimeout(timeout);
  }
}
