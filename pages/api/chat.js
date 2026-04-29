import OpenAI from 'openai';
import { checkRateLimit } from '../../lib/rateLimiter.js';
import { queryEmbedding } from '../../lib/vectorStore.js';
import { verifyTurnstile } from '../../lib/turnstile.js';

const MAX_QUESTION_LENGTH = 1000;

const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Esse modelo devera responder perguntas somente com base no arquivo pdf. Ele deverá citar o capitulo e a pagina como fonte, se possível. O Texto de retorno deverá ser separado por paragrafos. Caso seja feita uma pergunta que não tem nada a ver com o texto, deverá ser retornada uma mensagem informando que a pergunta não faz parte do escopo ou que não existe informações sobre a pergunta. A resposta deve conter somente propostas concretas e objetivas extraídas diretamente do texto — não inclua frases genéricas, introduções vagas, conclusões superficiais ou afirmações que não estejam respaldadas por uma proposta específica do documento.`;

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}

function sanitizeQuestion(raw) {
  return raw.toString().trim().slice(0, MAX_QUESTION_LENGTH);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { question: rawQuestion, turnstileToken } = req.body || {};
    if (!rawQuestion) return res.status(400).json({ error: 'Missing question' });

    const question = sanitizeQuestion(rawQuestion);
    if (!question) return res.status(400).json({ error: 'Question is empty' });

    const ip = getIp(req);

    // Per-minute limit: 10 requests / 60s
    const rl = await checkRateLimit(ip, 10, 60);
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
    if (!rl.ok) return res.status(429).json({ error: 'Too many requests' });

    // Daily limit: 50 requests / 24h
    const daily = await checkRateLimit(`${ip}:day`, 50, 86400);
    if (!daily.ok) return res.status(429).json({ error: 'Daily limit reached' });

    const okRes = await verifyTurnstile(turnstileToken);
    if (!okRes.ok) {
      console.warn('Turnstile failed:', okRes);
      return res.status(403).json({ error: 'Turnstile verification failed' });
    }

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

      let top;
      if (emb?.data?.[0]?.embedding) {
        top = await queryEmbedding(emb.data[0].embedding, 6);
      } else {
        console.warn('Embedding not available for query; using text-match fallback');
        top = await queryEmbedding(question, 6);
      }

      const contextText = top.map((t, i) =>
        `Source ${i + 1} - ${t.meta?.file || 'unknown'}:page=${t.meta?.page} (score=${t.score?.toFixed(3)}):\n${t.text}\n---\n`
      ).join('\n');

      const userPrompt = `Context:\n${contextText}\nQuestion: """${question}"""\nAnswer:`;

      const chat = await client.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 600
      });

      const text = chat.choices?.[0]?.message?.content || '';
      const sources = top.map((t, i) => ({ source: `Source ${i + 1}`, file: t.meta?.file, page: t.meta?.page, score: t.score }));
      return res.json({ text, sources });
    }

    // Fallback: direct chat without RAG context
    const chat = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Question: """${question}"""\nAnswer:` }
      ],
      max_tokens: 600
    });

    const text = chat.choices?.[0]?.message?.content || '';
    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
