from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from app.models.entities import Node


EVIDENCE_STATE_EXTRACTED = "extracted_source_unresolved"


def evidence_presence(nodes: Iterable[Node]) -> Literal["none", "extracted_unresolved"]:
    for node in nodes:
        if node.node_type == "EVIDENCE" and node.claim.strip():
            return "extracted_unresolved"
    return "none"
