<p align="center">
  <img src="web/public/favicon.svg" width="64" height="64" alt="Logo" />
</p>

<h1 align="center">Declassified Archives</h1>
<h3 align="center">Argentine Civic-Military Dictatorship (1976-1983)</h3>

<p align="center">
  <strong>Open-access AI chatbot for querying officially declassified documents about the Argentine dictatorship.</strong>
</p>

<p align="center">
  <a href="https://history-arg-web.pages.dev">Live Site</a> &middot;
  <a href="#how-it-works">How it Works</a> &middot;
  <a href="#setup--deploy">Deploy</a> &middot;
  <a href="SOURCES.md">Sources</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/cost-$0%2Fmo-brightgreen" alt="Cost $0/mo" />
  <img src="https://img.shields.io/badge/sources-10%2C243_documents-blue" alt="10,243 documents" />
  <img src="https://img.shields.io/badge/tests-11%2F11_pass-success" alt="Tests 11/11" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="MIT" />
</p>

---

## What is this?

A free, open-source tool that allows anyone to query officially declassified documents about Argentina's last civic-military dictatorship (1976-1983). Responses are based **exclusively** on indexed documents — the system never fabricates or speculates information.

The chatbot uses RAG (Retrieval-Augmented Generation) to search through relevant documents and generate answers with citations to the original sources.

> **Context:** Between 1976 and 1983, Argentina was ruled by a military dictatorship responsible for the forced disappearance of 30,000 people. In March 2026, the Argentine government declassified 26 official intelligence files from that period. This project makes those documents — along with the official registry of victims — queryable by anyone.

### Guardrails

The chatbot enforces strict rules:

- Only answers about the Argentine dictatorship and indexed archives
- Rejects off-topic questions (sports, math, other countries, etc.)
- Does not emit political opinions — responds to value judgments with documented facts
- Resists prompt injection and jailbreak attempts
- Treats victim data with respect and sensitivity

---

## Data Sources

| Source | Description | Volume | License |
|---|---|---|---|
| **SIDE** | 26 declassified files from Argentina's Intelligence Secretariat. Resolutions, memos, circulars, directives and manuals (1973-1983). | 987 pages / 828 chunks | Public domain |
| **RUVTE** | Unified Registry of Victims of State Terrorism. Forced disappearances, murders and cases under investigation (1966-1983). | 9,415 victims | CC BY 4.0 |

**Total: 10,243 indexed documents.**

