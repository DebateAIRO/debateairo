"""add node path lifecycle metadata

Revision ID: 0005_node_path_lifecycle
Revises: 0004_node_scoring_results
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_node_path_lifecycle"
down_revision = "0004_node_scoring_results"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "nodes",
        sa.Column("path_status", sa.String(length=24), nullable=False, server_default="active"),
    )
    op.add_column(
        "nodes",
        sa.Column("stopping_status", sa.String(length=24), nullable=False, server_default="active"),
    )
    op.add_column("nodes", sa.Column("stopping_reason", sa.Text(), nullable=True))
    op.create_index("ix_nodes_path_status", "nodes", ["path_status"])
    op.create_index("ix_nodes_stopping_status", "nodes", ["stopping_status"])


def downgrade() -> None:
    op.drop_index("ix_nodes_stopping_status", table_name="nodes")
    op.drop_index("ix_nodes_path_status", table_name="nodes")
    op.drop_column("nodes", "stopping_reason")
    op.drop_column("nodes", "stopping_status")
    op.drop_column("nodes", "path_status")
