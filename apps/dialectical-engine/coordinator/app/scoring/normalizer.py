"""Deterministic, rule-based claim normalization.

No LLM/provider calls. No network calls. No new dependencies — classification
and extraction use only the stdlib `re` module. When a rule does not clearly
match, the corresponding field stays honestly empty/`None`/`"unknown"` —
never guessed.

Claim type precedence
----------------------
Hedging/ambiguity markers ("might", "may", "could", "some say", "arguably",
"probably") are detected FIRST and always recorded into `ambiguity_flags`.
They never affect `claim_type` on their own — a hedged causal claim is still
`causal`, just also flagged as ambiguous.

After hedge detection, each of the six type families is checked independently
against the full text (a claim can match more than one family). If:
  - exactly one family matches -> that family's type is returned.
  - two or more families match -> `"mixed"` is returned, with the union of
    every matched family's marker strings.
  - no family matches -> `"unknown"` is returned with an empty marker list.

When exactly one family matches, the families are checked in this order
(more-specific-first), and the FIRST one found in this order wins in the
(impossible-in-practice-since-we-scan-all, but documented for clarity) case
of ambiguity in implementation:

    comparative > prediction > causal > normative > definitional > empirical

This order matters because some sentence shapes could plausibly be described
by more than one family's *name* even though only one family's *regex*
actually matches (e.g. "higher" alone is not a comparative match — only an
explicit "more/less/-er ... than"-shaped construction is). The precedence
list is the tie-breaker used when deciding which family's match "counts more"
for documentation purposes; in this implementation ties are handled by the
mixed-when-multiple-match rule above, and precedence order is reflected in
the order family checks are performed and reported.
"""
from __future__ import annotations

import re

from app.scoring.models import ClaimType, NormalizedClaim, Scope


# ---------------------------------------------------------------------------
# Hedging / ambiguity markers
# ---------------------------------------------------------------------------

_HEDGE_MARKERS: list[tuple[str, re.Pattern[str]]] = [
    ("might", re.compile(r"\bmight\b", re.IGNORECASE)),
    ("may", re.compile(r"\bmay\b", re.IGNORECASE)),
    ("could", re.compile(r"\bcould\b", re.IGNORECASE)),
    ("some say", re.compile(r"\bsome say\b", re.IGNORECASE)),
    ("arguably", re.compile(r"\barguably\b", re.IGNORECASE)),
    ("probably", re.compile(r"\bprobably\b", re.IGNORECASE)),
]


def _find_hedge_markers(text: str) -> list[str]:
    return [label for label, pattern in _HEDGE_MARKERS if pattern.search(text)]


# ---------------------------------------------------------------------------
# Claim-type family rules, in precedence order (more-specific-first):
#   comparative > prediction > causal > normative > definitional > empirical
# ---------------------------------------------------------------------------

_COMPARATIVE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bmore\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\bless\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\bbetter\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\bworse\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\b\w+er\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\bcompared to\b", re.IGNORECASE),
    re.compile(r"\brelative to\b", re.IGNORECASE),
]

_PREDICTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bwill\s", re.IGNORECASE),
    re.compile(r"\bgoing to\b", re.IGNORECASE),
    re.compile(r"\bby 20\d\d\b", re.IGNORECASE),
    re.compile(r"\bis expected to\b", re.IGNORECASE),
    re.compile(r"\bare expected to\b", re.IGNORECASE),
    re.compile(r"\bforecast\b", re.IGNORECASE),
]

_CAUSAL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bcauses?\b", re.IGNORECASE),
    re.compile(r"\bcaused by\b", re.IGNORECASE),
    re.compile(r"\bleads? to\b", re.IGNORECASE),
    re.compile(r"\bresults? in\b", re.IGNORECASE),
    re.compile(r"\bbecause of\b", re.IGNORECASE),
    re.compile(r"\bdrives?\b", re.IGNORECASE),
    re.compile(r"\btriggers?\b", re.IGNORECASE),
]

_NORMATIVE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bshould\b", re.IGNORECASE),
    re.compile(r"\bought\b", re.IGNORECASE),
    re.compile(r"\bmust not\b", re.IGNORECASE),
    re.compile(r"\bmust\s", re.IGNORECASE),
    re.compile(r"\bit is (wrong|right|immoral|unjust|unfair) to\b", re.IGNORECASE),
    re.compile(r"\bis (good|bad)\b", re.IGNORECASE),
    re.compile(r"\bare (good|bad)\b", re.IGNORECASE),
]

_DEFINITIONAL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bis defined as\b", re.IGNORECASE),
    re.compile(r"\bmeans that\b", re.IGNORECASE),
    re.compile(r"\brefers to\b", re.IGNORECASE),
    re.compile(r"\bis a type of\b", re.IGNORECASE),
    re.compile(r"\bis when\b", re.IGNORECASE),
]

_EMPIRICAL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bstudy\b", re.IGNORECASE),
    re.compile(r"\bstudies show\b", re.IGNORECASE),
    re.compile(r"\bresearch\b", re.IGNORECASE),
    re.compile(r"\bdata\b", re.IGNORECASE),
    re.compile(r"\bevidence\b", re.IGNORECASE),
    re.compile(r"\d+%"),
    re.compile(r"\brate of\b", re.IGNORECASE),
    re.compile(r"\bstatistics\b", re.IGNORECASE),
    re.compile(r"\bmeasured\b", re.IGNORECASE),
    re.compile(r"\bobserved\b", re.IGNORECASE),
    re.compile(r"\d+\s*percent\b", re.IGNORECASE),
]

