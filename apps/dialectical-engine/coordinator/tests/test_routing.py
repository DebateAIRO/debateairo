from __future__ import annotations

from app.services.routing import RoutingEngine


def test_round_robin_prefers_online_capabilities() -> None:
    engine = RoutingEngine(
        roles={
            "proposer": {
                "pool": ["a", "b", "c"],
                "strategy": "round_robin",
            }
        }
    )

    assert engine.choose("proposer", {"b", "c"}) == "b"
    assert engine.choose("proposer", {"b", "c"}) == "c"


def test_primary_fallback_exclusions() -> None:
    engine = RoutingEngine(
        roles={
            "synthesizer": {
                "primary": "a",
                "fallback": ["b"],
            }
        }
    )

    assert engine.choose("synthesizer", {"a", "b"}, exclude_models={"a"}) == "b"


def test_primary_fallback_reports_unavailable_when_no_configured_model_online() -> None:
    engine = RoutingEngine(
        roles={
            "synthesizer": {
                "primary": "a",
                "fallback": ["b"],
            }
        }
    )

    try:
        engine.choose("synthesizer", {"c"})
    except ValueError as exc:
        assert str(exc) == "No online models available for role synthesizer"
    else:
        raise AssertionError("routing should not select an offline configured model")


def test_pool_reports_unavailable_when_no_pool_model_online() -> None:
    engine = RoutingEngine(
        roles={
            "proposer": {
                "pool": ["a", "b"],
                "strategy": "round_robin",
            }
        }
    )

    try:
        engine.choose("proposer", {"c"})
    except ValueError as exc:
        assert str(exc) == "No online models available for role proposer"
    else:
        raise AssertionError("routing should not select an offline pool model")


def test_empty_online_capabilities_keep_configured_pending_target() -> None:
    engine = RoutingEngine(
        roles={
            "synthesizer": {
                "primary": "a",
                "fallback": ["b"],
            }
        }
    )

    assert engine.choose("synthesizer", set()) == "a"

