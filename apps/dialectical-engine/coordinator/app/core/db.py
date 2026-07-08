from __future__ import annotations

from collections.abc import Iterator
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import ensure_home, load_settings


class Base(DeclarativeBase):
    pass


_settings = None
_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine, _session_factory, _settings
    if _engine is None:
        _settings = load_settings()
        ensure_home(_settings)
        connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
        _engine = create_engine(_settings.database_url, connect_args=connect_args, future=True)
        _session_factory = sessionmaker(bind=_engine, autoflush=False, autocommit=False, future=True)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    if _session_factory is None:
        get_engine()
    assert _session_factory is not None
    return _session_factory


def is_initialized() -> bool:
    return _engine is not None


class _LazyEngine:
    def __getattr__(self, name: str) -> Any:
        return getattr(get_engine(), name)

    def __repr__(self) -> str:
        return repr(get_engine()) if is_initialized() else "<LazyEngine uninitialized>"


class _LazySessionLocal:
    def __call__(self, **kwargs: Any) -> Session:
        return get_session_factory()(**kwargs)

    def __getattr__(self, name: str) -> Any:
        return getattr(get_session_factory(), name)


engine = _LazyEngine()
SessionLocal = _LazySessionLocal()


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
    del connection_record
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


def init_db() -> None:
    from app.models import entities  # noqa: F401

    db_engine = get_engine()
    Base.metadata.create_all(bind=db_engine)
    backfill_existing_schema()
    for table in Base.metadata.tables.values():
        for index in table.indexes:
            if index.name in {
                "ux_generations_active_per_node",
                "ix_judge_output_artifacts_analyzer_run_id",
                # Fix-wave addition (Phase 11 Task 1 fix wave): partial
                # UNIQUE index backing next_analyzer_run_seq's
                # defense-in-depth loudness guarantee -- see
                # app.models.entities.AnalyzerRun.seq and
                # migrations/versions/0011_analyzer_run_seq.py.
                "ux_analyzer_runs_seq",
            }:
                index.create(bind=db_engine, checkfirst=True)


def _sqlite_column_names(connection, table_name: str) -> set[str]:
    return {row._mapping["name"] for row in connection.execute(text(f"PRAGMA table_info({table_name})"))}


def _capability_definition(row: dict[str, object], kind: str, legacy_json_column: str) -> str:
    raw_definition = row.get("definition") or row.get(legacy_json_column)
    if isinstance(raw_definition, dict):
        return json.dumps(raw_definition)
    if isinstance(raw_definition, str) and raw_definition.strip():
        try:
            json.loads(raw_definition)
        except json.JSONDecodeError:
            pass
        else:
            return raw_definition
    fallback = {
        "kind": kind,
        "name": row.get("name") or row.get("key") or f"Legacy {kind.title()}",
        "legacy": {
            "key": row.get("key"),
            "family": row.get("family"),
            "slot_type": row.get("slot_type"),
            "raw_definition": raw_definition,
        },
    }
    return json.dumps(fallback)


