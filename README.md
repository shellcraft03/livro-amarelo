<div align="center">

**🌐 Language / Idioma:** [English](README.en.md) . [Português](README.md)

# o Livro Amarelo — Q&A

**Explore o Livro Amarelo e as entrevistas de Renan Santos por meio de perguntas em linguagem natural.**

RAG (Retrieval-Augmented Generation) com OpenAI · Protegido por Cloudflare Turnstile

---

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1-412991?style=flat-square&logo=openai)
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
- **Renan Responde** — Q&A com base em entrevistas do YouTube: transcrição automática, filtro de speaker por IA, chunking por fronteira de frase, citações inline `[1][2]` com link direto para o trecho no vídeo; botões de cópia do texto e download da resposta como imagem
- **Curadoria automática de entrevistas** — agente de IA avalia periodicamente links submetidos por usuários e aprova/reprova com base em critérios (entrevistado principal, entrevista completa, canal independente, conteúdo político substantivo)
- **Submissão de vídeos por usuários** — formulário na página `/entrevistas` para sugerir links do YouTube; protegido por Turnstile + rate limit
- **Proteção por CAPTCHA** — Cloudflare Turnstile com inicialização lazy (ativa apenas no foco do input); na entrada cria um cookie de sessão HMAC-SHA256 HttpOnly (TTL 1h) — endpoints de chat pulam o Turnstile enquanto a sessão for válida
- **Rate limiting compartilhado** — 10 req/min e 50 req/dia por IP via Sliding Window (`@upstash/ratelimit`); contadores compartilhados entre todos os endpoints (chat do livro, chat de entrevistas e submissão de vídeos) · fallback em memória (dev local)
- **Bloqueio de canais** — curadoria rejeita automaticamente vídeos de canais configurados em `BLOCKED_YOUTUBE_CHANNEL_NAMES` (termos separados por `;`)
- **Respostas concretas** — o modelo cita apenas o que está explicitamente nas fontes indexadas
- **Deputados federais** — página `/deputados` com composição da Câmara por partido e estado, via API da Câmara dos Deputados
- **Filiados partidários** — página `/filiados` com dados de filiação por partido e estado, atualizada automaticamente toda segunda-feira via GitHub Actions a partir dos dados públicos do TSE
- **Responsivo** — layout adaptado para desktop e dispositivos móveis

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4.1 (livro e entrevistas) |
| Embeddings | OpenAI text-embedding-3-large (livro e entrevistas) |
| Vector store | Pinecone — namespace `livro-amarelo-v2` (livro) e `entrevistas` (YouTube) |
| Banco relacional | Neon Postgres (serverless) |
| Transcrição YouTube | youtube-transcript-api (Python, CI) · youtube-transcript (Node, local) |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | @upstash/ratelimit · Sliding Window · Upstash Redis (serverless) · fallback em memória (dev local) |
| Analytics | Google Analytics 4 |
| PDF parsing | pdf-parse |
| Automação de dados | GitHub Actions (cron semanal + disparo manual) |
| Geração de imagens (bot) | canvas (node-canvas) · Inter TTF bundled em `public/fonts/` |
| Bot Twitter | Python 3.11 · Railway (worker) · Twitter API v2 |

---

## Estrutura do projeto

