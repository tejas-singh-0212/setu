import logging
from typing import Any, Dict, Literal, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from llm_client import MappingSuggestion, generate_fix_proposal
from retrieve_fixes import open_collection, retrieve_fixes


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Setu RAG Service")
collection = open_collection()


class SchemaChangeRequest(BaseModel):
    change_id: str = Field(min_length=1)
    provider: Optional[str] = None
    change_type: str
    diff_summary: str
    expected_schema: Dict[str, Any]
    observed_schema: Dict[str, Any]


class SuggestionResponse(BaseModel):
    change_id: str
    status: Literal["suggested", "insufficient_evidence"]
    generation_mode: Literal["qwen_via_groq", "not_called"]
    summary: str
    mappings: list[MappingSuggestion]
    retrieved_fix_ids: list[str]
    requires_human_approval: bool


@app.get("/health")
def health():
    return {
        "status": "ok",
        "indexed_fixes": collection.count(),
    }


@app.post(
    "/internal/v1/schema-fix-suggestions",
    response_model=SuggestionResponse,
)
def suggest_fix(
    request: SchemaChangeRequest,
    user_id: str = Header(..., alias="X-User-Id"),
):
    try:
        matches = retrieve_fixes(
            collection=collection,
            change=request.model_dump(),
            user_id=user_id,
            top_k=3,
        )
    except Exception as exc:
        logger.exception("Historical-fix retrieval failed.")
        raise HTTPException(
            status_code=503,
            detail="Could not retrieve historical fixes.",
        ) from exc

    retrieved_ids = [match["id"] for match in matches]

    try:
        proposal = generate_fix_proposal(
            change=request.model_dump(),
            retrieved_fixes=matches,
        )
    except Exception as exc:
        logger.exception("Qwen proposal generation or validation failed.")
        raise HTTPException(
            status_code=502,
            detail="Could not generate or validate a fix suggestion.",
        ) from exc

    return SuggestionResponse(
        change_id=request.change_id,
        status=proposal.status,
        generation_mode="qwen_via_groq" if matches else "not_called",
        summary=proposal.summary,
        mappings=proposal.mappings,
        retrieved_fix_ids=retrieved_ids,
        requires_human_approval=(proposal.status == "suggested"),
    )