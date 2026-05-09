import { neon } from '@neondatabase/serverless';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const sql    = neon(process.env.DATABASE_URL);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pc     = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index  = pc.index(process.env.PINECONE_INDEX).namespace('entrevistas');
const ai     = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CHUNK_SIZE  = 400;
const UPSERT_BATCH             = 100;
const EMBEDDING_MODEL = 'text-embedding-3-small';

const CURATION_PROMPT = `Você é um curador de conteúdo de uma plataforma política sobre Renan Santos, pré-candidato à presidência do Brasil pelo Partido Missão.

Seu trabalho é avaliar transcrições de vídeos do YouTube submetidos por usuários.

CRITÉRIOS DE APROVAÇÃO — o vídeo deve atender a TODOS:
1. Renan Santos é o entrevistado principal (ou convidado central) e fala de forma substantiva sobre temas políticos, de governo, sociais ou sobre sua candidatura.
2. O vídeo é uma unidade completa e autônoma — pode ser uma entrevista tradicional, podcast, live ou episódio de série (Parte 1, Ep. 2 etc.), desde que não seja um corte avulso de trecho de um vídeo maior.
3. O conteúdo é genuíno: não é paródia, sátira, imitação nem vídeo humorístico.

CRITÉRIOS DE REPROVAÇÃO — reprovar se qualquer um for verdadeiro:
- Renan Santos não é o entrevistado principal (é apenas citado, aparece brevemente ou o foco do vídeo é outra pessoa).
- Renan Santos fala, mas não aborda temas políticos, de governo ou de sua candidatura de forma substantiva (ex: participação rápida em programa de auditório ou evento social).
- É um corte ou compilação de trechos avulsos de entrevistas maiores.
- É paródia, sátira, imitação ou vídeo humorístico.
- O vídeo é publicado pelo próprio canal de Renan Santos ou por canais ligados ao MBL, Partido Missão ou MBLive — apenas entrevistas concedidas a veículos independentes são aceitas.
- Não é possível determinar com clareza que se trata de Renan Santos sendo entrevistado.

Responda SOMENTE com JSON válido, sem texto adicional:
{ "approved": true | false, "reason": "explicação curta em português" }`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanYouTubeUrl(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : url;
}

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function sanitizeField(value, maxLen = 200) {
  if (!value || typeof value !== 'string') return null;
  return value.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, maxLen);
}

async function fetchVideoMetadata(videoId) {
  try {
    const res  = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'pt-BR,pt;q=0.9', 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const mDate    = html.match(/"publishDate"\s*:\s*"([^"]+)"/) || html.match(/"uploadDate"\s*:\s*"([^"]+)"/);
    const mTitle   = html.match(/"title"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"/);
    const mChannel = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/);
    return {
      publishedAt: mDate    ? mDate[1].split('T')[0] : null,
      title:       mTitle   ? mTitle[1]              : null,
      channel:     mChannel ? mChannel[1]            : null,
    };
  } catch {
    return { publishedAt: null, title: null, channel: null };
  }
}

// ─── Gemini transcript (chunked URL — handles videos of any length) ─────────

async function fetchTranscript(url) {
  const cleanUrl = cleanYouTubeUrl(url);
  const videoId  = extractVideoId(url);
  const CHUNK_MIN = 60;

  // 1. Get real duration from YouTube page HTML
  let totalMinutes = 90; // fallback if fetch fails
  try {
    const res  = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'pt-BR,pt;q=0.9', 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const m = html.match(/"lengthSeconds"\s*:\s*"([0-9]+)"/);
    if (m) totalMinutes = Math.ceil(parseInt(m[1], 10) / 60);
  } catch { /* use fallback */ }

  const numChunks = Math.ceil(totalMinutes / CHUNK_MIN);
  console.log(`  ~${totalMinutes} min → ${numChunks} chunk(s)`);

  // 2. Transcribe each chunk
  const allSegments = [];
  for (let i = 0; i < numChunks; i++) {
    const startMin = i * CHUNK_MIN;
    const endMin   = Math.min((i + 1) * CHUNK_MIN, totalMinutes);

    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text:
        `Transcribe the speech from minute ${startMin} to minute ${endMin} of this YouTube video: ${cleanUrl}\n\n` +
        `Identify each speaker by name or role (e.g. "Renan Santos", "Entrevistador", "Apresentador").\n` +
        `Return ONLY a valid JSON array: [{"speaker": "name or role", "text": "spoken words", "offset_seconds": N}]\n` +
        `offset_seconds must be the absolute time from the video start (minute ${startMin} = ${startMin * 60}s). No extra text.`,
      }] }],
      config: { responseMimeType: 'application/json' },
    });

    let parsed;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      const lastClose = res.text.lastIndexOf('},');
      if (lastClose > 0) {
        try { parsed = JSON.parse(res.text.slice(0, lastClose + 1) + ']'); }
        catch { console.warn(`  chunk ${startMin}-${endMin}min: JSON recovery failed, skipping`); continue; }
      } else {
        console.warn(`  chunk ${startMin}-${endMin}min: invalid JSON, skipping`);
        continue;
      }
    }

    for (const s of parsed) {
      const text = String(s.text || '').trim();
      if (text) allSegments.push({
        text,
        speaker: String(s.speaker || '').trim(),
        offset:  Math.round((Number(s.offset_seconds) || startMin * 60) * 1000),
      });
    }
    process.stdout.write(`\r  transcribed ${endMin}/${totalMinutes} min (${allSegments.length} segments)`);
  }

  console.log('');
  return allSegments;
}

