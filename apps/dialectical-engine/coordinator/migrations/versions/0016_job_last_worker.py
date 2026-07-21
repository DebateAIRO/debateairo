"""Add jobs.last_worker_id: remember the most recent claimant across a
release so a worker that finishes late can re-adopt its claim (late-
completion rescue). Additive and nullable-safe: historical rows honestly
carry no memory of a prior claimant. Modeled on 0010's inspector-guarded,
idempotent style.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_job_last_worker"
down_revision = "0015_job_transitions"
branch_labels = None
depends_on = None

TABLE_NAME = "jobs"
COLUMN_NAME = "last_worker_id"


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    op.add_column(TABLE_NAME, sa.Column(COLUMN_NAME, sa.String(length=36), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if not _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        batch_op.drop_column(COLUMN_NAME)
