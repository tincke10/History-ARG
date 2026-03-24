<p align="center">
  <img src="web/public/favicon.svg" width="64" height="64" alt="Logo" />
</p>

<h1 align="center">Archivos Desclasificados</h1>
<h3 align="center">Dictadura Civico-Militar Argentina (1976-1983)</h3>

<p align="center">
  <strong>Chatbot de acceso abierto para consultar documentos oficiales desclasificados sobre la dictadura argentina usando inteligencia artificial.</strong>
</p>

<p align="center">
  <a href="https://history-arg-web.pages.dev">Ver sitio</a> &middot;
  <a href="#como-funciona">Como funciona</a> &middot;
  <a href="#setup-y-deploy">Deploy</a> &middot;
  <a href="SOURCES.md">Fuentes</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/costo-$0%2Fmes-brightgreen" alt="Costo $0/mes" />
  <img src="https://img.shields.io/badge/fuentes-10%2C243_documentos-blue" alt="10,243 documentos" />
  <img src="https://img.shields.io/badge/tests-11%2F11_pass-success" alt="Tests 11/11" />
  <img src="https://img.shields.io/badge/licencia-MIT-yellow" alt="MIT" />
</p>

---

## Que es esto?

Una herramienta gratuita y abierta que permite a cualquier ciudadano argentino consultar informacion de archivos oficiales desclasificados sobre la ultima dictadura civico-militar. Las respuestas se basan **exclusivamente** en documentos indexados: nunca inventa ni especula informacion.

El sistema utiliza RAG (Retrieval-Augmented Generation) para buscar en los documentos relevantes y generar respuestas con citas a las fuentes originales.

### Guardrails

El chatbot tiene reglas estrictas:

- Solo responde sobre la dictadura argentina y los archivos indexados
- Rechaza preguntas fuera de tema (deportes, matematica, etc.)
- No emite opiniones politicas: ante preguntas de valoracion, responde con hechos documentados
- Resiste intentos de manipulacion o jailbreak
- Trata la informacion de victimas con respeto y sensibilidad

---

## Fuentes de datos

| Fuente | Descripcion | Volumen | Licencia |
|---|---|---|---|
| **SIDE** | 26 documentos desclasificados de la Secretaria de Inteligencia del Estado. Resoluciones, memorandos, circulares, directivas y manuales (1973-1983). | 987 paginas / 828 chunks | Dominio publico |
| **RUVTE** | Registro Unificado de Victimas del Terrorismo de Estado. Desapariciones forzadas, asesinatos y casos en investigacion (1966-1983). | 9,415 victimas | CC BY 4.0 |

**Total: 10,243 documentos indexados.**

