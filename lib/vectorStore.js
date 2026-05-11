import { Pinecone } from '@pinecone-database/pinecone';

const loggedIndexStats = new Set();

function shouldDebugRag() {
  return process.env.DEBUG_RAG === 'true';
}

function getIndex() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return pc.index(process.env.PINECONE_INDEX);
}

export async function addItems(items) {
  const index = getIndex();
  const records = items
    .filter(i => i.embedding)
    .map(i => ({
      id: i.id,
      values: i.embedding,
      metadata: { text: i.text, ...i.meta }
    }));

  const BATCH = 100;
  for (let i = 0; i < records.length; i += BATCH) {
    await index.upsert({ records: records.slice(i, i + BATCH) });
  }
}

export async function queryEmbedding(embeddingOrText, k = 6) {
  // Text-only fallback (no embedding available) — not supported in Pinecone
  if (!Array.isArray(embeddingOrText)) {
    console.warn('Pinecone requires a vector — text-only query not supported.');
    return [];
  }

  const index = getIndex();
  const result = await index.query({
    vector: embeddingOrText,
    topK: k,
    includeMetadata: true,
  });

  return (result.matches || []).map(m => ({
    score: m.score,
    id: m.id,
    text: m.metadata?.text || '',
    embedding: null,
    meta: {
      file: m.metadata?.file,
      page: m.metadata?.page,
      chunk: m.metadata?.chunk,
      title: m.metadata?.title,
    }
  }));
}

export async function queryEmbeddingInNamespace(embedding, namespace, k = 6) {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const indexName = getIndexNameForNamespace(namespace);
  if (!indexName) throw new Error(`Missing Pinecone index env var for namespace "${namespace}"`);

  const index = pc.index(indexName).namespace(namespace);
  await logIndexStatsOnce(index, indexName, namespace, embedding?.length);
  const result = await index.query({
    vector: embedding,
    topK: k,
    includeMetadata: true,
  });

  return (result.matches || []).map(m => ({
    score: m.score,
    id: m.id,
    text: m.metadata?.text || '',
    meta: m.metadata || {},
  }));
}

export function getIndexNameForNamespace(namespace) {
  return namespace === 'entrevistas'
    ? (process.env.PINECONE_INDEX_ENTREVISTAS || process.env.PINECONE_INDEX)
    : process.env.PINECONE_INDEX;
}

async function logIndexStatsOnce(index, indexName, namespace, embeddingDims) {
  if (!shouldDebugRag()) return;

  const key = `${indexName}:${namespace}`;
  if (loggedIndexStats.has(key)) return;
  loggedIndexStats.add(key);

  try {
    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];
    console.log('[pinecone][stats]', {
      index: indexName,
      namespace,
      indexDimension: stats.dimension,
      queryDimension: embeddingDims,
      namespaceRecordCount: namespaceStats?.recordCount || 0,
      totalRecordCount: stats.totalRecordCount,
    });

    if (!namespaceStats?.recordCount) {
      console.warn(`[pinecone] namespace "${namespace}" is empty in index "${indexName}"`);
    }
    if (stats.dimension && embeddingDims && stats.dimension !== embeddingDims) {
      console.warn(`[pinecone] dimension mismatch index=${stats.dimension} query=${embeddingDims}`);
    }
  } catch (err) {
    console.warn('[pinecone] could not describe index stats:', err?.message || err);
  }
}

export async function clearStore() {
  const index = getIndex();
  await index.deleteAll();
}

export async function getAll() {
  // Pinecone doesn't support full scan — not needed in this project
  return [];
}