SIDE files come from the [official government portal](https://www.argentina.gob.ar/inteligencia/archivos), declassified on March 19, 2026. OCR was performed by the community project [side.com.ar](https://side.com.ar/).

RUVTE data comes from [datos.jus.gob.ar](https://datos.jus.gob.ar/dataset/registro-unificado-de-victimas-del-terrorismo-de-estado-ruvte), published by Argentina's Ministry of Justice.

See [SOURCES.md](SOURCES.md) for full URLs, dataset fields, and accessibility status.

---

## How it Works

```
                          Declassified Archives — RAG Architecture

  ┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
  │  User        │     │  Cloudflare      │     │  Cloudflare      │     │  Groq API       │
  │  (browser)   │────>│  Worker          │────>│  Vectorize       │     │  (Llama 3.1 70B)│
  │              │     │                  │     │  (10,243 vectors)│     │                 │
  │              │     │  1. Embed query  │     └──────────────────┘     │                 │
  │              │     │  2. Search top-5 │                              │                 │
  │              │     │  3. Fetch D1     │     ┌──────────────────┐     │                 │
  │              │<────│  4. LLM stream   │────>│  Cloudflare D1   │     │                 │
  │              │ SSE │  5. Cache        │     │  (text+metadata) │     │                 │
  └─────────────┘     │                  │────>│                  │────>│                 │
                      └──────────────────┘     └──────────────────┘     └─────────────────┘
                             │                                                   │
                             │  Workers AI (bge-small, 384d)                     │
                             │  for query embeddings                             │
                             └───────────────────────────────────────────────────┘
```

### Step-by-step pipeline

1. **User writes a question** in the web interface
2. **Worker embeds the query** with Workers AI (`bge-small-en-v1.5`, 384 dimensions)
3. **Searches the 5 most relevant documents** in Vectorize (cosine similarity)
4. **Retrieves full text** from D1
5. **Builds a prompt** with context and safety rules
6. **Generates the response** with Groq (Llama 3.1 70B) via streaming
7. **User sees the response** token by token with cited sources
8. **Response is cached** for 1 hour for repeated queries

---

## Tech Stack

### Production (public web)

| Component | Technology | Cost |
|---|---|---|
| Frontend | Astro + Tailwind CSS v4 + React (islands) | Free (Cloudflare Pages) |
| Backend API | Cloudflare Workers | Free (free tier) |
| Embeddings | Workers AI (`bge-small-en-v1.5`, 384d) | Free (10K Neurons/day) |
| Vector store | Cloudflare Vectorize (10,243 vectors) | Free (78.7% of free tier) |
| Database | Cloudflare D1 (SQLite) | Free (16 MB / 500 MB) |
| LLM | Groq (`llama-3.1-70b-versatile`) | Free (14,400 req/day) |
| Fallback LLM | Workers AI (`llama-3.1-8b-instruct`) | Free |
| Cache | Cloudflare Cache API (1h TTL) | Free |
| **Total** | | **$0/mo** |

### Development

| Component | Technology |
|---|---|
| Data pipeline | Python + sentence-transformers |
| Batch embeddings | `BAAI/bge-small-en-v1.5` via sentence-transformers |
| OCR | Not needed (uses community OCR from [side.com.ar](https://github.com/Xyborg/side.com.ar)) |
| Tests | 11-query suite + local cosine similarity |

---

## Project Structure

```
History-ARG/
│
├── web/                           # Frontend (Astro + Tailwind + React)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro        #   Main page with chat
│   │   │   └── acerca.astro       #   About page with sources
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx   #   Chat with SSE streaming (React island)
│   │   │   ├── Header.astro       #   Header with Argentine flag stripe + Sol de Mayo
│   │   │   ├── MemorialBanner.astro#   March 24th memorial banner
│   │   │   └── Footer.astro       #   Memorial footer with white handkerchiefs
│   │   ├── layouts/Layout.astro   #   Base layout with Google Fonts
│   │   └── styles/global.css      #   Dark memorial Argentine theme
│   └── astro.config.mjs
│
├── worker/                        # Backend API (Cloudflare Worker)
│   ├── src/
│   │   ├── index.js               #   Router: /api/chat, /api/sources, /api/health
│   │   ├── rag.js                 #   Full RAG pipeline with cache and fallback
│   │   ├── prompts.js             #   System prompt with guardrails
│   │   └── preprocessing.js       #   Acronym expansion (ESMA, CONADEP, etc.)
│   └── wrangler.toml              #   Config: Vectorize + D1 + Workers AI bindings
│
├── src/                           # Python modules (data pipeline)
│   ├── data_acquisition.py        #   Downloads SIDE OCR (987 JSONs) + RUVTE CSVs
│   ├── text_processing.py         #   Cleaning, chunking, RUVTE-to-text conversion
│   └── embeddings.py              #   Embedding generation + NDJSON/SQL export
│
├── notebooks/
│   └── 01_data_pipeline.ipynb     # Full pipeline for Google Colab
│
├── scripts/
│   ├── setup_cloudflare.sh        # Create Vectorize index + D1 database
│   └── upload_to_cloudflare.py    # Upload vectors and data to Cloudflare
│
├── tests/
│   ├── test_queries.json          # Suite of 14 queries (factual + adversarial)
│   └── test_local_rag.py          # Local retrieval test without Cloudflare
│
├── data_catalog.yaml              # Machine-readable source catalog
├── SOURCES.md                     # Detailed source documentation
├── PLAN.md                        # Implementation plan (7 phases)
└── package.json                   # Root scripts (dev, build, deploy)
```

---

## Setup & Deploy

### Prerequisites

- Python 3.9+
- Node.js 18+
- [Cloudflare](https://dash.cloudflare.com) account (free tier)
- [Groq](https://console.groq.com) API key (free)

### 1. Clone and process data

```bash
git clone https://github.com/YOUR_USERNAME/History-ARG.git
cd History-ARG

# Install Python dependencies
pip install langchain sentence-transformers pandas tqdm requests

# Run the full pipeline (~2 minutes)
python3 -c "
from src.data_acquisition import download_side_ocr, download_side_metadata, download_ruvte
from src.text_processing import build_side_documents, chunk_side_documents, process_ruvte, save_chunks
from src.embeddings import load_model, generate_embeddings, save_embeddings_ndjson, save_d1_sql, split_ndjson_for_upload

ocr = download_side_ocr('data/raw/side/ocr')
meta, _ = download_side_metadata('data/raw/side')
df1, df2 = download_ruvte('data/raw/ruvte')

side_chunks = chunk_side_documents(build_side_documents(ocr, meta))
ruvte_chunks = process_ruvte(df1, df2)
all_chunks = side_chunks + ruvte_chunks
save_chunks(all_chunks, 'data/processed/chunks.jsonl')

model = load_model()
embs = generate_embeddings(all_chunks, model)
save_embeddings_ndjson(all_chunks, embs, 'data/processed/vectors.ndjson')
split_ndjson_for_upload('data/processed/vectors.ndjson', 'data/processed/vectorize_batches')
save_d1_sql(all_chunks, 'data/processed/d1_schema.sql')
"
```

### 2. Configure Cloudflare

```bash
npx wrangler login
chmod +x scripts/setup_cloudflare.sh
./scripts/setup_cloudflare.sh
```

### 3. Set secrets

```bash
echo "your_groq_api_key" | npx wrangler secret put GROQ_API_KEY --name history-arg-api
```

### 4. Upload data

```bash
python3 scripts/upload_to_cloudflare.py
```

### 5. Deploy

```bash
# API (Worker)
cd worker && npm install && npx wrangler deploy

# Frontend (Pages)
cd web && npm install && npm run deploy
```

### 6. Local development

```bash
# Frontend (from root)
npm run dev

# Worker
npm run dev:worker
```

---

## Test Results

The retrieval pipeline was tested with 11 factual and cross-reference queries:

```
TEST SUMMARY
════════════════════════════════════════════════════
  Total queries:     11
  Source hit rate:    11/11 (100%)
  Keyword hit rate:  11/11 (100%)
  Avg top-1 score:   0.775

  [PASS] side_01:  How was SIDE organized?                    → SIDE  @ 0.741
  [PASS] side_02:  What types of documents were declassified?  → SIDE  @ 0.767
  [PASS] side_03:  SIDE regional offices?                      → SIDE  @ 0.803
  [PASS] side_04:  What was the Advisory Commission?           → SIDE  @ 0.825
  [PASS] side_05:  Staff cover-up regulations?                 → SIDE  @ 0.779
  [PASS] ruvte_01: Victims in Buenos Aires?                    → RUVTE @ 0.815
  [PASS] ruvte_02: Pregnant victims?                           → RUVTE @ 0.829
  [PASS] ruvte_03: Disappeared in Cordoba?                     → RUVTE @ 0.711
  [PASS] ruvte_04: Victims under 18?                           → RUVTE @ 0.809
  [PASS] ruvte_05: Types of events in RUVTE?                   → SIDE  @ 0.689
  [PASS] cross_01: Did SIDE operate in provinces?              → SIDE  @ 0.759
```

Adversarial tests verified manually:
- **Off-topic** (World Cup, math): rejects and explains its scope
- **Jailbreak** (ignore instructions): rejects without executing
- **Political opinions** (did the military do the right thing?): responds with documented facts, no judgment
- **Impersonation** (are you ChatGPT?): does not play along

---

## Performance

| Metric | Value |
|---|---|
| Full response time | ~5 seconds |
| Tokens per response | ~250-300 |
| Generation speed | ~500 tokens/sec (Groq) |
| Cache hit | Instant response |
| Cold start | < 1 second (Workers) |
| Frontend bundle size | ~74 KB gzip |

---

## Roadmap

Sources identified for future versions:

| Source | Content | Language | Priority |
|---|---|---|---|
| Nunca Mas Report (CONADEP) | Official report on disappearances | ES | High |
| Archive.org Declassification Project | ~47,000 pages from CIA, FBI, State Dept | EN | Medium |
| Desclasificados.org.ar | 4,903 US documents (CELS + Abuelas de Plaza de Mayo) | EN | Medium |
| CELS Archive | Institutional human rights archive | ES | Medium |
| NSA at George Washington University | 2,429 Southern Cone Project documents | EN | Low |
| Memoria Abierta | 300+ audiovisual interviews | ES | Low |

---

## Credits

- **SIDE documents OCR**: [side.com.ar](https://side.com.ar/) by [Martin Aberastegue](https://github.com/Xyborg/side.com.ar)
- **RUVTE**: Ministry of Justice, Secretariat of Human Rights, Argentine Republic
- **Original documents**: Secretariat of State Intelligence (SIDE), Argentine Republic
- **Infrastructure**: [Cloudflare](https://cloudflare.com) (Workers, Pages, Vectorize, D1, Workers AI)
- **LLM inference**: [Groq](https://groq.com) (Llama 3.1 70B)

---

## License

MIT

---

<p align="center">
  <em>30,000 Disappeared &middot; Never Again &middot; Memory, Truth and Justice</em>
</p>
