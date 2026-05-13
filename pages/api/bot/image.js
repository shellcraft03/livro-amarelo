import { createCanvas } from 'canvas';

const W = 1080;
const PAD = 72;
const CW = W - PAD * 2;
const HEADER_H = 100;
const FOOTER_H = 72;
const LH_Q = 44, LH_A = 42, LH_BLANK = 18;
const FONT_Q = 'italic 500 30px Arial, sans-serif';
const FONT_A = '400 28px Arial, sans-serif';

function wrapLines(ctx, text, font, maxW) {
  ctx.font = font;
  const lines = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { lines.push(null); continue; }
    const words = para.split(' ');
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function stripCitations(text) {
  return text.replace(/\[\d+(?:[,\s]+\d+:\d+(?::\d+)?)?\]/g, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.BOT_API_SECRET;
  if (!secret || req.headers['x-bot-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { question, answer: rawAnswer, type } = req.body || {};
  if (!question || !rawAnswer || !['livro', 'entrevistas'].includes(type)) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const answer = type === 'entrevistas' ? stripCitations(rawAnswer) : rawAnswer;
  const title = type === 'livro' ? 'O LIVRO AMARELO' : 'RENAN RESPONDE';
  const subtitle = type === 'livro' ? 'O Futuro é Glorioso' : 'Com Renan Santos';

  const tmp = createCanvas(W, 100);
  const mCtx = tmp.getContext('2d');
  const qLines = wrapLines(mCtx, `"${question}"`, FONT_Q, CW);
  const aLines = wrapLines(mCtx, answer, FONT_A, CW);

  const qH = qLines.reduce((s, l) => s + (l === null ? LH_BLANK : LH_Q), 0);
  const aH = aLines.reduce((s, l) => s + (l === null ? LH_BLANK : LH_A), 0);
  const H = HEADER_H + 56 + 30 + 14 + qH + 44 + 4 + 44 + 30 + 14 + aH + 56 + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = '#FCBF22';
  ctx.font = '900 36px Arial, sans-serif';
  ctx.fillText(title, PAD, 60);
  ctx.fillStyle = '#888888';
  ctx.font = '400 18px Arial, sans-serif';
  ctx.fillText(subtitle, PAD, 84);

  let y = HEADER_H + 56;

  ctx.font = '700 15px Arial, sans-serif';
  const plW = ctx.measureText('PERGUNTA').width + 20;
  ctx.fillStyle = '#000000';
  ctx.fillRect(PAD, y, plW, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('PERGUNTA', PAD + 10, y + 19);
  y += 28 + 14;

  ctx.font = FONT_Q;
  ctx.fillStyle = '#333333';
  for (const line of qLines) {
    if (line === null) { y += LH_BLANK; continue; }
    ctx.fillText(line, PAD, y + LH_Q - 10);
    y += LH_Q;
  }
  y += 28;

  ctx.fillStyle = '#FCBF22';
  ctx.fillRect(PAD, y, CW, 4);
  y += 4 + 36;

  ctx.font = '700 15px Arial, sans-serif';
  const rlW = ctx.measureText('RESPOSTA').width + 20;
  ctx.fillStyle = '#FCBF22';
  ctx.fillRect(PAD, y, rlW, 28);
  ctx.fillStyle = '#000000';
  ctx.fillText('RESPOSTA', PAD + 10, y + 19);
  y += 28 + 14;

  ctx.font = FONT_A;
  ctx.fillStyle = '#111111';
  for (const line of aLines) {
    if (line === null) { y += LH_BLANK; continue; }
    ctx.fillText(line, PAD, y + LH_A - 8);
    y += LH_A;
  }

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
  ctx.fillStyle = '#FCBF22';
  ctx.font = '700 18px Arial, sans-serif';
  ctx.fillText('Inevitável GPT', PAD, H - FOOTER_H + 44);
  ctx.fillStyle = '#666666';
  ctx.font = '400 16px Arial, sans-serif';
  const right = 'Partido Missão · Brasil 2026';
  ctx.fillText(right, W - PAD - ctx.measureText(right).width, H - FOOTER_H + 44);

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
}
