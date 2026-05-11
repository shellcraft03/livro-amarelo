import OpenAI from 'openai';
import { checkMinuteLimit, checkDailyLimit, logBlock } from '../../lib/rateLimiter.js';
import { hasValidHumanSession } from '../../lib/session.js';
import { getIndexNameForNamespace, queryEmbeddingInNamespace } from '../../lib/vectorStore.js';
import { verifyTurnstile } from '../../lib/turnstile.js';

const MAX_QUESTION_LENGTH = 1000;
const TURNSTILE_ACTION = 'chat';
const EMBEDDING_MODEL = 'text-embedding-3-large';
const QUERY_REWRITE_MODEL = process.env.QUERY_REWRITE_MODEL || 'gpt-4.1-mini';

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
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content: [
            'Voce reescreve perguntas para busca vetorial em transcricoes de entrevistas de Renan Santos.',
            'Nao responda a pergunta.',
            'Gere uma consulta de recuperacao densa, com 3 partes em texto simples:',
            '1) tema central sem frases conversacionais;',
            '2) palavras-chave e sinonimos relevantes;',
            '3) uma passagem hipotetica curta do tipo de trecho que deveria ser encontrado na transcricao.',
            'Nao inclua opinioes, fatos novos ou conclusoes nao presentes na pergunta.',
            'Nao escreva JSON, markdown, bullets ou explicacoes.',
          ].join(' '),
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
  if (!terms.length) return matches;

  return matches
    .map(match => {
      const haystack = normalizeText(`${match.meta?.title || ''} ${match.text || ''}`);
      const hits = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      const coverage = hits / terms.length;
      const titleHits = terms.reduce((sum, term) => sum + (normalizeText(match.meta?.title).includes(term) ? 1 : 0), 0);
      return {
        ...match,
        rerankScore: (match.score || 0) + coverage * 0.12 + titleHits * 0.02,
        lexicalHits: hits,
      };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

async function retrieveInterviewChunks(question) {
  const focusedQuery = await rewriteRetrievalQuery(question);
  const queries = [...new Set([focusedQuery, question])];
  const emb = await client.embeddings.create({ model: EMBEDDING_MODEL, input: queries });
  const embeddings = emb?.data?.map(d => d.embedding).filter(Boolean) || [];

  const resultSets = await Promise.all(
    embeddings.map(embedding => queryEmbeddingInNamespace(embedding, 'entrevistas', 20))
  );

  const byId = new Map();
  for (const match of resultSets.flat()) {
    const current = byId.get(match.id);
    if (!current || (match.score || 0) > (current.score || 0)) byId.set(match.id, match);
  }

  const terms = topicTerms(question);
  const ranked = rankMatches([...byId.values()], question);
  const relevant = terms.length > 0
    ? ranked.filter(match => match.lexicalHits > 0)
    : ranked;

  if (shouldDebugRag() && terms.length > 0 && relevant.length === 0 && ranked.length > 0) {
    console.warn('[rag][entrevistas] no lexical match for topic terms; dropping semantic-only matches', {
      terms,
      bestSemanticMatches: ranked.slice(0, 5).map(match => ({
        id: match.id,
        score: Number(match.score?.toFixed?.(4) ?? match.score),
        title: match.meta?.title || '',
      })),
    });
  }

  return {
    chunks: relevant.slice(0, 12),
    dims: embeddings[0]?.length || 0,
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
        return `<fonte id="${i + 1}" titulo="${esc(t.meta?.title)}" tempo="${esc(tempo)}">\n${t.text}\n</fonte>`;
      }).join('\n');
      sources = top.map((t, i) => ({
        id:            i + 1,
        text:          t.text || '',
        source_url:    t.meta?.source_url || '',
        title:         t.meta?.title || '',
        channel:       t.meta?.channel || '',
        individual:    t.meta?.individual || '',
        published_at:  t.meta?.published_at || '',
        start_seconds: t.meta?.start_seconds ?? null,
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
          '<instrucao_resposta>',
          'Responda de forma substancial, explorando os principais pontos encontrados nas fontes.',
          'Quando houver material suficiente, organize a resposta em 3 a 6 parágrafos curtos.',
          'Use detalhes concretos das entrevistas e cite os trechos relevantes no formato exigido pelo sistema.',
          'Se o contexto for fraco ou insuficiente, diga isso claramente em vez de preencher lacunas.',
          '</instrucao_resposta>',
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
