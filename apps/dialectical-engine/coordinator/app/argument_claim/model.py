from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.qbaf.model import require_non_empty


@dataclass(frozen=True)
class ArgumentClaim:
    id: str
    debate_id: str
    parent_id: str | None
    node_type: str
    depth: int
    position: int
    text: str
    status: str
    materialized_path: str
    active_generation_id: str | None

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", require_non_empty(self.id, "id"))
        object.__setattr__(self, "debate_id", require_non_empty(self.debate_id, "debate_id"))
        object.__setattr__(self, "node_type", require_non_empty(self.node_type, "node_type"))
        object.__setattr__(self, "text", require_non_empty(self.text, "text"))
        object.__setattr__(self, "status", require_non_empty(self.status, "status"))
        object.__setattr__(self, "materialized_path", str(self.materialized_path))
        object.__setattr__(self, "depth", int(self.depth))
        object.__setattr__(self, "position", int(self.position))

    def to_node_payload(self, *, status: str | None = None) -> dict[str, Any]:
        resolved_status = status or self.status
        return {
            "id": self.id,
            "debate_id": self.debate_id,
            "parent_id": self.parent_id,
            "node_type": self.node_type,
            "depth": self.depth,
            "position": self.position,
            "claim": self.text,
            "status": resolved_status,
            "materialized_path": self.materialized_path,
            "active_generation_id": self.active_generation_id,
        }

    def to_domain_payload(self, *, status: str | None = None) -> dict[str, Any]:
        payload = self.to_node_payload(status=status)
        payload["text"] = payload.pop("claim")
        return payload
