from __future__ import annotations

import json
from typing import Any


RESULT_CONTRACT_VERSION = "dialectical-result-v2"

JSON_JOB_TYPES = frozenset(
    {
        "decompose",
        "synthesize",
        "v2_skill_create",
        "v2_agent_create",
        "v2_agent_argument",
        "v2_plan",
        "v2_pov",
        "v2_expand",
        "v2_agent_run",
        "v2_synthesize",
        "v2_evidence",
    }
)


class StructuredOutputError(ValueError):
    """The provider returned content that cannot satisfy the assigned job."""


_PERMANENT_FAILURE_MARKERS = (
    "400 bad request",
    "401 unauthorized",
    "403 forbidden",
    "404 not found",
    "422 unprocessable",
    "authentication",
    "not logged in",
    "login required",
    "invalid model",
    "model not found",
    "unknown model",
    "prompt transport incompatibility",
    "argument list too long",
    "result contract",
    # Account-level caps with a long reset horizon cannot become healthy by
    # retrying this job seconds later. Mark the provider attempt permanent so
    # the coordinator advances its failover ladder immediately. Deliberately
    # exclude generic "rate limit"/429: those short throttles are transient.
    "weekly limit",
    "monthly limit",
    "usage limit",
    "quota exceeded",
    "insufficient credits",
    "credit balance",
)


def failure_is_permanent(error: BaseException | str) -> bool:
    if isinstance(error, StructuredOutputError):
        return True
    message = str(error).lower()
    return any(marker in message for marker in _PERMANENT_FAILURE_MARKERS)


def job_requires_json(job_type: str) -> bool:
    return job_type in JSON_JOB_TYPES


def output_instruction(job_type: str) -> str:
    if job_requires_json(job_type):
        shapes = {
            "v2_pov": (
                '{"title":"...","content":"...","strongest_pro":{"title":"...",'
                '"content":"...","pro":{"title":"...","content":"..."}}}'
            ),
            "v2_expand": '{"title":"...","content":"..."}',
            "v2_evidence": (
                '{"sources":[{"url":"https://...","quote":"...","publisher":"...",'
                '"date":"YYYY-MM-DD or null","retrieval_query":"...",'
                '"stance":"supports|refutes|mixed"}]}'
            ),
            "v2_synthesize": (
                '{"strongest_pro":"...","strongest_con":"...","verdict":"...",'
                '"confidence":0.0}'
            ),
        }
        shape = shapes.get(job_type)
        suffix = f" Required JSON shape: {shape}" if shape else ""
        return (
            "Output exactly one strict JSON object and no Markdown fences or "
            f"surrounding commentary.{suffix}"
        )
    return "Output only the argument text, with no Markdown fence and no commentary about this protocol."


def extract_json_object(text: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    raise StructuredOutputError("Model output did not contain a valid JSON object")


def parse_model_result(job: dict[str, Any], text: str) -> Any:
    if job_requires_json(str(job.get("job_type") or "")):
        return extract_json_object(text)
    return {"argument": text.strip()}


def enrich_v2_result(job: dict[str, Any], result: Any, worker_id: str | None) -> Any:
    if not isinstance(result, dict):
        return result
    job_type = str(job.get("job_type") or "")
    if not job_type.startswith("v2_"):
        return result
    enriched = dict(result)
    enriched["result_contract_version"] = RESULT_CONTRACT_VERSION
    job_id = str(job.get("id") or "")
    model_id = str(job.get("required_model") or "")
    worker = str(worker_id or "")
    if job_type in {"v2_skill_create", "v2_agent_create"}:
        enriched["provenance"] = {
            **(enriched.get("provenance") if isinstance(enriched.get("provenance"), dict) else {}),
            "created_by_model": model_id,
            "created_by_worker_id": worker,
            "creation_prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        }
    else:
        enriched["provenance"] = {
            **(enriched.get("provenance") if isinstance(enriched.get("provenance"), dict) else {}),
            "model_id": model_id,
            "worker_id": worker,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        }
    return enriched
