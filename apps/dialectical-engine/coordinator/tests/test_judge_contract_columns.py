from app.models.entities import JudgeOutputArtifact, NodeScoringResult


def test_judge_output_artifact_has_contract_identity_columns() -> None:
    cols = JudgeOutputArtifact.__table__.columns
    for name in ("judge_id", "judge_version", "contract_hash"):
        assert name in cols, f"missing column {name}"
        assert cols[name].nullable is True


def test_node_scoring_result_has_contract_identity_columns() -> None:
    cols = NodeScoringResult.__table__.columns
    for name in ("judge_id", "judge_version", "contract_hash"):
        assert name in cols, f"missing column {name}"
        assert cols[name].nullable is True
