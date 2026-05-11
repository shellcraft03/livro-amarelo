import OpenAI from 'openai';
import { checkMinuteLimit, checkDailyLimit, logBlock } from '../../lib/rateLimiter.js';
import { hasValidHumanSession } from '../../lib/session.js';
import { getIndexNameForNamespace, queryEmbeddingInNamespace } from '../../lib/vectorStore.js';
import { verifyTurnstile } from '../../lib/turnstile.js';

const MAX_QUESTION_LENGTH = 1000;
const TURNSTILE_ACTION = 'chat';
const EMBEDDING_MODEL = 'text-embedding-3-large';
const QUERY_REWRITE_MODEL = process.env.QUERY_REWRITE_MODEL || 'gpt-4.1-nano';
const RERANK_MODEL = process.env.INTERVIEW_RERANK_MODEL || 'gpt-4.1-nano';

function intFromEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const INITIAL_TOP_K = intFromEnv('INTERVIEW_INITIAL_TOP_K', 20, 10, 100);
const RERANK_CANDIDATES = intFromEnv('INTERVIEW_RERANK_CANDIDATES', 20, 12, 80);
const FINAL_CHUNKS = intFromEnv('INTERVIEW_FINAL_CHUNKS', 12, 4, 20);

const TOPIC_EXPANSIONS = [
  {
    pattern: /\beduca[cç][aã]o\b|\bescola\b|\bensino\b|\bprofessor/i,
    terms: 'educacao escola ensino professores alunos alfabetizacao universidade formacao tecnica ensino basico ensino superior gestao escolar curriculo',
  },
  {
    pattern: /\bseguran[cç]a\b|\bcrime\b|\bpol[ií]cia\b|\bviol[eê]ncia\b/i,
    terms: 'seguranca publica crime policia violencia criminalidade prisao faccoes impunidade justica soberania ordem',
  },
  {
    pattern: /\beconomia\b|\bimposto\b|\btribut/i,
    terms: 'economia impostos reforma tributaria crescimento fiscal gasto publico produtividade investimento emprego renda mercado',
  },
  {
    pattern: /\bsa[uú]de\b|\bsus\b|\bhospital\b/i,
    terms: 'saude sus hospitais medicos atendimento gestao hospitalar prevencao financiamento filas',
  },
];

const STOPWORDS = new Set([
  'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sobre', 'que', 'qual',
  'quais', 'como', 'ele', 'ela', 'renan', 'santos', 'pensa', 'acha', 'disse',
  'fala', 'falou', 'respondeu', 'resposta',
]);

function shouldDebugRag() {
  return process.env.DEBUG_RAG === 'true';
}

const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT_ENTREVISTAS;
if (!SYSTEM_PROMPT) throw new Error('Missing env var: SYSTEM_PROMPT_ENTREVISTAS');
const QUERY_REWRITE_PROMPT = process.env.SYSTEM_PROMPT_QUERY_REWRITE_ENTREVISTAS;
if (!QUERY_REWRITE_PROMPT) throw new Error('Missing env var: SYSTEM_PROMPT_QUERY_REWRITE_ENTREVISTAS');

export const config = {
  api: {
    bodyParser: { sizeLimit: '2kb' },
    responseLimit: false,
  },
};

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const ip = (forwardedFor || realIp || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  return ip && !['::1', '127.0.0.1', '::ffff:127.0.0.1', 'localhost'].includes(ip) ? ip : 'unknown';
}

function sanitizeQuestion(raw) {
  return raw
    .toString()
    .normalize('NFKC')
    .trim()
    .slice(0, MAX_QUESTION_LENGTH)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^a-zA-ZÀ-ú0-9\s.,!?;:()\-'"/%\n]/g, '');
}

function buildRetrievalQuery(question) {
  let focused = question
    .replace(/^(o que|qual|quais|como)\s+(o\s+)?renan\s+santos\s+(pensa|acha|disse|fala|respondeu)\s+(sobre|a respeito de)\s+/i, '')
    .replace(/^(o que|qual|quais|como)\s+(ele|renan)\s+(pensa|acha|disse|fala|respondeu)\s+(sobre|a respeito de)\s+/i, '')
    .trim();

  if (!focused) focused = question;

  const expansions = TOPIC_EXPANSIONS
    .filter(({ pattern }) => pattern.test(question))
    .map(({ terms }) => terms);

  return [focused, question, ...expansions].join('\n');
}

function cleanRetrievalQuery(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

async function rewriteRetrievalQuery(question) {
  const fallback = buildRetrievalQuery(question);

  try {
    const completion = await client.chat.completions.create({
      model: QUERY_REWRITE_MODEL,
      temperature: 0,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: QUERY_REWRITE_PROMPT,
        },
        { role: 'user', content: question },
      ],
    });

    const rewritten = cleanRetrievalQuery(completion.choices?.[0]?.message?.content);
    return rewritten
      ? [
          rewritten,
          fallback,
          `Pergunta original: ${question}`,
        ].join('\n')
      : fallback;
  } catch (err) {
    console.warn('[rag][entrevistas] query rewrite failed:', err?.message || err);
    return fallback;
  }
}

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function topicTerms(question) {
  const normalized = normalizeText(question);
  const terms = new Set(
    normalized
      .split(/[^a-z0-9]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 4 && !STOPWORDS.has(t))
  );

  for (const { pattern, terms: expandedTerms } of TOPIC_EXPANSIONS) {
    if (pattern.test(question)) {
      for (const term of normalizeText(expandedTerms).split(/\s+/)) {
        if (term.length >= 4) terms.add(term);
      }
    }
  }

  return [...terms];
}

