<div align="center">

**🌐 Language / Idioma:** [English](README.en.md) . [Português](README.md)

# o Livro Amarelo — Q&A

**Explore O Livro Amarelo through natural language questions.**

Retrieval-Augmented Generation with OpenAI · Protected by Cloudflare Turnstile

---

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1--mini-412991?style=flat-square&logo=openai)
![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-00B07D?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-white?style=flat-square)

</div>

---

## What is it

**O Livro Amarelo** (The Yellow Book) is a long-term national project aimed at transforming Brazil into the world's fifth largest economy over the coming decades. It is a concrete plan, built on objective and structured proposals, designed to guide the country's sustainable and consistent development.

This web application allows users to explore the content of O Livro Amarelo through natural language questions. The system indexes the document, generates semantic embeddings, and uses a language model to answer based exclusively on the document's content — citing page numbers as sources.

---

## Features

- **Full RAG pipeline** — semantic search via embeddings + contextualized response generation
- **CAPTCHA protection** — Cloudflare Turnstile with a fresh token per request
- **Rate limiting** — 10 req/min and 50 req/day per IP, with Redis or in-memory fallback
- **Concrete answers** — the model is instructed to cite only proposals explicitly found in the document
- **Sharing** — buttons to copy text or download the answer as a JPEG image
- **Responsive** — layout adapted for desktop and mobile devices

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4.1-mini |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | Pinecone (cloud vector database) |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | Upstash Redis (serverless) · in-memory fallback (local dev) |
| Analytics | Google Analytics 4 |
| PDF parsing | pdf-parse |

---

## Project structure

```
livro-amarelo/
├── pages/
│   ├── index.js              # Verification page (Turnstile)
│   ├── inicio.js             # Q&A interface
│   ├── sobre.js              # About page
│   ├── _app.js               # App wrapper — global CSS + Google Analytics
│   └── api/
│       └── chat.js           # Main RAG + LLM endpoint
├── hooks/
│   └── useTurnstile.js       # React hook for the Turnstile widget
├── lib/
│   ├── turnstile.js          # Server-side token verification
│   ├── chunker.js            # Text splitting and normalization
│   ├── vectorStore.js        # Embedding storage and search
│   └── rateLimiter.js        # IP-based rate limiting
├── scripts/
│   ├── index_pdf.mjs             # Index PDFs from data/books/
│   ├── generate_embeddings.mjs   # Generate embeddings for items without vectors
│   └── migrate_to_pinecone.mjs   # Upload vectors from store.json to Pinecone
├── styles/
│   └── globals.css           # Color palette, reset and responsive classes
├── public/
│   └── cover.png             # Cover illustration
└── data/
    └── books/                # Source PDFs (not versioned)
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create a `.env.local` file at the project root:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
TURNSTILE_SECRET=0x...

# Pinecone
PINECONE_API_KEY=pcsk-...
PINECONE_INDEX=your-index-name

# Enable RAG pipeline
USE_RAG=true

# Embedding model (optional — default: text-embedding-3-small)
# EMBEDDING_MODEL=text-embedding-3-small

# Upstash Redis for distributed rate limiting
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

> **Pinecone:** create an index in the [Pinecone console](https://app.pinecone.io) with dimension **1536** (compatible with `text-embedding-3-small`) and a region of your choice. After indexing PDFs locally, run the migration script (step 3b) to upload the vectors to Pinecone.

> **Note:** Your OpenAI project must have access to two models:
> - `text-embedding-3-small` — for embedding generation during indexing and queries
> - `gpt-4.1-mini` — for natural language response generation
>
> Check at *platform.openai.com → Projects → Model access*. These are the default models, but developers can swap them for any models they prefer by editing the `EMBEDDING_MODEL` variable and the `model` field in `pages/api/chat.js`.

### 3. Index the document and upload to Pinecone

Place the PDF in `data/books/` and run:

```bash
# First-time indexing (extracts text, generates chunks and embeddings locally)
npm run index:pdf

# Re-index from scratch (clears the store first)
npm run index:pdf -- --reindex
```

#### 3b. Migrate vectors to Pinecone

After local indexing, upload the vectors to Pinecone:

```bash
node scripts/migrate_to_pinecone.mjs
```

The script reads the local `store.json` and uploads all vectors in batches of 100. After migration, `store.json` is no longer needed in production — vectors are stored in Pinecone.

### 4. Generate missing embeddings

If indexing saved items without embeddings (temporary API failure):

```bash
npm run generate:embeddings
```

The script runs a preflight check and reports whether the model is accessible before processing.

### 5. Start the server

```bash
npm run dev                    # development (port 3000)
npm run build && npm start     # production
```

---

## Application flow

```
User
  │
  ▼
┌──────────────────────────────────────┐
│  /  — Turnstile Verification         │  Solve CAPTCHA → click "Enter"
└─────────────┬────────────────────────┘
              │ token saved in sessionStorage
              ▼
┌──────────────────────────────────────┐
│  /inicio — Q&A Interface             │  Type question → Enter or button
└─────────────┬────────────────────────┘
              │ fresh token generated per request
              ▼
┌──────────────────────────────────────┐
│  /api/chat                           │
│  1. Verify POST method               │
│  2. Rate limit (min + day)           │
│  3. Verify Turnstile                 │
│  4. Embed the question               │
│  5. Retrieve top-6 chunks (Pinecone) │
│  6. Build prompt with context        │
│  7. GPT-4.1-mini responds            │
└─────────────┬────────────────────────┘
              │
              ▼
        Answer with page citation
        + copy text / download image options
```

---

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run index:pdf` | Index PDFs in `data/books/` |
| `npm run index:pdf -- --reindex` | Clear local store and re-index |
| `npm run generate:embeddings` | Fill in missing embeddings |
| `node scripts/migrate_to_pinecone.mjs` | Upload vectors from store.json to Pinecone |

---

<div align="center">

**o Livro Amarelo · O Futuro é Glorioso**

</div>
