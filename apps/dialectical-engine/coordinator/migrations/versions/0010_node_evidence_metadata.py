"""Add Node.metadata JSON column for EVIDENCE node substrate.

Phase 7 Task 1: Node has no JSON-capable column today (re-confirmed: every
existing free-JSON column belongs to a different entity -- AnalyzerRun.output,
NodeScoringResult.result/.provider_metadata, ProvenanceRecord.metadata_json,
etc. -- none is unused/available on Node itself). Storing an EVIDENCE node's
`evidenceKind` classification (empirical/statistical/citation/anecdotal/
unclassified) requires a genuinely new, additive, nullable-safe column.
Modeled on 0009's inspector-guarded, idempotent style.

Column is named "metadata" at the DB layer (mirrors ProvenanceRecord's
`metadata_json -> "metadata"` mapped-name pattern, since `metadata` is a
reserved attribute name on SQLAlchemy declarative Base subclasses).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010_node_evidence_metadata"
down_revision = "0009_contract_keyed_cache_identity"
branch_labels = None
depends_on = None

TABLE_NAME = "nodes"
COLUMN_NAME = "metadata"


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    op.add_column(TABLE_NAME, sa.Column(COLUMN_NAME, sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if not _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        batch_op.drop_column(COLUMN_NAME)
