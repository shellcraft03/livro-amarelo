import fs from 'fs/promises';
import path from 'path';

const STORE_PATH = path.join(process.cwd(), 'data', 'store.json');

async function loadStore() {
  try {
    const txt = await fs.readFile(STORE_PATH, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return { items: [] };
  }
}

async function saveStore(store) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function dot(a, b) {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function norm(a) {
  return Math.sqrt(a.reduce((s, v) => s + v * v, 0));
}

function cosine(a, b) {
  return dot(a, b) / (norm(a) * norm(b) + 1e-8);
}

export async function addItems(items) {
  const store = await loadStore();
  store.items.push(...items);
  await saveStore(store);
}

export async function queryEmbedding(embeddingOrText, k = 3) {
  const store = await loadStore();
  // If caller provided embedding vector -> use cosine similarity (only for items that have embeddings)
  if (Array.isArray(embeddingOrText) && embeddingOrText.length > 0) {
    const scored = store.items.map(item => ({
      score: item.embedding ? cosine(embeddingOrText, item.embedding) : -1,
      item
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(s => ({ score: s.score, ...s.item }));
  }

  // Otherwise treat embeddingOrText as query text and do simple token-match scoring as fallback
  const q = (embeddingOrText || '').toString().toLowerCase();
  const qWords = q.split(/\s+/).filter(Boolean);
  const scored = store.items.map(item => {
    const text = ((item.text || '') + ' ' + JSON.stringify(item.meta || {})).toLowerCase();
    let matches = 0;
    for (const w of qWords) if (text.includes(w)) matches += 1;
    const score = qWords.length ? matches / qWords.length : 0;
    return { score, item };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => ({ score: s.score, ...s.item }));
}

export async function clearStore() {
  await saveStore({ items: [] });
}

export async function getAll() {
  return (await loadStore()).items;
}
