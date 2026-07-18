from __future__ import annotations

import pytest

from app.qbaf.semantics_versions import (
    DEFAULT_SEMANTICS,
    SEMANTICS_V1,
    SEMANTICS_WEIGHTED_V1,
    resolve_semantics,
)


def test_semantics_registry_uses_distinct_stable_identifiers() -> None:
    assert SEMANTICS_V1 == "df-quad-v1"
    assert SEMANTICS_WEIGHTED_V1 == "df-quad-weighted-v1"
    assert DEFAULT_SEMANTICS == SEMANTICS_V1
    assert SEMANTICS_WEIGHTED_V1 != SEMANTICS_V1


def test_resolve_semantics_defaults_to_v1_and_raises_on_unknown() -> None:
    assert resolve_semantics(None) == SEMANTICS_V1
    assert resolve_semantics(SEMANTICS_V1) == SEMANTICS_V1
    assert resolve_semantics(SEMANTICS_WEIGHTED_V1) == SEMANTICS_WEIGHTED_V1

    with pytest.raises(ValueError, match="Unknown QBAF semantics"):
        resolve_semantics("df-quad-not-registered")
