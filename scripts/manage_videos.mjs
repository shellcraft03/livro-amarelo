import { neon } from '@neondatabase/serverless';
import { Pinecone } from '@pinecone-database/pinecone';
import { createInterface } from 'node:readline/promises';

try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const sql  = neon(process.env.DATABASE_URL);
const pc   = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const idx  = pc.index(process.env.PINECONE_INDEX_ENTREVISTAS || process.env.PINECONE_INDEX).namespace('entrevistas');
const mode = process.argv[2];

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function listPending() {
  const rows = await sql`
    SELECT id, url, title, individual, created_at
    FROM videos WHERE curated IS NULL ORDER BY created_at
  `;

  if (rows.length === 0) {
    console.log('Nenhum vídeo pendente de curadoria.');
    return;
  }

  console.log(`\n${rows.length} vídeo(s) pendentes:\n`);
  for (const v of rows) {
    console.log(`  ID ${v.id} — ${v.url}`);
    if (v.title)      console.log(`          Título: ${v.title}`);
    if (v.individual) console.log(`          Entrevistado: ${v.individual}`);
    console.log(`          Enviado: ${new Date(v.created_at).toLocaleString('pt-BR')}`);
    console.log('');
  }
}

async function listAll() {
  const rows = await sql`
    SELECT id, url, title, curated, indexed, rejection_reason, created_at
    FROM videos ORDER BY created_at DESC
  `;

  if (rows.length === 0) {
    console.log('Nenhum vídeo cadastrado.');
    return;
  }

  const status = v =>
    v.curated === null  ? 'Pendente'          :
    v.curated === true  ? (v.indexed ? 'Aprovado + Indexado' : 'Aprovado') :
                          'Reprovado';

  console.log(`\n${rows.length} vídeo(s) no total:\n`);
  for (const v of rows) {
    console.log(`  ID ${v.id} [${status(v)}] — ${v.url}`);
    if (v.title)            console.log(`          Título: ${v.title}`);
    if (v.rejection_reason) console.log(`          Motivo: ${v.rejection_reason}`);
    console.log('');
  }
}

async function manualCurate() {
  const rows = await sql`
    SELECT id, url, title, individual, created_at
    FROM videos WHERE curated IS NULL ORDER BY created_at
  `;

  if (rows.length === 0) {
    console.log('Nenhum vídeo pendente de curadoria.');
    rl.close();
    return;
  }

  console.log(`\n${rows.length} vídeo(s) pendentes:\n`);
  for (const v of rows) {
    const extra = v.title ? ` — ${v.title}` : '';
    console.log(`  [${v.id}] ${v.url}${extra}`);
  }

  const idStr = await rl.question('\nID do vídeo (Enter para cancelar): ');
  const id = parseInt(idStr.trim(), 10);
  if (!id) { rl.close(); return; }

  const video = rows.find(v => v.id === id);
  if (!video) {
    console.log('ID não encontrado.');
    rl.close();
    return;
  }

  console.log(`\nVídeo: ${video.url}`);
  if (video.title)      console.log(`Título: ${video.title}`);
  if (video.individual) console.log(`Entrevistado: ${video.individual}`);

  const decision = await rl.question('\n[A]provar ou [R]eprovar? ');
  const approved = decision.trim().toLowerCase().startsWith('a');

  let reason = null;
  if (!approved) {
    reason = await rl.question('Motivo da reprovação: ');
    reason = reason.trim() || 'Reprovado manualmente';
  }

  await sql`
    UPDATE videos
    SET curated          = ${approved},
        rejection_reason = ${approved ? null : reason},
        curated_at       = NOW()
    WHERE id = ${id}
  `;

  if (approved) {
    console.log(`\n✓ Vídeo ${id} aprovado.`);
  } else {
    console.log(`\n✗ Vídeo ${id} reprovado: ${reason}`);
  }

  rl.close();
}

async function rejectCurated() {
  const rows = await sql`
    SELECT id, url, title, indexed, curated_at
    FROM videos WHERE curated = true ORDER BY curated_at
  `;

  if (rows.length === 0) {
    console.log('Nenhum vídeo aprovado encontrado.');
    rl.close();
    return;
  }

  console.log(`\n${rows.length} vídeo(s) aprovados:\n`);
  for (const v of rows) {
    const flag  = v.indexed ? ' [indexado]' : ' [não indexado]';
    const extra = v.title ? ` — ${v.title}` : '';
    console.log(`  [${v.id}]${flag} ${v.url}${extra}`);
  }

  const idStr = await rl.question('\nID do vídeo para reprovar (Enter para cancelar): ');
  const id = parseInt(idStr.trim(), 10);
  if (!id) { rl.close(); return; }

  const video = rows.find(v => v.id === id);
  if (!video) {
    console.log('ID não encontrado.');
    rl.close();
    return;
  }

  console.log(`\nVídeo: ${video.url}`);
  const reason = await rl.question('Motivo da reprovação: ');

  await sql`
    UPDATE videos
    SET curated          = false,
        rejection_reason = ${reason.trim() || 'Reprovado manualmente'},
        curated_at       = NOW()
    WHERE id = ${id}
  `;

  console.log(`\n✗ Vídeo ${id} reprovado.`);

  if (video.indexed) {
    console.log('ATENÇÃO: este vídeo já foi indexado no Pinecone.');
    console.log('Os vetores existentes não são removidos automaticamente.');
  }

  rl.close();
}

