import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import OpenAI from 'openai';
import { addItems, clearStore } from '../lib/vectorStore.js';
import { chunkText } from '../lib/chunker.js';

try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const LIVRO_NAMESPACE = 'livro-amarelo-v2';
const EMBEDDING_MODEL = 'text-embedding-3-large';

async function extractPages(data) {
  const pageTexts = [];

  const options = {
    pagerender(pageData) {
      return pageData.getTextContent({ normalizeWhitespace: true }).then(tc => {
        let lastY = null;
        let text = '';
        for (const item of tc.items) {
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
            text += '\n';
          }
          text += item.str;
          lastY = item.transform[5];
        }
        pageTexts.push(text);
        return text;
      });
    }
  };

  await pdf(data, options);

  // Fall back to form-feed split if pagerender yielded nothing
  if (pageTexts.length === 0) {
    const parsed = await pdf(data);
    return (parsed.text || '').split(/\f/).map(p => p.trim()).filter(Boolean);
  }

  return pageTexts;
}

async function indexPdf(filePath, title = null) {
  const data = await fs.readFile(filePath);
  const pages = await extractPages(data);
  console.log(`Extracted ${pages.length} pages from ${path.basename(filePath)}`);

  const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });
  try {
    await client.embeddings.create({ model: EMBEDDING_MODEL, input: 'test' });
    console.log(`Using embedding model: ${EMBEDDING_MODEL}`);
  } catch (e) {
    console.error(`Embedding model ${EMBEDDING_MODEL} unavailable: ${e.message}`);
    process.exit(1);
  }

  const items = [];
  let totalChunks = 0;
  let skipped = 0;

  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i];
    const pageChunks = chunkText(pageText, 600);

    for (let j = 0; j < pageChunks.length; j++) {
      const text = pageChunks[j];
      totalChunks++;

      let vector = null;
      try {
        const emb = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text });
        vector = emb?.data?.[0]?.embedding ?? null;
      } catch (e) {
        console.error(`Embedding failed (page ${i + 1}, chunk ${j}):`, e.message);
        skipped++;
      }

      items.push({
        id: `${path.basename(filePath)}-p${i + 1}-c${j}-${Date.now()}`,
        text,
        embedding: vector,
        meta: { file: path.basename(filePath), page: i + 1, chunk: j, title }
      });

      process.stdout.write(`\r  page ${i + 1}/${pages.length} | chunk ${totalChunks} | skipped ${skipped}`);
    }
  }

  console.log(`\nIndexed ${items.length} chunks (${skipped} without embeddings) from ${filePath}`);
  await addItems(items, { namespace: LIVRO_NAMESPACE });
}

const rawArgs = process.argv.slice(2);
const reindex = rawArgs.includes('--reindex');
const args = rawArgs.filter(a => a !== '--reindex');

async function indexFromArgs() {
  if (reindex) {
    console.log(`--reindex: clearing namespace "${LIVRO_NAMESPACE}"...`);
    await clearStore({ namespace: LIVRO_NAMESPACE });
  }

  if (args.length === 0) {
    const dir = path.join(process.cwd(), 'data', 'books');
    try {
      const files = await fs.readdir(dir);
      const pdfs = files.filter(f => f.toLowerCase().endsWith('.pdf'));
      if (pdfs.length === 0) { console.log('No PDF files found in data/books'); return; }
      for (const p of pdfs) {
        await indexPdf(path.join(dir, p), p.replace(/\.pdf$/i, ''));
      }
    } catch (err) {
      console.error('Failed to read data/books:', err);
      process.exit(1);
    }
    return;
  }

  await indexPdf(args[0], args[1] || null);
}

indexFromArgs().catch(err => { console.error(err); process.exit(1); });
