<div align="center">

**🌐 Language / Idioma:** [English](README.en.md) . [Português](README.md)

# o Livro Amarelo — Q&A

**Explore o Livro Amarelo e as entrevistas de Renan Santos por meio de perguntas em linguagem natural.**

RAG (Retrieval-Augmented Generation) com OpenAI · Protegido por Cloudflare Turnstile

---

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1--mini-412991?style=flat-square&logo=openai)
![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-00B07D?style=flat-square)
![Neon](https://img.shields.io/badge/Neon-Postgres-00E699?style=flat-square&logo=postgresql&logoColor=black)
![Upstash](https://img.shields.io/badge/Upstash-Rate%20Limit-00E9A3?style=flat-square&logo=upstash)
![Turnstile](https://img.shields.io/badge/Turnstile-CAPTCHA-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![License](https://img.shields.io/badge/licença-MIT-white?style=flat-square)

</div>

---

## O que é

O **Livro Amarelo** é um projeto de país com horizonte de várias décadas, com o objetivo de transformar o Brasil na quinta maior economia do mundo. Um plano concreto, baseado em propostas objetivas e estruturadas, para guiar o desenvolvimento nacional de forma sustentável e consistente.

Esta aplicação web permite explorar o conteúdo do Livro Amarelo e as entrevistas de Renan Santos por meio de perguntas em linguagem natural. O sistema indexa os documentos e transcrições, gera embeddings semânticos e usa um modelo de linguagem para responder com base exclusivamente no conteúdo indexado — citando as fontes.

---

## Funcionalidades

- **RAG completo** — busca semântica por embeddings + geração de resposta contextualizada
- **Renan Responde** — Q&A com base em entrevistas do YouTube: transcrição automática, filtro de speaker por IA, chunking por fronteira de frase, citações inline `[1][2]` com link direto para o trecho no vídeo
- **Curadoria automática de entrevistas** — agente de IA avalia diariamente links submetidos por usuários e aprova/reprova com base em critérios (entrevistado principal, entrevista completa, canal independente, conteúdo político substantivo)
- **Submissão de vídeos por usuários** — formulário na página `/entrevistas` para sugerir links do YouTube; protegido por Turnstile + rate limit
- **Proteção por CAPTCHA** — Cloudflare Turnstile com token renovado por requisição
- **Rate limiting compartilhado** — 10 req/min e 50 req/dia por IP via Sliding Window (`@upstash/ratelimit`); contadores compartilhados entre todos os endpoints (chat do livro, chat de entrevistas e submissão de vídeos) · fallback em memória (dev local)
- **Respostas concretas** — o modelo cita apenas o que está explicitamente nas fontes indexadas
- **Deputados federais** — página `/deputados` com composição da Câmara por partido e estado, via API da Câmara dos Deputados
- **Filiados partidários** — página `/filiados` com dados de filiação por partido e estado, atualizada automaticamente toda segunda-feira via GitHub Actions a partir dos dados públicos do TSE
- **Responsivo** — layout adaptado para desktop e dispositivos móveis

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4.1-mini |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | Pinecone — namespace `default` (livro) e `entrevistas` (YouTube) |
| Banco relacional | Neon Postgres (serverless) |
| Transcrição YouTube | youtube-transcript |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | @upstash/ratelimit · Sliding Window · Upstash Redis (serverless) · fallback em memória (dev local) |
| Analytics | Google Analytics 4 |
| PDF parsing | pdf-parse |
| Automação de dados | GitHub Actions (cron diário e semanal) |

---

## Estrutura do projeto

```
livro-amarelo/
├── .github/
│   └── workflows/
│       ├── update-filiados.yml      # Cron semanal: atualiza filiados (TSE) e deputados (Câmara API)
│       └── curate-videos.yml        # Cron diário 18h BRT: curadoria + indexação de entrevistas YouTube
├── pages/
│   ├── index.js                     # Página de verificação (Turnstile)
│   ├── inicio.js                    # Interface Q&A — Livro Amarelo
│   ├── renan-santos-responde.js     # Interface Q&A — Entrevistas (Renan Responde)
│   ├── entrevistas.js               # Lista de entrevistas indexadas + submissão de sugestões
│   ├── deputados.js                 # Deputados federais por partido e estado
│   ├── filiados.js                  # Filiados partidários por estado
│   ├── sobre.js                     # Sobre o projeto
│   ├── privacidade.js               # Política de privacidade
│   ├── _app.js                      # App wrapper — CSS global + Google Analytics
│   └── api/
│       ├── chat.js                  # RAG + LLM — Livro Amarelo
│       ├── chat-entrevistas.js      # RAG + LLM — Entrevistas YouTube (namespace entrevistas)
│       ├── videos.js                # GET lista indexadas · POST submissão de sugestão
│       ├── deputados.js             # Deputados (Neon + join com filiados)
│       └── filiados.js              # Filiados (Neon Postgres)
├── hooks/
│   └── useTurnstile.js              # Hook React para o widget Turnstile
├── lib/
│   ├── turnstile.js                 # Verificação server-side do token
│   ├── chunker.js                   # Divisão e normalização de texto (PDF)
│   ├── vectorStore.js               # Armazenamento e busca de embeddings (Pinecone)
│   └── rateLimiter.js               # Rate limiting por IP (compartilhado entre endpoints)
├── scripts/
│   ├── migrate_videos.mjs           # Cria/atualiza tabela videos no Neon
│   ├── curate_videos.mjs            # Curadoria de vídeos pendentes por GPT-4.1-mini
│   ├── index_youtube.mjs            # Transcrição, filtro speaker, chunking, embeddings → Pinecone
│   ├── aggregate_deputados.mjs      # Busca deputados na API da Câmara e insere no Neon
│   ├── aggregate_filiados.mjs       # Processa CSV do TSE (streaming) e insere no Neon
│   ├── index_pdf.mjs                # Indexar PDFs da pasta data/books/
│   ├── generate_embeddings.mjs      # Gerar embeddings para itens sem vetor
│   └── migrate_to_pinecone.mjs      # Migrar vetores do store.json para o Pinecone
├── styles/
│   └── globals.css                  # Paleta de cores, reset e classes responsivas
└── public/
    └── cover.png                    # Ilustração da capa
```

---

## Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Variáveis de ambiente

Crie um arquivo `.env.local` na raiz:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
TURNSTILE_SECRET=0x...

# Pinecone
PINECONE_API_KEY=pcsk-...
PINECONE_INDEX=nome-do-index

# Habilitar pipeline RAG
USE_RAG=true

# Upstash Redis para rate limiting distribuído
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Neon Postgres
DATABASE_URL=postgresql://...
```

> **Pinecone:** crie um index com dimensão **1536** (compatível com `text-embedding-3-small`). O projeto usa dois namespaces: `default` para o Livro Amarelo e `entrevistas` para as entrevistas do YouTube.

> **Neon:** a tabela `videos` é criada/atualizada pelo script `migrate_videos.mjs`. Execute-o uma vez antes de rodar a indexação de entrevistas.

### 3. Indexar o Livro Amarelo

```bash
# Coloque o PDF em data/books/ e execute:
npm run index:pdf

# Re-indexar do zero
npm run index:pdf -- --reindex

# Enviar vetores para o Pinecone
node scripts/migrate_to_pinecone.mjs
```

### 4. Configurar entrevistas do YouTube

```bash
# Criar tabela no Neon
node scripts/migrate_videos.mjs

# Inserir um vídeo manualmente (ou via formulário na página /entrevistas)
# e executar o pipeline completo:
node scripts/curate_videos.mjs    # curadoria por IA
node scripts/index_youtube.mjs    # transcrição + embeddings → Pinecone
```

A partir da primeira carga, o workflow `curate-videos.yml` executa o pipeline completo automaticamente todo dia às 18h BRT.

### 5. Popular o banco de filiados e deputados

```bash
# Filiados do TSE
curl -L -o filiacao.zip "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip"
mkdir -p tse_data && unzip filiacao.zip -d tse_data/
node scripts/aggregate_filiados.mjs ./tse_data
rm -rf filiacao.zip tse_data/

# Deputados federais
node scripts/aggregate_deputados.mjs
```

A partir da primeira carga, o workflow `update-filiados.yml` atualiza ambos automaticamente toda segunda-feira às 08:00 BRT.

### 6. Iniciar o servidor

```bash
npm run dev                    # desenvolvimento (porta 3000)
npm run build && npm start     # produção
```

---

## Fluxo da aplicação

```
Usuário
  │
  ▼
┌───────────────────────────────────┐
│  /  — Verificação Turnstile       │  Resolve o CAPTCHA → clica "Entrar"
└─────────────┬─────────────────────┘
              │ token salvo em sessionStorage
              ▼
┌─────────────────────────────────────────────────────────┐
│  /inicio — Q&A Livro Amarelo                            │
│  /renan-santos-responde — Renan Responde (entrevistas)  │
└─────────────┬───────────────────────────────────────────┘
              │ token fresco gerado por requisição (Turnstile invisível)
              ▼
┌───────────────────────────────────────────┐
│  /api/chat  ou  /api/chat-entrevistas     │
│  1. Verifica Turnstile                    │
│  2. Rate limit por IP (min + dia)         │
│  3. Embed a pergunta                      │
│  4. Busca top-14 chunks (Pinecone)        │
│  5. Monta prompt com contexto             │
│  6. GPT-4.1-mini responde via streaming   │
└─────────────┬─────────────────────────────┘
              │
              ▼
        Resposta com citações inline [1][2]
        + lista de fontes com link para o trecho no YouTube

┌───────────────────────────────────────────┐
│  /entrevistas — Lista + submissão         │
│  Pesquisa por título ou canal             │
│  Formulário de sugestão de link           │
│  Turnstile + rate limit por requisição    │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  GitHub Actions — curate-videos.yml       │  todo dia 18h BRT
│  1. curate_videos.mjs                     │
│     Busca vídeos pendentes (Neon)         │
│     Amostra de transcrição → GPT avalia   │
│     Aprova ou reprova com motivo          │
│  2. index_youtube.mjs                     │
│     Transcrição completa via YouTube API  │
│     Filtro de speaker por IA (GPT)        │
│     Chunking por fronteira de frase       │
│     Embeddings → Pinecone (entrevistas)   │
│     Salva título, canal e data no Neon    │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  GitHub Actions — update-filiados.yml     │  toda segunda 08h BRT
│  Filiados: ZIP TSE → streaming → Neon     │
│  Deputados: API Câmara → Neon             │
└───────────────────────────────────────────┘
```

---

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento na porta 3000 |
| `npm run build` | Build de produção |
| `npm start` | Servidor de produção |
| `npm run index:pdf` | Indexar PDFs em `data/books/` |
| `npm run index:pdf -- --reindex` | Limpar store local e re-indexar |
| `npm run generate:embeddings` | Preencher embeddings ausentes |
| `node scripts/migrate_videos.mjs` | Criar/atualizar tabela videos no Neon |
| `node scripts/curate_videos.mjs` | Curar vídeos pendentes de aprovação |
| `node scripts/index_youtube.mjs` | Indexar entrevistas aprovadas no Pinecone |
| `node scripts/migrate_to_pinecone.mjs` | Enviar vetores do store.json para o Pinecone |
| `node scripts/aggregate_filiados.mjs ./tse_data` | Processar CSV do TSE e inserir no Neon |
| `node scripts/aggregate_deputados.mjs` | Buscar deputados na API da Câmara e inserir no Neon |

---

<div align="center">

**o Livro Amarelo · O Futuro é Glorioso**

</div>
