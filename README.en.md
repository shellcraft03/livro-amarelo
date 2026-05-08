<div align="center">

**🌐 Language / Idioma:** [English](README.en.md) . [Português](README.md)

# o Livro Amarelo — Q&A

**Explore O Livro Amarelo and Renan Santos's interviews through natural language questions.**

Retrieval-Augmented Generation with OpenAI · Protected by Cloudflare Turnstile

---

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1--mini-412991?style=flat-square&logo=openai)
![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-00B07D?style=flat-square)
![Neon](https://img.shields.io/badge/Neon-Postgres-00E699?style=flat-square&logo=postgresql&logoColor=black)
![Upstash](https://img.shields.io/badge/Upstash-Rate%20Limit-00E9A3?style=flat-square&logo=upstash)
![Turnstile](https://img.shields.io/badge/Turnstile-CAPTCHA-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-white?style=flat-square)

</div>

---

## What is it

**O Livro Amarelo** (The Yellow Book) is a long-term national project aimed at transforming Brazil into the world's fifth largest economy over the coming decades. It is a concrete plan, built on objective and structured proposals, designed to guide the country's sustainable and consistent development.

This web application allows users to explore the content of O Livro Amarelo and Renan Santos's interviews through natural language questions. The system indexes documents and transcripts, generates semantic embeddings, and uses a language model to answer based exclusively on the indexed content — citing sources.

---

## Features

- **Full RAG pipeline** — semantic search via embeddings + contextualized response generation
- **Renan Responde** — Q&A based on YouTube interviews: automatic transcription, AI speaker filtering, sentence-boundary chunking, inline citations `[1][2]` with direct links to the exact moment in the video
- **Automatic interview curation** — an AI agent daily evaluates links submitted by users and approves/rejects them based on defined criteria (main interviewee, complete interview, independent channel, substantive political content)
- **User video submission** — form on the `/entrevistas` page to suggest YouTube links; protected by Turnstile + rate limit
- **CAPTCHA protection** — Cloudflare Turnstile with a fresh token per request
- **Shared rate limiting** — 10 req/min and 50 req/day per IP via Sliding Window (`@upstash/ratelimit`); counters shared across all endpoints (book chat, interview chat, and video submission) · in-memory fallback (local dev)
- **Concrete answers** — the model cites only what is explicitly found in the indexed sources
- **Federal deputies** — `/deputados` page showing Chamber of Deputies composition by party and state, via the Câmara dos Deputados API
- **Party membership data** — `/filiados` page showing party affiliation counts by state, automatically updated every Monday via GitHub Actions from public TSE data
- **Responsive** — layout adapted for desktop and mobile devices

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4.1-mini |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | Pinecone — namespace `default` (book) and `entrevistas` (YouTube) |
| Relational DB | Neon Postgres (serverless) |
| YouTube transcription | youtube-transcript |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | @upstash/ratelimit · Sliding Window · Upstash Redis (serverless) · in-memory fallback (local dev) |
| Analytics | Google Analytics 4 |
| PDF parsing | pdf-parse |
| Data automation | GitHub Actions (daily and weekly cron) |

---

## Project structure

```
livro-amarelo/
├── .github/
│   └── workflows/
│       ├── update-filiados.yml      # Weekly cron: updates membership (TSE) and deputies (Câmara API)
│       └── curate-videos.yml        # Daily cron 18:00 BRT: curation + indexing of YouTube interviews
├── pages/
│   ├── index.js                     # Verification page (Turnstile)
│   ├── inicio.js                    # Q&A interface — Livro Amarelo
│   ├── renan-santos-responde.js     # Q&A interface — Interviews (Renan Responde)
│   ├── entrevistas.js               # Indexed interviews list + submission form
│   ├── deputados.js                 # Federal deputies by party and state
│   ├── filiados.js                  # Party membership by state
│   ├── sobre.js                     # About page
│   ├── privacidade.js               # Privacy policy
│   ├── _app.js                      # App wrapper — global CSS + Google Analytics
│   └── api/
│       ├── chat.js                  # RAG + LLM — Livro Amarelo
│       ├── chat-entrevistas.js      # RAG + LLM — YouTube interviews (entrevistas namespace)
│       ├── videos.js                # GET indexed list · POST suggestion submission
│       ├── deputados.js             # Deputies endpoint (Neon + join with filiados)
│       └── filiados.js              # Party membership endpoint (Neon Postgres)
├── hooks/
│   └── useTurnstile.js              # React hook for the Turnstile widget
├── lib/
│   ├── turnstile.js                 # Server-side token verification
│   ├── chunker.js                   # Text splitting and normalization (PDF)
│   ├── vectorStore.js               # Embedding storage and search (Pinecone)
│   └── rateLimiter.js               # IP-based rate limiting (shared across endpoints)
├── scripts/
│   ├── migrate_videos.mjs           # Create/update videos table in Neon
│   ├── curate_videos.mjs            # Curate pending videos via GPT-4.1-mini
│   ├── index_youtube.mjs            # Transcription, speaker filter, chunking, embeddings → Pinecone
│   ├── aggregate_deputados.mjs      # Fetch deputies from Câmara API and insert into Neon
│   ├── aggregate_filiados.mjs       # Stream TSE CSV and insert into Neon
│   ├── index_pdf.mjs                # Index PDFs from data/books/
│   ├── generate_embeddings.mjs      # Generate embeddings for items without vectors
│   └── migrate_to_pinecone.mjs      # Upload vectors from store.json to Pinecone
├── styles/
│   └── globals.css                  # Color palette, reset and responsive classes
└── public/
    └── cover.png                    # Cover illustration
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

# Upstash Redis for distributed rate limiting
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Neon Postgres
DATABASE_URL=postgresql://...
```

> **Pinecone:** create an index with dimension **1536** (compatible with `text-embedding-3-small`). The project uses two namespaces: `default` for the Livro Amarelo and `entrevistas` for YouTube interviews.

> **Neon:** the `videos` table is created/updated by `migrate_videos.mjs`. Run it once before indexing any interviews.

### 3. Index the Livro Amarelo

```bash
# Place the PDF in data/books/ and run:
npm run index:pdf

# Re-index from scratch
npm run index:pdf -- --reindex

# Upload vectors to Pinecone
node scripts/migrate_to_pinecone.mjs
```

### 4. Set up YouTube interviews

```bash
# Create the table in Neon
node scripts/migrate_videos.mjs

# Insert a video manually (or via the form on /entrevistas)
# then run the full pipeline:
node scripts/curate_videos.mjs    # AI curation
node scripts/index_youtube.mjs    # transcription + embeddings → Pinecone
```

From the first run, the `curate-videos.yml` workflow runs the full pipeline automatically every day at 18:00 BRT.

### 5. Populate party membership and deputies

```bash
# TSE membership data
curl -L -o filiacao.zip "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip"
mkdir -p tse_data && unzip filiacao.zip -d tse_data/
node scripts/aggregate_filiados.mjs ./tse_data
rm -rf filiacao.zip tse_data/

# Federal deputies
node scripts/aggregate_deputados.mjs
```

After the initial load, the `update-filiados.yml` workflow updates both automatically every Monday at 08:00 BRT.

### 6. Start the server

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
┌───────────────────────────────────────────┐
│  /  — Turnstile Verification              │  Solve CAPTCHA → click "Enter"
└─────────────┬─────────────────────────────┘
              │ token saved in sessionStorage
              ▼
┌─────────────────────────────────────────────────────────┐
│  /inicio — Q&A Livro Amarelo                            │
│  /renan-santos-responde — Renan Responde (interviews)   │
└─────────────┬───────────────────────────────────────────┘
              │ fresh token generated per request (invisible Turnstile)
              ▼
┌───────────────────────────────────────────┐
│  /api/chat  or  /api/chat-entrevistas     │
│  1. Verify Turnstile                      │
│  2. Rate limit per IP (min + day)         │
│  3. Embed the question                    │
│  4. Retrieve top-14 chunks (Pinecone)     │
│  5. Build prompt with context             │
│  6. GPT-4.1-mini responds via streaming   │
└─────────────┬─────────────────────────────┘
              │
              ▼
        Answer with inline citations [1][2]
        + source list with links to the exact moment in YouTube

┌───────────────────────────────────────────┐
│  /entrevistas — List + submission         │
│  Search by title or channel               │
│  Link suggestion form                     │
│  Turnstile + rate limit per request       │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  GitHub Actions — curate-videos.yml       │  every day at 18:00 BRT
│  1. curate_videos.mjs                     │
│     Fetch pending videos (Neon)           │
│     Transcript sample → GPT evaluates     │
│     Approve or reject with reason         │
│  2. index_youtube.mjs                     │
│     Full transcript via YouTube API       │
│     AI speaker filtering (GPT)            │
│     Sentence-boundary chunking            │
│     Embeddings → Pinecone (entrevistas)   │
│     Save title, channel and date to Neon  │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  GitHub Actions — update-filiados.yml     │  every Monday at 08:00 BRT
│  Membership: TSE ZIP → stream → Neon      │
│  Deputies: Câmara API → Neon              │
└───────────────────────────────────────────┘
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
| `node scripts/migrate_videos.mjs` | Create/update videos table in Neon |
| `node scripts/curate_videos.mjs` | Curate pending videos |
| `node scripts/index_youtube.mjs` | Index approved interviews into Pinecone |
| `node scripts/migrate_to_pinecone.mjs` | Upload vectors from store.json to Pinecone |
| `node scripts/aggregate_filiados.mjs ./tse_data` | Process TSE CSV and insert into Neon |
| `node scripts/aggregate_deputados.mjs` | Fetch deputies from Câmara API and insert into Neon |

---

<div align="center">

**o Livro Amarelo · O Futuro é Glorioso**

</div>
