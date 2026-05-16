import { clearUserSessionCookie } from '../../../lib/inevitavelgpt2/session.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  clearUserSessionCookie(req, res);
  return res.status(204).end();
}
