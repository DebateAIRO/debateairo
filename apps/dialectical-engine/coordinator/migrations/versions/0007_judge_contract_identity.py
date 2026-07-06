"""Add judge contract identity to judge artifacts and scoring cache rows."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_judge_contract_identity"
down_revision = "0006_node_feedback_votes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("judge_output_artifacts", "node_scoring_results"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("judge_id", sa.String(120), nullable=True))
            batch.add_column(sa.Column("judge_version", sa.String(32), nullable=True))
            batch.add_column(sa.Column("contract_hash", sa.String(128), nullable=True))
    op.create_index(
        "ix_node_scoring_results_contract_hash",
        "node_scoring_results",
        ["contract_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_node_scoring_results_contract_hash", table_name="node_scoring_results")
    for table in ("judge_output_artifacts", "node_scoring_results"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("contract_hash")
            batch.drop_column("judge_version")
            batch.drop_column("judge_id")
