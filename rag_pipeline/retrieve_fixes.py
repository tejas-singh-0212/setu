import json
from typing import Any, Dict, List
from pathlib import Path

import chromadb
from chromadb.utils.embedding_functions import (
    SentenceTransformerEmbeddingFunction,
)


BASE_DIR = Path(__file__).resolve().parent
CHROMA_DIR = BASE_DIR / "chroma_db"

# Must match COLLECTION_NAME in index_fixes.py.
COLLECTION_NAME = "setu_approved_fixes"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def open_collection():
    """Open the local ChromaDB collection created by index_fixes.py."""
    embedding_function = SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    return client.get_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_function,
    )


def make_query_text(change: Dict[str, Any]) -> str:
    """Build searchable text from a detected schema change."""
    parts = [
        f"Provider: {change.get('provider', 'unknown')}",
        f"Change type: {change.get('change_type', 'unknown')}",
        f"Change summary: {change.get('diff_summary', '')}",
    ]

    for label, key in (
        ("Expected schema", "expected_schema"),
        ("Observed schema", "observed_schema"),
    ):
        if change.get(key) is not None:
            parts.append(
                f"{label}:\n"
                + json.dumps(change[key], sort_keys=True)
            )

    return "\n".join(parts)


def retrieve_fixes(
    collection,
    change: Dict[str, Any],
    user_id: str,
    top_k: int = 3,
) -> List[Dict[str, Any]]:
    """Retrieve eligible synthetic fixes belonging to this user."""
    if not isinstance(user_id, str) or not user_id.strip():
        raise ValueError("user_id is required")

    if top_k <= 0:
        return []

    collection_size = collection.count()
    if collection_size == 0:
        return []

    filters = [
        {"user_id": user_id.strip()},
        {"status": "approved"},
        {"outcome": "verified"},
        {"record_origin": "synthetic_generated"},
    ]

    # Restrict retrieval to the provider when one is supplied.
    provider = change.get("provider")
    if provider is not None and str(provider).strip():
        filters.append({"provider": str(provider).strip()})

    results = collection.query(
        query_texts=[make_query_text(change)],
        n_results=min(top_k, collection_size),
        where={"$and": filters},
        include=["documents", "metadatas", "distances"],
    )

    ids = results.get("ids", [[]])[0]
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    matches = []

    for index, record_id in enumerate(ids):
        metadata = metadatas[index] or {}

        try:
            mapping = json.loads(metadata.get("mapping_json", "[]"))
        except (TypeError, json.JSONDecodeError):
            mapping = []

        if not isinstance(mapping, list):
            mapping = []

        matches.append(
            {
                "id": record_id,
                "distance": float(distances[index]),
                "metadata": metadata,
                "document": documents[index],
                "mapping": mapping,
            }
        )

    return matches
