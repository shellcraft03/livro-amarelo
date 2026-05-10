import { neon } from '@neondatabase/serverless';
import { YoutubeTranscript } from 'youtube-transcript';
import OpenAI from 'openai';
import { loadCached, saveCache } from './lib/transcript_cache.mjs';

try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const sql    = neon(process.env.DATABASE_URL);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT_CURADORIA;

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function fetchTranscript(url, videoId) {
  if (videoId) {
    const cached = await loadCached(videoId);
    if (cached) {
      const full = cached.map(s => s.text).join(' ');
      return { full, totalChars: full.length };
    }
  }

  let segments;
  try {
    segments = await YoutubeTranscript.fetchTranscript(url, { lang: 'pt' });
  } catch {
    segments = await YoutubeTranscript.fetchTranscript(url);
  }

  if (videoId) await saveCache(videoId, segments);

  const full = segments.map(s => s.text).join(' ');
  return { full, totalChars: full.length };
}

function sanitizeField(value, maxLen = 200) {
  if (!value || typeof value !== 'string') return null;
  return value.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, maxLen);
}

async function curate(video) {
  const { id, url } = video;
  const title      = sanitizeField(video.title, 300);
  const individual = sanitizeField(video.individual, 200);

  console.log(`[${id}] Curando: ${url}`);

  const videoId = extractVideoId(url);
  let full, totalChars;
  try {
    ({ full, totalChars } = await fetchTranscript(url, videoId));
  } catch (err) {
    console.warn(`[${id}] Não foi possível obter transcrição, pulando (será tentado novamente): ${err.message}`);
    return;
  }

  const userMessage = [
    title       ? `Título informado: ${title}` : null,
    individual  ? `Entrevistado informado: ${individual}` : null,
    `Tamanho total da transcrição: ~${Math.round(totalChars / 5)} palavras`,
    `\nTranscrição:\n${full}`,
  ].filter(Boolean).join('\n');

  let raw;
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage },
      ],
    });
    raw = res.choices[0].message.content.trim();
  } catch (err) {
    console.error(`[${id}] Erro na chamada OpenAI: ${err.message}`);
    return;
  }

  let verdict;
  try {
    verdict = JSON.parse(raw);
  } catch {
    console.error(`[${id}] Resposta inválida do modelo: ${raw}`);
    return;
  }

  const approved = Boolean(verdict.approved);
  const reason   = String(verdict.reason || '').slice(0, 500);

  await sql`
    UPDATE videos
    SET curated          = ${approved},
        rejection_reason = ${approved ? null : reason},
        curated_at       = NOW()
    WHERE id = ${id}
  `;

  console.log(`[${id}] ${approved ? '✓ Aprovado' : '✗ Reprovado'}: ${reason}\n`);
}

const pending = await sql`
  SELECT * FROM videos
  WHERE curated IS NULL
  ORDER BY created_at
`;

if (pending.length === 0) {
  console.log('Nenhum vídeo pendente de curadoria.');
  process.exit(0);
}

console.log(`${pending.length} vídeo(s) para curar.\n`);

for (const video of pending) {
  await curate(video);
}

console.log('Curadoria concluída.');
