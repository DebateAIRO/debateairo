from __future__ import annotations

import json

from app.scoring.judges import ScoringProviderRequest
from app.scoring.models import ClaimAssessment


def render_single_node_judge_prompt(request: ScoringProviderRequest) -> list[dict[str, str]]:
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
