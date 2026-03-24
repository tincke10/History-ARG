#!/usr/bin/env python3
"""Sube vectores a Cloudflare Vectorize y datos a D1.

Requisitos:
    - wrangler instalado y logueado (npm install -g wrangler && wrangler login)
    - Index Vectorize creado (./scripts/setup_cloudflare.sh)
    - Base D1 creada (./scripts/setup_cloudflare.sh)

Uso:
    python3 scripts/upload_to_cloudflare.py
    python3 scripts/upload_to_cloudflare.py --only-vectors
    python3 scripts/upload_to_cloudflare.py --only-d1
"""

import argparse
import subprocess
import sys
from pathlib import Path

VECTORIZE_INDEX = "argentina-dictadura-docs"
D1_DATABASE = "history-arg"

VECTORS_DIR = Path("data/processed/vectorize_batches")
D1_SQL = Path("data/processed/d1_schema.sql")


def upload_vectors():
    """Sube vectores a Cloudflare Vectorize en batches."""
    if not VECTORS_DIR.exists():
        print(f"ERROR: No se encontró {VECTORS_DIR}")
        print("Ejecutá primero el pipeline de embeddings.")
        sys.exit(1)

    batch_files = sorted(VECTORS_DIR.glob("*.ndjson"))
    if not batch_files:
        print(f"ERROR: No hay archivos .ndjson en {VECTORS_DIR}")
        sys.exit(1)

    print(f"=== Subiendo {len(batch_files)} batches a Vectorize ===")
    for i, batch_file in enumerate(batch_files):
        line_count = sum(1 for _ in open(batch_file))
        print(f"  Batch {i + 1}/{len(batch_files)}: {batch_file.name} ({line_count} vectores)")
        result = subprocess.run(
            ["wrangler", "vectorize", "insert", VECTORIZE_INDEX,
             "--file", str(batch_file)],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"  ERROR: {result.stderr}")
            sys.exit(1)
        print(f"  OK")

    print(f"\nVectores subidos exitosamente a '{VECTORIZE_INDEX}'")


def upload_d1():
    """Ejecuta el SQL en Cloudflare D1."""
    if not D1_SQL.exists():
        print(f"ERROR: No se encontró {D1_SQL}")
        print("Ejecutá primero el pipeline de embeddings.")
        sys.exit(1)

    print(f"=== Ejecutando SQL en D1 ({D1_SQL.stat().st_size / 1024:.0f} KB) ===")
    result = subprocess.run(
        ["wrangler", "d1", "execute", D1_DATABASE,
         "--file", str(D1_SQL)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"ERROR: {result.stderr}")
        sys.exit(1)

    print(f"Datos cargados en D1 '{D1_DATABASE}'")


def main():
    parser = argparse.ArgumentParser(description="Upload data to Cloudflare")
    parser.add_argument("--only-vectors", action="store_true",
                        help="Solo subir vectores a Vectorize")
    parser.add_argument("--only-d1", action="store_true",
                        help="Solo ejecutar SQL en D1")
    args = parser.parse_args()

    if args.only_vectors:
        upload_vectors()
    elif args.only_d1:
        upload_d1()
    else:
        upload_d1()
        print()
        upload_vectors()

    print("\n=== Upload completado ===")


if __name__ == "__main__":
    main()
