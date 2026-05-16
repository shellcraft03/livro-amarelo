import { getCurrentUser } from '../../../lib/inevitavelgpt2/user.js';

export const config = {
  api: { bodyParser: { sizeLimit: '8kb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'User automation settings are not editable' });

  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.status(200).json({
      settings: {
        enabled: Boolean(user.automation_enabled),
        mode: user.automation_mode || 'automatic',
        triggers: ['livro amarelo', 'renan santos'],
        sourceMode: 'auto',
        editable: false,
      },
    });
  } catch (err) {
    console.error('[igpt2/settings]', err?.message || err);
    return res.status(500).json({ error: 'Could not save settings' });
  }
}
