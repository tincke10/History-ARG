#!/bin/bash
# Setup de recursos Cloudflare para History-ARG
# Ejecutar una sola vez para crear el index de Vectorize y la base D1.
#
# Requisitos:
#   npm install -g wrangler
#   wrangler login
#
# Uso:
#   chmod +x scripts/setup_cloudflare.sh
#   ./scripts/setup_cloudflare.sh

set -e

echo "=== Creando index en Vectorize ==="
wrangler vectorize create argentina-dictadura-docs \
  --dimensions=384 \
  --metric=cosine \
  || echo "Index ya existe, continuando..."

echo ""
echo "=== Creando base D1 ==="
wrangler d1 create history-arg \
  || echo "Base ya existe, continuando..."

echo ""
echo "=== Recursos creados ==="
echo "Vectorize index: argentina-dictadura-docs (384d, cosine)"
echo "D1 database: history-arg"
echo ""
echo "Próximo paso:"
echo "  1. Ejecutar el schema SQL:"
echo "     wrangler d1 execute history-arg --file=data/processed/d1_schema.sql"
echo "  2. Subir vectores:"
echo "     python3 scripts/upload_to_cloudflare.py"