```
livro-amarelo/
├── .github/
│   └── workflows/
│       ├── update-filiados.yml      # Cron semanal: atualiza filiados (TSE) e deputados (Câmara API)
│       └── curate-videos.yml        # Todo dia 18h BRT + disparo manual: curadoria + indexação de entrevistas YouTube
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
│       ├── session.js               # GET verifica sessão · POST cria cookie de sessão via Turnstile
│       ├── videos.js                # GET lista indexadas · POST submissão de sugestão
│       ├── deputados.js             # Deputados (Neon + join com filiados)
│       ├── filiados.js              # Filiados (Neon Postgres)
│       └── bot/
│           ├── answer.js            # RAG para o bot — retorna { answer, question, type } (X-Bot-Secret)
│           └── image.js             # Gera JPEG 1080px com node-canvas + Inter TTF (X-Bot-Secret)
├── hooks/
│   ├── useTurnstile.js              # Hook React para o widget Turnstile
│   └── useSessionGate.js            # Hook React para verificar sessão via cookie e redirecionar se inválida
├── lib/
│   ├── turnstile.js                 # Verificação server-side do token
│   ├── session.js                   # Geração e validação de cookie de sessão HMAC-SHA256
│   ├── chunker.js                   # Divisão e normalização de texto (PDF)
│   ├── vectorStore.js               # Armazenamento e busca de embeddings (Pinecone)
│   └── rateLimiter.js               # Rate limiting por IP (compartilhado entre endpoints)
├── curar-indexar.bat                # Menu interativo local para gestão de vídeos (curadoria + indexação)
├── scripts/
│   ├── process_videos_ci.py         # CI: curadoria + indexação em passagem única (Python); bloqueia canais configurados; prefere proxies BR → US
│   ├── migrate_videos.mjs           # Cria/atualiza tabela videos no Neon
│   ├── curate_videos.mjs            # Curadoria de vídeos pendentes por GPT-4.1-mini (uso local)
│   ├── index_youtube.mjs            # Transcrição, filtro speaker, chunking, embeddings → Pinecone (uso local)
│   ├── manage_videos.mjs            # Gestão manual: listar, aprovar, reprovar e resetar vídeos
│   ├── reset_entrevistas_index.mjs  # Apaga vetores do Pinecone e desindexar vídeos no Neon
│   ├── lib/
│   │   └── transcript_cache.mjs     # Cache de transcrições em disco (uso local)
│   ├── aggregate_deputados.mjs      # Busca deputados na API da Câmara e insere no Neon
│   ├── aggregate_filiados.mjs       # Processa CSV do TSE (streaming) e insere no Neon
│   ├── index_pdf.mjs                # Indexar PDFs da pasta data/books/
│   ├── generate_embeddings.mjs      # Gerar embeddings para itens sem vetor
│   └── migrate_to_pinecone.mjs      # Migrar vetores do store.json para o Pinecone
├── styles/
│   └── globals.css                  # Paleta de cores, reset e classes responsivas
├── public/
│   ├── cover.png                    # Ilustração da capa
│   └── fonts/                       # Inter TTF bundled para geração de imagem no servidor
│       ├── Inter-Regular.ttf
│       ├── Inter-Bold.ttf
│       ├── Inter-Italic.ttf
│       └── Inter-BoldItalic.ttf
└── BotTwitter/                      # Worker Python — bot @Inevitavel_Bot (Railway)
    ├── Procfile                     # worker: python main.py
    ├── runtime.txt                  # python-3.11
    ├── requirements.txt
    ├── main.py                      # loop principal: chama buscar_e_responder() a cada 300s
    └── InevitavelGPT/
        ├── bot.py                   # busca tweets, parseia pergunta, aciona API, posta reply
        └── ImageGenerator.py        # chama POST /api/bot/image na Vercel → retorna JPEG
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
PINECONE_INDEX_LIVRO=nome-do-index         # índice do livro (3072 dim, text-embedding-3-large, namespace livro-amarelo-v2)
PINECONE_INDEX_ENTREVISTAS=nome-do-index   # índice de entrevistas (3072 dim, text-embedding-3-large, namespace entrevistas)

# Habilitar pipeline RAG
USE_RAG=true

# Upstash Redis para rate limiting distribuído
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Neon Postgres
DATABASE_URL=postgresql://...

# Webshare (proxy para YouTube Transcript API — necessário para o script Python de CI)
WEBSHARE_PROXY_USERNAME=...
WEBSHARE_PROXY_PASSWORD=...

# System prompts (usados pelos scripts e API routes)
SYSTEM_PROMPT_CURADORIA=...
SYSTEM_PROMPT_QUERY_REWRITE_LIVRO=...
SYSTEM_PROMPT_QUERY_REWRITE_ENTREVISTAS=...

# Sessão de acesso (obrigatório)
APP_SESSION_SECRET=...

# Canais do YouTube bloqueados na curadoria (termos separados por ";")
BLOCKED_YOUTUBE_CHANNEL_NAMES=...

# Bot Twitter — protege /api/bot/answer e /api/bot/image
BOT_API_SECRET=...
```

