"""Add judge contract identity to judge artifacts and scoring cache rows.

Note: ``judge_output_artifacts`` was originally materialized only via
``Base.metadata.create_all()`` -- the entity was absorbed into the codebase
without an accompanying migration, so no earlier revision in this chain ever
creates the table. A fresh ``alembic upgrade head`` against an empty database
therefore fails when this migration tries to ``batch_alter_table`` a table
that does not exist. ``upgrade()`` now detects that case and creates the
table with its full current schema (including the contract columns) instead
of assuming it is already present. Dev databases that were bootstrapped via
``create_all`` already have the table, so those keep using the original
add-columns path.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_judge_contract_identity"
down_revision = "0006_node_feedback_votes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("judge_output_artifacts"):
        op.create_table(
            "judge_output_artifacts",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("debate_id", sa.String(length=36), sa.ForeignKey("debates.id"), nullable=False),
            sa.Column("node_id", sa.String(length=36), sa.ForeignKey("nodes.id"), nullable=False),
            sa.Column("job_id", sa.String(length=36), sa.ForeignKey("jobs.id"), nullable=True),
            sa.Column(
                "analyzer_run_id", sa.String(length=36), sa.ForeignKey("analyzer_runs.id"), nullable=True
            ),
            sa.Column("input_hash", sa.String(length=128), nullable=False),
            sa.Column("judge_role", sa.String(length=64), nullable=False),
            sa.Column("provider", sa.String(length=120), nullable=False),
            sa.Column("model", sa.String(length=120), nullable=False),
            sa.Column("judge_id", sa.String(length=120), nullable=True),
            sa.Column("judge_version", sa.String(length=32), nullable=True),
            sa.Column("contract_hash", sa.String(length=128), nullable=True),
            sa.Column("prompt_version", sa.String(length=120), nullable=True),
            sa.Column("request_metadata", sa.JSON(), nullable=False),
            sa.Column("raw_output", sa.Text(), nullable=False),
            sa.Column("raw_output_sha256", sa.String(length=64), nullable=False),
            sa.Column("parse_status", sa.String(length=24), nullable=False),
            sa.Column("parse_error", sa.Text(), nullable=True),
            sa.Column("assessment", sa.JSON(), nullable=True),
            sa.Column("provider_metadata", sa.JSON(), nullable=False),
            sa.Column("latency_ms", sa.Integer(), nullable=True),
            sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "parse_status IN ('available', 'unavailable')", name="ck_judge_output_parse_status"
            ),
            sa.UniqueConstraint(
                "debate_id",
                "node_id",
                "input_hash",
                "judge_role",
                "provider",
                "model",
                "raw_output_sha256",
                name="ux_judge_output_artifacts_identity",
            ),
        )
        op.create_index("ix_judge_output_artifacts_debate_id", "judge_output_artifacts", ["debate_id"])
        op.create_index("ix_judge_output_artifacts_node_id", "judge_output_artifacts", ["node_id"])
        op.create_index("ix_judge_output_artifacts_job_id", "judge_output_artifacts", ["job_id"])
        op.create_index("ix_judge_output_artifacts_created_at", "judge_output_artifacts", ["created_at"])
    else:
        with op.batch_alter_table("judge_output_artifacts") as batch:
            batch.add_column(sa.Column("judge_id", sa.String(120), nullable=True))
            batch.add_column(sa.Column("judge_version", sa.String(32), nullable=True))
            batch.add_column(sa.Column("contract_hash", sa.String(128), nullable=True))

    with op.batch_alter_table("node_scoring_results") as batch:
        batch.add_column(sa.Column("judge_id", sa.String(120), nullable=True))
        batch.add_column(sa.Column("judge_version", sa.String(32), nullable=True))
        batch.add_column(sa.Column("contract_hash", sa.String(128), nullable=True))
    op.create_index(
        "ix_node_scoring_results_contract_hash",
        "node_scoring_results",
        ["contract_hash"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.drop_index("ix_node_scoring_results_contract_hash", table_name="node_scoring_results")
    with op.batch_alter_table("node_scoring_results") as batch:
        batch.drop_column("contract_hash")
        batch.drop_column("judge_version")
        batch.drop_column("judge_id")

    # Data safety over symmetry: if judge_output_artifacts was created by this
    # migration's upgrade() (fresh DB), there is no reliable way at downgrade
    # time to distinguish that from a pre-existing dev table, and dropping the
    # whole table would destroy any data written since upgrade. So we only
    # ever strip the contract columns we added, never drop the table itself.
    if inspector.has_table("judge_output_artifacts"):
        with op.batch_alter_table("judge_output_artifacts") as batch:
            batch.drop_column("contract_hash")
            batch.drop_column("judge_version")
            batch.drop_column("judge_id")
