"""Add signal_class / config_override / dispatch_outcome to decision records.

W4 (adaptive expansion): every lifecycle decision is structurally classified
as "categorical" or "scalar" grounding; only categorical decisions may steer
real expansion work. All three columns are additive and nullable -- historical
rows honestly carry no classification (NULL reads as scalar, fail-closed, at
the dispatch boundary) and are never backfilled or reinterpreted.
Modeled on 0010's inspector-guarded, idempotent style.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014_lifecycle_decision_signal_class"
down_revision = "0013_lifecycle_decision_records"
branch_labels = None
depends_on = None

TABLE_NAME = "lifecycle_decision_records"
COLUMNS = (
    ("signal_class", sa.String(length=16)),
    ("config_override", sa.String(length=120)),
    ("dispatch_outcome", sa.String(length=40)),
)


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    for column_name, column_type in COLUMNS:
        if _has_column(inspector, TABLE_NAME, column_name):
            continue
        op.add_column(TABLE_NAME, sa.Column(column_name, column_type, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        for column_name, _ in COLUMNS:
            if _has_column(inspector, TABLE_NAME, column_name):
                batch_op.drop_column(column_name)
