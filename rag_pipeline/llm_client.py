import json
import os
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel, ConfigDict, Field


load_dotenv(Path(__file__).resolve().with_name(".env"))


class MappingSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_path: str = Field(min_length=1)
    target_path: str = Field(min_length=1)
    operation: Literal[
        "rename",
        "path_remap",
        "parse_number_if_valid",
    ]
    evidence_ids: list[str] = Field(min_length=1)
    rationale: str = Field(min_length=1)


class FixProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["suggested", "insufficient_evidence"]
    summary: str = Field(min_length=1)
    mappings: list[MappingSuggestion]


def generate_fix_proposal(
    change: dict[str, Any],
    retrieved_fixes: list[dict[str, Any]],
) -> FixProposal:
    """Ask Groq's Qwen model to suggest a fix using retrieved examples."""

    if not retrieved_fixes:
        return FixProposal(
            status="insufficient_evidence",
            summary="No historical fixes were retrieved.",
            mappings=[],
        )

    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing from the .env file.")

    if not model:
        raise RuntimeError("GROQ_MODEL is missing from the .env file.")

    client = Groq(api_key=api_key)

    # Include only information needed by the model.
    change_for_model = {
        key: change[key]
        for key in (
            "change_id",
            "provider",
            "change_type",
            "diff_summary",
            "expected_schema",
            "observed_schema",
        )
        if key in change
    }

    examples_for_model = [
        {
            "id": fix["id"],
            "document": fix.get("document", ""),
            "mapping": fix.get("mapping", []),
        }
        for fix in retrieved_fixes
    ]

    prompt_data = {
        "new_schema_change": change_for_model,
        "retrieved_historical_fixes": examples_for_model,
    }

    system_prompt = """
You help developers review API JSON schema drift and propose data mappings.
Do not apply fixes or write code.

Mapping direction:
- source_path is a path in the observed schema.
- target_path is the corresponding path in the expected schema.

Use only these operations:
- rename
- path_remap
- parse_number_if_valid

Only suggest a mapping when the supplied schemas and retrieved examples
provide enough evidence. If they do not, return status
"insufficient_evidence" and an empty mappings array.

Every mapping must cite one or more exact retrieved example IDs in
evidence_ids. Do not invent evidence IDs. Return only a JSON object with
this shape:
{
  "status": "suggested" or "insufficient_evidence",
  "summary": "short explanation",
  "mappings": [
    {
      "source_path": "$.observed_field",
      "target_path": "$.expected_field",
      "operation": "rename",
      "evidence_ids": ["retrieved-fix-id"],
      "rationale": "short explanation"
    }
  ]
}
"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps(prompt_data, indent=2),
            },
        ],
        temperature=0,
        max_tokens=800,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("Groq returned an empty response.")

    # Parse and validate the model's JSON.
    proposal = FixProposal.model_validate_json(content)

    if proposal.status == "suggested" and not proposal.mappings:
        raise ValueError("A suggested proposal must contain a mapping.")

    if proposal.status == "insufficient_evidence" and proposal.mappings:
        raise ValueError(
            "An insufficient-evidence response must not contain mappings."
        )

    # Ensure the model cites only fixes actually retrieved for this request.
    retrieved_ids = {str(fix["id"]) for fix in retrieved_fixes}

    for mapping in proposal.mappings:
        unknown_ids = set(mapping.evidence_ids) - retrieved_ids
        if unknown_ids:
            raise ValueError(
                f"Model cited fixes that were not retrieved: "
                f"{sorted(unknown_ids)}"
            )

    return proposal