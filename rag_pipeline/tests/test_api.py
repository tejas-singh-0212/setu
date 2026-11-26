import api
import llm_client
from fastapi.testclient import TestClient
from llm_client import FixProposal, MappingSuggestion


client = TestClient(api.app)

REQUEST_BODY = {
    "change_id": "change-001",
    "provider": "demo-orders-api",
    "change_type": "field_renamed",
    "diff_summary": "customer_id is now named client_id.",
    "expected_schema": {
        "type": "object",
        "properties": {
            "customer_id": {"type": "string"}
        }
    },
    "observed_schema": {
        "type": "object",
        "properties": {
            "client_id": {"type": "string"}
        }
    }
}

HEADERS = {"X-User-Id": "demo-user-1"}
ENDPOINT = "/internal/v1/schema-fix-suggestions"

SAMPLE_FIX = {
    "id": "demo-fix-001",
    "distance": 0.1,
    "metadata": {},
    "document": "A historical customer_id to client_id rename.",
    "mapping": [
        {
            "source_path": "$.client_id",
            "target_path": "$.customer_id",
            "operation": "rename"
        }
    ]
}


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_suggestion_includes_retrieved_evidence(monkeypatch):
    received = {}

    def fake_retrieve_fixes(**kwargs):
        received.update(kwargs)
        return [SAMPLE_FIX]

    def fake_generate_fix_proposal(change, retrieved_fixes):
        return FixProposal(
            status="suggested",
            summary="The observed field matches the expected field.",
            mappings=[
                MappingSuggestion(
                    source_path="$.client_id",
                    target_path="$.customer_id",
                    operation="rename",
                    evidence_ids=["demo-fix-001"],
                    rationale="This matches the retrieved historical fix."
                )
            ]
        )

    monkeypatch.setattr(api, "retrieve_fixes", fake_retrieve_fixes)
    monkeypatch.setattr(
        api,
        "generate_fix_proposal",
        fake_generate_fix_proposal,
    )

    response = client.post(
        ENDPOINT,
        headers=HEADERS,
        json=REQUEST_BODY,
    )

    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "suggested"
    assert body["retrieved_fix_ids"] == ["demo-fix-001"]
    assert body["mappings"][0]["source_path"] == "$.client_id"
    assert body["mappings"][0]["target_path"] == "$.customer_id"
    assert body["mappings"][0]["evidence_ids"] == ["demo-fix-001"]
    assert body["requires_human_approval"] is True
    assert received["user_id"] == "demo-user-1"


def test_no_history_returns_without_calling_groq(monkeypatch):
    monkeypatch.setattr(
        api,
        "retrieve_fixes",
        lambda **kwargs: [],
    )

    def groq_must_not_be_called(*args, **kwargs):
        raise AssertionError("Groq should not be called when no fixes are found.")

    # The real proposal function returns early when retrieval finds no fixes.
    monkeypatch.setattr(llm_client, "Groq", groq_must_not_be_called)

    response = client.post(
        ENDPOINT,
        headers=HEADERS,
        json=REQUEST_BODY,
    )

    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "insufficient_evidence"
    assert body["generation_mode"] == "not_called"
    assert body["mappings"] == []
    assert body["retrieved_fix_ids"] == []


def test_model_can_abstain_when_evidence_is_not_relevant(monkeypatch):
    monkeypatch.setattr(
        api,
        "retrieve_fixes",
        lambda **kwargs: [SAMPLE_FIX],
    )

    def fake_generate_fix_proposal(change, retrieved_fixes):
        return FixProposal(
            status="insufficient_evidence",
            summary="The retrieved fix does not support this change.",
            mappings=[],
        )

    monkeypatch.setattr(
        api,
        "generate_fix_proposal",
        fake_generate_fix_proposal,
    )

    response = client.post(
        ENDPOINT,
        headers=HEADERS,
        json=REQUEST_BODY,
    )

    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "insufficient_evidence"
    assert body["mappings"] == []
    assert body["requires_human_approval"] is False


def test_model_error_returns_502(monkeypatch):
    monkeypatch.setattr(
        api,
        "retrieve_fixes",
        lambda **kwargs: [SAMPLE_FIX],
    )

    def fail_to_generate(*args, **kwargs):
        raise RuntimeError("Test model failure")

    monkeypatch.setattr(
        api,
        "generate_fix_proposal",
        fail_to_generate,
    )

    response = client.post(
        ENDPOINT,
        headers=HEADERS,
        json=REQUEST_BODY,
    )

    assert response.status_code == 502