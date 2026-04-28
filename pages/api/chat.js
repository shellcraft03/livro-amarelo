import OpenAI from 'openai';
import { checkRateLimit } from '../../lib/rateLimiter.js';
import { queryEmbedding } from '../../lib/vectorStore.js';

const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

async function verifyTurnstile(token) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret || !token) return false;
  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`
  });
  const j = await resp.json();
  return j.success;
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}

export default async function handler(req, res) {
  try {
    const { question, turnstileToken } = req.body || {};
    if (!question) return res.status(400).json({ error: 'Missing question' });

    const ip = getIp(req);
    const rl = await checkRateLimit(ip, 60, 60); // 60 reqs per minute (persistent when REDIS_URL set)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
    if (!rl.ok) return res.status(429).json({ error: 'Too many requests' });

    const ok = await verifyTurnstile(turnstileToken);
    if (!ok) return res.status(403).json({ error: 'Turnstile verification failed' });

    // If RAG enabled, retrieve relevant chunks and include as context
    if (process.env.USE_RAG === 'true') {
      // Try to create an embedding (with model fallbacks). If embedding not available, fall back to text-match retrieval.
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
      if (emb && emb.data && emb.data[0] && emb.data[0].embedding) {
        const qvec = emb.data[0].embedding;
        top = await queryEmbedding(qvec, 6);
      } else {
        console.warn('Embedding not available for query; using text-match fallback');
        top = await queryEmbedding(question, 6);
      }

      const contextText = top.map((t, i) => `Source ${i + 1} - ${t.meta?.file || 'unknown'}:page=${t.meta?.page} (score=${t.score?.toFixed(3)}):\n${t.text}\n---\n`).join('\n');

      const systemPrompt = `Esse modelo devera responder perguntas somente com base no arquivo pdf. Ele deverá citar o capitulo e a pagina como fonte, se possível. O Texto de retorno deverá ser separado por paragrafos de no maximo 140 caracteres para que possa ser copiado e colado em uma thread do twitter. Caso seja feita uma pergunta que não tem nada a ver com o texto, deverá ser retornada uma mensagem informando que a pergunta não faz parte do escopo ou que não existe informações sobre a pergunta.`;

      const userPrompt = `Context:\n${contextText}\nQuestion: ${question}\nAnswer:`;

      const chat = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 800
      });

      const text = chat.choices?.[0]?.message?.content || '';
      const sources = top.map((t, i) => ({ source: `Source ${i+1}`, file: t.meta?.file, page: t.meta?.page, score: t.score }));
      return res.json({ text, sources });
    }

    // Fallback: direct chat through custom app key
    const systemPrompt = `Esse modelo devera responder perguntas somente com base no arquivo pdf. Ele deverá citar o capitulo e a pagina como fonte, se possível. O Texto de retorno deverá ser separado por paragrafos de no maximo 140 caracteres para que possa ser copiado e colado em uma thread do twitter. Caso seja feita uma pergunta que não tem nada a ver com o texto, deverá ser retornada uma mensagem informando que a pergunta não faz parte do escopo ou que não existe informações sobre a pergunta.`;

    const chat = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      max_tokens: 700
    });

    const text = chat.choices?.[0]?.message?.content || '';
    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}