def _rebuild_sqlite_capability_table(connection, table_name: str, kind: str, legacy_json_column: str) -> None:
    table_names = set(inspect(connection).get_table_names())
    if table_name not in table_names:
        return
    columns = _sqlite_column_names(connection, table_name)
    v2_columns = {"id", "definition", "status", "quality_score", "reuse_count", "last_used_at", "created_at"}
    legacy_columns = {"key", "name", "family", "slot_type", legacy_json_column, "usage_count"}
    if v2_columns <= columns and columns.isdisjoint(legacy_columns):
        return

    rows = [dict(row) for row in connection.execute(text(f"SELECT * FROM {table_name}")).mappings().all()]
    temp_table = f"{table_name}_v2_rebuild"
    connection.execute(text(f"DROP TABLE IF EXISTS {temp_table}"))
    connection.execute(
        text(
            f"""
            CREATE TABLE {temp_table} (
                id VARCHAR(36) PRIMARY KEY,
                definition JSON NOT NULL,
                status VARCHAR(24) NOT NULL,
                quality_score FLOAT,
                reuse_count INTEGER NOT NULL,
                last_used_at DATETIME,
                created_at DATETIME NOT NULL
            )
            """
        )
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for row in rows:
        connection.execute(
            text(
                f"""
                INSERT INTO {temp_table} (
                    id, definition, status, quality_score, reuse_count, last_used_at, created_at
                )
                VALUES (
                    :id, :definition, :status, :quality_score, :reuse_count, :last_used_at, :created_at
                )
                """
            ),
            {
                "id": row.get("id"),
                "definition": _capability_definition(row, kind, legacy_json_column),
                "status": row.get("status") or "provisional",
                "quality_score": row.get("quality_score"),
                "reuse_count": (
                    row.get("reuse_count") if row.get("reuse_count") is not None else row.get("usage_count") or 0
                ),
                "last_used_at": row.get("last_used_at"),
                "created_at": row.get("created_at") or now,
            },
        )
    connection.execute(text(f"DROP TABLE {table_name}"))
    connection.execute(text(f"ALTER TABLE {temp_table} RENAME TO {table_name}"))
    connection.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_status ON {table_name} (status)"))


def backfill_existing_schema() -> None:
    additions_by_table = {
        "syntheses": {
            "upstream_agent_output_ids": "JSON",
            "analyzer_findings": "JSON",
            "provenance": "JSON",
        },
        "debate_branches": {
            "debate_id": "VARCHAR(36)",
            "parent_branch_id": "VARCHAR(36)",
            "root_node_id": "VARCHAR(36)",
            "status": "VARCHAR(24)",
            "created_at": "DATETIME",
        },
        "skills": {
            "definition": "JSON",
            "status": "VARCHAR(24)",
            "quality_score": "FLOAT",
            "reuse_count": "INTEGER",
            "last_used_at": "DATETIME",
            "updated_at": "DATETIME",
            "created_at": "DATETIME",
        },
        "agents": {
            "definition": "JSON",
            "status": "VARCHAR(24)",
            "quality_score": "FLOAT",
            "reuse_count": "INTEGER",
            "last_used_at": "DATETIME",
            "updated_at": "DATETIME",
            "created_at": "DATETIME",
        },
        "analyzer_runs": {
            "debate_id": "VARCHAR(36)",
            "branch_id": "VARCHAR(36)",
            "analyzer_type": "VARCHAR(80)",
            "output": "JSON",
            "status": "VARCHAR(24)",
            "provenance": "JSON",
            "created_at": "DATETIME",
            "seq": "INTEGER",
        },
        "capability_matches": {
            "debate_id": "VARCHAR(36)",
            "branch_id": "VARCHAR(36)",
            "capability_kind": "VARCHAR(16)",
            "capability_id": "VARCHAR(36)",
            "selection_reason": "VARCHAR(32)",
            "score": "INTEGER",
            "created_at": "DATETIME",
        },
        "agent_outputs": {
            "debate_id": "VARCHAR(36)",
            "branch_id": "VARCHAR(36)",
            "skill_id": "VARCHAR(36)",
            "agent_id": "VARCHAR(36)",
            "agent_definition_id": "VARCHAR(36)",
            "selected_skill_ids": "JSON",
            "role": "VARCHAR(120)",
            "lens": "VARCHAR(120)",
            "prompt_input": "JSON",
            "output": "JSON",
            "status": "VARCHAR(24)",
            "job_id": "VARCHAR(36)",
            "worker_id": "VARCHAR(36)",
            "model_id": "VARCHAR(120)",
            "analyzer_run_ids": "JSON",
            "pros": "JSON",
            "cons": "JSON",
            "summary": "TEXT",
            "confidence": "INTEGER",
            "provenance": "JSON",
            "updated_at": "DATETIME",
            "created_at": "DATETIME",
        },
        "provenance_records": {
            "debate_id": "VARCHAR(36)",
            "branch_id": "VARCHAR(36)",
            "artifact_kind": "VARCHAR(40)",
            "artifact_id": "VARCHAR(36)",
            "model_id": "VARCHAR(120)",
            "worker_id": "VARCHAR(120)",
            "prompt_id": "VARCHAR(120)",
            "job_id": "VARCHAR(36)",
            "metadata": "JSON",
            "created_at": "DATETIME",
        },
        "node_scoring_results": {
            "debate_id": "VARCHAR(36)",
            "node_id": "VARCHAR(36)",
            "input_hash": "VARCHAR(128)",
            "judge_role": "VARCHAR(64)",
            "provider": "VARCHAR(120)",
            "model": "VARCHAR(120)",
            "provider_metadata": "JSON",
            "status": "VARCHAR(24)",
            "result": "JSON",
            "created_at": "DATETIME",
            "updated_at": "DATETIME",
        },
        "nodes": {
            "metadata": "JSON",
        },
    }
    db_engine = get_engine()
    with db_engine.connect() as connection:
        sqlite_rebuild = db_engine.dialect.name == "sqlite"
        if sqlite_rebuild:
            connection.execute(text("PRAGMA foreign_keys=OFF"))
            connection.commit()
        try:
            with connection.begin():
                if sqlite_rebuild:
                    _rebuild_sqlite_capability_table(connection, "skills", "skill", "skill_json")
                    _rebuild_sqlite_capability_table(connection, "agents", "agent", "agent_json")

                inspector = inspect(connection)
                table_names = set(inspector.get_table_names())
                for table_name, additions in additions_by_table.items():
                    if table_name not in table_names:
                        continue
                    columns = {column["name"] for column in inspector.get_columns(table_name)}
                    for column, column_type in additions.items():
                        if column not in columns:
                            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column} {column_type}"))
        finally:
            if sqlite_rebuild:
                connection.execute(text("PRAGMA foreign_keys=ON"))
                connection.commit()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
