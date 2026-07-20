"""W5b structured operational logging for hot paths.

One JSON line per operational event (claim/complete/fail/requeue/terminalize,
scoring waker/run, expansion dispatch) so the loop is observable with plain
`grep` + `json.loads`. Deliberately tiny: this is NOT an app-wide logging
reformat -- callers keep their module loggers and existing human-readable
logs; they add exactly one structured line per hot-path event.

Content law: ids, types, outcomes, and durations only -- never LLM text
bodies, prompts, tokens, or any secret/PII-bearing value.
"""
from __future__ import annotations

import json
import logging
from typing import Any


def log_event(logger: logging.Logger, event: str, **fields: Any) -> None:
    """Emit one structured JSON log line. Best-effort: never raises.

    None-valued fields are dropped so absent context (e.g. a job with no
    node) reads as absent instead of `null` noise.
    """
    try:
        payload = {"event": event}
        payload.update((key, value) for key, value in fields.items() if value is not None)
        logger.info("%s", json.dumps(payload, default=str, sort_keys=True))
    except Exception:  # pragma: no cover - logging must never break the hot path
        logging.getLogger(__name__).debug("structured log emit failed for %s", event)
