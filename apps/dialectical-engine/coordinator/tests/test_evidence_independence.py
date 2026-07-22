"""Task 13 (P1.5): evidence independence bookkeeping.

docs/improvement-plan-2026-07-22.md Sec P1.5: "record per evidence leaf
{source domain, method: retrieval|model-claim, retrieval query, model
family}; count distinct (domain, method) pairs per claim; expose it instead
of pretending to measure training-corpus independence."

Pure-function tests for app.evidence.independence -- no DB, no I/O. See
test_serialization.py for the wiring test proving this attaches to (and is
absent from) the debate payload correctly.
"""
from __future__ import annotations

import pytest

from app.evidence.independence import (
    aggregate_evidence_independence,
    evidence_leaf_record,
    registrable_domain,
)


# ---------------------------------------------------------------------------
# registrable_domain: simple, non-PSL domain heuristic.
# ---------------------------------------------------------------------------


def test_registrable_domain_strips_www_prefix() -> None:
    assert registrable_domain("https://www.example.com/a/b") == "example.com"


def test_registrable_domain_strips_path_query_and_fragment() -> None:
    assert registrable_domain("https://example.com/foo/bar?x=1#y") == "example.com"


def test_registrable_domain_strips_port() -> None:
    assert registrable_domain("https://example.com:8443/a") == "example.com"


def test_registrable_domain_accepts_a_bare_domain_with_no_scheme() -> None:
    assert registrable_domain("example.com") == "example.com"


def test_registrable_domain_accepts_a_bare_www_domain_with_no_scheme() -> None:
    assert registrable_domain("www.example.com") == "example.com"


def test_registrable_domain_keeps_an_ip_literal_with_scheme_and_port() -> None:
    assert registrable_domain("http://192.168.1.1:8080/path") == "192.168.1.1"


def test_registrable_domain_keeps_a_bare_ip_literal() -> None:
    assert registrable_domain("8.8.8.8") == "8.8.8.8"


def test_registrable_domain_is_case_insensitive() -> None:
    assert registrable_domain("HTTPS://WWW.EXAMPLE.COM/A") == "example.com"


def test_registrable_domain_keeps_deeper_subdomains_unmerged() -> None:
    # Documented limitation of the simple (non-PSL) heuristic: only a
    # leading "www." label is stripped, not "collapse to eTLD+1" -- a real
    # registrable-domain parse (co.uk, github.io, etc.) is explicitly NOT
    # required by the brief.
    assert registrable_domain("https://sub.example.com") == "sub.example.com"


@pytest.mark.parametrize(
    "malformed",
    [
        None,
        "",
        "   ",
        123,
        "not a url with spaces",
        "http://",
        "ftp://",
        "http://[::1/a",  # unbalanced IPv6 bracket -- urlsplit raises ValueError
    ],
)
def test_registrable_domain_returns_none_for_malformed_input(malformed) -> None:
    assert registrable_domain(malformed) is None


# ---------------------------------------------------------------------------
# evidence_leaf_record: per-evidence-leaf {source_domain, method,
# retrieval_query, model_family}. model_family reuses Task 6's
# app.scoring.lineage.lineage_family helper (not reimplemented).
# ---------------------------------------------------------------------------


def test_evidence_leaf_record_for_retrieval_evidence() -> None:
    record = evidence_leaf_record(
        {
            "method": "retrieval",
            "url": "https://www.reuters.com/world/article",
            "quote": "...",
            "retrieval_query": "global temperature trend 2020-2024",
            "publisher": "Reuters",
            "date": "2024-01-01",
            "stance": "supports",
            "resolution_status": "pending",
        },
        model_id="claude-sonnet-5-high-loop",
    )

    assert record == {
        "source_domain": "reuters.com",
        "method": "retrieval",
        "retrieval_query": "global temperature trend 2020-2024",
        "model_family": "claude",
    }


def test_evidence_leaf_record_for_model_claim_evidence_has_no_domain_or_query() -> None:
    record = evidence_leaf_record(
        {"evidenceKind": "statistical", "method": "model-claim"},
        model_id="gpt-5.6sol-medium",
    )

    assert record == {
        "source_domain": None,
        "method": "model-claim",
        "retrieval_query": None,
        "model_family": "gpt",
    }


def test_evidence_leaf_record_reuses_the_task_6_family_helper_verbatim() -> None:
    # Same model id, called through both paths -- must never drift.
    from app.scoring.lineage import lineage_family

    record = evidence_leaf_record({"method": "retrieval", "url": "https://x.com/a"}, model_id="gemini-2.5-pro")

    assert record["model_family"] == lineage_family("gemini-2.5-pro")


def test_evidence_leaf_record_is_defensive_against_missing_metadata() -> None:
    record = evidence_leaf_record(None, model_id=None)

    assert record == {
        "source_domain": None,
        "method": None,
        "retrieval_query": None,
        "model_family": None,
    }


