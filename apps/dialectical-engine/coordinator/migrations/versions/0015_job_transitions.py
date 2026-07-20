"""Add the append-only job_transitions ledger table.

W5b (ops floor): one row per job state change (create/claim/complete/fail/
requeue/terminalize plus the scoring-lifecycle channels), written best-effort
at the existing transition points. Purely additive: no existing table or row
is touched, and the ledger deliberately carries NO foreign keys so a
constraint error can never roll back the real transition it describes.
Modeled on 0013's inspector-guarded, idempotent style.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_job_transitions"
down_revision = "0014_lifecycle_decision_signal_class"
branch_labels = None
depends_on = None

TABLE_NAME = "job_transitions"


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table(TABLE_NAME):
        return
    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("debate_id", sa.String(length=36), nullable=True),
        sa.Column("job_type", sa.String(length=24), nullable=True),
        sa.Column("from_status", sa.String(length=24), nullable=True),
        sa.Column("to_status", sa.String(length=24), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("channel", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_job_transitions_job_id", TABLE_NAME, ["job_id"])
    op.create_index("ix_job_transitions_debate_id", TABLE_NAME, ["debate_id"])
    op.create_index("ix_job_transitions_created_at", TABLE_NAME, ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(TABLE_NAME):
        return
    op.drop_table(TABLE_NAME)
