"""FW2 telemetry must actually reach a stream.

Every structured hot-path event (`expansion.census`, `expansion.stop`,
`expansion.score_items`, `expansion.dispatch`, `synthesis.payload_shape`,
`synthesis.contested_rank`, `scoring.cache`, `scoring.run`) is emitted by
``app.core.oplog.log_event`` at INFO on a module logger under the ``app``
namespace.

Nothing configured that namespace. uvicorn's default logging config attaches
handlers to the ``uvicorn*`` loggers only, so ``app.*`` records propagated to
a root logger with no handler and fell back to ``logging.lastResort``, whose
level is WARNING -- every INFO line was dropped before it reached stderr.
Verified live on 2026-07-26: two real dispatch passes ran and produced zero
`expansion.*` lines in either coordinator log, while the flip plan instructs
the operator to grep for exactly those events.
"""
from __future__ import annotations

import io
import logging

import pytest

from app.core.log_config import APP_LOGGER_NAME, LOG_LEVEL_ENV, configure_app_logging
from app.core.oplog import log_event


@pytest.fixture
def restore_app_logger(monkeypatch):
    """Undo whatever the test does to the ``app`` logger."""

    monkeypatch.delenv(LOG_LEVEL_ENV, raising=False)
    logger = logging.getLogger(APP_LOGGER_NAME)
    saved = (list(logger.handlers), logger.level, logger.propagate)
    try:
        yield logger
    finally:
        logger.handlers = saved[0]
        logger.setLevel(saved[1])
        logger.propagate = saved[2]


def _reset(logger: logging.Logger) -> None:
    logger.handlers = []
    logger.setLevel(logging.NOTSET)
    logger.propagate = True


def test_app_logger_hierarchy_is_info_after_startup_configuration(restore_app_logger) -> None:
    _reset(restore_app_logger)
    assert logging.getLogger("app.exploration.expansion_dispatch").getEffectiveLevel() > logging.INFO

    configure_app_logging()

    # The whole hierarchy, not just the root of it: every hot-path module
    # logger inherits from `app`, and it is those loggers log_event is called
    # with.
    for name in (
        APP_LOGGER_NAME,
        "app.exploration.expansion_dispatch",
        "app.scoring.jobs",
        "app.scoring.service",
        "app.synthesis.branch_summary",
        "app.services.job_ledger",
    ):
        assert logging.getLogger(name).getEffectiveLevel() == logging.INFO, name


def test_structured_events_reach_the_stream_exactly_once(restore_app_logger) -> None:
    _reset(restore_app_logger)
    stream = io.StringIO()

    configure_app_logging(stream=stream)
    log_event(logging.getLogger("app.exploration.expansion_dispatch"), "expansion.census")

    # Exactly once: a second handler (ours plus an inherited root handler)
    # would double every operational line in the launchd err log.
    assert stream.getvalue().count('"event": "expansion.census"') == 1


def test_configuration_does_not_double_print_through_the_root_logger(restore_app_logger) -> None:
    _reset(restore_app_logger)
    ours = io.StringIO()
    root_stream = io.StringIO()
    root = logging.getLogger()
    root_handler = logging.StreamHandler(root_stream)
    root.addHandler(root_handler)
    try:
        configure_app_logging(stream=ours)
        log_event(logging.getLogger("app.scoring.jobs"), "scoring.run")
    finally:
        root.removeHandler(root_handler)

    assert ours.getvalue().count('"event": "scoring.run"') == 1
    # propagate=False, so a root handler installed by anything else (uvicorn
    # run with --log-config, a test harness, a future basicConfig) can never
    # emit our records a second time.
    assert root_stream.getvalue() == ""


def test_noisy_third_party_loggers_are_not_turned_up(restore_app_logger) -> None:
    _reset(restore_app_logger)

    configure_app_logging()

    # The failure mode this rules out is `logging.basicConfig(level=INFO)`,
    # which sets the ROOT level and would turn on INFO for every library that
    # propagates to it -- sqlalchemy's engine echo and httpx's per-request
    # lines would then flood the same log the operator greps for census
    # events.
    for name in ("sqlalchemy", "sqlalchemy.engine", "httpx", "httpcore", "urllib3"):
        assert logging.getLogger(name).getEffectiveLevel() > logging.INFO, name
    assert logging.getLogger().level != logging.INFO


def test_repeated_configuration_is_idempotent(restore_app_logger) -> None:
    _reset(restore_app_logger)
    stream = io.StringIO()

    configure_app_logging(stream=stream)
    configure_app_logging(stream=stream)
    log_event(logging.getLogger("app.scoring.jobs"), "scoring.cache")

    assert len(logging.getLogger(APP_LOGGER_NAME).handlers) == 1
    assert stream.getvalue().count('"event": "scoring.cache"') == 1


def test_level_is_operator_overridable_without_losing_the_handler(restore_app_logger) -> None:
    _reset(restore_app_logger)
    stream = io.StringIO()

    configure_app_logging(stream=stream, level="WARNING")
    logger = logging.getLogger("app.scoring.jobs")
    log_event(logger, "scoring.run")
    logger.warning("a real warning")

    assert '"event": "scoring.run"' not in stream.getvalue()
    assert "a real warning" in stream.getvalue()


def test_unparsable_level_falls_back_to_info(restore_app_logger) -> None:
    _reset(restore_app_logger)

    configure_app_logging(level="not-a-level")

    assert logging.getLogger(APP_LOGGER_NAME).getEffectiveLevel() == logging.INFO


def test_startup_path_configures_logging(restore_app_logger, monkeypatch) -> None:
    """The wiring, not just the helper: FW2 events were dark because nothing
    CALLED a configuration function, so a green unit test on the helper alone
    would have proved nothing."""

    _reset(restore_app_logger)
    import app.main as main

    monkeypatch.setattr(main, "init_db", lambda: None)
    monkeypatch.setattr(main, "SessionLocal", lambda: _NullSession())
    monkeypatch.setattr(main.settings, "apply_persisted_runtime_settings", lambda db: None)
    monkeypatch.setattr(main, "ensure_user_token", lambda db, token: None)

    main.run_startup_tasks()

    assert logging.getLogger("app.exploration.expansion_dispatch").getEffectiveLevel() == logging.INFO


class _NullSession:
    def __enter__(self) -> "_NullSession":
        return self

    def __exit__(self, *args: object) -> bool:
        return False
