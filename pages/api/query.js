import OpenAI from 'openai';
import { queryEmbedding } from '../../lib/vectorStore.js';
import { checkRateLimit } from '../../lib/rateLimiter.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    // Rate limit by IP
    const ip = getIp(req);
    const rl = checkRateLimit(ip, 30, 60);
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
    if (!rl.ok) return res.status(429).json({ error: 'Too many requests' });

    // Verify Turnstile token
    const ok = await verifyTurnstile(turnstileToken);
    if (!ok) return res.status(403).json({ error: 'Turnstile verification failed' });

    const emb = await client.embeddings.create({ model: 'text-embedding-3-small', input: question });
    const qvec = emb.data[0].embedding;

    const top = await queryEmbedding(qvec, 4);

    const contextText = top.map((t, i) => `Source ${i + 1} [score=${t.score.toFixed(3)}]:\n${t.text}\n---\n`).join('\n');

    const systemPrompt = `You are a helpful assistant that answers questions based on the provided context. Provide a concise answer and cite sources by "Source N" where relevant. If the answer is not in the sources, say you don't know.`;

    const userPrompt = `Context:\n${contextText}\n\nQuestion: ${question}\n\nAnswer with a short summary and list the sources used (include chunkIndex from metadata if available).`;

    const chat = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 500
    });

    const text = chat.choices[0].message.content;

    const sources = top.map((t, i) => `Source ${i + 1}: chunkIndex=${t.meta?.chunkIndex}`);

    res.json({ text, sources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}
