import { getCurrentUser } from '../../../lib/inevitavelgpt2/user.js';
import { getTweetCostCents } from '../../../lib/inevitavelgpt2/settings.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ authenticated: false });
    const tweetCostCents = await getTweetCostCents();
    return res.status(200).json({ authenticated: true, user, settings: { tweet_cost_cents: tweetCostCents } });
  } catch (err) {
    console.error('[igpt2/me]', err?.message || err);
    return res.status(500).json({ error: 'Could not load account' });
  }
}
