"""Task 13 (P1.5): evidence independence bookkeeping.

docs/improvement-plan-2026-07-22.md Sec P1.5: "Independence bookkeeping
(cheap first version of the synthesis's 'independence metric'): record per
evidence leaf {source domain, method: retrieval|model-claim, retrieval
query, model family}; count distinct (domain, method) pairs per claim;
expose it instead of pretending to measure training-corpus independence."

Pure, no I/O, no DB access -- callers (app.services.serialization) supply
each EVIDENCE node's already-loaded `evidence_metadata` dict and its
generating model id.

Honesty laws (binding):
  - This is NOT a training-corpus-independence measurement. It counts
    distinct (source_domain, method) pairs among a claim's evidence
    children -- sourcing BREADTH (how many distinct places/ways this
    evidence claims to come from), never truth, never verified-ness, and
    never a statement about the models' training data.
  - `aggregate_evidence_independence` counts every supplied leaf record
    regardless of verification status -- "this measures sourcing breadth,
    not truth" (brief, point 2). Callers must not pre-filter to
    verified-only leaves expecting a different meaning; the un-filtered
    count IS the intended metric.
  - The per-claim aggregate's pairs are keyed on (source_domain, method)
    ONLY (brief point 2's literal shape); `model_family` is recorded on the
    per-leaf record (this task's other job -- "ensure model_family +
    source_domain are derivable") but deliberately does not widen the pair
    key, so this task's aggregation stays exactly what the brief specifies.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any
from urllib.parse import urlsplit

from app.scoring.lineage import lineage_family

# Registrable-domain heuristic (simple, NOT full Public Suffix List parsing --
# the brief explicitly does not require eTLD+1 correctness for multi-part
# TLDs like "co.uk"; deeper subdomains like "sub.example.com" are kept
# as-is, not collapsed to "example.com"). After a leading "www." label is
# stripped, the remaining hostname must consist only of characters legal in
# a DNS host or an IPv4/IPv6 literal (letters, digits, '.', '-', ':') --
# anything else (a stray space, free text mistaken for a bare host, etc.) is
# rejected as malformed rather than returned as a fabricated "domain".
_HOSTNAME_RE = re.compile(r"^[a-z0-9.\-:]+$")
_WWW_PREFIX = "www."


def registrable_domain(url: object) -> str | None:
    """Simple, PSL-free domain heuristic (Task 13, P1.5).

    Strips scheme, a leading "www." label, path/query/fragment, and port;
    case-folds the result. Returns None for anything that cannot honestly
    be read as a host (absent/non-string/blank input, or a value with no
    parseable hostname) -- never a guess.

    Examples: "https://www.example.com/a/b" -> "example.com";
    "http://192.168.1.1:8080/x" -> "192.168.1.1" (IP literals pass through
    unchanged -- there is no "registrable" reduction for an IP);
    "not a url" -> None.
    """
    if not isinstance(url, str):
        return None
    candidate = url.strip()
    if not candidate:
        return None
    try:
        parsed = urlsplit(candidate)
        hostname = parsed.hostname
        if not hostname and not parsed.scheme and not parsed.netloc:
            # No scheme/authority marker at all (e.g. a bare "example.com"):
            # urlsplit only populates .hostname when a "//" authority marker
            # is present. Retry once, reinterpreting the whole string as a
            # host -- this never invents data, it just resolves a
            # genuinely scheme-less string the way a browser address bar
            # would. A string WITH a scheme but no host (e.g. "http://") is
            # never retried here -- that is honestly malformed, not
            # scheme-less.
            hostname = urlsplit(f"//{candidate}").hostname
    except ValueError:
        # e.g. an unbalanced IPv6 bracket ("http://[::1/a") -- urlsplit can
        # raise rather than return an unparseable result.
        return None
    if not hostname:
        return None
    hostname = hostname.lower()
    if not _HOSTNAME_RE.match(hostname):
        return None
    if hostname.startswith(_WWW_PREFIX):
        hostname = hostname[len(_WWW_PREFIX) :]
    return hostname or None


def evidence_leaf_record(
    evidence_metadata: Mapping[str, Any] | None,
    *,
    model_id: str | None,
) -> dict[str, Any]:
    """Assemble one EVIDENCE node's per-leaf record (Task 13, P1.5 point 1):
    {source_domain, method, retrieval_query, model_family}.

    source_domain: registrable_domain(evidence_metadata["url"]) -- honestly
        None for method="model-claim" nodes (Task 10's extractor never
        stores a "url") and for any node missing/failing to parse one.
    method: evidence_metadata["method"] verbatim ("retrieval" |
        "model-claim", per Task 10) -- None only for pre-Task-10/corrupted
        rows that never got the stamp.
    retrieval_query: evidence_metadata["retrieval_query"] verbatim -- None
        for model-claim evidence (never stamped) and for any node missing
        it.
    model_family: app.scoring.lineage.lineage_family(model_id) -- REUSES
        Task 6's helper verbatim rather than reimplementing family
        detection (per the brief's explicit "reuse the existing family
        helper from Task 6").
    """
    metadata: Mapping[str, Any] = evidence_metadata if isinstance(evidence_metadata, Mapping) else {}
    return {
        "source_domain": registrable_domain(metadata.get("url")),
        "method": metadata.get("method"),
        "retrieval_query": metadata.get("retrieval_query"),
        "model_family": lineage_family(model_id),
    }


def aggregate_evidence_independence(
    leaf_records: Iterable[Mapping[str, Any]],
) -> dict[str, Any]:
    """Per-claim aggregation over its evidence children's leaf records
    (Task 13, P1.5 point 2): counts distinct (source_domain, method) pairs.

    Sourcing BREADTH, not truth -- every supplied leaf counts once toward
    the pair set regardless of verification status (callers pass whichever
    leaves they want counted; this function never filters). Duplicate
    (domain, method) pairs collapse to one entry (e.g. five model-claim
    spans on the same claim -- all (None, "model-claim") -- contribute
    exactly ONE pair, a direct effect of set-based dedup on the pair key,
    not a special case). `pairs` is returned in a deterministic sorted
    order (None sorts first) so the wire payload never varies by hash seed.
    """
    pairs = {
        (record.get("source_domain"), record.get("method"))
        for record in leaf_records
    }
    ordered_pairs = sorted(pairs, key=lambda pair: (pair[0] or "", pair[1] or ""))
    return {
        "distinct_source_count": len(ordered_pairs),
        "pairs": [list(pair) for pair in ordered_pairs],
    }
