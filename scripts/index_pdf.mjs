import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import OpenAI from 'openai';
import { addItems } from '../lib/vectorStore.js';

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

async function indexPdf(filePath, title = null) {
  const data = await fs.readFile(filePath);
  const parsed = await pdf(data);
  const pages = (parsed.text || '').split(/\f/).map(p => p.trim()).filter(Boolean);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const items = [];
  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i];
    const pageChunks = chunkText(pageText, 1000);
    for (let j = 0; j < pageChunks.length; j++) {
      const text = pageChunks[j];
      try {
        const emb = await client.embeddings.create({ model: 'text-embedding-3-small', input: text });
        const vector = emb.data[0].embedding;
        items.push({ id: `${path.basename(filePath)}-${i}-${j}-${Date.now()}`, text, embedding: vector, meta: { file: path.basename(filePath), page: i+1, chunk: j, title } });
      } catch (err) {
        console.error('embedding error', err);
      }
    }
  }

  await addItems(items);
  console.log(`Indexed ${items.length} chunks from ${filePath}`);
}

// CLI
const args = process.argv.slice(2);
// If no args provided, index all PDFs in data/books
async function indexFromArgs() {
  if (args.length === 0) {
    const dir = path.join(process.cwd(), 'data', 'books');
    try {
      const files = await fs.readdir(dir);
      const pdfs = files.filter(f => f.toLowerCase().endsWith('.pdf'));
      if (pdfs.length === 0) {
        console.log('No PDF files found in data/books');
        return;
      }
      for (const p of pdfs) {
        const full = path.join(dir, p);
        console.log('Indexing', full);
        await indexPdf(full, p.replace(/\.pdf$/i, ''));
      }
      return;
    } catch (err) {
      console.error('Failed to read data/books:', err);
      process.exit(1);
    }
  }

  const filePath = args[0];
  const title = args[1] || null;
  await indexPdf(filePath, title);
}

indexFromArgs().catch(err => { console.error(err); process.exit(1); });
