"""Shared reason-code -> human-copy map (W5a: transparency serialization).

One source of truth for translating internal, machine-oriented reason codes
into plain-language copy that reaches the product surface (debate-level
``completion.humanReason``, per-node ``stopping_reason_human``, and any
future consumer). The codes come from vocabularies already documented in the
W1/W4 reports:

  - the terminal-failure engine's node-scoped code
    (``app.services.orchestrator.GENERATION_EXHAUSTED_STOPPING_REASON``) and
    its debate-scoped counterpart
    (``app.services.orchestrator.PUBLIC_DEBATE_FAILURE_CODE``) -- both
    duplicated here as literals for the same reason
    ``PROTOCOL_ANALYSIS_TYPE`` is duplicated in ``app.services.serialization``:
    importing ``app.services.orchestrator`` from this module would risk
    reintroducing the documented ``app.scoring -> app.services.orchestrator ->
    app.services.serialization`` circular-import cycle, and this module is
    deliberately kept a dependency-free leaf so it can be imported from
    ``serialization.py`` at module level without that risk;
  - the adaptive dispatcher's ``stopped_because`` vocabulary
    (``app.exploration.expansion_dispatch.STOPPED_*``);
  - the lifecycle-input resolver's component reason codes
    (``app.exploration.lifecycle_inputs`` -- ``f"{component}_stale"`` etc.),
    which are not reachable on any wire payload today (unauthenticated
    lifecycle outcomes are never persisted -- see
    ``scoring_completion_lifecycle.reevaluate_lifecycle_after_scoring_completion``)
    but are mapped defensively so a future write path never leaks a raw code.

Never fabricates specifics: an unrecognized bare code gets an honest generic
fallback, and anything that is not a bare lower_snake_case code (i.e.
already-human prose, such as ``ExplorationPolicy``'s authored stopping
reasons, which always contain spaces) passes through unchanged.
"""
from __future__ import annotations

import re

_REASON_CODE_RE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")

# Duplicated literals (see module docstring): keep in sync with
# app.services.orchestrator.GENERATION_EXHAUSTED_STOPPING_REASON and
# .PUBLIC_DEBATE_FAILURE_CODE, and with
# app.exploration.expansion_dispatch.STOPPED_* / OUTCOME_* string values.
REASON_CODE_HUMAN_COPY: dict[str, str] = {
    # Node-level terminal failure (a branch exhausted its retry budget) --
    # also the adaptive dispatcher's identical STOPPED_GENERATION_EXHAUSTED.
    "generation_exhausted": "Generation failed after repeated attempts, so this path was set aside.",
    # Debate-level terminal failure with no node-scoped detail available
    # (root generation / synthesis family; PUBLIC_DEBATE_FAILURE_CODE).
    "debate_generation_failed": "Debate generation failed and could not be completed.",
    # Adaptive expansion stopped_because vocabulary (W4).
    "budget_exhausted": "Automatic expansion paused after reaching its budget for this debate.",
    "deferred_no_capacity": (
        "Automatic expansion paused because no capable worker was available; "
        "it will resume when one is."
    ),
    "no_categorical_signals": (
        "Automatic expansion paused because nothing found so far meets the bar for automatic growth."
    ),
    "quiescent_no_decisions": "Automatic expansion has not found anything to grow yet.",
    # Lifecycle-input resolver component codes (defensive; not reachable on
    # any wire payload today -- see module docstring).
    "score_stale": "The score behind this step was too old to act on, so nothing changed.",
    "evidence_stale": "The evidence behind this step was too old to act on, so nothing changed.",
}

DEFAULT_REASON_HUMAN_COPY = "No further detail is available for this step."


def humanize_reason(code: str | None) -> str | None:
    """Map a raw reason code to plain-language copy, honestly.

    - ``None``/blank -> ``None`` (no fabrication for an absent reason).
    - A known bare code -> its mapped copy.
    - Text that is not a bare lower_snake_case code (contains whitespace,
      punctuation, or uppercase -- i.e. already-human prose such as
      ``ExplorationPolicy``'s authored ``stopping_reason`` text) -> passed
      through unchanged; it is already honest, human copy.
    - An unrecognized bare code -> the generic fallback (never a fabricated
      specific).
    """
    if not isinstance(code, str):
        return None
    text = code.strip()
    if not text:
        return None
    if text in REASON_CODE_HUMAN_COPY:
        return REASON_CODE_HUMAN_COPY[text]
    if _REASON_CODE_RE.fullmatch(text):
        return DEFAULT_REASON_HUMAN_COPY
    return text
