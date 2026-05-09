import { neon } from '@neondatabase/serverless';
import { Pinecone } from '@pinecone-database/pinecone';
import { execFileSync } from 'child_process';
import OpenAI from 'openai';
try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const sql    = neon(process.env.DATABASE_URL);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pc     = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index  = pc.index(process.env.PINECONE_INDEX).namespace('entrevistas');

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE      = 400;
const UPSERT_BATCH    = 100;

// Chunkeia os segmentos preservando timestamps e quebrando em fronteiras de frase.
// Prioridade de quebra: fim de frase (.!?) > pausa (,;) > limite de caracteres.
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
        flush(buffer.slice(0, i + 1));
        buffer = buffer.slice(i + 1);
        return;
      }
    }
    for (let i = buffer.length - 1; i > 0; i--) {
      if (/[,;]\s*$/.test(buffer[i].text)) {
        flush(buffer.slice(0, i + 1));
        buffer = buffer.slice(i + 1);
        return;
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

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function fetchVideoMetadata(videoId) {
  try {
    const res  = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'pt-BR,pt;q=0.9', 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();

    const mDate  = html.match(/"publishDate"\s*:\s*"([^"]+)"/) || html.match(/"uploadDate"\s*:\s*"([^"]+)"/);
    const publishedAt = mDate ? mDate[1].split('T')[0] : null;

    const mTitle   = html.match(/"title"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"/);
    const title    = mTitle ? mTitle[1] : null;

    const mChannel = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/);
    const channel  = mChannel ? mChannel[1] : null;

    return { publishedAt, title, channel };
  } catch {
    return { publishedAt: null, title: null, channel: null };
  }
}

function fetchTranscript(url) {
  const out = execFileSync('python3', ['scripts/fetch_transcript.py', url], { encoding: 'utf-8', timeout: 120000 });
  return JSON.parse(out);
}

async function embedBatch(texts) {
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return res.data.map(d => d.embedding);
}

const SPEAKER_BLOCK = 50;

async function filterSpeakerSegments(segments, individual) {
  const name = individual || 'Renan Santos';
  const kept = [];

  for (let i = 0; i < segments.length; i += SPEAKER_BLOCK) {
    const block = segments.slice(i, i + SPEAKER_BLOCK);
    const text  = block.map((s, j) => `${j}: ${s.text.trim()}`).join('\n');

    let raw;
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        temperature: 0,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: `Você receberá linhas numeradas de uma transcrição de entrevista. Identifique quais linhas são falas de "${name}" (não do entrevistador nem de terceiros). Retorne APENAS um array JSON com os números das linhas de "${name}". Exemplo: [0,1,2,5,6]. Sem texto adicional.`,
          },
          { role: 'user', content: text },
        ],
      });
      raw = res.choices[0].message.content.trim();
    } catch (err) {
      console.warn(`  bloco ${i}–${i + block.length}: erro na classificação, incluindo tudo.`, err.message);
      kept.push(...block);
      continue;
    }

    let indices;
    try { indices = JSON.parse(raw); } catch {
      console.warn(`  bloco ${i}–${i + block.length}: resposta inválida ("${raw}"), incluindo tudo.`);
      kept.push(...block);
      continue;
    }

    for (const j of indices) {
      if (block[j]) kept.push(block[j]);
    }

    process.stdout.write(`\r  filtrando segmentos ${Math.min(i + SPEAKER_BLOCK, segments.length)}/${segments.length}`);
  }

  return kept;
}

async function indexVideo(video) {
  const { id, url, individual } = video;
  const videoId = extractVideoId(url);

  if (!videoId) {
    console.warn(`[${id}] URL inválida, pulando: ${url}`);
    return false;
  }

  console.log(`[${id}] Buscando metadados e transcrição: ${url}`);
  const { publishedAt, title: ytTitle, channel } = await fetchVideoMetadata(videoId);
  const title = ytTitle || video.title || '';
  if (publishedAt) console.log(`[${id}] Data de publicação: ${publishedAt}`);
  if (ytTitle)     console.log(`[${id}] Título do YouTube: ${ytTitle}`);
  if (channel)     console.log(`[${id}] Canal: ${channel}`);

  const allSegments = fetchTranscript(url);
  console.log(`[${id}] ${allSegments.length} segmentos — filtrando falas de ${individual || 'Renan Santos'}...`);

  const segments = await filterSpeakerSegments(allSegments, individual);
  console.log(`\n[${id}] ${segments.length}/${allSegments.length} segmentos após filtro de speaker.`);

  const chunks = chunkSegments(segments);

  if (chunks.length === 0) {
    console.warn(`[${id}] Nenhum chunk útil gerado.`);
    return false;
  }

  console.log(`[${id}] ${chunks.length} chunks — gerando embeddings...`);

  let total = 0;
  for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
    const batch      = chunks.slice(i, i + UPSERT_BATCH);
    const embeddings = await embedBatch(batch.map(c => c.text));

    const batchRecords = batch.map((chunk, j) => {
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
          title:         title || '',
          channel:       channel || '',
          individual:    individual || '',
          published_at:  publishedAt || '',
          chunk:         i + j,
          start_seconds: startSeconds,
        },
      };
    });

    await index.upsert({ records: batchRecords });
    total += batchRecords.length;
    process.stdout.write(`\r  chunks ${total}/${chunks.length}`);
  }

  console.log('');
  console.log(`[${id}] Upsert de ${total} vetores concluído.`);
  return { publishedAt: publishedAt || null, title: title || null, channel: channel || null };
}

const videos = await sql`SELECT * FROM videos WHERE curated = true AND indexed = false ORDER BY created_at`;

if (videos.length === 0) {
  console.log('Nenhum vídeo pendente de indexação.');
  process.exit(0);
}

console.log(`${videos.length} vídeo(s) para indexar.\n`);

for (const video of videos) {
  try {
    const result = await indexVideo(video);
    if (result !== false) {
      const { publishedAt, title, channel } = result;
      await sql`
        UPDATE videos
        SET indexed = true, indexed_at = NOW(),
            published_at = ${publishedAt},
            title   = COALESCE(${title},   title),
            channel = COALESCE(${channel}, channel)
        WHERE id = ${video.id}
      `;
      console.log(`[${video.id}] Marcado como indexado.\n`);
    }
  } catch (err) {
    console.error(`[${video.id}] Erro ao indexar ${video.url}:`, err.message);
  }
}

console.log('Concluído.');
