"""add node scoring results cache

Revision ID: 0004_node_scoring_results
Revises: 0003_dialectical_v2_artifacts
Create Date: 2026-06-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_node_scoring_results"
down_revision = "0003_dialectical_v2_artifacts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "node_scoring_results",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("debate_id", sa.String(length=36), sa.ForeignKey("debates.id"), nullable=False),
        sa.Column("node_id", sa.String(length=36), sa.ForeignKey("nodes.id"), nullable=False),
        sa.Column("input_hash", sa.String(length=128), nullable=False),
        sa.Column("judge_role", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=120), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("provider_metadata", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_node_scoring_results_debate_id", "node_scoring_results", ["debate_id"])
    op.create_index("ix_node_scoring_results_node_id", "node_scoring_results", ["node_id"])
    op.create_index("ix_node_scoring_results_status", "node_scoring_results", ["status"])
    op.create_index(
        "ux_node_scoring_results_cache_identity",
        "node_scoring_results",
        ["debate_id", "node_id", "input_hash", "judge_role", "provider", "model"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ux_node_scoring_results_cache_identity", table_name="node_scoring_results")
    op.drop_index("ix_node_scoring_results_status", table_name="node_scoring_results")
    op.drop_index("ix_node_scoring_results_node_id", table_name="node_scoring_results")
    op.drop_index("ix_node_scoring_results_debate_id", table_name="node_scoring_results")
    op.drop_table("node_scoring_results")
