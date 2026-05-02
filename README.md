<div align="center">

**🌐 Language / Idioma:** [English](README.en.md) . [Português](README.md)

# o Livro Amarelo — Q&A

**Explore o Livro Amarelo por meio de perguntas em linguagem natural.**

RAG (Retrieval-Augmented Generation) com OpenAI · Protegido por Cloudflare Turnstile

---

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1--mini-412991?style=flat-square&logo=openai)
![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-00B07D?style=flat-square)
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
- **Rate limiting** — 10 req/min e 50 req/dia por IP, com suporte a Redis ou fallback em memória
- **Respostas concretas** — o modelo é instruído a citar apenas propostas explícitas do documento
- **Compartilhamento** — botões para copiar texto ou baixar a resposta como imagem JPEG
- **Responsivo** — layout adaptado para desktop e dispositivos móveis

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4.1-mini |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | Pinecone (banco de vetores em nuvem) |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | Upstash Redis (serverless) · fallback em memória (dev local) |
| Analytics | Google Analytics 4 |
| PDF parsing | pdf-parse |

---

## Estrutura do projeto

```
livro-amarelo/
├── pages/
│   ├── index.js              # Página de verificação (Turnstile)
│   ├── inicio.js             # Interface de perguntas e respostas
│   ├── sobre.js              # Página sobre o projeto
│   ├── _app.js               # App wrapper — CSS global + Google Analytics
│   └── api/
│       └── chat.js           # Endpoint principal RAG + LLM
├── hooks/
│   └── useTurnstile.js       # Hook React para o widget Turnstile
├── lib/
│   ├── turnstile.js          # Verificação server-side do token
│   ├── chunker.js            # Divisão e normalização de texto
│   ├── vectorStore.js        # Armazenamento e busca de embeddings
│   └── rateLimiter.js        # Rate limiting por IP
├── scripts/
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
```

> **Pinecone:** crie um index no [console do Pinecone](https://app.pinecone.io) com dimensão **1536** (compatível com `text-embedding-3-small`) e região de sua preferência. Após indexar os PDFs localmente, execute o script de migração (seção 3b) para enviar os vetores ao Pinecone.

> **Atenção:** o projeto OpenAI precisa ter acesso a dois modelos:
> - `text-embedding-3-small` — para geração de embeddings na indexação e nas consultas
> - `gpt-4.1-mini` — para geração de respostas em linguagem natural
>
> Verifique em *platform.openai.com → Projects → Model access*. Os modelos acima são os padrões utilizados, mas o desenvolvedor pode substituí-los pelos modelos de sua preferência editando as variáveis `EMBEDDING_MODEL` e o campo `model` em `pages/api/chat.js`.

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

### 4. Gerar embeddings ausentes

Se a indexação salvou itens sem embedding (falha temporária na API):

```bash
npm run generate:embeddings
```

O script faz um preflight check e informa se o modelo não está acessível antes de processar.

### 5. Iniciar o servidor

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

---

<div align="center">

**o Livro Amarelo · O Futuro é Glorioso**

</div>
