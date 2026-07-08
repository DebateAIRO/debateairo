"""Contract-keyed scoring cache identity.

Extends ux_node_scoring_results_cache_identity to include contract_hash so a
re-score under a changed judge contract creates a new row instead of
overwriting the old contract's row (immutable-per-contract cache).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_contract_keyed_cache_identity"
down_revision = "0008_judge_output_artifact_analyzer_run_index"
branch_labels = None
depends_on = None

INDEX_NAME = "ux_node_scoring_results_cache_identity"
TABLE_NAME = "node_scoring_results"
OLD_COLUMNS = ["debate_id", "node_id", "input_hash", "judge_role", "provider", "model"]
NEW_COLUMNS = [*OLD_COLUMNS, "contract_hash"]


def _index_columns(inspector: sa.Inspector) -> list[str] | None:
    for index in inspector.get_indexes(TABLE_NAME):
        if index["name"] == INDEX_NAME:
            return list(index["column_names"])
    return None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    current = _index_columns(inspector)
    if current == NEW_COLUMNS:
        return
    if current is not None:
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)
    op.create_index(INDEX_NAME, TABLE_NAME, NEW_COLUMNS, unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    current = _index_columns(inspector)
    if current == OLD_COLUMNS:
        return
    if current is not None:
        op.drop_index(INDEX_NAME, table_name=TABLE_NAME)
    # Restoring the 6-column unique index can fail if multiple contract rows
    # now share the 6-column identity; that is expected — downgrading past a
    # contract-keyed cache requires resolving those rows first (never deleted
    # automatically here).
    op.create_index(INDEX_NAME, TABLE_NAME, OLD_COLUMNS, unique=True)
