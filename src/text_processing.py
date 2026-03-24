"""Procesamiento de texto: limpieza, conversión RUVTE, chunking."""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
from langchain.text_splitter import RecursiveCharacterTextSplitter


def clean_ocr_text(text: str) -> str:
    """Limpia texto de OCR: normaliza whitespace y elimina artefactos."""
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"[^\S\n]+", " ", text)
    lines = text.split("\n")
    cleaned_lines = [line.strip() for line in lines]
    text = "\n".join(cleaned_lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_side_documents(
    ocr_pages: list[dict],
    documents_metadata: list[dict],
) -> List[dict]:
    """Agrupa páginas OCR por documento y enriquece con metadata.

    Args:
        ocr_pages: Lista de dicts OCR {global_page, doc_id, text, confidence}.
        documents_metadata: Lista de dicts de documents.json.

    Returns:
        Lista de dicts {doc_id, title, date, text, metadata}.
    """
    meta_by_id = {doc["id"]: doc for doc in documents_metadata}

    pages_by_doc: dict[str, list[dict]] = {}
    for page in ocr_pages:
        doc_id = page["doc_id"]
        if doc_id not in pages_by_doc:
            pages_by_doc[doc_id] = []
        pages_by_doc[doc_id].append(page)

    for pages in pages_by_doc.values():
        pages.sort(key=lambda p: p["global_page"])

    documents = []
    for doc_id, pages in sorted(pages_by_doc.items()):
        full_text = "\n\n".join(clean_ocr_text(p["text"]) for p in pages)
        meta = meta_by_id.get(doc_id, {})

        documents.append({
            "doc_id": doc_id,
            "title": meta.get("title", f"Documento {doc_id}"),
            "date": meta.get("date", ""),
            "type": meta.get("type", ""),
            "classification": meta.get("classification", ""),
            "description": meta.get("description", ""),
            "tags": meta.get("tags", []),
            "key_topics": meta.get("key_topics", []),
            "historical_period": meta.get("historical_period", ""),
            "page_count": len(pages),
            "text": full_text,
            "confidence_levels": [p.get("confidence", "unknown") for p in pages],
        })

    return documents


def chunk_side_documents(
    documents: list[dict],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> List[dict]:
    """Chunkea los documentos SIDE con metadata por chunk.

    Returns:
        Lista de dicts {text, metadata} listos para embedding.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
        length_function=len,
    )

    min_chunk_length = 50  # Ignorar chunks muy cortos (artefactos OCR)

    chunks = []
    for doc in documents:
        text_chunks = splitter.split_text(doc["text"])
        # Filtrar chunks demasiado cortos
        text_chunks = [t for t in text_chunks if len(t.strip()) >= min_chunk_length]
        for i, chunk_text in enumerate(text_chunks):
            chunks.append({
                "text": chunk_text,
                "metadata": {
                    "source": "SIDE",
                    "doc_id": doc["doc_id"],
                    "title": doc["title"],
                    "date": doc["date"],
                    "type": doc["type"],
                    "classification": doc["classification"],
                    "tags": ", ".join(doc["tags"]) if doc["tags"] else "",
                    "historical_period": doc["historical_period"],
                    "chunk_index": i,
                    "total_chunks": len(text_chunks),
                    "language": "es",
                },
            })

    return chunks


def ruvte_record_to_text(row: pd.Series, has_fuente: bool = False) -> str:
    """Convierte un registro RUVTE a texto natural para embedding."""
    parts = []

    nombre = row.get("apellido_paterno_nombres", "")
    if pd.notna(nombre) and nombre:
        parts.append(f"Víctima: {nombre.strip()}.")

    apellido_m = row.get("apellido_materno", "")
    if pd.notna(apellido_m) and apellido_m:
        parts.append(f"Apellido materno: {apellido_m.strip()}.")

    apellido_c = row.get("apellido_casada", "")
    if pd.notna(apellido_c) and apellido_c:
        parts.append(f"Apellido de casada: {apellido_c.strip()}.")

    tipif = row.get("tipificacion_ruvte", "")
    if pd.notna(tipif) and tipif:
        parts.append(f"Tipificación: {tipif.strip()}.")

    edad = row.get("edad_al_momento_del_hecho", "")
    if pd.notna(edad) and edad:
        parts.append(f"Edad al momento del hecho: {edad}.")

    nac = row.get("anio_nacimiento", "")
    if pd.notna(nac) and str(nac).strip():
        parts.append(f"Año de nacimiento: {nac}.")

    prov = row.get("provincia_pais_nacimiento", "")
    if pd.notna(prov) and prov:
        parts.append(f"Lugar de nacimiento: {prov.strip()}.")

    nacionalidad = row.get("nacionalidad", "")
    if pd.notna(nacionalidad) and nacionalidad:
        parts.append(f"Nacionalidad: {nacionalidad.strip()}.")

    embarazo = row.get("embarazo", "")
    if pd.notna(embarazo) and embarazo:
        parts.append(f"Embarazo: {embarazo.strip()}.")

    det = row.get("fecha_lugar_detencion_secuestro", "")
    if pd.notna(det) and det and det != "---":
        parts.append(f"Fecha y lugar de detención/secuestro: {det.strip()}.")

    ases = row.get("fecha_lugar_asesinato_o_hallazgo_de_restos", "")
    if pd.notna(ases) and ases and ases != "---":
        parts.append(f"Fecha y lugar de asesinato o hallazgo de restos: {ases.strip()}.")

    if has_fuente:
        fuente = row.get("fuente_original", "")
        if pd.notna(fuente) and fuente:
            parts.append(f"Fuente original: {fuente.strip()}.")

    parts.append(
        "Fuente: Registro Unificado de Víctimas del Terrorismo de Estado (RUVTE)."
    )

    return " ".join(parts)


def process_ruvte(
    df_con_denuncia: pd.DataFrame,
    df_sin_denuncia: pd.DataFrame,
) -> List[dict]:
    """Convierte los DataFrames RUVTE a chunks (1 registro = 1 chunk).

    Returns:
        Lista de dicts {text, metadata}.
    """
    chunks = []

    for _, row in df_con_denuncia.iterrows():
        text = ruvte_record_to_text(row, has_fuente=False)
        id_ruvte = row.get("id_unico_ruvte", "")
        tipif = row.get("tipificacion_ruvte", "")
        prov = row.get("provincia_pais_nacimiento", "")

        chunks.append({
            "text": text,
            "metadata": {
                "source": "RUVTE",
                "doc_id": str(id_ruvte),
                "title": f"Víctima: {row.get('apellido_paterno_nombres', '')}",
                "date": "",
                "type": str(tipif) if pd.notna(tipif) else "",
                "classification": "",
                "tags": "",
                "historical_period": "",
                "chunk_index": 0,
                "total_chunks": 1,
                "language": "es",
                "subset": "con_denuncia",
                "provincia": str(prov) if pd.notna(prov) else "",
            },
        })

    for _, row in df_sin_denuncia.iterrows():
        text = ruvte_record_to_text(row, has_fuente=True)
        id_ruvte = row.get("id_unico_ruvte", "")
        tipif = row.get("tipificacion_ruvte", "")
        prov = row.get("provincia_pais_nacimiento", "")

        chunks.append({
            "text": text,
            "metadata": {
                "source": "RUVTE",
                "doc_id": str(id_ruvte),
                "title": f"Víctima: {row.get('apellido_paterno_nombres', '')}",
                "date": "",
                "type": str(tipif) if pd.notna(tipif) else "",
                "classification": "",
                "tags": "",
                "historical_period": "",
                "chunk_index": 0,
                "total_chunks": 1,
                "language": "es",
                "subset": "sin_denuncia",
                "provincia": str(prov) if pd.notna(prov) else "",
            },
        })

    return chunks


def save_chunks(chunks: list[dict], output_path: str) -> None:
    """Guarda chunks como JSONL."""
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for chunk in chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    print(f"Guardados {len(chunks)} chunks en {out}")


def load_chunks(input_path: str) -> List[dict]:
    """Carga chunks desde JSONL."""
    chunks = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            chunks.append(json.loads(line))
    return chunks
