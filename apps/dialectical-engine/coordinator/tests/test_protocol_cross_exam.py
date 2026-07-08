import pytest

from app.protocol.cross_exam import CROSS_EXAM_VERSION, CrossExamReport, cross_examine


def _scoring_item(node_id: str, strength: float, judge_disagreements=None):
    return {
        "node_id": node_id,
        "scores": {"strength": strength},
        "judge_disagreements": judge_disagreements or [],
    }


def test_unopposed_claim_has_no_counter():
    nodes = [{"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"}]
    scoring_items = [_scoring_item("n1", strength=0.9)]
    report = cross_examine(nodes, scoring_items)
    assert report.version == CROSS_EXAM_VERSION
    entry = report.entries_by_claim_id()["n1"]
    assert entry["strongestCounterId"] is None
    assert entry["counterStrength"] is None
    assert entry["unopposed"] is True


def test_strongest_opposing_child_is_selected_by_highest_strength():
    # higher strength on the CON child = stronger counter-pressure against the parent claim
    nodes = [
        {"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"},
        {"id": "n2", "parent_id": "n1", "node_type": "CON"},
        {"id": "n3", "parent_id": "n1", "node_type": "CON"},
    ]
    scoring_items = [
        _scoring_item("n1", strength=0.8),
        _scoring_item("n2", strength=0.6),
        _scoring_item("n3", strength=0.9),  # strongest -> strongest counter-pressure
    ]
    report = cross_examine(nodes, scoring_items)
    entry = report.entries_by_claim_id()["n1"]
    assert entry["strongestCounterId"] == "n3"
    assert entry["counterStrength"] == 0.9
    assert entry["unopposed"] is False


def test_non_con_children_are_not_treated_as_opposing():
    nodes = [
        {"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"},
        {"id": "n2", "parent_id": "n1", "node_type": "PRO"},
        {"id": "n3", "parent_id": "n1", "node_type": "SCIENTIFIC_POV"},
    ]
    scoring_items = [
        _scoring_item("n1", strength=0.5),
        _scoring_item("n2", strength=0.95),
        _scoring_item("n3", strength=0.95),
    ]
    report = cross_examine(nodes, scoring_items)
    entry = report.entries_by_claim_id()["n1"]
    assert entry["strongestCounterId"] is None
    assert entry["counterStrength"] is None
    assert entry["unopposed"] is True


def test_tie_in_strength_broken_by_node_id_for_determinism():
    nodes = [
        {"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"},
        {"id": "n3", "parent_id": "n1", "node_type": "CON"},
        {"id": "n2", "parent_id": "n1", "node_type": "CON"},
    ]
    scoring_items = [
        _scoring_item("n1", strength=0.5),
        _scoring_item("n2", strength=0.7),
        _scoring_item("n3", strength=0.7),
    ]
    report = cross_examine(nodes, scoring_items)
    entry = report.entries_by_claim_id()["n1"]
    assert entry["strongestCounterId"] == "n2"
    assert entry["counterStrength"] == 0.7


def test_unscored_con_child_is_ignored():
    nodes = [
        {"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"},
        {"id": "n2", "parent_id": "n1", "node_type": "CON"},  # not scored yet
    ]
    scoring_items = [_scoring_item("n1", strength=0.5)]
    report = cross_examine(nodes, scoring_items)
    entry = report.entries_by_claim_id()["n1"]
    assert entry["strongestCounterId"] is None
    assert entry["unopposed"] is True


def test_judge_disagreements_are_carried_through_per_node():
    disagreement = {"judges": ["a", "b"], "type": "persisted_judge_strength_gap", "severity": "high"}
    nodes = [{"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"}]
    scoring_items = [_scoring_item("n1", strength=0.5, judge_disagreements=[disagreement])]
    report = cross_examine(nodes, scoring_items)
    entry = report.entries_by_claim_id()["n1"]
    assert entry["judgeDisagreements"] == [disagreement]


def test_disagreements_override_map_takes_precedence_over_item_field():
    disagreement = {"judges": ["a", "b"], "type": "persisted_judge_strength_gap", "severity": "high"}
    nodes = [{"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"}]
    scoring_items = [_scoring_item("n1", strength=0.5, judge_disagreements=[{"stale": True}])]
    report = cross_examine(nodes, scoring_items, disagreements={"n1": [disagreement]})
    entry = report.entries_by_claim_id()["n1"]
    assert entry["judgeDisagreements"] == [disagreement]


def test_deterministic_ordering_by_claim_id():
    nodes = [{"id": "n3", "parent_id": None, "node_type": "ROOT_CLAIM"},
             {"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"}]
    scoring_items = [_scoring_item("n3", 0.5), _scoring_item("n1", 0.5)]
    report = cross_examine(nodes, scoring_items)
    assert [e["claimId"] for e in report.entries] == sorted(e["claimId"] for e in report.entries)


def test_unscored_claim_is_omitted_from_report():
    nodes = [
        {"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"},
        {"id": "n2", "parent_id": None, "node_type": "ROOT_CLAIM"},
    ]
    scoring_items = [_scoring_item("n1", 0.5)]
    report = cross_examine(nodes, scoring_items)
    assert report.entries_by_claim_id().keys() == {"n1"}


def test_empty_input_returns_empty_report():
    report = cross_examine([], [])
    assert report.entries == []
    assert report.version == CROSS_EXAM_VERSION


def test_report_is_frozen():
    report = cross_examine([], [])
    with pytest.raises(Exception):
        report.entries = []  # type: ignore[misc]


def test_report_to_dict_is_json_safe():
    nodes = [{"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"}]
    scoring_items = [_scoring_item("n1", strength=0.5)]
    report = cross_examine(nodes, scoring_items)
    payload = report.to_dict()
    assert payload == {"entries": report.entries, "version": CROSS_EXAM_VERSION}
    import json
    json.dumps(payload)  # must not raise
