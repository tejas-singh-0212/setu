import json
from pathlib import Path

import chromadb
from chromadb.utils.embedding_functions import (
    SentenceTransformerEmbeddingFunction,
)


BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "approved_synthetic_fixes.json"
CHROMA_DIR = BASE_DIR / "chroma_db"

# Keep this name consistent with retrieve_fixes.py.
COLLECTION_NAME = "setu_approved_fixes"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def build_document(record: dict) -> str:
    """Turn a synthetic fix into searchable text."""
    return "\n".join(
        [
            f"Record ID: {record['id']}",
            f"Provider: {record.get('provider', 'unknown')}",
            f"Change type: {record.get('change_type', 'unknown')}",
            f"Change summary: {record.get('diff_summary', '')}",
            "Expected schema:\n"
            + json.dumps(
                record.get("expected_schema", {}),
                indent=2,
                sort_keys=True,
            ),
            "Observed schema:\n"
            + json.dumps(
                record.get("observed_schema", {}),
                indent=2,
                sort_keys=True,
            ),
            "Mapping:\n"
            + json.dumps(
                record["mapping"],
                indent=2,
                sort_keys=True,
            ),
        ]
    )


def load_and_validate_records() -> list[dict]:
    """Load and validate the synthetic records file."""
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Could not find records file: {DATA_FILE}")

    try:
        with DATA_FILE.open("r", encoding="utf-8") as file:
            records = json.load(file)
    except json.JSONDecodeError as error:
        raise ValueError(
            f"{DATA_FILE.name} is not valid JSON: {error}"
        ) from error

    if not isinstance(records, list) or not records:
        raise ValueError(
            f"{DATA_FILE.name} must contain a non-empty JSON list."
        )

    seen_ids = set()

    for index, record in enumerate(records):
        if not isinstance(record, dict):
            raise ValueError(
                f"Record at position {index} must be a JSON object."
            )

        record_id = record.get("id")

        if not isinstance(record_id, str) or not record_id.strip():
            raise ValueError(
                f"Record at position {index} must have a non-empty string id."
            )

        if record_id in seen_ids:
            raise ValueError(f"Duplicate record ID found: {record_id}")
        seen_ids.add(record_id)

        if record.get("record_origin") != "synthetic_generated":
            raise ValueError(
                f"Record {record_id} must have "
                "record_origin='synthetic_generated'."
            )

        if record.get("status") != "approved":
            raise ValueError(
                f"Record {record_id} must have status='approved'."
            )

        if record.get("outcome") != "verified":
            raise ValueError(
                f"Record {record_id} must have outcome='verified'."
            )

        user_id = record.get("user_id")
        if not isinstance(user_id, str) or not user_id.strip():
            raise ValueError(
                f"Record {record_id} must have a non-empty string user_id."
            )

        for schema_name in ("expected_schema", "observed_schema"):
            if not isinstance(record.get(schema_name), dict):
                raise ValueError(
                    f"Record {record_id} must have {schema_name} as a JSON object."
                )

        mappings = record.get("mapping")
        if not isinstance(mappings, list) or not mappings:
            raise ValueError(
                f"Record {record_id} must have a non-empty mapping list."
            )

        for mapping_index, mapping in enumerate(mappings):
            if not isinstance(mapping, dict):
                raise ValueError(
                    f"Mapping {mapping_index} in record {record_id} "
                    "must be a JSON object."
                )

            for field in ("source_path", "target_path", "operation"):
                value = mapping.get(field)
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(
                        f"Mapping {mapping_index} in record {record_id} "
                        f"must have a non-empty string '{field}'."
                    )

    return records


def main() -> None:
    records = load_and_validate_records()

    embedding_function = SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_function,
        metadata={"hnsw:space": "cosine"},
    )

    # Adds new records or updates records with matching IDs.
    # This does not remove older records from ChromaDB.
    collection.upsert(
        ids=[record["id"] for record in records],
        documents=[build_document(record) for record in records],
        metadatas=[
            {
                "user_id": record["user_id"],
                "provider": str(record.get("provider", "unknown")),
                "change_type": str(record.get("change_type", "unknown")),
                "status": record["status"],
                "outcome": record["outcome"],
                "record_origin": record["record_origin"],
                "mapping_json": json.dumps(
                    record["mapping"],
                    separators=(",", ":"),
                ),
            }
            for record in records
        ],
    )

    print(f"Indexed {len(records)} synthetic fixes.")
    print(f"ChromaDB collection: {COLLECTION_NAME}")
    print(f"Local ChromaDB directory: {CHROMA_DIR}")
    print("These synthetic records are for local testing only.")


if __name__ == "__main__":
    main()