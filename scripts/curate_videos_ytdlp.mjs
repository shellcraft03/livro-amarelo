import { neon } from '@neondatabase/serverless';
import { execFileSync } from 'child_process';
import OpenAI from 'openai';

try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const sql    = neon(process.env.DATABASE_URL);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TRANSCRIPT_SAMPLE_CHARS = 3000;

const SYSTEM_PROMPT = `Você é um curador de conteúdo de uma plataforma política sobre Renan Santos, pré-candidato à presidência do Brasil pelo Partido Missão.

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

async function fetchTranscriptSample(url) {
  const out = execFileSync('python3', ['scripts/fetch_transcript.py', url], { encoding: 'utf-8', timeout: 120000 });
  const segments = JSON.parse(out);

  const full = segments.map(s => s.text).join(' ');
  const totalChars = full.length;

  const third = Math.floor(totalChars / 3);
  const sample = [
    full.slice(0, 1000),
    full.slice(third, third + 1000),
    full.slice(-1000),
  ].join('\n\n[...]\n\n');

  return { sample: sample.slice(0, TRANSCRIPT_SAMPLE_CHARS), totalChars };
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

  let sample, totalChars;
  try {
    ({ sample, totalChars } = await fetchTranscriptSample(url));
  } catch (err) {
    console.warn(`[${id}] Não foi possível obter transcrição, pulando (será tentado novamente): ${err.message}`);
    return;
  }

  const userMessage = [
    title       ? `Título informado: ${title}` : null,
    individual  ? `Entrevistado informado: ${individual}` : null,
    `Tamanho total da transcrição: ~${Math.round(totalChars / 5)} palavras`,
    `\nTrecho da transcrição:\n${sample}`,
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