def test_evidence_leaf_record_is_defensive_against_a_malformed_url() -> None:
    record = evidence_leaf_record(
        {"method": "retrieval", "url": "not a url with spaces"}, model_id="claude-sonnet-5"
    )

    assert record["source_domain"] is None


@pytest.mark.parametrize("corrupted_metadata", ["not a dict", ["also", "not", "a", "dict"], 42])
def test_evidence_leaf_record_is_defensive_against_a_non_dict_evidence_metadata(corrupted_metadata) -> None:
    # Node.evidence_metadata is a JSON column -- it can in principle hold any
    # JSON-serializable value, not just a dict. A corrupted/unexpected shape
    # must degrade to the same honest all-None record as missing metadata,
    # never raise, and never fabricate a method/domain from it.
    record = evidence_leaf_record(corrupted_metadata, model_id="claude-sonnet-5")

    assert record == {
        "source_domain": None,
        "method": None,
        "retrieval_query": None,
        "model_family": "claude",
    }


# ---------------------------------------------------------------------------
# aggregate_evidence_independence: {distinct_source_count, pairs} over a
# claim's evidence-leaf records. Sourcing BREADTH, not truth -- counts every
# leaf regardless of verification status (the caller decides which leaves to
# include; this function never filters by verified-ness itself).
# ---------------------------------------------------------------------------


def test_aggregate_counts_a_single_leaf_as_one_distinct_pair() -> None:
    result = aggregate_evidence_independence(
        [{"source_domain": "reuters.com", "method": "retrieval"}]
    )

    assert result == {"distinct_source_count": 1, "pairs": [["reuters.com", "retrieval"]]}


def test_aggregate_collapses_duplicate_domain_and_method_pairs() -> None:
    # Two different articles, same publisher domain, same method -- one
    # source of independence, not two.
    result = aggregate_evidence_independence(
        [
            {"source_domain": "reuters.com", "method": "retrieval"},
            {"source_domain": "reuters.com", "method": "retrieval"},
        ]
    )

    assert result == {"distinct_source_count": 1, "pairs": [["reuters.com", "retrieval"]]}


def test_aggregate_counts_distinct_methods_on_the_same_domain_separately() -> None:
    # Same (degenerate, both-null) domain bucket reached via two different
    # methods must count as two distinct pairs -- the pair key is
    # (domain, method) jointly, never domain alone.
    result = aggregate_evidence_independence(
        [
            {"source_domain": None, "method": "retrieval"},
            {"source_domain": None, "method": "model-claim"},
        ]
    )

    assert result["distinct_source_count"] == 2
    assert sorted(result["pairs"]) == [[None, "model-claim"], [None, "retrieval"]]


def test_aggregate_counts_multiple_distinct_domains() -> None:
    result = aggregate_evidence_independence(
        [
            {"source_domain": "reuters.com", "method": "retrieval"},
            {"source_domain": "apnews.com", "method": "retrieval"},
            {"source_domain": "bbc.com", "method": "retrieval"},
        ]
    )

    assert result["distinct_source_count"] == 3
    assert sorted(result["pairs"]) == [
        ["apnews.com", "retrieval"],
        ["bbc.com", "retrieval"],
        ["reuters.com", "retrieval"],
    ]


def test_aggregate_model_claim_evidence_contributes_one_pair_regardless_of_span_count() -> None:
    # Five separately-extracted model-claim spans on the same claim all
    # share the SAME (null-domain, "model-claim") bucket -- one pair, not
    # five. This is the brief's explicitly called-out rule.
    leaf_records = [{"source_domain": None, "method": "model-claim"} for _ in range(5)]

    result = aggregate_evidence_independence(leaf_records)

    assert result == {"distinct_source_count": 1, "pairs": [[None, "model-claim"]]}


def test_aggregate_of_no_evidence_is_the_honest_empty_object() -> None:
    assert aggregate_evidence_independence([]) == {"distinct_source_count": 0, "pairs": []}


def test_aggregate_ignores_model_family_when_counting_pairs() -> None:
    # Two leaves, same (domain, method), DIFFERENT model_family -- the
    # per-claim aggregate is {distinct_source_count, pairs} over
    # (domain, method) only (per the brief's literal shape); model_family
    # lives on the per-leaf record, not the aggregate.
    result = aggregate_evidence_independence(
        [
            {"source_domain": "reuters.com", "method": "retrieval", "model_family": "claude"},
            {"source_domain": "reuters.com", "method": "retrieval", "model_family": "gemini"},
        ]
    )

    assert result == {"distinct_source_count": 1, "pairs": [["reuters.com", "retrieval"]]}


def test_aggregate_pairs_are_returned_in_a_deterministic_sorted_order() -> None:
    result = aggregate_evidence_independence(
        [
            {"source_domain": "reuters.com", "method": "retrieval"},
            {"source_domain": None, "method": "model-claim"},
            {"source_domain": "apnews.com", "method": "retrieval"},
        ]
    )

    assert result["pairs"] == [
        [None, "model-claim"],
        ["apnews.com", "retrieval"],
        ["reuters.com", "retrieval"],
    ]
