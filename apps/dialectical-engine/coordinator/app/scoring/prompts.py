from __future__ import annotations

import json

from app.scoring.judges import ScoringProviderRequest
from app.scoring.models import ClaimAssessment


_VERIFIER_OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "verdict": {
            "type": "string",
            "enum": ["supported", "contradicted", "unverifiable"],
        },
        "evidence": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "status": {"const": "grounded"},
                "base_score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                "uncertainty": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                "entailment": {"const": "SUPPORTS"},
                "caveats": {"type": "array", "items": {"type": "string"}},
            },
            "required": [
                "status",
                "base_score",
                "uncertainty",
                "entailment",
                "caveats",
            ],
        },
    },
    "required": ["verdict"],
    "allOf": [
        {
            "if": {"properties": {"verdict": {"const": "supported"}}},
            "then": {"required": ["evidence"]},
            "else": {"not": {"required": ["evidence"]}},
        }
    ],
}


def render_single_node_judge_prompt(request: ScoringProviderRequest) -> list[dict[str, str]]:
    if request.judge_role == "verifier":
        system = (
            "You are an evidence verification judge. Return only valid JSON. "
            "Never invent evidence, citations, sources, or runtime facts. "
            "Compare only the provided claim, evidence text, and evidence references. "
            "Only return grounded evidence values when the verdict is supported; "
            "when supported, include every required evidence field; otherwise omit the evidence object."
        )
        user_payload = {
            "judge_role": request.judge_role,
            "prompt_version": request.prompt_version,
            "claim": request.claim.model_dump(mode="json"),
            "claim_argument_text": request.argument_text,
            "evidence_text": request.metadata.get("evidence_text"),
            "evidence_metadata": request.metadata,
            "instructions": {
                "output": "evidence verification verdict JSON only",
                "schema": _VERIFIER_OUTPUT_SCHEMA,
            },
        }
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload, sort_keys=True)},
        ]

    system = (
        "You are a debate scoring judge. Return only valid JSON. "
        "Never invent evidence, citations, sources, or runtime facts. "
        "Use only the provided node claim, generated argument text, and evidence references. "
        "If evidence is missing, say so in the JSON findings instead of filling gaps."
    )
    user_payload = {
        "judge_role": request.judge_role,
        "prompt_version": request.prompt_version,
        "claim": request.claim.model_dump(mode="json"),
        "argument_text": request.argument_text,
        "instructions": {
            "output": "structured judge assessment JSON only",
            "include": [
                "steelman",
                "critic",
                "evidence",
                "context",
                "fallacy",
            ],
            "schema": ClaimAssessment.model_json_schema(),
        },
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user_payload, sort_keys=True)},
    ]