_FAMILY_RULES: list[tuple[ClaimType, list[re.Pattern[str]]]] = [
    ("comparative", _COMPARATIVE_PATTERNS),
    ("prediction", _PREDICTION_PATTERNS),
    ("causal", _CAUSAL_PATTERNS),
    ("normative", _NORMATIVE_PATTERNS),
    ("definitional", _DEFINITIONAL_PATTERNS),
    ("empirical", _EMPIRICAL_PATTERNS),
]


def classify_claim_type(text: str) -> tuple[ClaimType, list[str]]:
    """Classify a claim's rhetorical type via ordered, deterministic regex rules.

    Returns (claim_type, matched_marker_strings). Hedge markers are detected
    separately (see `_find_hedge_markers`) and never influence this return
    value. See module docstring for full precedence rules.
    """
    matches: list[tuple[ClaimType, list[str]]] = []
    for claim_type, patterns in _FAMILY_RULES:
        found = [match.group(0) for pattern in patterns if (match := pattern.search(text))]
        if found:
            matches.append((claim_type, found))

    if len(matches) == 0:
        return "unknown", []
    if len(matches) == 1:
        return matches[0]

    all_markers: list[str] = []
    for _claim_type, markers in matches:
        for marker in markers:
            if marker not in all_markers:
                all_markers.append(marker)
    return "mixed", all_markers


# ---------------------------------------------------------------------------
# implied_assumptions: mechanical derivations keyed off claim_type only
# ---------------------------------------------------------------------------


def _implied_assumptions(claim_type: ClaimType) -> list[str]:
    if claim_type == "causal":
        return ["correlation supports causation here", "no major confounder dominates"]
    if claim_type == "prediction":
        return ["current trend continues"]
    if claim_type == "comparative":
        return ["comparison baseline is well-defined"]
    return []


# ---------------------------------------------------------------------------
# extract_scope: conservative, fixed-vocabulary regex extraction
# ---------------------------------------------------------------------------

_YEAR_PATTERN = re.compile(r"\b(19|20)\d\d\b")
_SINCE_YEAR_PATTERN = re.compile(r"\bsince (\d{4})\b", re.IGNORECASE)
_OVER_LAST_N_YEARS_PATTERN = re.compile(r"\bover the last (\d+) years?\b", re.IGNORECASE)

# Fixed, small vocabulary only. Deliberately NOT a general "in <ProperNoun>"
# heuristic — anything outside this list stays None rather than guessed.
_GEOGRAPHY_VOCABULARY: list[str] = [
    "United States",
    "United Kingdom",
    "Germany",
    "France",
    "Canada",
    "Australia",
    "Japan",
    "China",
    "India",
    "Brazil",
    "Europe",
    "Asia",
    "Africa",
    "North America",
    "South America",
]
_GEOGRAPHY_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(name) for name in _GEOGRAPHY_VOCABULARY) + r")\b"
)

# The boundary-preposition lookaheads stop the capture before scope clauses
# (e.g. "among software engineers in Germany" -> "software engineers",
# "among software engineers during 2024" -> "software engineers").
_POPULATION_BOUNDARY_PREPOSITIONS = (
    "in",
    "during",
    "since",
    "by",
    "over",
    "across",
    "within",
    "after",
    "before",
)
_POPULATION_BOUNDARY_PATTERN = "|".join(_POPULATION_BOUNDARY_PREPOSITIONS)
_POPULATION_PATTERN = re.compile(
    rf"\bamong ((?!(?:{_POPULATION_BOUNDARY_PATTERN})\b)[a-z][\w\-]*"
    rf"(?:\s+(?!(?:{_POPULATION_BOUNDARY_PATTERN})\b)[a-z][\w\-]*){{0,3}})",
    re.IGNORECASE,
)


def extract_scope(text: str) -> Scope:
    """Conservatively extract timeframe/geography/population scope.

    Every field defaults to None and is only set when a fixed pattern (or,
    for geography, a fixed vocabulary list) matches. No inference, no
    fuzzy matching, no free-form proper-noun guessing.
    """
    timeframe: str | None = None
    since_match = _SINCE_YEAR_PATTERN.search(text)
    over_match = _OVER_LAST_N_YEARS_PATTERN.search(text)
    year_match = _YEAR_PATTERN.search(text)
    if since_match:
        timeframe = f"since {since_match.group(1)}"
    elif over_match:
        timeframe = f"over the last {over_match.group(1)} years"
    elif year_match:
        timeframe = year_match.group(0)

    geography: str | None = None
    geography_match = _GEOGRAPHY_PATTERN.search(text)
    if geography_match:
        geography = geography_match.group(1)

    population: str | None = None
    population_match = _POPULATION_PATTERN.search(text)
    if population_match:
        population = population_match.group(1).strip()

    return Scope(timeframe=timeframe, geography=geography, population=population, domain=None)


# ---------------------------------------------------------------------------
# evidence_refs: URL extraction only
# ---------------------------------------------------------------------------

_URL_PATTERN = re.compile(r"https?://[^\s\)\]\,]+")


def _extract_evidence_refs(text: str) -> list[str]:
    return _URL_PATTERN.findall(text)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def normalize_claim(*, node_id: str, raw_text: str) -> NormalizedClaim:
    core_claim = raw_text.strip()
    claim_type, _markers = classify_claim_type(core_claim)
    return NormalizedClaim(
        node_id=node_id,
        raw_text=raw_text,
        core_claim=core_claim,
        claim_type=claim_type,
        scope=extract_scope(core_claim),
        implied_assumptions=_implied_assumptions(claim_type),
        evidence_refs=_extract_evidence_refs(core_claim),
        ambiguity_flags=_find_hedge_markers(core_claim),
        key_terms=[],
    )
