"""Add immutable lifecycle evidence snapshots.

This revision is additive and does not backfill or reinterpret historical
evidence.  Legacy data remains outside the v1 snapshot table until a caller
can persist every required fact without guessing.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0012_lifecycle_evidence_snapshots"
down_revision = "0011_analyzer_run_seq"
branch_labels = None
depends_on = None

TABLE_NAME = "evidence_lifecycle_snapshots"


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table(TABLE_NAME):
        return
    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("schema_version", sa.String(length=80), nullable=True),
        sa.Column("debate_id", sa.String(length=36), nullable=False),
        sa.Column("node_id", sa.String(length=36), nullable=False),
        sa.Column("evidence_node_id", sa.String(length=36), nullable=True),
        sa.Column("claim_node_id", sa.String(length=36), nullable=True),
        sa.Column("generation_id", sa.String(length=36), nullable=True),
        sa.Column("reference", sa.Text(), nullable=True),
        sa.Column("content_sha256", sa.String(length=64), nullable=True),
        sa.Column("evidence_kind", sa.String(length=80), nullable=True),
        sa.Column("availability", sa.String(length=32), nullable=True),
        sa.Column("verification_status", sa.String(length=32), nullable=True),
        sa.Column("unavailability_reason", sa.Text(), nullable=True),
        sa.Column("source_kind", sa.String(length=80), nullable=True),
        sa.Column("source_record_id", sa.String(length=120), nullable=True),
        sa.Column("run_id", sa.String(length=120), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=True),
        sa.Column("producer", sa.String(length=120), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("payload_sha256", sa.String(length=64), nullable=False),
        sa.Column("identity_sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "sequence IS NULL OR sequence > 0",
            name="ck_evidence_lifecycle_snapshots_positive_sequence",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_evidence_lifecycle_snapshots_debate_id",
        TABLE_NAME,
        ["debate_id"],
        unique=False,
    )
    op.create_index(
        "ix_evidence_lifecycle_snapshots_node_id",
        TABLE_NAME,
        ["node_id"],
        unique=False,
    )
    op.create_index(
        "ix_evidence_lifecycle_snapshots_evidence_node_id",
        TABLE_NAME,
        ["evidence_node_id"],
        unique=False,
    )
    op.create_index(
        "ix_evidence_lifecycle_snapshots_verification_status",
        TABLE_NAME,
        ["verification_status"],
        unique=False,
    )
    op.create_index(
        "ix_evidence_lifecycle_snapshots_created_at",
        TABLE_NAME,
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ux_evidence_lifecycle_snapshots_identity",
        TABLE_NAME,
        ["identity_sha256"],
        unique=True,
    )


def downgrade() -> None:
    # Forward-only safety: retaining immutable audit snapshots is preferable
    # to a downgrade that destroys evidence history.
    pass
