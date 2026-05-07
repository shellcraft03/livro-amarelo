import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Banco de dados não configurado.' });
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    const url = process.env.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://');
    const sql = neon(url);

    if (req.query.meta) {
      const rows = await sql`
        SELECT DISTINCT legislatura_id AS id, legislatura_ini AS ini, legislatura_fim AS fim
        FROM deputados_partidarios
        ORDER BY legislatura_id DESC
      `;
      return res.status(200).json({ legislaturas: rows });
    }

    const legId = req.query.legislatura_id
      ? Number(req.query.legislatura_id)
      : (await sql`SELECT MAX(legislatura_id) AS id FROM deputados_partidarios`)[0].id;

    const uf = req.query.uf || null;

    const rows = uf
      ? await sql`
          SELECT d.partido, f.nome_partido, d.uf, d.legislatura_id, d.legislatura_ini, d.legislatura_fim, d.quantidade
          FROM deputados_partidarios d
          LEFT JOIN (
            SELECT DISTINCT ON (partido) partido, nome_partido
            FROM filiados_partidarios
            WHERE nome_partido IS NOT NULL
            ORDER BY partido, ano DESC, mes DESC
          ) f ON f.partido = d.partido
          WHERE d.legislatura_id = ${legId} AND d.uf = ${uf}
          ORDER BY d.quantidade DESC
        `
      : await sql`
          SELECT d.partido, f.nome_partido, d.uf, d.legislatura_id, d.legislatura_ini, d.legislatura_fim, d.quantidade
          FROM deputados_partidarios d
          LEFT JOIN (
            SELECT DISTINCT ON (partido) partido, nome_partido
            FROM filiados_partidarios
            WHERE nome_partido IS NOT NULL
            ORDER BY partido, ano DESC, mes DESC
          ) f ON f.partido = d.partido
          WHERE d.legislatura_id = ${legId}
          ORDER BY d.quantidade DESC
        `;

    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('[api/deputados]', err);
    return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
}
