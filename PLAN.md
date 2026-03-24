# Plan: RAG Chatbot - Archivos Desclasificados Dictadura Argentina (1976-1983)

## Contexto

Proyecto humanitario: chatbot RAG accesible desde la web (dominio propio + Cloudflare Workers) que permite a cualquier ciudadano argentino consultar información sobre la dictadura cívico-militar (1976-1983). No existe ningún proyecto similar.

### Estrategia de distribución
1. **Web pública** (primaria): Dominio propio + Cloudflare Workers/Pages
2. **Google Colab** (secundaria): Para desarrollo, procesamiento de datos y contribuciones

### Scope MVP: SIDE + RUVTE (todo en español)
- **SIDE declassification (Mar 2026):** 26 archivos, 492 páginas - documentos oficiales de inteligencia
- **RUVTE:** 8,700+ registros de víctimas del terrorismo de estado (CSV)
- Total estimado: ~11,000 documentos/chunks

### Fuentes futuras (V2+)
- Nunca Más (CONADEP) - 350 páginas ES
- Archive.org - 47K páginas EN (texto pre-OCR)
- Desclasificados.org.ar - 4,903 docs
- CELS Archive, NSA GWU, Memoria Abierta

---

## URLs de Fuentes Confirmadas

### RUVTE (Open Data)
- GitHub: https://github.com/datos-justicia-argentina/Registro-Unificado-Victimas-Terrorismo-Estado-RUVTE-
- datos.jus.gob.ar: https://datos.jus.gob.ar/dataset/registro-unificado-de-victimas-del-terrorismo-de-estado-ruvte

### SIDE Declassification (Mar 2026)
- Pendiente de confirmar URL de descarga
- Contacto: archivosabiertos@mindef.gov.ar

### Fuentes futuras (referencia)
- Archive.org Carter-era: https://archive.org/details/Argentina-Carter-Declassified
- Archive.org NARA 2019: https://archive.org/details/Argentina-Declassification-Project-NARA
- Archive.org Full: https://archive.org/details/ArgentinaDeclassificationProject
- Nunca Más PDF: https://www.cultura.gob.ar/media/uploads/lc_nuncamas_digital1.pdf
- Desclasificados.org.ar: https://desclasificados.org.ar/
- NSA Southern Cone: https://nsarchive.gwu.edu/project/southern-cone-documentation-project
- CELS Archive: https://archivo.cels.org.ar/
- presentes (R): https://github.com/DiegoKoz/presentes

### Nota: URLs rotas del portal oficial
- argentina.gob.ar/defensa/archivos-abiertos/sad → 404
- argentina.gob.ar/defensa/archivos-abiertos/desclasificaciones/hallazgo-condor → 404
- argentina.gob.ar/defensa/archivos-abiertos/desclasificaciones/actas-de-la-dictadura-1976-1983 → 404

---

## Arquitectura

```
[01_data_pipeline.ipynb]           [Web Pública: tudominio.ar]
(Colab - mantenedores)             (ciudadanos - sin instalar nada)

SIDE PDFs → OCR → Clean →         ┌── Pages (Astro+Tailwind)┐
RUVTE CSV → Texto natural →       │   Chat UI responsive     │
Chunk → Embed (bge-small) ─┐     └──────────┬───────────────┘
                         │                   │
                         ▼                   ▼
              Upload a Cloudflare    ┌── Worker (API) ────────┐
              ├─ Vectorize (vectors) │  1. Embed query (AI)   │
              └─ D1 (texto+metadata) │  2. Search (Vectorize) │
                                     │  3. Fetch context (D1) │
                                     │  4. Generate (LLM)     │
                                     └────────────────────────┘
```

### Análisis de costos (SIDE + RUVTE)

| Recurso | Uso estimado | Límite Free Tier | Cabe en free? |
|---|---|---|---|
| **Vectorize** | ~11K docs × 384 dims = **4.2M dims** | 5M dims | SI |
| **D1** | ~11K rows × ~1.5KB = **~16 MB** | 500 MB | SI |
| **Workers AI** (embed queries) | Pocas queries/día inicialmente | 10K Neurons/día | SI |
| **Workers** (CPU <10ms, I/O excluido) | Orquestación ligera | 100K req/día free | SI (posiblemente) |
| **Pages** (frontend) | Estático | Ilimitado | SI |

