"""
Measure client-observed latency for Groq LLM requests.

This script benchmarks the Groq API call directly using a fixed, synthetic
schema-drift and historical-fix example, replicating the model configuration,
prompt structure, and request format from llm_client.py.

Note on latency:
The measured latency captures client-observed round-trip request time using
time.perf_counter(). It includes client serialization overhead, network
transmission, TLS negotiation, API gateway queuing, and server-side processing;
it is not pure model-compute time.
"""

import argparse
import json
import os
from pathlib import Path
import statistics
import time
from typing import Any

from dotenv import load_dotenv
from groq import Groq


# Load configuration using the same pattern as llm_client.py
load_dotenv(Path(__file__).resolve().with_name(".env"))

# System prompt matching the prompt format in llm_client.py
SYSTEM_PROMPT = """
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
""".strip()

# Fixed, small, synthetic schema-drift example (no real user data)
SYNTHETIC_CHANGE: dict[str, Any] = {
    "change_id": "synthetic-drift-001",
    "provider": "synthetic_payment_provider",
    "change_type": "field_rename",
    "diff_summary": "Field customer_id was renamed to client_id in payload",
    "expected_schema": {
        "type": "object",
        "properties": {
            "customer_id": {"type": "string"},
            "amount": {"type": "number"},
        },
        "required": ["customer_id", "amount"],
    },
    "observed_schema": {
        "type": "object",
        "properties": {
            "client_id": {"type": "string"},
            "amount": {"type": "number"},
        },
        "required": ["client_id", "amount"],
    },
}

# Synthetic historical fix example
SYNTHETIC_HISTORICAL_FIXES: list[dict[str, Any]] = [
    {
        "id": "synthetic-fix-001",
        "document": "Synthetic payment gateway renamed customer_id to client_id in API v2.",
        "mapping": [
            {
                "source_path": "$.client_id",
                "target_path": "$.customer_id",
                "operation": "rename",
                "evidence_ids": ["synthetic-fix-001"],
                "rationale": "Map client_id to customer_id based on provider changelog.",
            }
        ],
    }
]


def build_messages() -> list[dict[str, str]]:
    """Construct prompt messages following the format in llm_client.py."""
    change_for_model = {
        key: SYNTHETIC_CHANGE[key]
        for key in (
            "change_id",
            "provider",
            "change_type",
            "diff_summary",
            "expected_schema",
            "observed_schema",
        )
        if key in SYNTHETIC_CHANGE
    }

    examples_for_model = [
        {
            "id": fix["id"],
            "document": fix.get("document", ""),
            "mapping": fix.get("mapping", []),
        }
        for fix in SYNTHETIC_HISTORICAL_FIXES
    ]

    prompt_data = {
        "new_schema_change": change_for_model,
        "retrieved_historical_fixes": examples_for_model,
    }

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(prompt_data, indent=2)},
    ]


def extract_provider_metadata(response: Any) -> str:
    """
    Extract provider timing and token usage information if present.
    Does not assume unavailable fields exist; only formats present fields.
    """
    usage = getattr(response, "usage", None)
    if usage is None:
        return ""

    if hasattr(usage, "model_dump"):
        usage_dict = usage.model_dump()
    elif isinstance(usage, dict):
        usage_dict = usage
    else:
        usage_dict = {
            k: getattr(usage, k)
            for k in dir(usage)
            if not k.startswith("_") and not callable(getattr(usage, k))
        }

    token_parts: list[str] = []
    # Standard token fields
    for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
        if k in usage_dict and usage_dict[k] is not None:
            token_parts.append(f"{k}={usage_dict[k]}")

    # Any other non-None token fields
    for k, v in usage_dict.items():
        if (
            k not in ("prompt_tokens", "completion_tokens", "total_tokens")
            and "token" in k
            and v is not None
        ):
            token_parts.append(f"{k}={v}")

    timing_parts: list[str] = []
    # Standard provider timing fields in Groq
    for k in ("queue_time", "prompt_time", "completion_time", "total_time"):
        if k in usage_dict and usage_dict[k] is not None:
            val = usage_dict[k]
            val_str = f"{val:.4f}s" if isinstance(val, (int, float)) else str(val)
            timing_parts.append(f"{k}={val_str}")

    # Any other timing fields
    for k, v in usage_dict.items():
        if (
            k not in ("queue_time", "prompt_time", "completion_time", "total_time")
            and "time" in k
            and v is not None
        ):
            val_str = f"{v:.4f}s" if isinstance(v, (int, float)) else str(v)
            timing_parts.append(f"{k}={val_str}")

    metadata_sections: list[str] = []
    if token_parts:
        metadata_sections.append(f"Tokens: {', '.join(token_parts)}")
    if timing_parts:
        metadata_sections.append(f"Provider Timing: {', '.join(timing_parts)}")

    if metadata_sections:
        return " | " + " | ".join(metadata_sections)
    return ""


