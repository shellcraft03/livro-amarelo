<div align="center">

**🌐 Language / Idioma:** [English](README.en.md) . [Português](README.md)

# o Livro Amarelo — Q&A

**Explore o Livro Amarelo por meio de perguntas em linguagem natural.**

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

Esta aplicação web permite explorar o conteúdo do Livro Amarelo por meio de perguntas em linguagem natural. O sistema indexa o documento, gera embeddings semânticos e usa um modelo de linguagem para responder com base exclusivamente no conteúdo — citando as páginas como fonte.

---

## Funcionalidades

- **RAG completo** — busca semântica por embeddings + geração de resposta contextualizada
- **Proteção por CAPTCHA** — Cloudflare Turnstile com token renovado por requisição
- **Rate limiting** — 10 req/min e 50 req/dia por IP via Sliding Window (`@upstash/ratelimit`) · apenas requisições bloqueadas são registradas na chave `rl:blocked` do Redis (lista persistente, sem TTL, timestamp em horário de Brasília) · fallback em memória (dev local)
- **Respostas concretas** — o modelo é instruído a citar apenas propostas explícitas do documento
- **Compartilhamento** — botões para copiar texto ou baixar a resposta como imagem JPEG
- **Deputados federais** — página `/deputados` com composição da Câmara por partido e estado, via API da Câmara dos Deputados; nome do partido via join com a base de filiados
- **Filiados partidários** — página `/filiados` com dados de filiação por partido e estado, atualizada automaticamente toda segunda-feira via GitHub Actions a partir dos dados públicos do TSE
- **Responsivo** — layout adaptado para desktop e dispositivos móveis

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4.1-mini |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | Pinecone (banco de vetores em nuvem) |
| Banco relacional | Neon Postgres (serverless) |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | @upstash/ratelimit · Sliding Window · Upstash Redis (serverless) · fallback em memória (dev local) |
| Analytics | Google Analytics 4 |
| PDF parsing | pdf-parse |
| Automação de dados | GitHub Actions (cron semanal) |

---

## Estrutura do projeto

```
livro-amarelo/
├── .github/
│   └── workflows/
│       └── update-filiados.yml   # Cron semanal: atualiza filiados (TSE) e deputados (Câmara API)
├── pages/
│   ├── index.js              # Página de verificação (Turnstile)
│   ├── inicio.js             # Interface de perguntas e respostas
│   ├── deputados.js          # Página de deputados federais por partido e estado
│   ├── filiados.js           # Página de filiados partidários por estado
│   ├── sobre.js              # Página sobre o projeto
│   ├── privacidade.js        # Política de privacidade
│   ├── _app.js               # App wrapper — CSS global + Google Analytics
│   └── api/
│       ├── chat.js           # Endpoint principal RAG + LLM
│       ├── deputados.js      # Endpoint de deputados (Neon + join com filiados para nome do partido)
│       └── filiados.js       # Endpoint de filiados (lê do Neon Postgres)
├── hooks/
│   └── useTurnstile.js       # Hook React para o widget Turnstile
├── lib/
│   ├── turnstile.js          # Verificação server-side do token
│   ├── chunker.js            # Divisão e normalização de texto
│   ├── vectorStore.js        # Armazenamento e busca de embeddings
│   └── rateLimiter.js        # Rate limiting por IP
├── scripts/
│   ├── aggregate_deputados.mjs   # Busca deputados na API da Câmara e insere no Neon
│   ├── aggregate_filiados.mjs    # Processa CSV do TSE (streaming) e insere no Neon
│   ├── index_pdf.mjs             # Indexar PDFs da pasta data/books/
│   ├── generate_embeddings.mjs   # Gerar embeddings para itens sem vetor
│   └── migrate_to_pinecone.mjs   # Migrar vetores do store.json para o Pinecone
├── styles/
│   └── globals.css           # Paleta de cores, reset e classes responsivas
├── public/
│   └── cover.png             # Ilustração da capa
└── data/
    └── books/                # PDFs fonte (não versionados)
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

# Modelo de embedding (opcional — padrão: text-embedding-3-small)
# EMBEDDING_MODEL=text-embedding-3-small

# Upstash Redis para rate limiting distribuído
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Neon Postgres para dados de filiados
DATABASE_URL=postgresql://...
```