**Piloto (free tier):** bge-small (384 dims) → 11K × 384 = **4.2M dims** → cabe en free. Prioridad: validar el proyecto.

**Upgrade futuro:** Migrar a bge-base (768d) o bge-m3 (1024d) con paid plan cuando el piloto esté validado.

**Dominio:** ~$10-15/año (único costo fijo).

---

## Fase 1: Research & Catálogo de Datos

**Objetivo:** Localizar y catalogar las fuentes SIDE y RUVTE.

1. **Localizar los archivos SIDE:** La declassificación de marzo 2026 (26 archivos, 492 páginas) fue anunciada pero necesitamos confirmar la URL de descarga. Opciones:
   - Portal argentina.gob.ar (muchas URLs rotas, verificar)
   - Solicitar vía email a archivosabiertos@mindef.gov.ar
   - Buscar mirrors o notas de prensa con links directos
2. **Verificar RUVTE:** Confirmar que el CSV de GitHub sigue actualizado
   - URL: https://github.com/datos-justicia-argentina/Registro-Unificado-Victimas-Terrorismo-Estado-RUVTE-
3. Crear `data_catalog.yaml` con URLs, formatos, estado legal
4. Crear `SOURCES.md`

**Archivos a crear:** `data_catalog.yaml`, `SOURCES.md`

---

## Fase 2: Pipeline de Adquisición y Procesamiento

**Objetivo:** Notebook `01_data_pipeline.ipynb` que descarga, procesa y chunkea SIDE + RUVTE.

### 2.1 Setup
```
pip install langchain sentence-transformers pandas tqdm requests
# No se necesita tesseract/poppler - OCR ya disponible via repo comunitario
```

### 2.2 SIDE (26 archivos, 987 páginas - OCR ya disponible!)
- **NO requiere OCR propio.** El repo https://github.com/Xyborg/side.com.ar tiene 987 JSONs con OCR de alta calidad
- Descargar los 987 JSONs de `data/ocr/page-XXXX.json` (formato: `{global_page, doc_id, text, confidence}`)
- Descargar metadata de documentos de `documents.json` (título, fecha, clasificación, tags, tópicos)
- Combinar OCR + metadata para enriquecer cada chunk
- Limpiar: normalizar whitespace, eliminar artefactos de escaneo
- Chunking: `RecursiveCharacterTextSplitter` 1000 chars, 200 overlap
- Metadata por chunk: source="SIDE", doc_id, page, date, title, classification, tags

### 2.3 RUVTE (datos estructurados, sin OCR)
- Descargar CSVs de GitHub
- Convertir cada registro a texto natural:
  ```
  Víctima: [nombre]. Edad: [edad] años.
  Fecha y lugar de detención/secuestro: [fecha_lugar].
  Tipificación: [tipificacion_ruvte].
  Provincia de nacimiento: [provincia].
  Fuente: Registro Unificado de Víctimas del Terrorismo de Estado (RUVTE).
  ```
- NO chunkear (cada víctima = 1 documento)
- Metadata: source="RUVTE", id_unico_ruvte, tipificacion, provincia

### 2.4 Output
- `chunks.jsonl` en Google Drive (~11,000 documentos)
- Formato: `{"text": "...", "metadata": {"source": "...", ...}}`

**Recursos Colab:** ~2 GB RAM, sin GPU necesaria (descarga de JSONs + CSVs, sin OCR)

---

## Fase 3: Embeddings & Upload a Cloudflare

**Objetivo:** Generar embeddings y subirlos a Cloudflare Vectorize + D1.

### Modelo de embeddings

Para producción (Cloudflare Workers AI):
- **`@cf/baai/bge-small-en-v1.5`**: 384 dims — elegido para el piloto (free tier)
- Upgrade futuro: `@cf/baai/bge-base-en-v1.5` (768d) o `@cf/baai/bge-m3` (1024d)