Los archivos SIDE provienen del [portal oficial](https://www.argentina.gob.ar/inteligencia/archivos) del gobierno argentino, desclasificados el 19 de marzo de 2026. El OCR fue realizado por el proyecto comunitario [side.com.ar](https://side.com.ar/).

Los datos del RUVTE provienen de [datos.jus.gob.ar](https://datos.jus.gob.ar/dataset/registro-unificado-de-victimas-del-terrorismo-de-estado-ruvte), publicados por el Ministerio de Justicia.

Ver [SOURCES.md](SOURCES.md) para URLs completas, campos de cada dataset, y estado de accesibilidad.

---

## Como funciona

```
                            Archivos Desclasificados - Arquitectura RAG

  ┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
  │  Usuario     │     │  Cloudflare      │     │  Cloudflare      │     │  Groq API       │
  │  (browser)   │────>│  Worker          │────>│  Vectorize       │     │  (Llama 3.1 70B)│
  │              │     │                  │     │  (10,243 vectors)│     │                 │
  │              │     │  1. Embed query  │     └──────────────────┘     │                 │
  │              │     │  2. Search top-5 │                              │                 │
  │              │     │  3. Fetch D1     │     ┌──────────────────┐     │                 │
  │              │<────│  4. LLM stream   │────>│  Cloudflare D1   │     │                 │
  │              │ SSE │  5. Cache        │     │  (texto+metadata)│     │                 │
  └─────────────┘     │                  │────>│                  │────>│                 │
                      └──────────────────┘     └──────────────────┘     └─────────────────┘
                             │                                                   │
                             │  Workers AI (bge-small, 384d)                     │
                             │  para embedding de queries                        │
                             └───────────────────────────────────────────────────┘
```

### Pipeline paso a paso

1. **El usuario escribe una pregunta** en la interfaz web
2. **El Worker embede la query** con Workers AI (`bge-small-en-v1.5`, 384 dimensiones)
3. **Busca los 5 documentos mas relevantes** en Vectorize (cosine similarity)
4. **Recupera el texto completo** de esos documentos desde D1
5. **Construye un prompt** con el contexto y las reglas de seguridad
6. **Genera la respuesta** con Groq (Llama 3.1 70B) en streaming
7. **El usuario ve la respuesta** token por token con las fuentes citadas
8. **Se cachea** la respuesta por 1 hora para queries repetidas

---

## Stack tecnologico

### Produccion (web publica)

| Componente | Tecnologia | Costo |
|---|---|---|
| Frontend | Astro + Tailwind CSS v4 + React (islands) | Gratis (Cloudflare Pages) |
| Backend API | Cloudflare Workers | Gratis (free tier) |
| Embeddings | Workers AI (`bge-small-en-v1.5`, 384d) | Gratis (10K Neurons/dia) |
| Vector store | Cloudflare Vectorize (10,243 vectores) | Gratis (78.7% del free tier) |
| Base de datos | Cloudflare D1 (SQLite) | Gratis (16 MB / 500 MB) |
| LLM | Groq (`llama-3.1-70b-versatile`) | Gratis (14,400 req/dia) |
| Fallback LLM | Workers AI (`llama-3.1-8b-instruct`) | Gratis |
| Cache | Cloudflare Cache API (1h TTL) | Gratis |
| **Total** | | **$0/mes** |

### Desarrollo

| Componente | Tecnologia |
|---|---|
| Pipeline de datos | Python + sentence-transformers |
| Embeddings (batch) | `BAAI/bge-small-en-v1.5` via sentence-transformers |
| OCR | No necesario (usa OCR comunitario de [side.com.ar](https://github.com/Xyborg/side.com.ar)) |
| Tests | Suite de 11 queries + cosine similarity local |

---

## Estructura del proyecto

```
History-ARG/
│
├── web/                           # Frontend (Astro + Tailwind + React)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro        #   Pagina principal con chat
│   │   │   └── acerca.astro       #   Info del proyecto y fuentes
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx   #   Chat con streaming SSE (isla React)
│   │   │   ├── Header.astro       #   Header con franja argentina + Sol de Mayo
│   │   │   ├── MemorialBanner.astro#   Banner 24 de Marzo
│   │   │   └── Footer.astro       #   Footer memorial con panuelos blancos
│   │   ├── layouts/Layout.astro   #   Layout base con fuentes Google
│   │   └── styles/global.css      #   Tema dark memorial argentino
│   └── astro.config.mjs
│
├── worker/                        # Backend API (Cloudflare Worker)
│   ├── src/
│   │   ├── index.js               #   Router: /api/chat, /api/sources, /api/health
│   │   ├── rag.js                 #   Pipeline RAG completo con cache y fallback
│   │   ├── prompts.js             #   System prompt con guardrails
│   │   └── preprocessing.js       #   Expansion de acronimos (ESMA, CONADEP, etc.)
│   └── wrangler.toml              #   Config: Vectorize + D1 + Workers AI bindings
│
├── src/                           # Modulos Python (pipeline de datos)
│   ├── data_acquisition.py        #   Descarga SIDE OCR (987 JSONs) + RUVTE CSVs
│   ├── text_processing.py         #   Limpieza, chunking, conversion RUVTE a texto
│   └── embeddings.py              #   Generacion embeddings + export NDJSON/SQL
│
├── notebooks/
│   └── 01_data_pipeline.ipynb     # Pipeline completo para Google Colab
│
├── scripts/
│   ├── setup_cloudflare.sh        # Crear Vectorize index + D1 database
│   └── upload_to_cloudflare.py    # Subir vectores y datos a Cloudflare
│
├── tests/
│   ├── test_queries.json          # Suite de 14 queries (factuales + adversariales)
│   └── test_local_rag.py          # Test de retrieval local sin Cloudflare
│
├── data_catalog.yaml              # Catalogo machine-readable de fuentes
├── SOURCES.md                     # Documentacion detallada de fuentes
├── PLAN.md                        # Plan de implementacion (7 fases)
└── package.json                   # Scripts raiz (dev, build, deploy)
```

---

## Setup y deploy

### Prerequisitos

- Python 3.9+
- Node.js 18+
- Cuenta de [Cloudflare](https://dash.cloudflare.com) (free tier)
- API key de [Groq](https://console.groq.com) (gratis)

### 1. Clonar y procesar datos

```bash
git clone https://github.com/TU_USUARIO/History-ARG.git
cd History-ARG

# Instalar dependencias Python
pip install langchain sentence-transformers pandas tqdm requests

# Ejecutar pipeline completo (~2 minutos)
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

### 2. Configurar Cloudflare

```bash
npx wrangler login
chmod +x scripts/setup_cloudflare.sh
./scripts/setup_cloudflare.sh
```

### 3. Configurar secrets

```bash
# Guardar la API key de Groq como secret
echo "tu_groq_api_key" | npx wrangler secret put GROQ_API_KEY --name history-arg-api
```

### 4. Subir datos

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

### 6. Desarrollo local

```bash
# Frontend (desde la raiz)
npm run dev

# Worker
npm run dev:worker
```

---

## Resultados de tests

El pipeline de retrieval fue testeado con 11 queries factuales y de cross-reference:

```
RESUMEN DE TESTS
════════════════════════════════════════════════════
  Total queries:     11
  Source hit rate:    11/11 (100%)
  Keyword hit rate:  11/11 (100%)
  Avg top-1 score:   0.775

  [PASS] side_01:  Como estaba organizada la SIDE?           → SIDE  @ 0.741
  [PASS] side_02:  Que tipo de documentos desclasifico?       → SIDE  @ 0.767
  [PASS] side_03:  Delegaciones regionales de la SIDE?        → SIDE  @ 0.803
  [PASS] side_04:  Que era la Comision Asesora?               → SIDE  @ 0.825
  [PASS] side_05:  Normas de encubrimiento del personal?      → SIDE  @ 0.779
  [PASS] ruvte_01: Victimas en Buenos Aires?                  → RUVTE @ 0.815
  [PASS] ruvte_02: Victimas embarazadas?                      → RUVTE @ 0.829
  [PASS] ruvte_03: Desaparecidos en Cordoba?                  → RUVTE @ 0.711
  [PASS] ruvte_04: Victimas menores de 18 anos?               → RUVTE @ 0.809
  [PASS] ruvte_05: Tipos de hechos del RUVTE?                 → SIDE  @ 0.689
  [PASS] cross_01: SIDE tenia operaciones en provincias?      → SIDE  @ 0.759
```

Tests adversariales verificados manualmente:
- **Off-topic** (mundial, matematica): rechaza y explica su funcion
- **Jailbreak** (ignorar instrucciones): rechaza sin ejecutar
- **Opiniones politicas** (militares hicieron bien?): responde con hechos documentados, sin juicio
- **Suplantacion** (sos ChatGPT?): no se deja engañar

---

## Rendimiento

| Metrica | Valor |
|---|---|
| Tiempo de respuesta (completa) | ~5 segundos |
| Tokens por respuesta | ~250-300 |
| Velocidad de generacion | ~500 tokens/seg (Groq) |
| Cache hit | Respuesta instantanea |
| Cold start | < 1 segundo (Workers) |
| Tamaño del bundle frontend | ~74 KB gzip |

---

## Fuentes futuras (roadmap)

Fuentes identificadas para incorporar en futuras versiones:

| Fuente | Contenido | Idioma | Prioridad |
|---|---|---|---|
| Informe Nunca Mas (CONADEP) | Informe oficial sobre desapariciones | ES | Alta |
| Archive.org Declassification Project | ~47,000 paginas CIA, FBI, State Dept | EN | Media |
| Desclasificados.org.ar | 4,903 documentos EEUU (CELS + Abuelas) | EN | Media |
| CELS Archive | Archivo institucional de DDHH | ES | Media |
| NSA George Washington University | 2,429 documentos del Southern Cone Project | EN | Baja |
| Memoria Abierta | 300+ entrevistas audiovisuales | ES | Baja |

---

## Creditos

- **OCR de documentos SIDE**: [side.com.ar](https://side.com.ar/) por [Martin Aberastegue](https://github.com/Xyborg/side.com.ar)
- **RUVTE**: Ministerio de Justicia, Secretaria de Derechos Humanos de la Nacion Argentina
- **Documentos originales**: Secretaria de Inteligencia del Estado, Republica Argentina
- **Infraestructura**: [Cloudflare](https://cloudflare.com) (Workers, Pages, Vectorize, D1, Workers AI)
- **LLM**: [Groq](https://groq.com) (Llama 3.1 70B)

---

## Licencia

MIT

---

<p align="center">
  <em>30.000 Desaparecidos &middot; Nunca Mas &middot; Memoria, Verdad y Justicia</em>
</p>
