import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Banco de dados não configurado.' });
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    const sql = neon(process.env.DATABASE_URL);

    if (req.query.meta) {
      const rows = await sql`
        SELECT DISTINCT ano, mes
        FROM filiados_partidarios
        ORDER BY ano DESC, mes DESC
      `;
      return res.status(200).json({ periodos: rows });
    }

    let ano, mes;
    if (req.query.ano && req.query.mes) {
      ano = Number(req.query.ano);
      mes = Number(req.query.mes);
    } else {
      const latest = (await sql`
        SELECT ano, mes FROM filiados_partidarios ORDER BY ano DESC, mes DESC LIMIT 1
      `)[0];
      ano = latest.ano;
      mes = latest.mes;
    }

    const uf = req.query.uf || null;

    const rows = uf
      ? await sql`
          SELECT partido, nome_partido, uf, ano, mes, quantidade
          FROM filiados_partidarios
          WHERE ano = ${ano} AND mes = ${mes} AND uf = ${uf}
          ORDER BY quantidade DESC
        `
      : await sql`
          SELECT partido, nome_partido, uf, ano, mes, quantidade
          FROM filiados_partidarios
          WHERE ano = ${ano} AND mes = ${mes}
          ORDER BY quantidade DESC
        `;

    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('[api/filiados]', err);
    return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
}
