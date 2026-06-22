from __future__ import annotations

from app.scoring.models import NormalizedClaim


def normalize_claim(*, node_id: str, raw_text: str) -> NormalizedClaim:
    return NormalizedClaim(
        node_id=node_id,
        raw_text=raw_text,
        core_claim=raw_text.strip(),
        claim_type="unknown",
    )
