import { neon } from '@neondatabase/serverless';

try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS videos (
    id                SERIAL PRIMARY KEY,
    url               TEXT NOT NULL UNIQUE,
    title             TEXT,
    individual        TEXT,
    curated           BOOLEAN DEFAULT NULL,
    rejection_reason  TEXT,
    curated_at        TIMESTAMP,
    indexed           BOOLEAN NOT NULL DEFAULT FALSE,
    indexed_at        TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

// Adiciona colunas caso a tabela já existisse sem elas
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS curated          BOOLEAN DEFAULT NULL`;
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS rejection_reason  TEXT`;
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS curated_at        TIMESTAMP`;
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS published_at      TEXT`;
await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS channel           TEXT`;

console.log('Tabela "videos" criada/atualizada.');