Para generar embeddings del corpus completo (batch, una sola vez):
- Correr en Colab con `sentence-transformers` y el mismo modelo
- **IMPORTANTE:** usar el mismo modelo en Colab y en Workers AI para consistencia

### Upload pipeline

```
Colab genera embeddings
    │
    ├── wrangler d1 execute → INSERT chunks en D1 (texto + metadata)
    │   Tabla: chunks (id, text, source, document_id, page, date, collection)
    │   Tabla: sources (id, name, description, url, license)
    │
    └── wrangler vectorize insert → Upload vectors NDJSON a Vectorize
        Formato: {"id": "chunk_123", "values": [0.1, 0.2, ...], "metadata": {"source": "SIDE"}}
        Batch: 1000 vectores por request
```

### Estimación de storage (piloto)

| Config | Vectores | Dims | Total dims | Cabe en free (5M)? |
|---|---|---|---|---|
| **bge-small (384d)** | ~11,000 | 384 | **4.2M** | SI |

**Recursos:** Colab CPU/GPU para embedding (~10-20 min), upload a CF ~5 min

---

## Fase 4: RAG Worker (Cloudflare)

**Objetivo:** Worker que implementa el pipeline RAG completo.

### Flujo del Worker

```javascript
// POST /api/chat
// 1. Recibir query del usuario
// 2. Preprocesar (expandir acrónimos: ESMA, CONADEP, CCD, SIDE, AAA)
// 3. Embed query con Workers AI (mismo modelo que el corpus)
// 4. Buscar top-5 en Vectorize (cosine similarity)
// 5. Recuperar texto + metadata de D1 usando los IDs
// 6. Construir prompt con contexto + system prompt
// 7. Generar respuesta con LLM (Workers AI o Gemini API)
// 8. Streaming response (SSE)
```

### LLM para generación

| Opción | Modelo | Costo | Notas |
|---|---|---|---|
| **Workers AI** | Llama 3.1 8B | 10K Neurons/día gratis | Corre en el edge, sin API key externa |
| **Gemini API** | Gemini 2.5 Flash | Gratis (API key del servidor) | Mejor calidad, requiere fetch() externo |

**Recomendación:** Empezar con Workers AI (Llama 3.1 8B) para mantener todo en Cloudflare. Si la calidad no es suficiente, agregar Gemini como upgrade.

### System Prompt
```
Sos un asistente de investigación histórica especializado en la dictadura
cívico-militar argentina (1976-1983). Tu rol es ayudar a ciudadanos argentinos
a acceder y comprender información de archivos desclasificados y registros oficiales.

REGLAS ESTRICTAS:
1. SOLO respondé basándote en los documentos proporcionados como contexto.
2. Si la información no está en los documentos, decilo explícitamente:
   "No encontré información sobre esto en los archivos consultados."
3. SIEMPRE citá las fuentes usando los números de referencia [1], [2], etc.
4. Nunca inventes, especules ni completes información que no esté en los documentos.
5. Tratá el tema con la seriedad y respeto que merece.
6. Si te preguntan algo fuera de tema, explicá que tu función es específica.
```

### Configuración Worker (`wrangler.toml`)
```toml
name = "history-arg-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[vectorize]]
binding = "VECTORIZE"
index_name = "argentina-dictadura-docs"

[[d1_databases]]
binding = "DB"
database_name = "history-arg"

[ai]
binding = "AI"
```

**Archivos a crear:** `worker/src/index.js`, `worker/src/rag.js`, `worker/src/prompts.js`, `worker/src/preprocessing.js`, `worker/wrangler.toml`, `worker/package.json`

---

## Fase 5A: Frontend Web (Astro + Tailwind → Cloudflare Pages)

**Objetivo:** Sitio web en dominio propio, mobile-first, todo en español.

### Tech: Astro + Tailwind CSS
- **Astro:** genera HTML estático por defecto (zero JS shipped), ideal para Pages
- **Tailwind CSS:** utility-first, desarrollo rápido, responsive out-of-the-box
- **Islands architecture:** solo el componente de chat carga JS (el resto es HTML puro)
- Mobile-first (muchos argentinos navegan desde celular)
- Todo en español rioplatense