def calculate_percentile_90(values: list[float]) -> float:
    """Calculate the 90th percentile using inclusive quantiles."""
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    return float(statistics.quantiles(values, n=10, method="inclusive")[8])


def sanitize_error(err: Exception, secret: str | None) -> str:
    """Ensure error messages do not reveal API keys or secrets."""
    msg = f"{type(err).__name__}: {err}"
    if secret and secret in msg:
        msg = msg.replace(secret, "[REDACTED]")
    return msg


def execute_request(
    client: Groq,
    model: str,
    messages: list[dict[str, str]],
) -> tuple[float, Any]:
    """
    Execute a single Groq chat completion request and measure its latency.

    Latency is measured with time.perf_counter() from immediately before
    sending the request until the full response is received.
    """
    t0 = time.perf_counter()
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0,
        max_tokens=800,
        response_format={"type": "json_object"},
    )
    t1 = time.perf_counter()
    latency_ms = (t1 - t0) * 1000.0
    return latency_ms, response


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Measure client-observed latency for Groq LLM requests."
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=5,
        help="Number of sequential measurement requests (default: 5)",
    )
    args = parser.parse_args()

    if args.runs < 1:
        parser.error("--runs must be at least 1")

    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing from the .env file.")
    if not model:
        raise RuntimeError("GROQ_MODEL is missing from the .env file.")

    client = Groq(api_key=api_key)
    messages = build_messages()

    print("==================================================")
    print("Groq LLM Latency Benchmark")
    print(f"Target Model: {model}")
    print(f"Configured Runs: {args.runs} (+ 1 warm-up)")
    print("==================================================")
    print("Note: Latencies reported below represent client-observed Groq request")
    print("time. This includes client serialization, local overhead, network round-trip")
    print("latency, TLS negotiation, API queuing, and remote server inference.")
    print("It is not pure model-compute time.")
    print("--------------------------------------------------")

    # --- Warm-up Request ---
    print("\n--- Warm-up Request ---")
    try:
        warmup_latency_ms, warmup_resp = execute_request(client, model, messages)
        meta = extract_provider_metadata(warmup_resp)
        print(f"Warm-up: {warmup_latency_ms:.2f} ms (client-observed){meta}")
    except Exception as exc:
        print(f"Warm-up: FAILED ({sanitize_error(exc, api_key)})")
    print("(Warm-up request time is reported separately and excluded from summary statistics)")

    # --- Measurement Requests ---
    print(f"\n--- Sequential Measurement Requests (N={args.runs}) ---")
    latencies: list[float] = []
    successful_runs = 0
    failed_runs = 0

    for i in range(1, args.runs + 1):
        try:
            latency_ms, resp = execute_request(client, model, messages)
            latencies.append(latency_ms)
            successful_runs += 1
            meta = extract_provider_metadata(resp)
            print(f"Run {i}/{args.runs}: {latency_ms:.2f} ms (client-observed){meta}")
        except Exception as exc:
            failed_runs += 1
            print(f"Run {i}/{args.runs}: FAILED ({sanitize_error(exc, api_key)})")

    # --- Summary ---
    print("\n==================================================")
    print("Benchmark Summary")
    print("==================================================")
    print(f"Model:                {model}")
    print(f"Successful Requests:  {successful_runs}/{args.runs}")
    print(f"Failed Requests:      {failed_runs}/{args.runs}")

    if latencies:
        min_lat = min(latencies)
        mean_lat = statistics.mean(latencies)
        median_lat = statistics.median(latencies)
        p90_lat = calculate_percentile_90(latencies)
        max_lat = max(latencies)

        print("\nLatency Statistics (Client-Observed Groq Request Time):")
        print(f"  Minimum:            {min_lat:.2f} ms")
        print(f"  Mean:               {mean_lat:.2f} ms")
        print(f"  Median:             {median_lat:.2f} ms")
        print(f"  90th Percentile:    {p90_lat:.2f} ms")
        print(f"  Maximum:            {max_lat:.2f} ms")
    else:
        print("\nLatency Statistics: None available (all measurement requests failed).")

    print("\nNote: Latency values reflect end-to-end client-observed elapsed time,")
    print("including network and API overhead, not pure model-compute time.")
    print("==================================================")


if __name__ == "__main__":
    main()