function rankMatches(matches, question) {
  const terms = topicTerms(question);

  return matches
    .map(match => {
      const haystack = normalizeText(`${match.meta?.title || ''} ${match.text || ''}`);
      const hits = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      const coverage = terms.length > 0 ? hits / terms.length : 0;
      const titleHits = terms.reduce((sum, term) => sum + (normalizeText(match.meta?.title).includes(term) ? 1 : 0), 0);
      const lexicalBoost = coverage * 0.12 + titleHits * 0.02;
      const lexicalPenalty = terms.length > 0 && hits === 0 ? 0.04 : 0;
      return {
        ...match,
        rerankScore: (match.score || 0) + lexicalBoost - lexicalPenalty,
        lexicalHits: hits,
      };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

function parseRankedIds(raw) {
  const text = String(raw || '').trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (Array.isArray(parsed?.ids)) return parsed.ids.map(String);
  } catch {}

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function rerankInterviewChunks(question, matches) {
  const candidates = matches.slice(0, RERANK_CANDIDATES);
  if (candidates.length <= FINAL_CHUNKS) return candidates;

  try {
    const items = candidates.map((match, index) => ({
      id: match.id || String(index),
      title: match.meta?.title || '',
      time: match.meta?.start_seconds ?? null,
      text: String(match.text || '').slice(0, 250),
    }));

    const completion = await client.chat.completions.create({
      model: RERANK_MODEL,
      temperature: 0,
      max_tokens: 80,
      messages: [
        {
          role: 'system',
          content: [
            'Voce reranqueia trechos de entrevistas para responder uma pergunta.',
            'Use apenas a relevancia dos trechos para a pergunta.',
            'Prefira trechos que respondem diretamente, com detalhes concretos.',
            'Retorne somente um array JSON com os ids dos trechos mais relevantes em ordem.',
            `Retorne no maximo ${FINAL_CHUNKS} ids.`,
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({ question, candidates: items }),
        },
      ],
    });

    const rankedIds = parseRankedIds(completion.choices?.[0]?.message?.content);
    if (!rankedIds.length) return candidates.slice(0, FINAL_CHUNKS);

    const byId = new Map(candidates.map(match => [String(match.id), match]));
    const selected = [];
    const used = new Set();
    for (const id of rankedIds) {
      const match = byId.get(String(id));
      if (match && !used.has(match.id)) {
        selected.push({ ...match, llmReranked: true });
        used.add(match.id);
      }
      if (selected.length >= FINAL_CHUNKS) break;
    }

    for (const match of candidates) {
      if (selected.length >= FINAL_CHUNKS) break;
      if (!used.has(match.id)) selected.push(match);
    }

    return selected;
  } catch (err) {
    console.warn('[rag][entrevistas] rerank failed:', err?.message || err);
    return candidates.slice(0, FINAL_CHUNKS);
  }
}

async function retrieveInterviewChunks(question) {
  const tr0 = Date.now();

  // Start both immediately; origSearch kicks off as soon as embed_orig is ready,
  // without waiting for the rewrite LLM call to complete.
  const origEmbPromise = client.embeddings.create({ model: EMBEDDING_MODEL, input: [question] });
  const rewritePromise = rewriteRetrievalQuery(question);

  const origEmbRes = await origEmbPromise;
  const origEmbedding = origEmbRes?.data?.[0]?.embedding;
  const origSearchPromise = origEmbedding
    ? queryEmbeddingInNamespace(origEmbedding, 'entrevistas', INITIAL_TOP_K)
    : Promise.resolve([]);
  console.log(`[timing][entrevistas] embed_orig+pinecone_start=${Date.now() - tr0}ms`);

  const focusedQuery = await rewritePromise;
  console.log(`[timing][entrevistas] rewrite=${Date.now() - tr0}ms`);

  // Embed rewrite query; origSearch is already running in background
  let rewriteSearchPromise = Promise.resolve([]);
  if (focusedQuery && focusedQuery !== question) {
    const rewriteEmbRes = await client.embeddings.create({ model: EMBEDDING_MODEL, input: [focusedQuery] });
    console.log(`[timing][entrevistas] embed_rewrite=${Date.now() - tr0}ms`);
    const rewriteEmbedding = rewriteEmbRes?.data?.[0]?.embedding;
    if (rewriteEmbedding) {
      rewriteSearchPromise = queryEmbeddingInNamespace(rewriteEmbedding, 'entrevistas', INITIAL_TOP_K);
    }
  }

  const resultSets = await Promise.all([origSearchPromise, rewriteSearchPromise]);
  console.log(`[timing][entrevistas] pinecone=${Date.now() - tr0}ms candidates=${resultSets.flat().length}`);

  const byId = new Map();
  for (const match of resultSets.flat()) {
    const current = byId.get(match.id);
    if (!current || (match.score || 0) > (current.score || 0)) byId.set(match.id, match);
  }

  const ranked = rankMatches([...byId.values()], question);
  const chunks = await rerankInterviewChunks(question, ranked);
  console.log(`[timing][entrevistas] rerank=${Date.now() - tr0}ms chunks=${chunks.length}`);

  return {
    chunks,
    dims: origEmbedding?.length || 0,
    retrievalQuery: focusedQuery,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error: 'Unsupported media type' });
  }

  const t0 = Date.now();

  try {
    const { question: rawQuestion, turnstileToken } = req.body || {};
    if (!rawQuestion) return res.status(400).json({ error: 'Missing question' });

    const question = sanitizeQuestion(rawQuestion);
    if (!question) return res.status(400).json({ error: 'Question is empty' });

    const ip = getIp(req);

    const sessionOk = hasValidHumanSession(req);
    const [okRes, rl, daily] = await Promise.all([
      sessionOk ? Promise.resolve({ ok: true }) : verifyTurnstile(turnstileToken, { ip, action: TURNSTILE_ACTION }),
      checkMinuteLimit(ip),
      checkDailyLimit(ip),
    ]);
    console.log(`[timing][entrevistas] auth=${Date.now() - t0}ms`);

    if (!okRes.ok) {
      console.warn(`[turnstile] failed ip=${ip} reason=${okRes.reason || 'unknown'}`);
      return res.status(403).json({ error: 'Turnstile verification failed' });
    }

    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
    if (!rl.ok) {
      await logBlock(ip, 'minute');
      return res.status(429).json({ error: 'Too many requests' });
    }

    if (!daily.ok) {
      await logBlock(ip, 'daily');
      return res.status(429).json({ error: 'Daily limit reached' });
    }

    let sources = [];
    let contextText = '';

    const { chunks: top, dims, retrievalQuery } = await retrieveInterviewChunks(question);
    console.log(`[timing][entrevistas] retrieval=${Date.now() - t0}ms model=${EMBEDDING_MODEL} dims=${dims}`);
    if (shouldDebugRag()) {
      console.log('[rag][entrevistas]', {
        index: getIndexNameForNamespace('entrevistas'),
        namespace: 'entrevistas',
        originalQuestion: question,
        embeddingQuery: retrievalQuery,
        matches: top.map(t => ({
          id: t.id,
          score: Number(t.score?.toFixed?.(4) ?? t.score),
          rerankScore: Number(t.rerankScore?.toFixed?.(4) ?? t.rerankScore),
          lexicalHits: t.lexicalHits,
          llmReranked: Boolean(t.llmReranked),
          title: t.meta?.title || '',
          channel: t.meta?.channel || '',
          start_seconds: t.meta?.start_seconds ?? null,
        })),
      });
    }

    if (top.length > 0) {
      contextText = top.map((t, i) => {
        const secs  = t.meta?.start_seconds ?? null;
        const tempo = secs != null ? formatTime(secs) : '';
        const esc   = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const text  = t.meta?.context_text || t.text;
        return `<fonte id="${i + 1}" titulo="${esc(t.meta?.title)}" tempo="${esc(tempo)}">\n${text}\n</fonte>`;
      }).join('\n');
      sources = top.map((t, i) => ({
        id:            i + 1,
        text:          t.text || '',
        context_text:  t.meta?.context_text || '',
        source_url:    t.meta?.source_url || '',
        title:         t.meta?.title || '',
        channel:       t.meta?.channel || '',
        individual:    t.meta?.individual || '',
        published_at:  t.meta?.published_at || '',
        start_seconds: t.meta?.start_seconds ?? null,
        end_seconds:   t.meta?.end_seconds ?? null,
        score:         t.score,
      }));
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `<contexto>\n${contextText}\n</contexto>`,
          `<pergunta>${question}</pergunta>`,
          'Resposta:',
        ].join('\n'),
      },
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.socket) res.socket.setNoDelay(true);
    res.flushHeaders();

    const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const stream = await client.chat.completions.create({
        model: 'gpt-4.1',
        messages,
        max_tokens: 1400,
        stream: true,
      });
      console.log(`[timing][entrevistas] openai_stream_open=${Date.now() - t0}ms`);

      let firstToken = true;
      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) {
          if (firstToken) {
            console.log(`[timing][entrevistas] first_token=${Date.now() - t0}ms`);
            firstToken = false;
          }
          sendEvent({ token });
        }
      }

      console.log(`[timing][entrevistas] total=${Date.now() - t0}ms`);
      sendEvent({ done: true, sources });
      res.end();
    } catch (streamErr) {
      console.error('stream error:', streamErr?.message || streamErr);
      sendEvent({ error: 'Erro ao gerar resposta.' });
      res.end();
    }
  } catch (err) {
    console.error('chat-entrevistas error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Erro ao gerar resposta.' })}\n\n`);
      res.end();
    }
  }
}
