"""Generación de embeddings con sentence-transformers (bge-small-en-v1.5)."""

import json
import numpy as np
from pathlib import Path
from typing import List, Tuple

from sentence_transformers import SentenceTransformer
from tqdm import tqdm


# Mismo modelo disponible en Cloudflare Workers AI como @cf/baai/bge-small-en-v1.5
MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBEDDING_DIM = 384


def load_model() -> SentenceTransformer:
    """Carga el modelo de embeddings."""
    print(f"Cargando modelo {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    print(f"Modelo cargado. Dimensiones: {model.get_sentence_embedding_dimension()}")
    return model


def generate_embeddings(
    chunks: List[dict],
    model: SentenceTransformer,
    batch_size: int = 64,
    normalize: bool = True,
) -> np.ndarray:
    """Genera embeddings para una lista de chunks.

    Args:
        chunks: Lista de dicts con campo 'text'.
        model: Modelo sentence-transformers.
        batch_size: Tamaño de batch para encoding.
        normalize: Normalizar vectores (requerido para cosine similarity).

    Returns:
        np.ndarray de shape (n_chunks, embedding_dim).
    """
    texts = [c["text"] for c in chunks]
    print(f"Generando embeddings para {len(texts)} textos (batch_size={batch_size})...")

    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        normalize_embeddings=normalize,
    )

    print(f"Embeddings generados: shape={embeddings.shape}")
    return embeddings


def save_embeddings_ndjson(
    chunks: List[dict],
    embeddings: np.ndarray,
    output_path: str,
) -> None:
    """Guarda embeddings en formato NDJSON para Cloudflare Vectorize.

    Formato por línea: {"id": "chunk_0001", "values": [0.1, ...], "metadata": {"source": "SIDE"}}
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with open(out, "w", encoding="utf-8") as f:
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            record = {
                "id": f"chunk_{i:05d}",
                "values": embedding.tolist(),
                "metadata": {
                    "source": chunk["metadata"]["source"],
                    "doc_id": chunk["metadata"].get("doc_id", ""),
                },
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"Guardados {len(chunks)} vectores en {out}")


def save_d1_sql(
    chunks: List[dict],
    output_path: str,
) -> None:
    """Genera archivo SQL para insertar chunks en Cloudflare D1.

    Crea la tabla e inserta todos los chunks con su metadata.
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with open(out, "w", encoding="utf-8") as f:
        # Schema
        f.write("-- Schema para History-ARG\n")
        f.write("DROP TABLE IF EXISTS chunks;\n")
        f.write("DROP TABLE IF EXISTS sources;\n\n")

        f.write("""CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    url TEXT,
    license TEXT
);\n\n""")

        f.write("""CREATE TABLE chunks (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    source TEXT NOT NULL,
    doc_id TEXT,
    title TEXT,
    date TEXT,
    type TEXT,
    classification TEXT,
    tags TEXT,
    historical_period TEXT,
    chunk_index INTEGER,
    total_chunks INTEGER,
    language TEXT DEFAULT 'es',
    provincia TEXT
);\n\n""")

        # Sources
        f.write("INSERT INTO sources (id, name, description, url, license) VALUES\n")
        f.write("  ('SIDE', 'Archivos Desclasificados de la SIDE (1973-1983)', "
                "'26 documentos oficiales desclasificados', "
                "'https://www.argentina.gob.ar/inteligencia/archivos', "
                "'Dominio público'),\n")
        f.write("  ('RUVTE', 'Registro Unificado de Víctimas del Terrorismo de Estado', "
                "'Víctimas del accionar represivo ilegal 1966-1983', "
                "'https://datos.jus.gob.ar/dataset/registro-unificado-de-victimas-del-terrorismo-de-estado-ruvte', "
                "'CC BY 4.0');\n\n")

        # Chunks en batches de 50 (D1 tiene límite de 100KB por statement)
        batch_size = 50
        for batch_start in range(0, len(chunks), batch_size):
            batch = chunks[batch_start:batch_start + batch_size]
            f.write(f"-- Batch {batch_start // batch_size + 1}\n")
            f.write("INSERT INTO chunks (id, text, source, doc_id, title, date, type, "
                    "classification, tags, historical_period, chunk_index, total_chunks, "
                    "language, provincia) VALUES\n")

            values = []
            for i, chunk in enumerate(batch):
                idx = batch_start + i
                m = chunk["metadata"]
                text_escaped = chunk["text"].replace("'", "''")
                title_escaped = m.get("title", "").replace("'", "''")
                values.append(
                    f"  ('chunk_{idx:05d}', '{text_escaped}', '{m['source']}', "
                    f"'{m.get('doc_id', '')}', '{title_escaped}', '{m.get('date', '')}', "
                    f"'{m.get('type', '')}', '{m.get('classification', '')}', "
                    f"'{m.get('tags', '')}', '{m.get('historical_period', '')}', "
                    f"{m.get('chunk_index', 0)}, {m.get('total_chunks', 1)}, "
                    f"'{m.get('language', 'es')}', '{m.get('provincia', '')}')"
                )

            f.write(",\n".join(values) + ";\n\n")

        # Índices
        f.write("-- Índices para consultas frecuentes\n")
        f.write("CREATE INDEX idx_chunks_source ON chunks(source);\n")
        f.write("CREATE INDEX idx_chunks_doc_id ON chunks(doc_id);\n")

    print(f"Generado SQL con {len(chunks)} chunks en {out}")


def split_ndjson_for_upload(
    input_path: str,
    output_dir: str,
    max_per_file: int = 1000,
) -> List[str]:
    """Divide NDJSON en archivos más pequeños para upload batch a Vectorize.

    Vectorize acepta máx 1000 vectores por batch insert.

    Returns:
        Lista de paths de los archivos generados.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    lines = Path(input_path).read_text(encoding="utf-8").strip().split("\n")
    files = []

    for i in range(0, len(lines), max_per_file):
        batch = lines[i:i + max_per_file]
        batch_file = out / f"vectors_batch_{i // max_per_file:03d}.ndjson"
        batch_file.write_text("\n".join(batch) + "\n", encoding="utf-8")
        files.append(str(batch_file))

    print(f"Dividido en {len(files)} archivos de máx {max_per_file} vectores cada uno")
    return files
