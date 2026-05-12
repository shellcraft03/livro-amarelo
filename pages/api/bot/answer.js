import OpenAI from 'openai';
import { queryEmbeddingInNamespace } from '../../../lib/vectorStore.js';

const EMBEDDING_MODEL = 'text-embedding-3-large';
const QUERY_REWRITE_MODEL = process.env.QUERY_REWRITE_MODEL || 'gpt-4.1-nano';
const CHAT_MODEL = 'gpt-4.1';
const INITIAL_TOP_K = 20;
const FINAL_CHUNKS = 8;
const MAX_TOKENS = 800;

const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

function cleanQuery(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

function sanitizeQuestion(raw) {
  return raw
    .toString()
    .normalize('NFKC')
    .trim()
    .slice(0, 500)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[^a-zA-ZÀ-ú0-9\s.,!?;:()\-'"/%\n]/g, '');
}

async function rewriteQuery(question, promptEnvKey) {
  const prompt = process.env[promptEnvKey];
  if (!prompt) return question;
  try {
    const res = await client.chat.completions.create({
      model: QUERY_REWRITE_MODEL,
      temperature: 0,
      max_tokens: 100,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: question },
      ],
    });
    return cleanQuery(res.choices?.[0]?.message?.content) || question;
  } catch {
    return question;
  }
}

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function rankMatches(matches, question) {
  const terms = normalizeText(question)
    .split(/[^a-z0-9]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 4);

  return matches
    .map(match => {
      const haystack = normalizeText(`${match.meta?.title || ''} ${match.text || ''}`);
      const hits = terms.reduce((s, t) => s + (haystack.includes(t) ? 1 : 0), 0);
      const coverage = terms.length > 0 ? hits / terms.length : 0;
      const titleHits = terms.reduce((s, t) => s + (normalizeText(match.meta?.title).includes(t) ? 1 : 0), 0);
      return {
        ...match,
        rerankScore: (match.score || 0) + coverage * 0.12 + titleHits * 0.02 - (terms.length > 0 && hits === 0 ? 0.04 : 0),
      };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

async function retrieveChunks(question, namespace, rewritePromptKey) {
  const origEmbPromise = client.embeddings.create({ model: EMBEDDING_MODEL, input: [question] });
  const rewritePromise = rewriteQuery(question, rewritePromptKey);

  const origEmbRes = await origEmbPromise;
  const origEmbedding = origEmbRes?.data?.[0]?.embedding;
  const origSearch = origEmbedding
    ? queryEmbeddingInNamespace(origEmbedding, namespace, INITIAL_TOP_K)
    : Promise.resolve([]);

  const rewritten = await rewritePromise;
  let rewriteSearch = Promise.resolve([]);
  if (rewritten && rewritten !== question) {
    const rwRes = await client.embeddings.create({ model: EMBEDDING_MODEL, input: [rewritten] });
    const rwEmbedding = rwRes?.data?.[0]?.embedding;
    if (rwEmbedding) {
      rewriteSearch = queryEmbeddingInNamespace(rwEmbedding, namespace, INITIAL_TOP_K);
    }
  }

  const [r1, r2] = await Promise.all([origSearch, rewriteSearch]);
  const byId = new Map();
  for (const m of [...r1, ...r2]) {
    const cur = byId.get(m.id);
    if (!cur || (m.score || 0) > (cur.score || 0)) byId.set(m.id, m);
  }

  return rankMatches([...byId.values()], question).slice(0, FINAL_CHUNKS);
}

function buildContext(chunks, type) {
  if (type === 'livro') {
    return chunks
      .map((t, i) =>
        `<fonte id="${i + 1}" arquivo="${t.meta?.file || 'unknown'}" pagina="${t.meta?.page}">\n${t.text}\n</fonte>`
      )
      .join('\n');
  }
  return chunks
    .map((t, i) => {
      const text = t.meta?.context_text || t.text;
      return `<fonte id="${i + 1}" titulo="${t.meta?.title || ''}">\n${text}\n</fonte>`;
    })
    .join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.BOT_API_SECRET;
  if (!secret || req.headers['x-bot-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { question: rawQuestion, type } = req.body || {};
  if (!rawQuestion || !['livro', 'entrevistas'].includes(type)) {
    return res.status(400).json({ error: 'Missing question or invalid type' });
  }

  const question = sanitizeQuestion(rawQuestion);
  if (!question) return res.status(400).json({ error: 'Question is empty after sanitization' });

  const isLivro = type === 'livro';
  const namespace = isLivro ? 'livro-amarelo-v2' : 'entrevistas';
  const rewritePromptKey = isLivro ? 'SYSTEM_PROMPT_QUERY_REWRITE_LIVRO' : 'SYSTEM_PROMPT_QUERY_REWRITE_ENTREVISTAS';
  const systemPromptKey = isLivro ? 'SYSTEM_PROMPT_LIVRO' : 'SYSTEM_PROMPT_ENTREVISTAS';
  const systemPrompt = process.env[systemPromptKey];

  if (!systemPrompt) {
    return res.status(500).json({ error: `Missing env var: ${systemPromptKey}` });
  }

  try {
    const chunks = await retrieveChunks(question, namespace, rewritePromptKey);
    const contextText = buildContext(chunks, type);

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `<contexto>\n${contextText}\n</contexto>\n<pergunta>${question}</pergunta>\nResposta:`,
      },
    ];

    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      max_tokens: MAX_TOKENS,
    });

    const answer = completion.choices?.[0]?.message?.content || '';
    return res.status(200).json({ answer, question, type });
  } catch (err) {
    console.error('[bot/answer]', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
