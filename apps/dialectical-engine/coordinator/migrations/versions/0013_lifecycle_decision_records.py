"""Add immutable lifecycle-decision audit records.

The revision is additive and does not backfill or reinterpret historical rows.
Nullable correlation projections stay nullable so legacy/unverifiable facts are
preserved honestly instead of being guessed during migration.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0013_lifecycle_decision_records"
down_revision = "0012_lifecycle_evidence_snapshots"
branch_labels = None
depends_on = None

TABLE_NAME = "lifecycle_decision_records"


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table(TABLE_NAME):
        return
    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("schema_version", sa.String(length=80), nullable=True),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("snapshot_sha256", sa.String(length=64), nullable=True),
        sa.Column("debate_id", sa.String(length=36), nullable=False),
        sa.Column("node_id", sa.String(length=36), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("stopping_reason", sa.Text(), nullable=False),
        sa.Column("path_status", sa.String(length=24), nullable=False),
        sa.Column("stopping_status", sa.String(length=24), nullable=False),
        sa.Column("input_state", sa.String(length=32), nullable=False),
        sa.Column("reason_codes", sa.JSON(), nullable=False),
        sa.Column("score_availability", sa.String(length=32), nullable=True),
        sa.Column("score_freshness", sa.String(length=32), nullable=True),
        sa.Column("evidence_availability", sa.String(length=32), nullable=True),
        sa.Column("evidence_freshness", sa.String(length=32), nullable=True),
        sa.Column("current_score_input_hash", sa.String(length=64), nullable=True),
        sa.Column("scoring_contract_hash", sa.String(length=64), nullable=True),
        sa.Column("score_record_id", sa.String(length=120), nullable=True),
        sa.Column("score_run_id", sa.String(length=120), nullable=True),
        sa.Column("score_run_sequence", sa.Integer(), nullable=True),
        sa.Column("evidence_snapshot_id", sa.String(length=120), nullable=True),
        sa.Column("decision_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("child_spawn_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "score_run_sequence IS NULL OR score_run_sequence > 0",
            name="ck_lifecycle_decision_records_positive_score_sequence",
        ),
        sa.CheckConstraint(
            "child_spawn_count >= 0",
            name="ck_lifecycle_decision_records_nonnegative_child_count",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lifecycle_decision_records_debate_id",
        TABLE_NAME,
        ["debate_id"],
        unique=False,
    )
    op.create_index(
        "ix_lifecycle_decision_records_node_id",
        TABLE_NAME,
        ["node_id"],
        unique=False,
    )
    op.create_index(
        "ix_lifecycle_decision_records_decision",
        TABLE_NAME,
        ["decision"],
        unique=False,
    )
    op.create_index(
        "ix_lifecycle_decision_records_created_at",
        TABLE_NAME,
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ux_lifecycle_decision_records_idempotency_key",
        TABLE_NAME,
        ["idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    # Forward-only safety: lifecycle audit history is never deleted by downgrade.
    pass