> **Pinecone:** o projeto usa dois índices. `PINECONE_INDEX_LIVRO`: dimensão **3072**, compatível com `text-embedding-3-large`, namespace `livro-amarelo-v2` (Livro Amarelo). `PINECONE_INDEX_ENTREVISTAS`: dimensão **3072**, compatível com `text-embedding-3-large`, namespace `entrevistas` (YouTube).

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
# e executar o pipeline completo localmente:
node scripts/curate_videos.mjs    # curadoria por IA
node scripts/index_youtube.mjs    # transcrição + embeddings → Pinecone
```

Para gerenciar vídeos localmente no Windows, execute `curar-indexar.bat` — um menu interativo (opções 1–7) com curadoria automática, curadoria manual, indexação, reprovação e reset de curadoria/índice. A opção 7 abre um sub-menu com 4 variações de reset.

Em CI, o workflow `curate-videos.yml` usa `scripts/process_videos_ci.py` — um script Python que faz curadoria e indexação em passagem única (sem download duplo de transcrição). É executado automaticamente todo dia às 18h BRT e também pode ser disparado manualmente no GitHub Actions.

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
┌───────────────────────────────────────────────┐
│  /  — Verificação Turnstile                   │  Resolve o CAPTCHA → clica "Entrar"
└─────────────┬─────────────────────────────────┘
              │ POST /api/session → cookie HttpOnly ia_session (HMAC-SHA256, TTL 1h)
              ▼
┌─────────────────────────────────────────────────────────┐
│  /inicio — Q&A Livro Amarelo                            │
│  /renan-santos-responde — Renan Responde (entrevistas)  │
└─────────────┬───────────────────────────────────────────┘
              │ GET /api/session valida cookie; redireciona para / se inválido
              │ cookie ia_session enviado automaticamente pelo browser
              ▼
┌───────────────────────────────────────────┐
│  /api/chat  ou  /api/chat-entrevistas     │
│  1. Verifica sessão (cookie) ou Turnstile │
│  2. Rate limit por IP (min + dia)         │
│  3. Reescreve query + gera embeddings     │
│  4. Busca e re-ranqueia chunks (Pinecone) │
│  5. Monta prompt com contexto             │
│  6. GPT-4.1 responde via streaming        │
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
│  GitHub Actions — curate-videos.yml       │  todo dia 18h BRT + disparo manual
│  process_videos_ci.py                     │
│  Fase 1: vídeos pendentes de curadoria    │
│     Transcrição (pt-BR → pt → en)         │
│     GPT avalia → aprova ou reprova        │
│     Se aprovado: indexa na mesma passagem │
│  Fase 2: aprovados ainda não indexados    │
│     Transcrição → filtro speaker (GPT)    │
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

## Bot Twitter — @Inevitavel_Bot

O diretório `BotTwitter/` contém um **worker Python** implantado no **Railway** que monitora o perfil `@Inevitavel_Bot` a cada 5 minutos. Sempre que o próprio perfil postar um tweet contendo "livro amarelo" ou "renan santos", o bot gera uma resposta via RAG e responde ao tweet com uma imagem formatada.

### Como funciona

```
@Inevitavel_Bot posta tweet com "livro amarelo" ou "renan santos"
  │
  ▼
