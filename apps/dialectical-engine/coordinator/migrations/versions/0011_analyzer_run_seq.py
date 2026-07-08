"""Add AnalyzerRun.seq monotonic tiebreak column + deterministic backfill.

Phase 11 Task 1: `analyzer_runs` has no column carrying monotonic ordering
semantics -- `id` is a random UUID4 (String(36) PK, non-sequential; SQLite
AUTOINCREMENT is illegal on a non-INTEGER PK and there is no native SQLite
sequence object), and `created_at` is coarse wall-clock (especially on
Windows). Two AnalyzerRun rows written in the same timestamp tick therefore
have no deterministic "latest" ordering today (confirmed flake root cause at
app/scoring/service.py's debate_scoring_payload query). `seq` is an
application-assigned monotonic integer (read MAX(seq)+1 under the process-
wide write lock at construction time, see app.models.entities.
next_analyzer_run_seq) that becomes the primary sort key at every "latest
AnalyzerRun" read site.

Modeled on 0010's inspector-guarded, idempotent style: existence-checked
add_column, then a one-time deterministic backfill for pre-existing rows
ordered by (created_at ASC, id ASC) so historical relative order is
preserved as best-effort (ties among pre-existing same-timestamp rows are
broken by id once, permanently, at migration time -- acceptable since this
only needs to happen once, not on every read).

Fix-wave addition (see task-11-1-report.md "Fix wave" section): also adds a
PARTIAL UNIQUE index on seq (WHERE seq IS NOT NULL). The application-level
race fix (app.models.entities.next_analyzer_run_seq now holds
app.core.write_lock's process-wide RLock across the MAX(seq) read AND the
row's db.flush(), not just the read) is what actually makes duplicate-seq
assignment race-free; this index is defense-in-depth belt-and-suspenders --
if that invariant is ever violated by a future call site that bypasses the
locked helper, a collision now fails loudly (IntegrityError) instead of
silently degrading back to the old (created_at, id) tie. Partial (not a
plain unique column) because legacy/not-yet-backfilled rows may still carry
seq=NULL and multiple NULLs must not collide under a NOT NULL-agnostic
UNIQUE constraint.

Migration 0011 was NOT applied to any dev database when this addition was
made -- the active dev DB (apps/dialectical-engine/.dialectical-dev/db.sqlite3)
IS alembic-stamped, but at 0009_contract_keyed_cache_identity (behind 0011),
and carries no seq column or ux_analyzer_runs_seq index; it will pick up this
edited 0011 on its next `alembic upgrade`. Editing this migration in place
(rather than adding a new revision) is therefore safe: it is uncommitted and
unreleased, so there is no deployed state that depends on 0011's original
shape.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_analyzer_run_seq"
down_revision = "0010_node_evidence_metadata"
branch_labels = None
depends_on = None

TABLE_NAME = "analyzer_runs"
COLUMN_NAME = "seq"
UNIQUE_INDEX_NAME = "ux_analyzer_runs_seq"


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _has_index(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if not _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        op.add_column(TABLE_NAME, sa.Column(COLUMN_NAME, sa.Integer(), nullable=True))

    # Deterministic backfill: only touch rows that don't already have a seq
    # (idempotent -- safe to run twice, matches the house pattern's
    # idempotency requirement even though add_column itself is guarded above).
    inspector = sa.inspect(bind)
    if not _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    rows = bind.execute(
        sa.text(f"SELECT id FROM {TABLE_NAME} WHERE seq IS NULL ORDER BY created_at ASC, id ASC")
    ).all()
    if rows:
        existing_max = bind.execute(sa.text(f"SELECT MAX(seq) FROM {TABLE_NAME}")).scalar()
        next_seq = (existing_max or 0) + 1
        for (row_id,) in rows:
            bind.execute(
                sa.text(f"UPDATE {TABLE_NAME} SET seq = :seq WHERE id = :id"),
                {"seq": next_seq, "id": row_id},
            )
            next_seq += 1

    # Partial UNIQUE index (existence-checked -- idempotent, matches the
    # house pattern). SQLite/Postgres both support a WHERE-qualified unique
    # index via this same op.create_index(..., sqlite_where=/postgresql_where=)
    # call; op.f() is intentionally not used since the name is explicit and
    # stable across dialects.
    inspector = sa.inspect(bind)
    if not _has_index(inspector, TABLE_NAME, UNIQUE_INDEX_NAME):
        op.create_index(
            UNIQUE_INDEX_NAME,
            TABLE_NAME,
            [COLUMN_NAME],
            unique=True,
            sqlite_where=sa.text(f"{COLUMN_NAME} IS NOT NULL"),
            postgresql_where=sa.text(f"{COLUMN_NAME} IS NOT NULL"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE_NAME):
        return
    if _has_index(inspector, TABLE_NAME, UNIQUE_INDEX_NAME):
        op.drop_index(UNIQUE_INDEX_NAME, table_name=TABLE_NAME)
    inspector = sa.inspect(bind)
    if not _has_column(inspector, TABLE_NAME, COLUMN_NAME):
        return
    with op.batch_alter_table(TABLE_NAME) as batch_op:
        batch_op.drop_column(COLUMN_NAME)