// ─── Curation (GPT, uses transcript sample) ──────────────────────────────────

async function evaluateCuration(segments, video) {
  const full       = segments.map(s => s.speaker ? `[${s.speaker}]: ${s.text}` : s.text).join('\n').trim();
  const title      = sanitizeField(video.title, 300);
  const individual = sanitizeField(video.individual, 200);

  const userMessage = [
    title      ? `Título informado: ${title}`           : null,
    individual ? `Entrevistado informado: ${individual}` : null,
    `\nTranscrição:\n${full}`,
  ].filter(Boolean).join('\n');

  const res = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0,
    max_tokens: 200,
    messages: [
      { role: 'system', content: CURATION_PROMPT },
      { role: 'user',   content: userMessage },
    ],
  });

  const verdict = JSON.parse(res.choices[0].message.content.trim());
  return { approved: Boolean(verdict.approved), reason: String(verdict.reason || '').slice(0, 500) };
}

// ─── Speaker filter (uses Gemini speaker labels) ─────────────────────────────

function filterSpeakerSegments(segments, individual) {
  const name = (individual || 'Renan Santos').toLowerCase();
  const kept = segments.filter(s => s.speaker && s.speaker.toLowerCase().includes(name));
  // Fallback: if Gemini didn't label any segment, include all
  return kept.length > 0 ? kept : segments;
}

// ─── Chunking ────────────────────────────────────────────────────────────────

function chunkSegments(segments, maxChars = CHUNK_SIZE) {
  const chunks = [];
  let buffer = [];

  function flush(segs) {
    if (segs.length === 0) return;
    const raw  = segs.map(s => s.text.trim()).filter(Boolean).join(' ').trim();
    const text = raw.replace(/[<>]/g, m => m === '<' ? '&lt;' : '&gt;');
    if (text.length >= 80) chunks.push({ text, startOffsetMs: segs[0].offset });
  }

  function splitBuffer() {
    for (let i = buffer.length - 1; i > 0; i--) {
      if (/[.!?]\s*$/.test(buffer[i].text)) {
        flush(buffer.slice(0, i + 1)); buffer = buffer.slice(i + 1); return;
      }
    }
    for (let i = buffer.length - 1; i > 0; i--) {
      if (/[,;]\s*$/.test(buffer[i].text)) {
        flush(buffer.slice(0, i + 1)); buffer = buffer.slice(i + 1); return;
      }
    }
    const mid = Math.max(1, Math.floor(buffer.length / 2));
    flush(buffer.slice(0, mid));
    buffer = buffer.slice(mid);
  }

  for (const seg of segments) {
    const word = seg.text.trim();
    if (!word) continue;
    buffer.push(seg);
    if (buffer.map(s => s.text).join(' ').length > maxChars) splitBuffer();
  }

  flush(buffer);
  return chunks;
}

// ─── Embeddings + upsert ─────────────────────────────────────────────────────

async function embedBatch(texts) {
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return res.data.map(d => d.embedding);
}

