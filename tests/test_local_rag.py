#!/usr/bin/env python3
"""Test local del pipeline RAG sin Cloudflare.

Simula el retrieval usando cosine similarity sobre los embeddings
generados en la Fase 3. No requiere conexión a Cloudflare.

Uso:
    python3 tests/test_local_rag.py
    python3 tests/test_local_rag.py --query "Cómo estaba organizada la SIDE?"
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

CHUNKS_PATH = ROOT / "data" / "processed" / "chunks.jsonl"
VECTORS_PATH = ROOT / "data" / "processed" / "vectors.ndjson"
TEST_QUERIES_PATH = ROOT / "tests" / "test_queries.json"
MODEL_NAME = "BAAI/bge-small-en-v1.5"
TOP_K = 5


def load_data():
    """Carga chunks y embeddings."""
    print("Cargando chunks...")
    chunks = []
    with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            chunks.append(json.loads(line))

    print("Cargando embeddings...")
    embeddings = []
    with open(VECTORS_PATH, "r", encoding="utf-8") as f:
        for line in f:
            record = json.loads(line)
            embeddings.append(record["values"])
    embeddings = np.array(embeddings, dtype=np.float32)

    print(f"  {len(chunks)} chunks, embeddings shape: {embeddings.shape}")
    return chunks, embeddings


def search(query_text, model, embeddings, chunks, top_k=TOP_K):
    """Busca los chunks más relevantes para una query."""
    query_vec = model.encode([query_text], normalize_embeddings=True)
    scores = np.dot(embeddings, query_vec.T).flatten()
    top_indices = np.argsort(scores)[::-1][:top_k]

    results = []
    for idx in top_indices:
        results.append({
            "rank": len(results) + 1,
            "score": float(scores[idx]),
            "source": chunks[idx]["metadata"]["source"],
            "doc_id": chunks[idx]["metadata"].get("doc_id", ""),
            "title": chunks[idx]["metadata"].get("title", ""),
            "text_preview": chunks[idx]["text"][:200],
            "text_full": chunks[idx]["text"],
        })
    return results


def run_single_query(query, model, embeddings, chunks):
    """Ejecuta una query y muestra resultados."""
    print(f"\n{'='*60}")
    print(f"QUERY: {query}")
    print(f"{'='*60}")

    results = search(query, model, embeddings, chunks)

    for r in results:
        print(f"\n  [{r['rank']}] {r['source']} - {r['title'][:50]}")
        print(f"      Score: {r['score']:.4f}")
        print(f"      Doc: {r['doc_id']}")
        print(f"      Texto: {r['text_preview']}...")

    return results


def run_test_suite(model, embeddings, chunks):
    """Ejecuta la suite completa de tests."""
    with open(TEST_QUERIES_PATH, "r", encoding="utf-8") as f:
        test_data = json.load(f)

    tests = test_data["test_queries"]
    results_summary = {
        "total": 0,
        "source_hit": 0,
        "keyword_hit": 0,
        "avg_top1_score": [],
        "details": [],
    }

    for test in tests:
        if test["category"] == "adversarial":
            continue  # Adversarial tests requieren LLM

        query = test["query"]
        results = search(query, model, embeddings, chunks)
        top1 = results[0] if results else None
        results_summary["total"] += 1

        # Check source hit
        expected_source = test.get("expected_source", "")
        sources_found = [r["source"] for r in results]
        source_hit = expected_source in sources_found
        if source_hit:
            results_summary["source_hit"] += 1

        # Check keyword hit
        expected_keywords = test.get("expected_keywords", [])
        all_text = " ".join(r["text_full"] for r in results)
        keyword_hits = sum(1 for kw in expected_keywords if kw.lower() in all_text.lower())
        keyword_hit = keyword_hits > 0 if expected_keywords else True
        if keyword_hit:
            results_summary["keyword_hit"] += 1

        if top1:
            results_summary["avg_top1_score"].append(top1["score"])

        status = "PASS" if (source_hit and keyword_hit) else "FAIL"
        results_summary["details"].append({
            "id": test["id"],
            "query": query[:50],
            "status": status,
            "top1_source": top1["source"] if top1 else "N/A",
            "top1_score": f"{top1['score']:.4f}" if top1 else "N/A",
            "source_hit": source_hit,
            "keyword_hit": keyword_hit,
        })

        print(f"  [{status}] {test['id']}: {query[:50]}... "
              f"(top1: {top1['source'] if top1 else 'N/A'} @ {top1['score']:.3f})" if top1 else "")

    # Resumen
    total = results_summary["total"]
    print(f"\n{'='*60}")
    print(f"RESUMEN DE TESTS")
    print(f"{'='*60}")
    print(f"  Total queries: {total}")
    print(f"  Source hit rate: {results_summary['source_hit']}/{total} "
          f"({results_summary['source_hit']/total*100:.0f}%)")
    print(f"  Keyword hit rate: {results_summary['keyword_hit']}/{total} "
          f"({results_summary['keyword_hit']/total*100:.0f}%)")
    if results_summary["avg_top1_score"]:
        avg = sum(results_summary["avg_top1_score"]) / len(results_summary["avg_top1_score"])
        print(f"  Avg top-1 score: {avg:.4f}")

    print(f"\nDetalles:")
    for d in results_summary["details"]:
        print(f"  [{d['status']}] {d['id']}: top1={d['top1_source']} @ {d['top1_score']}")

    return results_summary


def main():
    parser = argparse.ArgumentParser(description="Test local del RAG")
    parser.add_argument("--query", type=str, help="Query individual")
    parser.add_argument("--suite", action="store_true", help="Ejecutar test suite completa")
    args = parser.parse_args()

    if not args.query and not args.suite:
        args.suite = True

    print("Cargando modelo...")
    model = SentenceTransformer(MODEL_NAME)
    chunks, embeddings = load_data()

    if args.query:
        run_single_query(args.query, model, embeddings, chunks)
    if args.suite:
        run_test_suite(model, embeddings, chunks)


if __name__ == "__main__":
    main()
