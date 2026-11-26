#!/usr/bin/env bash
# Start the RAG pipeline (FastAPI + Chroma) on :8000.
# Usage: ./start-rag.sh   (from the repo root)
set -euo pipefail
cd "$(dirname "$0")/rag_pipeline"

if [ -d .venv ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

# Central env (server/.env) is read automatically by llm_client.py;
# GROQ_API_KEY / GROQ_MODEL live there. Rebuild the index after dataset changes:
#   python index_fixes.py

# Bound to loopback: only the local Express server should reach this service.
# Override with RAG_HOST only when you also set RAG_SERVICE_TOKEN.
exec uvicorn api:app --host "${RAG_HOST:-127.0.0.1}" --port "${RAG_PORT:-8000}"
