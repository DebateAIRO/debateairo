from app.result_contracts import (
    failure_is_permanent,
    output_instruction,
    output_json_schema,
)


def test_long_horizon_provider_quota_is_permanent_for_failover() -> None:
    assert failure_is_permanent(
        "You've hit your weekly limit · resets Jul 29 at 9am (Europe/Bucharest)"
    )
    assert failure_is_permanent("Monthly usage limit reached")
    assert failure_is_permanent("Quota exceeded for this account")


def test_short_rate_limit_remains_retryable() -> None:
    assert not failure_is_permanent("429 rate limit; retry after 5 seconds")


def test_native_v2_pov_schema_requires_the_materialized_pro_chain() -> None:
    schema = output_json_schema("v2_pov")

    assert schema is not None
    assert schema["required"] == ["title", "content", "strongest_pro"]
    strongest_pro = schema["properties"]["strongest_pro"]
    assert strongest_pro["required"] == ["title", "content", "pro"]


def test_synthesis_instruction_matches_current_non_adjudicating_contract() -> None:
    instruction = output_instruction("v2_synthesize")

    assert '"title":"Synthesis"' in instruction
    assert '"tensions":["..."]' in instruction
    assert '"verdict"' not in instruction
