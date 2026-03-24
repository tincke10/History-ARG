# Archivos Desclasificados - Dictadura Argentina (1976-1983)

Chatbot de acceso abierto que permite consultar documentos oficiales desclasificados sobre la dictadura civico-militar argentina usando inteligencia artificial.

Las respuestas se basan **exclusivamente** en documentos indexados. No inventa ni especula informacion.

## Fuentes de datos

| Fuente | Contenido | Registros |
|---|---|---|
| **SIDE** | 26 documentos desclasificados de la Secretaria de Inteligencia (1973-1983) | 987 paginas |
| **RUVTE** | Registro Unificado de Victimas del Terrorismo de Estado | 9,415 victimas |

Ver [SOURCES.md](SOURCES.md) para URLs y detalles completos.

## Como funciona

```
Usuario pregunta
      |
      v
Embed query (bge-small, 384d)
      |
      v
Buscar en Vectorize (top-5 cosine similarity)
      |
      v
Recuperar texto de D1
      |
      v
Generar respuesta con LLM (Workers AI)
      |
      v
Streaming con citas [1], [2], [3]
```

## Stack

**Produccion (web publica):**
- Frontend: Astro + Tailwind CSS (Cloudflare Pages)
- Backend: Cloudflare Workers
- Embeddings: Workers AI (bge-small-en-v1.5, 384d)
- Vector store: Cloudflare Vectorize
- Base de datos: Cloudflare D1
- LLM: Workers AI (Llama 3.1 8B)
- Costo: **$0/mes** + dominio

**Desarrollo:**
- Pipeline de datos: Python + sentence-transformers
- Notebook: Google Colab
- Tests: pytest + cosine similarity local

## Estructura del proyecto

```
History-ARG/
├── web/                  # Frontend Astro + Tailwind (Cloudflare Pages)
├── worker/               # Backend API RAG (Cloudflare Worker)
├── notebooks/            # Pipeline de datos (Colab)
│   └── 01_data_pipeline.ipynb
├── src/                  # Modulos Python
│   ├── data_acquisition.py
│   ├── text_processing.py
│   └── embeddings.py
├── scripts/              # Setup y upload a Cloudflare
├── tests/                # Test suite
├── PLAN.md               # Plan de implementacion
├── SOURCES.md            # Catalogo de fuentes
└── data_catalog.yaml     # Fuentes machine-readable
```

## Setup y deploy

### 1. Procesar datos

```bash
# Instalar dependencias
pip install langchain sentence-transformers pandas tqdm requests

# Ejecutar pipeline (descarga OCR + RUVTE, genera chunks y embeddings)
python3 -c "
from src.data_acquisition import download_side_ocr, download_side_metadata, download_ruvte
from src.text_processing import build_side_documents, chunk_side_documents, process_ruvte, save_chunks
from src.embeddings import load_model, generate_embeddings, save_embeddings_ndjson, save_d1_sql, split_ndjson_for_upload

# Descargar
ocr = download_side_ocr('data/raw/side/ocr')
meta, _ = download_side_metadata('data/raw/side')
df1, df2 = download_ruvte('data/raw/ruvte')

# Procesar
side_chunks = chunk_side_documents(build_side_documents(ocr, meta))
ruvte_chunks = process_ruvte(df1, df2)
all_chunks = side_chunks + ruvte_chunks
save_chunks(all_chunks, 'data/processed/chunks.jsonl')

# Embeddings
model = load_model()
embs = generate_embeddings(all_chunks, model)
save_embeddings_ndjson(all_chunks, embs, 'data/processed/vectors.ndjson')
split_ndjson_for_upload('data/processed/vectors.ndjson', 'data/processed/vectorize_batches')
save_d1_sql(all_chunks, 'data/processed/d1_schema.sql')
"
```

### 2. Configurar Cloudflare

```bash
npm install -g wrangler
wrangler login
chmod +x scripts/setup_cloudflare.sh
./scripts/setup_cloudflare.sh
```

### 3. Subir datos

```bash
python3 scripts/upload_to_cloudflare.py
```

### 4. Deploy

```bash
# Worker (API)
cd worker && npm install && wrangler deploy

# Frontend
cd web && npm install && npm run deploy
```

### 5. Testear

```bash
# Tests de retrieval local
python3 tests/test_local_rag.py

# Query individual
python3 tests/test_local_rag.py --query "Como estaba organizada la SIDE?"
```

## Resultados de tests

```
Source hit rate: 11/11 (100%)
Keyword hit rate: 11/11 (100%)
Avg top-1 score: 0.775
```

## Creditos

- **OCR de documentos SIDE**: [side.com.ar](https://side.com.ar/) por Martin Aberastegue
- **RUVTE**: Ministerio de Justicia, Secretaria de Derechos Humanos (CC BY 4.0)
- **Documentos originales**: Secretaria de Inteligencia del Estado, Republica Argentina

## Licencia

MIT
