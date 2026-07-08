"""Deterministic evidence extraction seam over generation prose.

Phase 7 Task 1: no worker-side generation schema anywhere in this repo asks
the model for a distinct evidence/citation field today (confirmed: worker
schema is plain `pros`/`cons` strings). This module therefore scans a
completed claim node's `Generation.argument` prose for evidence-shaped spans
using the same honest, deterministic-regex philosophy as
`app.scoring.normalizer._extract_evidence_refs` (a bare URL regex) -- extended
to a small, explicit keyword/pattern vocabulary, never an LLM call.

Honesty laws (binding, see docs/superpowers/plans/2026-07-07-phase7-evidence-verification.md):
  - Evidence nodes persist ONLY verbatim substrings of real generation prose.
    Never fabricated, never rewritten, never summarized.
  - `evidenceKind` classification is a deterministic keyword/pattern
    classifier with an honest "unclassified" fallback -- never silently
    guessed as one of the known kinds.
  - Extraction is always-on (no feature flag) but strictly best-effort: a
    failure here must never fail node creation/generation persistence.
  - No verification status is assigned here. An extracted citation is NOT
    verified evidence -- that is Task 2's evaluator, gated separately.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.core.write_lock import flush_write
from app.models.entities import Debate, Generation, Node
from app.scoring.normalizer import _URL_PATTERN

# ---------------------------------------------------------------------------
# EVIDENCE_POSITION_OFFSET: reserved numeric namespace for EVIDENCE-node
# sibling positions and their materialized_path segment.
#
# Hermes ticket 1 (P7 evidence extraction position/path collision):
# materialize_pov_branch (dialectical_v2.py) calls
# extract_and_persist_evidence_for_completed_node() on a claim node BEFORE
# that same claim node's nested PRO/CON argument children are appended at
# small positions (0, 1, ...). Both used plain `enumerate()`-based indexing,
# so when the generated prose contained extractable evidence, an EVIDENCE
# node and a nested PRO/CON child could both land on sibling position=0
# with an identical materialized_path (e.g. both at ".../0"). That corrupts
# the tree's path/position invariants (duplicate siblings).
#
# Fix: EVIDENCE children never use small indexes at all. They are placed in
# a reserved, argument-children-can-never-reach numeric namespace starting
# at 1000 (position = 1000 + span_index; the SAME offset value is used for
# the materialized_path segment). This was chosen over a non-numeric segment
# (e.g. "e0") after auditing every reader of Node.position/materialized_path
# in this repo (orchestrator.py, scoring/service.py, scoring/qbaf_debug.py,
# services/serialization.py, argument_claim/node_adapter.py+model.py): all of
# them treat position as an opaque sort key and materialized_path as an
# opaque string for equality/prefix (`startswith`) checks -- nothing parses
# path segments as arithmetic indexes or assumes contiguous/small values.
# A numeric offset is therefore safe and keeps materialized_path fully
# numeric-segmented, matching the existing path shape everywhere else in the
# tree. Argument branching is config-driven (default 2, small integers) and
# nested PRO/CON stances are always position 0/1, so 1000 leaves an
# enormous, effectively permanent safety margin against ever colliding with
# real argument-child positions.
EVIDENCE_POSITION_OFFSET = 1000

# ---------------------------------------------------------------------------
# evidence_kind: pure, deterministic, no I/O.
#
# Checked in this order, first match wins. Word-boundary regexes throughout
# (P5a triage lesson: "law" must not match "lawn" -- substring matching is
# never honest here, only \b-bounded patterns with explicit plural handling
# where relevant).
# ---------------------------------------------------------------------------

_PERCENT_PATTERN = re.compile(r"\d+(\.\d+)?\s*%")

_STATISTICAL_KEYWORDS_PATTERN = re.compile(
    r"\b(stud(?:y|ies)|surveys?|data|samples?|percent|statistics?)\b",
    re.IGNORECASE,
)

_EMPIRICAL_MARKERS_PATTERN = re.compile(
    r"\b(stud(?:y|ies) found|research shows?|experiments?|observed|measured|trials?)\b",
    re.IGNORECASE,
)

_ANECDOTAL_MARKERS_PATTERN = re.compile(
    r"\b(in my experience|i(?:'|’)ve seen|anecdotally|one example is)\b",
    re.IGNORECASE,
)


def evidence_kind(text: str) -> str:
    """Classify a single extracted span's evidenceKind. Pure, deterministic,
    no I/O. First match wins; honest "unclassified" fallback if nothing
    matches (never silently guessed)."""
    if _URL_PATTERN.search(text):
        return "citation"

    has_percent = _PERCENT_PATTERN.search(text) is not None
    has_stat_keyword = _STATISTICAL_KEYWORDS_PATTERN.search(text) is not None
    if has_percent or has_stat_keyword:
        return "statistical"

    if _EMPIRICAL_MARKERS_PATTERN.search(text):
        return "empirical"

    if _ANECDOTAL_MARKERS_PATTERN.search(text):
        return "anecdotal"

    return "unclassified"


# ---------------------------------------------------------------------------
# extract_evidence_spans: pure, deterministic, no I/O.
#
# No existing sentence-splitter was found in normalizer.py (confirmed by
# reading the full file -- only claim-type/scope/evidence-ref regex helpers
# exist, no tokenizer). A simple `. `/`\n`-boundary splitter is used here,
# scoped to this module.
# ---------------------------------------------------------------------------

_SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+|\n+")


def _split_sentences(argument_text: str) -> list[str]:
    stripped = argument_text.strip()
    if not stripped:
        return []
    return [sentence.strip() for sentence in _SENTENCE_SPLIT_PATTERN.split(stripped) if sentence.strip()]


def extract_evidence_spans(argument_text: str) -> list[dict[str, str]]:
    """Split argument_text into sentences and keep only ones that classify
    to a non-"unclassified" evidenceKind. Returns verbatim substrings of the
    input text -- never rewritten/summarized/fabricated. Empty list is
    honest and expected for most arguments."""
    spans: list[dict[str, str]] = []
    for sentence in _split_sentences(argument_text):
        kind = evidence_kind(sentence)
        if kind == "unclassified":
            continue
        spans.append({"text": sentence, "evidenceKind": kind})
    return spans


# ---------------------------------------------------------------------------
# persist_evidence_nodes: DB-backed, best-effort by design at the call site
# (see dialectical_v2.py wiring) -- this function itself does not swallow
# exceptions; the caller wraps it in a best-effort try/except mirroring the
# protocol runner's pattern, so a failure here never fails node completion.
# ---------------------------------------------------------------------------


def persist_evidence_nodes(
    db: Session,
    debate: Debate,
    claim_node: Node,
    generation: Generation,
) -> list[Node]:
    """Persist each extracted evidence span as a child EVIDENCE Node with its
    own Generation row. Attribution (`model_id`/`worker_id`/`role`) is
    copied forward from the PARENT generation -- honest, since it correctly
    attributes "who produced this text" (the evidence span is a substring of
    the same generation event, not an independently generated artifact).
    """
    spans = extract_evidence_spans(generation.argument)
    evidence_nodes: list[Node] = []
    for span_index, span in enumerate(spans):
        position = EVIDENCE_POSITION_OFFSET + span_index
        evidence_node = Node(
            debate_id=debate.id,
            parent_id=claim_node.id,
            node_type="EVIDENCE",
            depth=claim_node.depth + 1,
            position=position,
            claim=span["text"],
            status="completed",
            path_status="active",
            materialized_path=f"{claim_node.materialized_path}/{position}",
            evidence_metadata={"evidenceKind": span["evidenceKind"]},
        )
        db.add(evidence_node)
        flush_write(db)

        evidence_generation = Generation(
            node_id=evidence_node.id,
            model_id=generation.model_id,
            role=generation.role,
            argument=span["text"],
            prompt_version=generation.prompt_version,
            worker_id=generation.worker_id,
            is_active=True,
        )
        db.add(evidence_generation)
        flush_write(db)

        evidence_node.active_generation_id = evidence_generation.id
        evidence_nodes.append(evidence_node)

    return evidence_nodes
