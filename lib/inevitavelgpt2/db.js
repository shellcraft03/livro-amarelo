import { neon } from '@neondatabase/serverless';

let cachedSql = null;

export function getInevitavelGpt2Db() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing env var: DATABASE_URL');
  }

  if (!cachedSql) {
    cachedSql = neon(process.env.DATABASE_URL);
  }

  return cachedSql;
}
