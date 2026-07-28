from app.result_contracts import failure_is_permanent


def test_long_horizon_provider_quota_is_permanent_for_failover() -> None:
    assert failure_is_permanent(
        "You've hit your weekly limit · resets Jul 29 at 9am (Europe/Bucharest)"
    )
    assert failure_is_permanent("Monthly usage limit reached")
    assert failure_is_permanent("Quota exceeded for this account")


def test_short_rate_limit_remains_retryable() -> None:
    assert not failure_is_permanent("429 rate limit; retry after 5 seconds")
