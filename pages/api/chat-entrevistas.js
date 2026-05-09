import OpenAI from 'openai';
import { checkMinuteLimit, checkDailyLimit, logBlock } from '../../lib/rateLimiter.js';
import { queryEmbeddingInNamespace } from '../../lib/vectorStore.js';
import { verifyTurnstile } from '../../lib/turnstile.js';

const MAX_QUESTION_LENGTH = 1000;
const TURNSTILE_ACTION = 'chat';

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

    const emb = await client.embeddings.create({ model: 'text-embedding-3-large', input: question });
    const embedding = emb?.data?.[0]?.embedding;
    console.log(`[timing][entrevistas] embedding=${Date.now() - t0}ms`);

    let sources = [];
    let contextText = '';

    if (embedding) {
      const top = await queryEmbeddingInNamespace(embedding, 'entrevistas', 8);
      console.log(`[timing][entrevistas] pinecone=${Date.now() - t0}ms`);
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
      { role: 'user',   content: `<contexto>\n${contextText}\n</contexto>\n<pergunta>${question}</pergunta>\nResposta:` },
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
        max_tokens: 800,
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
