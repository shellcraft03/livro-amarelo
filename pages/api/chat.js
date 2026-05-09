import OpenAI from 'openai';
import { checkMinuteLimit, checkDailyLimit, logBlock } from '../../lib/rateLimiter.js';
import { queryEmbedding } from '../../lib/vectorStore.js';
import { verifyTurnstile } from '../../lib/turnstile.js';

const MAX_QUESTION_LENGTH = 1000;
const TURNSTILE_ACTION = 'chat';

const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT_LIVRO;
if (!SYSTEM_PROMPT) throw new Error('Missing env var: SYSTEM_PROMPT_LIVRO');

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2kb',
    },
    responseLimit: false,
  },
};

function getIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  return (forwardedFor || realIp || req.socket.remoteAddress || '').toString().split(',')[0].trim() || 'unknown';
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

    const [okRes, rl, daily] = await Promise.all([
      verifyTurnstile(turnstileToken, { ip, action: TURNSTILE_ACTION }),
      checkMinuteLimit(ip),
      checkDailyLimit(ip),
    ]);
    console.log(`[timing][chat] auth=${Date.now() - t0}ms`);

    if (!okRes.ok) {
      console.warn(`[turnstile] failed ip=${ip} reason=${okRes.reason || 'unknown'}`);
      return res.status(403).json({ error: 'Turnstile verification failed' });
    }

    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
    if (!rl.ok) {
      console.warn(`[rate-limit] per-minute ip=${ip} remaining=${rl.remaining} reset=${rl.resetSeconds}s`);
      await logBlock(ip, 'minute');
      return res.status(429).json({ error: 'Too many requests' });
    }

    if (!daily.ok) {
      console.warn(`[rate-limit] daily ip=${ip} remaining=${daily.remaining} reset=${daily.resetSeconds}s`);
      await logBlock(ip, 'daily');
      return res.status(429).json({ error: 'Daily limit reached' });
    }

    let messages;
    let sources = [];

    if (process.env.USE_RAG === 'true') {
      const preferred = process.env.EMBEDDING_MODEL ? process.env.EMBEDDING_MODEL.split(',') : ['text-embedding-3-small'];
      const alternatives = ['text-embedding-3-large', 'text-embedding-3-small', 'text-embedding-ada-002'];
      const modelsToTry = [...new Set([...preferred, ...alternatives])];
      let emb = null;
      for (const m of modelsToTry) {
        try {
          emb = await client.embeddings.create({ model: m, input: question });
          break;
        } catch (e) {
          console.error(`embedding model ${m} failed:`, e?.message || e);
        }
      }
      console.log(`[timing][chat] embedding=${Date.now() - t0}ms`);

      let top;
      if (emb?.data?.[0]?.embedding) {
        top = await queryEmbedding(emb.data[0].embedding, 6);
      } else {
        console.warn('Embedding not available for query; using text-match fallback');
        top = await queryEmbedding(question, 6);
      }
      console.log(`[timing][chat] pinecone=${Date.now() - t0}ms`);

      const contextText = top.map((t, i) =>
        `<fonte id="${i + 1}" arquivo="${t.meta?.file || 'unknown'}" pagina="${t.meta?.page}" score="${t.score?.toFixed(3)}">\n${t.text}\n</fonte>`
      ).join('\n');

      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `<contexto>\n${contextText}\n</contexto>\n<pergunta>${question}</pergunta>\nResposta:` }
      ];
      sources = top.map((t, i) => ({ source: `Source ${i + 1}`, file: t.meta?.file, page: t.meta?.page, score: t.score }));
    } else {
      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `<pergunta>${question}</pergunta>\nResposta:` }
      ];
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.socket) res.socket.setNoDelay(true);
    res.flushHeaders();

    const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const stream = await client.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages,
        max_tokens: 600,
        stream: true,
      });
      console.log(`[timing][chat] openai_stream_open=${Date.now() - t0}ms`);

      let firstToken = true;
      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) {
          if (firstToken) {
            console.log(`[timing][chat] first_token=${Date.now() - t0}ms`);
            firstToken = false;
          }
          sendEvent({ token });
        }
      }

      console.log(`[timing][chat] total=${Date.now() - t0}ms`);
      sendEvent({ done: true, sources });
      res.end();
    } catch (streamErr) {
      console.error('stream error:', streamErr?.message || streamErr);
      sendEvent({ error: 'Erro ao gerar resposta.' });
      res.end();
    }
  } catch (err) {
    console.error('chat error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Erro ao gerar resposta.' })}\n\n`);
      res.end();
    }
  }
}
