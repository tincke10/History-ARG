"""Descarga de datos: SIDE OCR JSONs + metadata, RUVTE CSVs."""

import json
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple

import pandas as pd
import requests
from tqdm import tqdm

# URLs de las fuentes
SIDE_OCR_BASE = "https://raw.githubusercontent.com/Xyborg/side.com.ar/refs/heads/main/data/ocr"
SIDE_DOCUMENTS_URL = "https://side.com.ar/data/documents.json?v=4"
SIDE_CARPETAS_URL = "https://side.com.ar/data/carpetas.json?v=4"
SIDE_TOTAL_PAGES = 987

RUVTE_URLS = {
    "con_denuncia": (
        "https://datos.jus.gob.ar/dataset/d43fa140-f43f-4cc2-8491-b1d8bb899de4"
        "/resource/c6b674bc-e178-41f3-81f5-0f10038e1688/download"
        "/victimas-accionar-represivo-ilegal.csv"
    ),
    "sin_denuncia": (
        "https://datos.jus.gob.ar/dataset/d43fa140-f43f-4cc2-8491-b1d8bb899de4"
        "/resource/4c66093d-1293-4c44-a4c4-4cc1d914127e/download"
        "/victimas-accionar-represivo-ilegal-sin-denuncia-formal.csv"
    ),
}


def _fetch_page(page_num: int, output_dir: Path) -> Optional[dict]:
    """Descarga un JSON de OCR individual."""
    filename = f"page-{page_num:04d}.json"
    filepath = output_dir / filename
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    url = f"{SIDE_OCR_BASE}/{filename}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def download_side_ocr(output_dir: str, max_workers: int = 10) -> List[dict]:
    """Descarga los 987 JSONs de OCR del repo Xyborg/side.com.ar.

    Args:
        output_dir: Directorio donde guardar los JSONs.
        max_workers: Hilos concurrentes para descarga.

    Returns:
        Lista de dicts con {global_page, doc_id, text, confidence}.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    pages = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_fetch_page, i, out): i
            for i in range(1, SIDE_TOTAL_PAGES + 1)
        }
        for future in tqdm(
            as_completed(futures), total=SIDE_TOTAL_PAGES, desc="Descargando OCR SIDE"
        ):
            result = future.result()
            if result:
                pages.append(result)

    pages.sort(key=lambda p: p["global_page"])
    return pages


def download_side_metadata(output_dir: str) -> Tuple[List[dict], List[dict]]:
    """Descarga metadata de documentos y carpetas.

    Returns:
        (documents, carpetas) - listas de dicts.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    docs_path = out / "documents.json"
    if not docs_path.exists():
        resp = requests.get(SIDE_DOCUMENTS_URL, timeout=30)
        resp.raise_for_status()
        with open(docs_path, "w", encoding="utf-8") as f:
            json.dump(resp.json(), f, ensure_ascii=False, indent=2)
    with open(docs_path, "r", encoding="utf-8") as f:
        documents = json.load(f)

    carpetas_path = out / "carpetas.json"
    if not carpetas_path.exists():
        resp = requests.get(SIDE_CARPETAS_URL, timeout=30)
        resp.raise_for_status()
        with open(carpetas_path, "w", encoding="utf-8") as f:
            json.dump(resp.json(), f, ensure_ascii=False, indent=2)
    with open(carpetas_path, "r", encoding="utf-8") as f:
        carpetas = json.load(f)

    return documents, carpetas


def download_ruvte(output_dir: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Descarga los 2 CSVs del RUVTE.

    Returns:
        (df_con_denuncia, df_sin_denuncia)
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    dfs = {}
    for key, url in RUVTE_URLS.items():
        filepath = out / f"ruvte_{key}.csv"
        if not filepath.exists():
            print(f"Descargando RUVTE ({key})...")
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            with open(filepath, "wb") as f:
                f.write(resp.content)

        dfs[key] = pd.read_csv(filepath, encoding="utf-8-sig")
        print(f"  RUVTE {key}: {len(dfs[key])} registros")

    return dfs["con_denuncia"], dfs["sin_denuncia"]