> **Pinecone:** crie um index no [console do Pinecone](https://app.pinecone.io) com dimensão **1536** (compatível com `text-embedding-3-small`) e região de sua preferência. Após indexar os PDFs localmente, execute o script de migração (seção 3b) para enviar os vetores ao Pinecone.

> **Atenção:** o projeto OpenAI precisa ter acesso a dois modelos:
> - `text-embedding-3-small` — para geração de embeddings na indexação e nas consultas
> - `gpt-4.1-mini` — para geração de respostas em linguagem natural
>
> Verifique em *platform.openai.com → Projects → Model access*. Os modelos acima são os padrões utilizados, mas o desenvolvedor pode substituí-los pelos modelos de sua preferência editando as variáveis `EMBEDDING_MODEL` e o campo `model` em `pages/api/chat.js`.

> **Neon:** crie um projeto em [neon.tech](https://neon.tech) e copie a connection string no formato `postgresql://...`. A tabela `filiados_partidarios` é criada automaticamente na primeira execução do script `aggregate_filiados.mjs`. Adicione `DATABASE_URL` também como secret do repositório no GitHub (Actions → Secrets) para o workflow de atualização automática funcionar.

### 3. Indexar o documento e enviar ao Pinecone

Coloque o PDF em `data/books/` e execute:

```bash
# Primeira indexação (extrai texto, gera chunks e embeddings localmente)
npm run index:pdf

# Re-indexar do zero (limpa o store antes)
npm run index:pdf -- --reindex
```

#### 3b. Migrar vetores para o Pinecone

Após a indexação local, envie os vetores para o Pinecone:

```bash
node scripts/migrate_to_pinecone.mjs
```

O script lê o `store.json` local e faz upload de todos os vetores em lotes de 100. Após a migração, o `store.json` não é mais necessário em produção — os vetores ficam armazenados no Pinecone.

### 4. Popular o banco de filiados

Baixe o arquivo de filiação do TSE e processe-o com o script de agregação:

```bash
# Baixar e extrair
curl -L -o filiacao.zip "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip"
mkdir -p tse_data && unzip filiacao.zip -d tse_data/

# Processar e inserir no banco (~12M linhas, ~5 min)
node scripts/aggregate_filiados.mjs ./tse_data

# Limpar temporários
rm -rf filiacao.zip tse_data/
```

O script usa streaming para processar o CSV de 3,3 GB sem estourar memória. A cada execução, os dados do período presente no arquivo são descartados e reinseridos — sem duplicidade.

A partir da primeira carga, o workflow do GitHub Actions atualiza o banco automaticamente toda segunda-feira às 08:00 BRT.

### 5. Gerar embeddings ausentes

Se a indexação salvou itens sem embedding (falha temporária na API):

```bash
npm run generate:embeddings
```

O script faz um preflight check e informa se o modelo não está acessível antes de processar.

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
┌───────────────────────────────────┐
│  /inicio — Interface Q&A          │  Digita pergunta → Enter ou botão
└─────────────┬─────────────────────┘
              │ token fresco gerado por requisição
              ▼
┌───────────────────────────────────┐
│  /api/chat                        │
│  1. Verifica método POST          │
│  2. Rate limit (min + dia)        │
│  3. Verifica Turnstile            │
│  4. Embed a pergunta              │
│  5. Busca top-6 chunks (Pinecone) │
│  6. Monta prompt com contexto     │
│  7. GPT-4.1-mini responde         │
└─────────────┬─────────────────────┘
              │
              ▼
        Resposta com citação de página
        + opções de copiar / baixar imagem

┌───────────────────────────────────┐
│  /filiados — Filiados Partidários │  Filtros por estado e período
└─────────────┬─────────────────────┘
              │
              ▼
┌───────────────────────────────────┐
│  /api/filiados                    │
│  Lê do Neon Postgres              │
│  Cache: 1h (s-maxage)             │
└───────────────────────────────────┘
              ▲
              │ toda segunda-feira 08:00 BRT
┌───────────────────────────────────┐
│  GitHub Actions                   │
│  Baixa ZIP do TSE (~221MB)        │
│  Processa 12M linhas via stream   │
│  Drop + insert no Neon            │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  /deputados — Deputados Federais  │  Filtros por estado e legislatura
└─────────────┬─────────────────────┘
              │
              ▼
┌───────────────────────────────────┐
│  /api/deputados                   │
│  Lê do Neon Postgres              │
│  Join com filiados_partidarios    │
│  para obter nome do partido       │
│  Cache: 1h (s-maxage)             │
└───────────────────────────────────┘
              ▲
              │ toda segunda-feira 08:00 BRT
┌───────────────────────────────────┐
│  GitHub Actions                   │
│  Busca deputados na API da Câmara │
│  Agrega por partido × UF          │
│  Drop + insert no Neon            │
└───────────────────────────────────┘
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
| `node scripts/migrate_to_pinecone.mjs` | Enviar vetores do store.json para o Pinecone |
| `node scripts/aggregate_filiados.mjs ./tse_data` | Processar CSV do TSE e inserir no Neon |
| `node scripts/aggregate_deputados.mjs` | Buscar deputados na API da Câmara e inserir no Neon |

---

<div align="center">

**o Livro Amarelo · O Futuro é Glorioso**

</div>
