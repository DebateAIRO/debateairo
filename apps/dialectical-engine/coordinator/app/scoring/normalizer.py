from __future__ import annotations

import re

from app.scoring.models import NormalizedClaim


def normalize_claim(*, node_id: str, raw_text: str) -> NormalizedClaim:
    core_claim = raw_text.strip()
    return NormalizedClaim(
        node_id=node_id,
        raw_text=raw_text,
        core_claim=core_claim,
        claim_type=_claim_type(core_claim),
    )


def _claim_type(core_claim: str) -> str:
    text = core_claim.lower()
    padded = f" {text} "
    if re.search(r"\b(is|are|means|mean|refers to|refer to|defined as)\b", text) and re.search(
        r"\b(defined as|means?|refers? to)\b", text
    ):
        return "definitional"
    if re.search(r"\b(should|must|ought|need to|needs to|required to)\b", text):
        return "normative"
    comparative_pattern = r"\b(better|worse|higher|lower|more|less|greater|smaller)\b\s+\w*\s*\bthan\b"
    if re.search(comparative_pattern, text) or " than " in padded:
        return "comparative"
    if re.search(r"\b(will|would|likely to|expected to|forecast|predicts?|by \d{4})\b", text):
        return "prediction"
    if re.search(r"\b(causes?|because|leads? to|results? in|due to|drives?|prevents?)\b", text):
        return "causal"
    if re.search(r"\b(studies?|data|survey|trial|experiment|evidence|observed|measured|percent|%)\b", text):
        return "empirical"
    return "unknown"
