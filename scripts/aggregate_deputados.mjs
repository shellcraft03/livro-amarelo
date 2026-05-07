import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const { Pool } = pkg;

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2';
const ITENS_POR_PAGINA = 100;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function setup(client) {
  // Migra do schema antigo (ano/mes) para o novo (legislatura_id) se necessário
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deputados_partidarios' AND column_name = 'ano'
      ) THEN
        DROP TABLE deputados_partidarios;
      END IF;
    END$$
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS deputados_partidarios (
      partido          VARCHAR(30)  NOT NULL,
      uf               CHAR(2)      NOT NULL,
      legislatura_id   SMALLINT     NOT NULL,
      legislatura_ini  DATE         NOT NULL,
      legislatura_fim  DATE         NOT NULL,
      quantidade       INTEGER      NOT NULL,
      atualizado_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY (partido, uf, legislatura_id)
    )
  `);
}

async function fetchCurrentLegislatura() {
  const res = await fetch(`${API_BASE}/legislaturas?ordem=DESC&ordenarPor=id&itens=1`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Câmara API respondeu ${res.status} ao buscar legislatura`);
  const { dados } = await res.json();
  if (!dados.length) throw new Error('Nenhuma legislatura retornada pela API');
  return dados[0]; // { id, dataInicio, dataFim }
}

async function fetchAllDeputados() {
  const all = [];
  let url = `${API_BASE}/deputados?ordem=ASC&ordenarPor=nome&itens=${ITENS_POR_PAGINA}`;

  while (url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Câmara API respondeu ${res.status}: ${url}`);
    const json = await res.json();

    all.push(...json.dados);
    console.log(`  ${all.length} deputados carregados...`);

    const next = json.links?.find(l => l.rel === 'next');
    url = next?.href ?? null;
  }

  return all;
}

async function dropAndInsert(client, entries) {
  if (!entries.length) return;

  const legIds = [...new Set(entries.map(e => e.legislatura_id))];
  for (const id of legIds) {
    const { rowCount } = await client.query(
      'DELETE FROM deputados_partidarios WHERE legislatura_id = $1',
      [id]
    );
    console.log(`  Removidos ${rowCount} registros existentes da legislatura ${id}`);
  }

  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, j) => {
      const b = j * 6;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
    }).join(', ');

    const values = chunk.flatMap(({ partido, uf, legislatura_id, legislatura_ini, legislatura_fim, quantidade }) =>
      [partido, uf, legislatura_id, legislatura_ini, legislatura_fim, quantidade]
    );

    await client.query(
      `INSERT INTO deputados_partidarios (partido, uf, legislatura_id, legislatura_ini, legislatura_fim, quantidade)
       VALUES ${placeholders}`,
      values
    );
  }
}

async function main() {
  console.log('Buscando legislatura atual...');
  const leg = await fetchCurrentLegislatura();
  console.log(`Legislatura ${leg.id}: ${leg.dataInicio} → ${leg.dataFim}`);

  console.log(`\nBuscando deputados federais da API da Câmara...`);
  const deputados = await fetchAllDeputados();
  console.log(`Total: ${deputados.length} deputados`);

  const agg = new Map();
  for (const d of deputados) {
    const partido = (d.siglaPartido ?? '').trim().toUpperCase();
    const uf      = (d.siglaUf      ?? '').trim().toUpperCase();
    if (!partido || !uf) continue;
    const key = `${partido}|${uf}`;
    agg.set(key, (agg.get(key) ?? 0) + 1);
  }

  const entries = [...agg.entries()].map(([key, quantidade]) => {
    const [partido, uf] = key.split('|');
    return { partido, uf, legislatura_id: leg.id, legislatura_ini: leg.dataInicio, legislatura_fim: leg.dataFim, quantidade };
  });

  console.log(`\nInserindo ${entries.length} registros no banco...`);
  const client = await pool.connect();
  try {
    await setup(client);
    await dropAndInsert(client, entries);
    console.log(`Concluído: ${entries.length} registros (partido × UF × legislatura) inseridos.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
