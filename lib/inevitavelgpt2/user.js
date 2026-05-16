import { getInevitavelGpt2Db } from './db.js';
import { getUserSession } from './session.js';

export async function getCurrentUser(req) {
  const session = getUserSession(req);
  if (!session) return null;

  const sql = getInevitavelGpt2Db();
  const rows = await sql`
    SELECT
      u.id,
      u.x_user_id,
      u.x_username,
      u.x_name,
      u.x_profile_image_url,
      u.created_at,
      u.updated_at,
      g.access_status,
      g.credit_balance_cents,
      g.approved_at,
      s.enabled AS automation_enabled,
      s.mode AS automation_mode
    FROM igpt2_users u
    LEFT JOIN igpt2_access_grants g ON g.user_id = u.id
    LEFT JOIN igpt2_automation_settings s ON s.user_id = u.id
    WHERE u.id = ${session.userId}
    LIMIT 1
  `;

  return rows[0] || null;
}

export function requireApproved(user, res) {
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (user.access_status !== 'approved') {
    res.status(403).json({ error: 'Access not approved', status: user.access_status || 'pending' });
    return false;
  }
  return true;
}
