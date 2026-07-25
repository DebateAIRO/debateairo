"""Add lifecycle_decision_records.frontier_priority: the impact x uncertainty
x dispersion rank the adaptive dispatcher gave a decision, recorded so the
ORDER in which the frontier was spent is auditable after the fact (P1 Task
6). Additive and nullable-safe: historical rows -- and every row written
while DIALECTICAL_ADAPTIVE_EXPANSION is off, which is the default -- honestly
carry no rank. Modeled on 0016's inspector-guarded, idempotent style.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017_lifecycle_frontier_priority"
down_revision = "0016_job_last_worker"
branch_labels = None
depends_on = None

TABLE_NAME = "lifecycle_decision_records"
COLUMN_NAME = "frontier_priority"


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    op.add_column(TABLE_NAME, sa.Column(COLUMN_NAME, sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if not _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        batch_op.drop_column(COLUMN_NAME)