async function upsertChunks(chunks, videoId, url, title, channel, individual, publishedAt) {
  let total = 0;
  for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
    const batch      = chunks.slice(i, i + UPSERT_BATCH);
    const embeddings = await embedBatch(batch.map(c => c.text));

    const records = batch.map((chunk, j) => {
      const startSeconds = Math.floor(chunk.startOffsetMs / 1000);
      return {
        id:     `yt-${videoId}-c${i + j}`,
        values: embeddings[j],
        metadata: {
          text:          chunk.text,
          source:        'youtube',
          video_id:      videoId,
          url,
          source_url:    `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}s`,
          title:         title        || '',
          channel:       channel      || '',
          individual:    individual   || '',
          published_at:  publishedAt  || '',
          chunk:         i + j,
          start_seconds: startSeconds,
        },
      };
    });

    await index.upsert({ records });
    total += records.length;
    process.stdout.write(`\r  chunks ${total}/${chunks.length}`);
  }
  return total;
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

async function processVideo(video, { skipCuration = false } = {}) {
  const { id, url, individual } = video;
  const videoId = extractVideoId(url);

  if (!videoId) {
    console.warn(`[${id}] Invalid URL, skipping: ${url}`);
    return;
  }

  console.log(`[${id}] ${skipCuration ? 'Indexing' : 'Processing'}: ${url}`);

  // 1. Fetch full transcript via Gemini chunks (used for both curation and indexing)
  let segments;
  try {
    segments = await fetchTranscript(url);
    console.log(`[${id}] ${segments.length} segments from Gemini.`);
  } catch (err) {
    console.warn(`[${id}] Could not fetch transcript, skipping (will retry): ${err.message}`);
    return;
  }

  // 2. Curation — GPT evaluates the full transcript (skipped if already approved)
  if (!skipCuration) {
    let approved, reason;
    try {
      ({ approved, reason } = await evaluateCuration(segments, video));
    } catch (err) {
      console.error(`[${id}] Curation error: ${err.message}`);
      return;
    }

    await sql`
      UPDATE videos
      SET curated = ${approved}, rejection_reason = ${approved ? null : reason}, curated_at = NOW()
      WHERE id = ${id}
    `;

    if (!approved) {
      console.log(`[${id}] ✗ Rejected: ${reason}\n`);
      return;
    }
    console.log(`[${id}] ✓ Approved: ${reason}`);
  }

  // 3. Metadata
  const { publishedAt, title: ytTitle, channel } = await fetchVideoMetadata(videoId);
  const title = ytTitle || video.title || '';
  if (publishedAt) console.log(`[${id}] Published: ${publishedAt}`);
  if (ytTitle)     console.log(`[${id}] Title: ${ytTitle}`);
  if (channel)     console.log(`[${id}] Channel: ${channel}`);

  // 4. Speaker filter (GPT)
  const filtered = await filterSpeakerSegments(segments, individual);
  console.log(`\n[${id}] ${filtered.length}/${segments.length} segments after speaker filter.`);

  // 5. Chunk, embed, upsert
  const chunks = chunkSegments(filtered);
  if (chunks.length === 0) {
    console.warn(`[${id}] No usable chunks generated.`);
    return;
  }

  console.log(`[${id}] ${chunks.length} chunks — generating embeddings...`);
  const total = await upsertChunks(chunks, videoId, url, title, channel, individual, publishedAt);

  // 6. Mark as indexed
  await sql`
    UPDATE videos
    SET indexed = true, indexed_at = NOW(),
        published_at = ${publishedAt},
        title   = COALESCE(${title},   title),
        channel = COALESCE(${channel}, channel)
    WHERE id = ${id}
  `;

  console.log(`\n[${id}] Done — ${total} vectors upserted.\n`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const pending          = await sql`SELECT * FROM videos WHERE curated IS NULL ORDER BY created_at`;
const approvedNotIndexed = await sql`SELECT * FROM videos WHERE curated = true AND indexed = false ORDER BY created_at`;

if (pending.length === 0 && approvedNotIndexed.length === 0) {
  console.log('No videos to process.');
  process.exit(0);
}

if (pending.length > 0) {
  console.log(`${pending.length} video(s) pending curation.\n`);
  for (const video of pending) {
    try { await processVideo(video, { skipCuration: false }); }
    catch (err) { console.error(`[${video.id}] Unexpected error:`, err.message); }
  }
}

if (approvedNotIndexed.length > 0) {
  console.log(`${approvedNotIndexed.length} approved video(s) pending indexing.\n`);
  for (const video of approvedNotIndexed) {
    try { await processVideo(video, { skipCuration: true }); }
    catch (err) { console.error(`[${video.id}] Unexpected error:`, err.message); }
  }
}

console.log('Done.');