### Setup
```bash
npm create astro@latest web -- --template minimal
cd web
npx astro add tailwind
npm install
```

### Estructura del proyecto Astro:
```
web/
├── astro.config.mjs          # adapter: cloudflare
├── tailwind.config.mjs
├── package.json
├── src/
│   ├── layouts/
│   │   └── Layout.astro      # Layout base (meta, nav, footer)
│   ├── pages/
│   │   ├── index.astro       # Página principal con chat
│   │   └── acerca.astro      # Acerca del proyecto
│   ├── components/
│   │   ├── Chat.astro        # Componente de chat (island con client:load)
│   │   ├── ChatMessage.astro # Mensaje individual con fuentes
│   │   ├── Examples.astro    # Queries de ejemplo clickeables
│   │   └── Sources.astro     # Panel colapsable de fuentes citadas
│   └── styles/
│       └── global.css        # @tailwind base/components/utilities
└── public/
    └── favicon.svg
```

### Páginas:
1. **index.astro** - Chat principal
   - Input de texto + botón enviar
   - Área de respuestas con streaming (SSE)
   - Ejemplos clickeables para guiar al usuario
   - Panel de fuentes citadas (colapsable por respuesta)
2. **acerca.astro** - Acerca del proyecto
   - Qué es, qué fuentes usa, limitaciones
   - Créditos y organizaciones
   - Link al repo para contribuir

### Ejemplos de consulta predefinidos:
- "Qué dicen los archivos desclasificados de la SIDE sobre la represión?"
- "Cuántas víctimas registra el RUVTE en la provincia de Buenos Aires?"
- "Qué tipo de documentos desclasificó la SIDE?"
- "Hay información sobre desaparecidos en Córdoba?"

### Consideraciones:
- **Sin autenticación:** acceso público
- **Rate limiting:** Cloudflare nativo, ~10-20 queries/min por IP
- **Caching:** Cache API para queries frecuentes
- **Accesibilidad:** semantic HTML, alto contraste, font legible
- **Performance:** Astro genera HTML estático, Tailwind se purga en build → bundle mínimo

### Deploy:
```bash
# Cloudflare Pages auto-deploy via Git integration
# O manual:
npm run build && npx wrangler pages deploy dist/
```

---

## Fase 5B: Notebook Colab (desarrollo)

**Objetivo:** `02_chatbot.ipynb` para desarrolladores y contribuyentes.

- Misma lógica RAG pero con ChromaDB local + Gradio
- Sirve para experimentar, testear prompts, evaluar calidad
- Instrucciones para obtener API key de Gemini (o usar modelo local)

---

## Fase 6: Testing & Validación

### Suite de tests (~30 queries):

**SIDE (documentos oficiales):**
- "Qué resoluciones desclasificó la SIDE?"
- "Qué dicen los memorandos sobre operaciones de inteligencia?"
- "Hay directivas sobre manejo de detenidos?"

**RUVTE (víctimas):**
- "Cuántas víctimas hay registradas en total?"
- "Cuántas víctimas embarazadas registra el RUVTE?"
- "Hay víctimas registradas en [provincia]?"

**Cross-reference:**
- "Los documentos de la SIDE mencionan operaciones en las provincias con más víctimas?"

**Adversariales:**
- "Quién ganó el Mundial 2022?" → rechazar off-topic
- "Los militares tenían razón?" → respuesta factual sin opinión
- "Inventame algo" → negarse a fabricar

### Métricas:
- Source hit rate, relevancia promedio, precisión factual
- Latencia end-to-end (query → respuesta completa)
- Funcionalidad en mobile

---

## Fase 7: Documentación & Distribución

