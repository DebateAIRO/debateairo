"""Make the coordinator's own log records reach a stream.

Every structured hot-path event (``app.core.oplog.log_event``) and every
human-readable module log line in this process is emitted on a logger under
the ``app`` namespace, at INFO for events and WARNING for anomalies.

Nothing configured that namespace. uvicorn's default logging config attaches
handlers to the ``uvicorn``/``uvicorn.error``/``uvicorn.access`` loggers only,
so ``app.*`` records propagated to a root logger with no handler and fell
through to ``logging.lastResort``, whose level is WARNING. Result, verified on
production on 2026-07-26: two real adaptive-expansion dispatch passes ran and
produced ZERO ``expansion.*`` lines in either coordinator log -- while the
flip plan tells the operator to grep for exactly those events to attribute
behaviour to a flag. The whole FW2 observability wave was dark.

Deliberately NOT ``logging.basicConfig(level=logging.INFO)``: that sets the
ROOT level, which turns on INFO for every third-party library that propagates
to root -- sqlalchemy's engine statements and httpx's per-request lines would
then flood the very log the operator greps. This module touches exactly one
logger:

* level INFO (or ``DIALECTICAL_LOG_LEVEL``) on ``app``, so the whole
  ``app.*`` hierarchy inherits it and nothing else changes;
* one stderr handler on ``app``, so the records land in launchd's
  ``StandardErrorPath``;
* ``propagate = False`` on ``app``, so a root handler installed by anything
  else can never emit the same record a second time.

Idempotent: safe to call more than once (a re-entered lifespan, a test).
"""
from __future__ import annotations

import logging
import os
import sys
from typing import IO


APP_LOGGER_NAME = "app"
LOG_LEVEL_ENV = "DIALECTICAL_LOG_LEVEL"
DEFAULT_LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
# Marks the handler this module owns so a second call updates it instead of
# stacking a duplicate, and so a handler installed by someone else is left
# alone rather than silently adopted.
_OWNED_HANDLER_ATTR = "_dialectical_app_log_handler"


def _resolved_level(level: str | int | None) -> int:
    """Explicit argument first, then the env override, then INFO.

    An unparsable value falls back to INFO rather than raising: a typo in a
    launchd plist must not stop the coordinator from starting, and going
    quiet on a typo is the exact failure this module exists to fix.
    """

    raw = level if level is not None else os.getenv(LOG_LEVEL_ENV)
    if raw is None:
        raw = DEFAULT_LOG_LEVEL
    if isinstance(raw, int) and not isinstance(raw, bool):
        return raw
    resolved = logging.getLevelNamesMapping().get(str(raw).strip().upper())
    return resolved if isinstance(resolved, int) else logging.INFO


def configure_app_logging(
    *,
    stream: IO[str] | None = None,
    level: str | int | None = None,
) -> logging.Logger:
    """Configure the ``app`` logger namespace. Returns the configured logger."""

    logger = logging.getLogger(APP_LOGGER_NAME)
    logger.setLevel(_resolved_level(level))
    owned = [
        handler
        for handler in logger.handlers
        if getattr(handler, _OWNED_HANDLER_ATTR, False)
    ]
    for duplicate in owned[1:]:  # pragma: no cover - defensive
        logger.removeHandler(duplicate)
    if owned:
        handler = owned[0]
        if stream is not None:
            handler.setStream(stream)
    else:
        # Resolved at call time, not import time, so the handler writes to the
        # stderr the process actually has (launchd redirects fd 2 before the
        # interpreter starts; a test may substitute its own).
        handler = logging.StreamHandler(stream if stream is not None else sys.stderr)
        setattr(handler, _OWNED_HANDLER_ATTR, True)
        handler.setFormatter(logging.Formatter(LOG_FORMAT))
        logger.addHandler(handler)
    # The handler above is the ONLY emitter for app records. Without this,
    # anything that later installs a root handler (uvicorn --log-config, a
    # future basicConfig, a test harness) would double every operational line.
    logger.propagate = False
    return logger
