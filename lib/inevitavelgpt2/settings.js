import { getInevitavelGpt2Db } from './db.js';

export async function getTweetCostCents(sql = getInevitavelGpt2Db()) {
  const rows = await sql`
    SELECT value
    FROM igpt2_global_settings
    WHERE key = 'tweet_cost_cents'
    LIMIT 1
  `;
  const value = Number(rows[0]?.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Missing or invalid igpt2 setting: tweet_cost_cents');
  }
  return Math.round(value);
}
