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
    # Fix wave 1 (I1): the two rails that used to share the copy above. All
    # three say "paused", not "stopped", for the reason the convergence /
    # wall-clock note below spells out -- a budget rail is a number an
    # operator can raise, so it does not claim to be final. Each names a
    # DIFFERENT limit, because "raise the round budget", "raise the debate
    # budget" and "look at one hot node" are three different responses.
    "rounds_exhausted": (
        "Automatic expansion paused after using all the growth rounds allowed for this debate."
    ),
    "node_budget_exhausted": (
        "Automatic expansion paused because the points it wanted to pursue had already "
        "been grown as many times as any single point may be."
    ),
    "deferred_no_capacity": (
        "Automatic expansion paused because no capable worker was available; "
        "it will resume when one is."
    ),
    "no_categorical_signals": (
        "Automatic expansion paused because nothing found so far meets the bar for automatic growth."
    ),
    "quiescent_no_decisions": "Automatic expansion has not found anything to grow yet.",
    # P1 Task 6: the frontier was ranked and nothing left on it cleared the
    # bar. Deliberately says "not worth the effort", not "not important" --
    # the floor compares a relative priority, it does not judge the claim.
    "below_priority_floor": (
        "Automatic expansion paused because the remaining points looked less "
        "worth pursuing than the work already done."
    ),
    # P1 Task 6: deliberately NOT the budget_exhausted copy above. This pass
    # filled its own wave; the debate's expansion budget is untouched and the
    # remaining points stay eligible on the next pass.
    "wave_full": (
        "Automatic expansion paused because it had already started as many "
        "lines of inquiry as it takes on at once; the rest remain in line."
    ),
    # P1 Task 7: the two whole-debate stop conditions. Both say STOPPED, not
    # "paused": unlike every code above them, neither clears on the next pass
    # -- a settled tree stays settled and elapsed time does not run backwards.
    # The convergence copy deliberately claims only that the conclusions stopped
    # MOVING, which is exactly what was measured (max strength drift under the
    # stability threshold, twice running); it does not claim the question is
    # settled or the answer is right.
    "converged": (
        "Automatic expansion stopped because the analysis had settled: further "
        "rounds were no longer changing the conclusions."
    ),
    "wall_clock": (
        "Automatic expansion stopped because this debate reached the time limit "
        "set for how long it may keep growing."
    ),
    # Fix wave 1 (I4): the depth guardrail. FW2 promoted this from defensive
    # to LIVE -- expansion_dispatch.STOPPED_DEPTH_LIMIT now derives a real
    # stopped_because from it, so this copy reaches completion.humanReason on
    # any pass whose every target sat at the rail (expected late in a
    # 12-round run against a depth-10 rail).
    #
    # Reworded for that promotion, to match its structural neighbour
    # node_budget_exhausted above -- the other PER-NODE rail:
    #   * PLURAL ("the points it wanted to pursue"), because a stop reason
    #     summarises a whole pass; the old singular "this line of argument"
    #     was written for the per-record outcome sense and understates it.
    #   * "paused", not "stopped", for the reason the budget rails give:
    #     DIALECTICAL_MAX_EXPANSION_DEPTH is a number an operator can raise,
    #     so this must not claim to be final the way converged / wall_clock
    #     legitimately do.
    # It still declines to say "for this debate": the rail is per-branch, and
    # a later pass on shallower nodes keeps growing.
    "depth_limit": (
        "Automatic expansion paused because the points it wanted to pursue had "
        "already reached the deepest level allowed."
    ),
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
