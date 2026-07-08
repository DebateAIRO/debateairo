"""Deterministic, rule-based triage for the epistemic protocol's Phase 5.1.

No LLM/provider calls. No network calls. Reuses the same deterministic claim
classification already used for claim normalization (P2) so triage stays
consistent with how the rest of the system reasons about claim types.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from app.scoring.normalizer import classify_claim_type

CLASSIFIER_VERSION = "triage-v1"

Difficulty = Literal["simple", "contested", "high_stakes"]

_CONTESTED_CLAIM_TYPES = {"normative", "causal", "prediction", "mixed"}

_DEPTH_BUDGET_BY_DIFFICULTY: dict[Difficulty, int] = {
    "simple": 1,
    "contested": 2,
    "high_stakes": 3,
}

# Stakes keywords: written out fully, deliberately conservative — these push a
# claim to "high_stakes" (and force verification_required=True) regardless of
# its rhetorical claim type, because the real-world cost of being wrong is
# what matters here, not the claim's grammatical shape.
_STAKES_KEYWORDS: tuple[str, ...] = (
    # health
    "health", "medical", "medicine", "drug", "vaccine", "disease", "surgery",
    "patient", "clinical", "treatment", "diagnosis", "diagnoses", "mental health",
    # legal
    "legal", "law", "lawsuit", "court", "contract", "liability", "regulation",
    "compliance", "crime", "criminal", "constitutional",
    # financial
    "financial", "investment", "tax", "interest rate", "bank", "loan",
    "pension", "retirement", "bankruptcy", "insurance", "market crash",
    # safety
    "safety", "hazard", "accident", "injury", "fatal", "risk of death",
    "structural", "inspection", "emergency",
    # policy
    "policy", "legislation", "government", "regulation", "public health",
    "national security", "immigration", "election",
)

# Word-boundary alternation over _STAKES_KEYWORDS, compiled once. Bare
# substring matching (`keyword in topic_lower`) let ordinary vocabulary
# silently escalate to high_stakes purely by containing a keyword as a
# substring: law->lawn/flawless, tax->syntax, bank->riverbank,
# patient->impatient, contract->contractor, court->courteous,
# drug->drugstore. The trailing `(?:e?s)?` preserves the substring version's
# plural matches (e.g. "interest rate" still firing on "interest rates",
# "law" firing on "laws") without reintroducing bare substring matching, and
# additionally covers -es plurals for keywords ending in a sibilant (e.g.
# "tax"->"taxes", "market crash"->"market crashes") that a bare `s?` suffix
# missed. "diagnosis"->"diagnoses" is a stem change no suffix pattern can
# cover, so "diagnoses" is listed as its own explicit keyword above.
_STAKES_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(keyword) for keyword in _STAKES_KEYWORDS) + r")(?:e?s)?\b",
    re.IGNORECASE,
)

# Hedge markers, same word-boundary treatment: bare substring matching let
# "may" fire on "dismay"/"mayor(s)" and similar false positives.
_HEDGE_KEYWORDS: tuple[str, ...] = ("might", "may", "could", "some say", "arguably", "probably")
_HEDGE_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(keyword) for keyword in _HEDGE_KEYWORDS) + r")\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class TriageDecision:
    difficulty: Difficulty
    depth_budget: int
    verification_required: bool
    rationale: list[str] = field(default_factory=list)
    classifier_version: str = CLASSIFIER_VERSION


def _detect_stakes(topic_lower: str) -> list[str]:
    matches = {match.group(1) for match in _STAKES_PATTERN.finditer(topic_lower)}
    return sorted(matches)


def triage_debate(topic: str, config: dict[str, Any] | None) -> TriageDecision:
    """Classify a debate topic into a difficulty tier + depth budget + verification need.

    Deterministic and side-effect free. Explicit config overrides
    (`config["protocol"]["difficulty"]` / `config["protocol"]["depth_budget"]`)
    always win over classification. `config["max_depth"]`, when present,
    clamps the resulting `depth_budget` (never raises it above that ceiling).
    """
    config = config or {}
    rationale: list[str] = []

    protocol_overrides = config.get("protocol") if isinstance(config.get("protocol"), dict) else {}
    override_difficulty = protocol_overrides.get("difficulty")
    override_depth_budget = protocol_overrides.get("depth_budget")

    topic_lower = topic.lower()
    claim_type, markers = classify_claim_type(topic)
    hedge_hit = _HEDGE_PATTERN.search(topic_lower) is not None
    stakes_hits = _detect_stakes(topic_lower)

    if override_difficulty in ("simple", "contested", "high_stakes"):
        difficulty: Difficulty = override_difficulty  # type: ignore[assignment]
        rationale.append(f"config override: protocol.difficulty={difficulty}")
        verification_required = difficulty == "high_stakes"
    elif stakes_hits:
        difficulty = "high_stakes"
        verification_required = True
        rationale.append(f"stakes keywords matched: {', '.join(stakes_hits)}")
    elif claim_type in _CONTESTED_CLAIM_TYPES:
        difficulty = "contested"
        verification_required = False
        rationale.append(f"claim_type={claim_type} (markers: {', '.join(markers) or 'none'})")
    elif hedge_hit:
        difficulty = "contested"
        verification_required = False
        rationale.append("hedge marker present in topic text")
    else:
        difficulty = "simple"
        verification_required = False
        rationale.append(f"claim_type={claim_type}; no stakes keywords; no hedge markers")

    if hedge_hit and "hedge marker present in topic text" not in rationale:
        rationale.append("hedge marker also present in topic text")

    if override_depth_budget is not None:
        depth_budget = int(override_depth_budget)
        rationale.append(f"config override: protocol.depth_budget={depth_budget}")
    else:
        depth_budget = _DEPTH_BUDGET_BY_DIFFICULTY[difficulty]

    max_depth = config.get("max_depth")
    if isinstance(max_depth, int) and not isinstance(max_depth, bool) and depth_budget > max_depth:
        rationale.append(f"depth_budget clamped from {depth_budget} to max_depth={max_depth}")
        depth_budget = max_depth

    return TriageDecision(
        difficulty=difficulty,
        depth_budget=depth_budget,
        verification_required=verification_required,
        rationale=rationale,
        classifier_version=CLASSIFIER_VERSION,
    )
