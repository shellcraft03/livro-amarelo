import formidable from 'formidable';
import fs from 'fs/promises';
import pdf from 'pdf-parse';
import OpenAI from 'openai';
import { addItems } from '../../lib/vectorStore.js';
import { checkRateLimit } from '../../lib/rateLimiter.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function chunkText(text, maxChars = 800) {
  const paragraphs = text.split(/\n{2,}|\r\n{2,}/g).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paragraphs) {
    if ((cur + '\n\n' + p).length > maxChars) {
      if (cur) chunks.push(cur.trim());
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const form = new formidable.IncomingForm();

  const parsed = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });

  const file = parsed.files?.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const rl = checkRateLimit(ip, 5, 60); // 5 uploads per minute per IP
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
  if (!rl.ok) return res.status(429).json({ error: 'Too many requests' });

  // Turnstile verification
  const turnstileToken = parsed.fields?.turnstileToken || parsed.fields?.turnstiletoken;
  if (!turnstileToken) return res.status(403).json({ error: 'Missing turnstile token' });
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return res.status(500).json({ error: 'Turnstile not configured' });
  const verifyResp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(turnstileToken)}`
  });
  const verifyJson = await verifyResp.json();
  if (!verifyJson.success) return res.status(403).json({ error: 'Turnstile verification failed' });
  // Read file buffer
  const buffer = await fs.readFile(file.filepath || file.path);

  // Extract text using pdf-parse
  let data;
  try {
    data = await pdf(buffer);
  } catch (err) {
    console.error('PDF parse error', err);
    return res.status(500).json({ error: 'Failed to parse PDF' });
  }

  // pdf-parse often separates pages with form-feed \f
  const pages = (data.text || '').split(/\f/).map(p => p.trim()).filter(Boolean);

  // Create chunks per page (or smaller chunks if page is large)
  const items = [];
  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i];
    const pageChunks = chunkText(pageText, 1000);
    for (let j = 0; j < pageChunks.length; j++) {
      items.push({ id: `${Date.now()}-${i}-${j}`, text: pageChunks[j], meta: { page: i + 1, pageChunk: j } });
    }
  }

  // Generate embeddings for each chunk
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const outItems = [];
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    try {
      const emb = await client.embeddings.create({ model: 'text-embedding-3-small', input: it.text });
      const vector = emb.data[0].embedding;
      outItems.push({ ...it, embedding: vector });
    } catch (err) {
      console.error('Embedding error', err);
    }
  }

  await addItems(outItems);

  res.json({ ok: true, pages: pages.length, chunks: outItems.length });
}
