import { neon } from '@neondatabase/serverless';
import { Pinecone } from '@pinecone-database/pinecone';

try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const sql = neon(process.env.DATABASE_URL);
const pc  = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

console.log('Apagando vetores do namespace "entrevistas" no Pinecone...');
try {
  await pc.index(process.env.PINECONE_INDEX_ENTREVISTAS).namespace('entrevistas').deleteAll();
  console.log('Vetores apagados.');
} catch (e) {
  if (e.name === 'PineconeNotFoundError') {
    console.log('Namespace vazio ou inexistente — nada a apagar.');
  } else {
    throw e;
  }
}

console.log('Desindexando vídeos no banco...');
const result = await sql`UPDATE videos SET indexed = false, indexed_at = NULL WHERE indexed = true`;
console.log(`${result.count ?? 'N'} vídeo(s) marcados como não indexados.`);

console.log('\nPronto. Rode a indexação para reprocessar com o novo modelo de embeddings.');