Worker Railway (main.py — loop de 300s)
  │ GET /2/tweets/search/recent — filtra por handle + termos no lado do Twitter
  │
  ├─ Nenhum tweet novo → aguarda próximo ciclo
  │
  ▼
bot.py — buscar_e_responder()
  │ _parse_tweet(): remove keyword e @mentions → extrai pergunta + tipo (livro | entrevistas)
  │
  ▼
POST /api/bot/answer  (Vercel · X-Bot-Secret)
  │ RAG idêntico ao chat da web
  ▼
POST /api/bot/image   (Vercel · X-Bot-Secret)
  │ node-canvas + Inter TTF bundled → JPEG 1080px
  ▼
POST /1.1/media/upload.json → POST /2/tweets (reply ao tweet original)
  │
  ▼
tweet_id registrado em processed_ids.json (STATE_DIR)
falhas não registram o ID → serão reprocessadas no próximo ciclo
```

### Deploy no Railway

1. Conecte o repositório ao Railway e aponte o **root directory** para `BotTwitter/`.
2. Monte um volume em `/data` e defina `STATE_DIR=/data` para persistir estado entre restarts.
3. Configure as variáveis de ambiente abaixo no painel do Railway.

### Variáveis de ambiente — Railway

| Variável | Descrição |
|---|---|
| `BEARER_TOKEN` | Twitter Bearer Token (leitura de tweets) |
| `CONSUMER_KEY` | Twitter OAuth 1.0a Consumer Key |
| `CONSUMER_SECRET` | Twitter OAuth 1.0a Consumer Secret |
| `ACESS_TOKEN` | Twitter OAuth 1.0a Access Token |
| `ACESS_TOKEN_SECRET` | Twitter OAuth 1.0a Access Token Secret |
| `BOT_API_URL` | URL de `/api/bot/answer` na Vercel (ex.: `https://www.inevitavelgpt.com/api/bot/answer`) |
| `BOT_API_SECRET` | Mesmo valor de `BOT_API_SECRET` configurado na Vercel |
| `INEVITAVEL_BOT_HANDLE` | Handle sem `@` (ex.: `Inevitavel_Bot`) |
| `INEVITAVEL_GPT_KEYWORD` | Palavra-chave de acionamento digitada no tweet (ex.: `InevitavelGPT`) |
| `STATE_DIR` | Caminho do volume de persistência (ex.: `/data`) |

> `BOT_API_SECRET` também deve estar definido nas variáveis de ambiente da **Vercel** — ele protege tanto `/api/bot/answer` quanto `/api/bot/image`.

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
| `node scripts/manage_videos.mjs --list-pending` | Listar vídeos pendentes de curadoria |
| `node scripts/manage_videos.mjs --list-all` | Listar todos os vídeos com status |
| `node scripts/manage_videos.mjs --manual-curate` | Curadoria manual de um vídeo específico |
| `node scripts/manage_videos.mjs --reject-curated` | Reprovar manualmente um vídeo já aprovado |
| `node scripts/manage_videos.mjs --reset-curation-all` | Resetar curadoria de todos os vídeos (mantém vetores Pinecone) |
| `node scripts/manage_videos.mjs --reset-curation-video` | Resetar curadoria de um vídeo específico (mantém vetores Pinecone) |
| `node scripts/reset_entrevistas_index.mjs` | Apagar vetores do Pinecone e desindexar todos os vídeos |
| `curar-indexar.bat` | Menu interativo local com todas as opções acima (Windows) |
| `node scripts/migrate_to_pinecone.mjs` | Enviar vetores do store.json para o Pinecone |
| `node scripts/aggregate_filiados.mjs ./tse_data` | Processar CSV do TSE e inserir no Neon |
| `node scripts/aggregate_deputados.mjs` | Buscar deputados na API da Câmara e inserir no Neon |

---

<div align="center">

**o Livro Amarelo · O Futuro é Glorioso**

</div>
