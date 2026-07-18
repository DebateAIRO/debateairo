"""Pure registry for QBAF semantics identifiers."""
from __future__ import annotations

SEMANTICS_V1 = "df-quad-v1"
SEMANTICS_WEIGHTED_V1 = "df-quad-weighted-v1"
SEMANTICS_V2_LENS_LIFT = "df-quad-v2-lens-lift"
DEFAULT_SEMANTICS = SEMANTICS_V1

_REGISTERED_SEMANTICS = frozenset(
    {SEMANTICS_V1, SEMANTICS_WEIGHTED_V1, SEMANTICS_V2_LENS_LIFT}
)


def resolve_semantics(value: str | None) -> str:
    """Resolve a stored/requested identifier, pinning a missing stamp to v1."""
    resolved = DEFAULT_SEMANTICS if value is None else value
    if resolved not in _REGISTERED_SEMANTICS:
        raise ValueError(f"Unknown QBAF semantics: {resolved!r}")
    return resolved
