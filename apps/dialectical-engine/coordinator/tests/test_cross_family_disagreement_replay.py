"""P1 Task 5 Step 8: replay the real smoke4 judge artifacts.

DISAGREEMENT_FIELD_THRESHOLD must be chosen against data, not defended, so
this replays every persisted judge artifact from the last production debate
(f67ad244-a37f-44cd-9008-31df0ef87bfe: 78 artifacts, 26 nodes, 3 judge
families per node) and records the contested-node count at 0.20 / 0.25 /
0.30.

The artifacts are frozen into tests/fixtures/smoke4_judge_artifacts.json --
the test never reads the live database, so the measurement stays
reproducible after ~/.dialectical/db.sqlite3 moves on.

Fixture export (columns are the exact ones
app/scoring/service.py:_persisted_judge_evidence_for_node selects, so the
replay can run the REAL distinctness rule rather than a reconstruction;
`assessment` is post-parsed from sqlite3's JSON-as-string into an object):

    sqlite3 "file:$HOME/.dialectical/db.sqlite3?mode=ro" -readonly -json \\
      "SELECT node_id, judge_role, provider, model, raw_output_sha256, \\
              input_hash, parse_status, assessment \\
       FROM judge_output_artifacts \\
       WHERE debate_id='f67ad244-a37f-44cd-9008-31df0ef87bfe' \\
       ORDER BY node_id, judge_role, provider, model, created_at, id;" \\
      > tests/fixtures/smoke4_judge_artifacts.json
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.scoring.disagreement import (
    DISAGREEMENT_FIELD_THRESHOLD,
    FIELD_DISAGREEMENT_FLAG,
    detect_persisted_judge_disagreements,
    field_spreads,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "smoke4_judge_artifacts.json"
SMOKE4_DEBATE_ID = "f67ad244-a37f-44cd-9008-31df0ef87bfe"

# Measured on the frozen fixture (see test_replay_smoke4_contested_counts).
# 0.25 was chosen for the 13/26 contested frontier it produces; it was NOT
# reverse-engineered from the design's ">=3 contested" acceptance bar, which
# every one of these three thresholds clears by a wide margin.
EXPECTED_CONTESTED_COUNTS = {0.20: 16, 0.25: 13, 0.30: 8}


@pytest.fixture(scope="module")
def smoke4_judge_artifacts() -> dict[str, list[dict]]:
    """Real persisted judge evidence, grouped per node, in exactly the dict
    shape _persisted_judge_evidence_for_node hands the detector."""
    rows = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    by_node: dict[str, list[dict]] = {}
    for row in rows:
        # Mirror the production query's filters rather than trusting the
        # export: only parseable, present assessments are judge evidence.
        if row.get("parse_status") != "available" or row.get("assessment") is None:
            continue
        by_node.setdefault(str(row["node_id"]), []).append(
            {
                "judge_role": row["judge_role"],
                "provider": row["provider"],
                "model": row["model"],
                "raw_output_sha256": row["raw_output_sha256"],
                "assessment": row["assessment"],
            }
        )
    return by_node


def _contested_node_count(artifacts_by_node: dict[str, list[dict]], threshold: float) -> int:
    return sum(
        1
        for evidence in artifacts_by_node.values()
        if any(spread >= threshold for spread in field_spreads(evidence).values())
    )


def test_fixture_matches_the_recorded_production_shape(smoke4_judge_artifacts) -> None:
    assert len(smoke4_judge_artifacts) == 26
    assert sum(len(items) for items in smoke4_judge_artifacts.values()) == 78
    assert {len(items) for items in smoke4_judge_artifacts.values()} == {3}


def test_replay_smoke4_contested_counts(smoke4_judge_artifacts) -> None:
    counts = {
        threshold: _contested_node_count(smoke4_judge_artifacts, threshold)
        for threshold in (0.20, 0.25, 0.30)
    }

    # Recorded for the record; the design requires >=3 contested at the
    # chosen threshold, versus 0 under the old composite gate.
    assert counts[0.25] >= 3
    assert counts == EXPECTED_CONTESTED_COUNTS
    print(f"contested-node counts by threshold: {counts}")


def test_chosen_threshold_is_the_one_the_code_ships(smoke4_judge_artifacts) -> None:
    assert DISAGREEMENT_FIELD_THRESHOLD == 0.25
    assert (
        _contested_node_count(smoke4_judge_artifacts, DISAGREEMENT_FIELD_THRESHOLD)
        == EXPECTED_CONTESTED_COUNTS[0.25]
    )


def test_old_composite_gate_found_nothing_in_the_whole_debate(
    smoke4_judge_artifacts, monkeypatch
) -> None:
    """The negative control this task exists to overturn: with the flag off,
    the historical 0.35 composite gate reports zero contested nodes across
    all 26 -- which is why disagreement_status was "none" everywhere and
    `challenge` had no categorical route."""
    monkeypatch.setenv(FIELD_DISAGREEMENT_FLAG, "false")

    contested = [
        node_id
        for node_id, evidence in smoke4_judge_artifacts.items()
        if detect_persisted_judge_disagreements(evidence)
    ]

    assert contested == []


def test_new_gate_makes_the_same_debate_contested(smoke4_judge_artifacts, monkeypatch) -> None:
    monkeypatch.setenv(FIELD_DISAGREEMENT_FLAG, "true")

    contested = [
        node_id
        for node_id, evidence in smoke4_judge_artifacts.items()
        if detect_persisted_judge_disagreements(evidence)
    ]

    assert len(contested) == EXPECTED_CONTESTED_COUNTS[0.25]
    assert all(
        item.type == "cross_family_field_spread"
        for node_id in contested
        for item in detect_persisted_judge_disagreements(smoke4_judge_artifacts[node_id])
    )