async function resetVideo() {
  const rows = await sql`
    SELECT id, url, title, curated, indexed
    FROM videos ORDER BY created_at DESC
  `;

  if (rows.length === 0) {
    console.log('Nenhum vídeo cadastrado.');
    rl.close();
    return;
  }

  const label = v =>
    v.curated === null ? 'pendente'  :
    v.curated          ? 'aprovado'  : 'reprovado';

  console.log(`\n${rows.length} vídeo(s):\n`);
  for (const v of rows) {
    const extra = v.title ? ` — ${v.title}` : '';
    console.log(`  [${v.id}] [${label(v)}${v.indexed ? '/indexado' : ''}] ${v.url}${extra}`);
  }

  const idStr = await rl.question('\nID do vídeo para resetar (Enter para cancelar): ');
  const id = parseInt(idStr.trim(), 10);
  if (!id) { rl.close(); return; }

  const video = rows.find(v => v.id === id);
  if (!video) { console.log('ID não encontrado.'); rl.close(); return; }

  console.log(`\nVídeo: ${video.url}`);
  const confirm = await rl.question('Confirmar reset de curadoria e indexação? [S/N]: ');
  if (!confirm.trim().toLowerCase().startsWith('s')) {
    console.log('Cancelado.');
    rl.close();
    return;
  }

  if (video.indexed) {
    const videoId = video.url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
    if (videoId) {
      const ids = [];
      let paginationToken;
      do {
        const res = await idx.listPaginated({ prefix: `yt-${videoId}-`, ...(paginationToken ? { paginationToken } : {}) });
        ids.push(...(res.vectors ?? []).map(v => v.id));
        paginationToken = res.pagination?.next;
      } while (paginationToken);

      if (ids.length > 0) {
        await idx.deleteMany({ ids });
        console.log(`${ids.length} vetores removidos do Pinecone.`);
      } else {
        console.log('Nenhum vetor encontrado no Pinecone para este vídeo.');
      }
    }
  }

  await sql`
    UPDATE videos
    SET curated          = NULL,
        curated_at       = NULL,
        rejection_reason = NULL,
        indexed          = false,
        indexed_at       = NULL
    WHERE id = ${id}
  `;

  console.log(`\nVídeo ${id} resetado com sucesso.`);
  rl.close();
}

async function resetCurationAll() {
  const rows = await sql`SELECT id FROM videos WHERE curated IS NOT NULL`;

  if (rows.length === 0) {
    console.log('Nenhum vídeo com curadoria definida.');
    rl.close();
    return;
  }

  console.log(`\n${rows.length} vídeo(s) terão a curadoria resetada (vetores Pinecone não são removidos).`);
  const confirm = await rl.question('Confirmar? [S/N]: ');
  if (!confirm.trim().toLowerCase().startsWith('s')) {
    console.log('Cancelado.');
    rl.close();
    return;
  }

  await sql`
    UPDATE videos
    SET curated          = NULL,
        curated_at       = NULL,
        rejection_reason = NULL,
        indexed          = false,
        indexed_at       = NULL
  `;

  console.log(`\n${rows.length} vídeo(s) resetados. Rode a curadoria para reprocessar.`);
  rl.close();
}

async function resetCurationVideo() {
  const rows = await sql`
    SELECT id, url, title, curated, indexed
    FROM videos ORDER BY created_at DESC
  `;

  if (rows.length === 0) {
    console.log('Nenhum vídeo cadastrado.');
    rl.close();
    return;
  }

  const label = v =>
    v.curated === null ? 'pendente'  :
    v.curated          ? 'aprovado'  : 'reprovado';

  console.log(`\n${rows.length} vídeo(s):\n`);
  for (const v of rows) {
    const extra = v.title ? ` — ${v.title}` : '';
    console.log(`  [${v.id}] [${label(v)}${v.indexed ? '/indexado' : ''}] ${v.url}${extra}`);
  }

  const idStr = await rl.question('\nID do vídeo para resetar curadoria (Enter para cancelar): ');
  const id = parseInt(idStr.trim(), 10);
  if (!id) { rl.close(); return; }

  const video = rows.find(v => v.id === id);
  if (!video) { console.log('ID não encontrado.'); rl.close(); return; }

  console.log(`\nVídeo: ${video.url}`);
  console.log('Apenas a curadoria será resetada. Vetores Pinecone não são removidos.');
  const confirm = await rl.question('Confirmar? [S/N]: ');
  if (!confirm.trim().toLowerCase().startsWith('s')) {
    console.log('Cancelado.');
    rl.close();
    return;
  }

  await sql`
    UPDATE videos
    SET curated          = NULL,
        curated_at       = NULL,
        rejection_reason = NULL,
        indexed          = false,
        indexed_at       = NULL
    WHERE id = ${id}
  `;

  console.log(`\nVídeo ${id} resetado. Rode a curadoria para reprocessar.`);
  rl.close();
}

if (mode === '--list-pending') {
  await listPending();
} else if (mode === '--list-all') {
  await listAll();
} else if (mode === '--manual-curate') {
  await manualCurate();
} else if (mode === '--reject-curated') {
  await rejectCurated();
} else if (mode === '--reset-video') {
  await resetVideo();
} else if (mode === '--reset-curation-all') {
  await resetCurationAll();
} else if (mode === '--reset-curation-video') {
  await resetCurationVideo();
} else {
  console.log('Uso: node scripts/manage_videos.mjs [--list-pending | --list-all | --manual-curate | --reject-curated | --reset-video | --reset-curation-all | --reset-curation-video]');
}

rl.close();
