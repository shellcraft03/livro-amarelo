import { neon } from '@neondatabase/serverless';
import { checkMinuteLimit, checkDailyLimit, logBlock } from '../../lib/rateLimiter.js';

function getIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  return (forwardedFor || realIp || req.socket.remoteAddress || '').toString().split(',')[0].trim() || 'unknown';
}

async function handleGet(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Banco de dados não configurado.' });
  }
  try {
    const db   = neon(process.env.DATABASE_URL);
    const rows = await db`
      SELECT id, url, title, individual, channel, indexed_at, published_at
      FROM videos
      WHERE indexed = true
      ORDER BY indexed_at DESC
    `;
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ videos: rows });
  } catch (err) {
    console.error('[api/videos GET]', err);
    return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
}

const YT_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Banco de dados não configurado.' });
  }

  const ip = getIp(req);

  const rl = await checkMinuteLimit(ip);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
  if (!rl.ok) {
    await logBlock(ip, 'minute');
    return res.status(429).json({ error: 'Too many requests' });
  }

  const daily = await checkDailyLimit(ip);
  if (!daily.ok) {
    await logBlock(ip, 'daily');
    return res.status(429).json({ error: 'Daily limit reached' });
  }

  const { url, title, individual } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL é obrigatória.' });
  }

  if (!YT_REGEX.test(url.trim())) {
    return res.status(400).json({ error: 'URL inválida. Envie um link do YouTube.' });
  }

  if (individual && typeof individual === 'string' && individual.trim().length > 200) {
    return res.status(400).json({ error: 'Nome do entrevistado muito longo.' });
  }

  if (title && typeof title === 'string' && title.trim().length > 500) {
    return res.status(400).json({ error: 'Título muito longo.' });
  }

  try {
    const db = neon(process.env.DATABASE_URL);

    const existing = await db`SELECT id FROM videos WHERE url = ${url.trim()}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Este vídeo já foi enviado anteriormente.' });
    }

    await db`
      INSERT INTO videos (url, title, individual)
      VALUES (
        ${url.trim()},
        ${title?.trim() || null},
        ${individual?.trim() || null}
      )
    `;

    return res.status(201).json({ message: 'Vídeo recebido. Será processado em breve.' });
  } catch (err) {
    console.error('[api/videos]', err);
    return res.status(500).json({ error: 'Erro ao salvar no banco de dados.' });
  }
}
