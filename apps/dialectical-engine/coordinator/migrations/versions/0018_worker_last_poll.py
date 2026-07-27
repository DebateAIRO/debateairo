"""Add workers.last_poll_at: work-loop liveness, stamped only by poll/claim
contact (orchestrator.mark_worker_seen), never by heartbeats. Heartbeats run
on an independent thread in loop workers, so `last_seen` cannot distinguish a
live process from a live work loop -- the 2026-07-26 wedge heartbeated for
18 h while claiming nothing. The pending watchdog keys capability liveness on
this column. Additive and nullable-safe: historical rows honestly carry no
poll history. Modeled on 0016's inspector-guarded, idempotent style.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0018_worker_last_poll"
down_revision = "0017_lifecycle_frontier_priority"
branch_labels = None
depends_on = None

TABLE_NAME = "workers"
COLUMN_NAME = "last_poll_at"


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    op.add_column(TABLE_NAME, sa.Column(COLUMN_NAME, sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if not _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        batch_op.drop_column(COLUMN_NAME)
