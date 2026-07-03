"""add node feedback votes

Revision ID: 0006_node_feedback_votes
Revises: 0005_node_path_lifecycle
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_node_feedback_votes"
down_revision = "0005_node_path_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "node_feedback_votes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("debate_id", sa.String(length=36), sa.ForeignKey("debates.id"), nullable=False),
        sa.Column("node_id", sa.String(length=36), sa.ForeignKey("nodes.id"), nullable=False),
        sa.Column(
            "scoring_result_id",
            sa.String(length=36),
            sa.ForeignKey("node_scoring_results.id"),
            nullable=True,
        ),
        sa.Column("user_identity_hash", sa.String(length=64), nullable=False),
        sa.Column("vote", sa.String(length=4), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("vote IN ('up', 'down')", name="ck_node_feedback_votes_vote"),
        sa.UniqueConstraint(
            "debate_id",
            "node_id",
            "user_identity_hash",
            name="ux_node_feedback_votes_current_identity",
        ),
    )
    op.create_index("ix_node_feedback_votes_debate_id", "node_feedback_votes", ["debate_id"])
    op.create_index("ix_node_feedback_votes_node_id", "node_feedback_votes", ["node_id"])
    op.create_index("ix_node_feedback_votes_scoring_result_id", "node_feedback_votes", ["scoring_result_id"])


def downgrade() -> None:
    op.drop_index("ix_node_feedback_votes_scoring_result_id", table_name="node_feedback_votes")
    op.drop_index("ix_node_feedback_votes_node_id", table_name="node_feedback_votes")
    op.drop_index("ix_node_feedback_votes_debate_id", table_name="node_feedback_votes")
    op.drop_table("node_feedback_votes")
