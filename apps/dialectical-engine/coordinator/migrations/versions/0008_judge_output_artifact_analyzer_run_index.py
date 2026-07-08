from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008_judge_output_artifact_analyzer_run_index"
down_revision = "0007_judge_contract_identity"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_judge_output_artifacts_analyzer_run_id"
TABLE_NAME = "judge_output_artifacts"


def _index_exists(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME) or _index_exists(inspector, TABLE_NAME, INDEX_NAME):
        return
    op.create_index(INDEX_NAME, TABLE_NAME, ["analyzer_run_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME) or not _index_exists(inspector, TABLE_NAME, INDEX_NAME):
        return
    op.drop_index(INDEX_NAME, table_name=TABLE_NAME)
