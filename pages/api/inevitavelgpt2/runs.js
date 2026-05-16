import { getInevitavelGpt2Db } from '../../../lib/inevitavelgpt2/db.js';
import { getCurrentUser } from '../../../lib/inevitavelgpt2/user.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const sql = getInevitavelGpt2Db();
    const rows = await sql`
      SELECT
        id,
        input_tweet_id,
        captured_tweet_created_at,
        source_type,
        status,
        error_message,
        published_tweet_id,
        api_result,
        balance_delta_cents,
        created_at
      FROM igpt2_automation_runs
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return res.status(200).json({ runs: rows });
  } catch (err) {
    console.error('[igpt2/runs]', err?.message || err);
    return res.status(500).json({ error: 'Could not load runs' });
  }
}