### Estructura del repo:
```
History-ARG/
├── README.md                    # Español, link al sitio + badge Colab
├── SOURCES.md                   # Catálogo de fuentes
├── PLAN.md                      # Este documento
├── LICENSE                      # MIT
├── data_catalog.yaml
│
├── web/                         # Frontend (Astro + Tailwind → Cloudflare Pages)
│   ├── astro.config.mjs
│   ├── tailwind.config.mjs
│   ├── package.json
│   └── src/
│       ├── layouts/Layout.astro
│       ├── pages/index.astro, acerca.astro
│       ├── components/Chat.astro, Examples.astro, Sources.astro
│       └── styles/global.css
│
├── worker/                      # Backend (Cloudflare Worker)
│   ├── src/
│   │   ├── index.js
│   │   ├── rag.js
│   │   ├── prompts.js
│   │   └── preprocessing.js
│   ├── wrangler.toml
│   └── package.json
│
├── notebooks/
│   ├── 01_data_pipeline.ipynb
│   ├── 02_chatbot.ipynb
│   └── 03_evaluation.ipynb
│
├── scripts/
│   ├── upload_to_vectorize.py
│   ├── upload_to_d1.py
│   └── validate_sources.py
│
├── src/                         # Python (Colab)
│   ├── data_acquisition.py
│   ├── text_processing.py
│   ├── embeddings.py
│   ├── rag_pipeline.py
│   └── prompts.py
│
└── tests/
    └── test_queries.json
```

### Distribución:
1. **Sitio web público** con dominio propio (acceso principal)
2. Badge "Open in Colab" en README (desarrolladores)
3. Compartir con organizaciones: CELS, Abuelas, H.I.J.O.S., universidades

---

## Stack Tecnológico Final

### Producción (Web)

| Componente | Herramienta | Costo |
|---|---|---|
| Frontend | Astro + Tailwind → Cloudflare Pages | Gratis |
| Backend API | Cloudflare Workers | Free tier (10ms CPU, I/O excluido) |
| Embeddings (query) | Cloudflare Workers AI (bge-small, 384d) | Gratis (10K Neurons/día) |
| Vector store | Cloudflare Vectorize (4.2M/5M dims) | Gratis (free tier) |
| Metadata + texto | Cloudflare D1 (16MB/500MB) | Gratis (free tier) |
| LLM | Workers AI (Llama 3.1 8B) | Gratis (10K Neurons/día) |
| Dominio | .ar o .com | ~$10-15/año |
| **Total piloto** | | **$0/mes + dominio (~$10-15/año)** |

### Desarrollo (Colab)

| Componente | Herramienta |
|---|---|
| Embeddings | sentence-transformers (bge-small-en-v1.5) |
| Vector store | ChromaDB local |
| LLM | Gemini Flash / modelo local |
| OCR | Tesseract |
| UI | Gradio |

---

## Dependencias entre Fases

```
Fase 1 (Catálogo + localizar SIDE)
    │
    ▼
Fase 2 (Data Pipeline: OCR SIDE + RUVTE)
    │
    ▼
Fase 3 (Embeddings + Upload a Cloudflare)
    │
    ├──────────────────────┐
    ▼                      ▼
Fase 4 (RAG Worker)       Fase 5B (Colab)    ← en paralelo
    │
    ▼
Fase 5A (Frontend Web)
    │
    ▼
Fase 6 (Testing)
    │
    ▼
Fase 7 (Documentación)   ← puede empezar en F1
```

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Archivos SIDE no localizables online | Contactar archivosabiertos@mindef.gov.ar; buscar en Wayback Machine |
| OCR comunitario con errores | Comparar contra PDF oficial para docs clave; contribuir fixes al repo Xyborg |
| Workers AI calidad insuficiente (Llama 8B) | Switchear a Gemini Flash API (gratis, API key del servidor) |
| Abuso del servicio web | Rate limiting Cloudflare nativo; challenge si necesario |
| Free tier insuficiente para escalar | Plan paid $5/mes + upgrade a bge-base/m3 |

---

## Verificación End-to-End

### Web pública
1. `wrangler d1 execute` → verificar datos en D1
2. `wrangler vectorize insert` → verificar vectores en Vectorize
3. `wrangler deploy` → verificar Worker responde en `/api/chat`
4. Deploy Pages → verificar chat funciona en el dominio
5. Probar 10 queries → verificar citaciones correctas
6. Probar en mobile
7. **Probar con usuario no técnico** (test crítico)

### Colab
8. Ejecutar `01_data_pipeline.ipynb` → verificar chunks.jsonl
9. Ejecutar `02_chatbot.ipynb` en Colab free → verificar Gradio funciona
