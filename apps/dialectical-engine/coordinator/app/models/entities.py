from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, event, func, update
from sqlalchemy import UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.db import Base
from app.core.write_lock import hold_write_lock


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def uuid_str() -> str:
    return str(uuid.uuid4())


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class Debate(Base):
    __tablename__ = "debates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    root_node_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    synthesis_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    nodes: Mapped[list["Node"]] = relationship("Node", back_populates="debate", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship("Job", back_populates="debate", cascade="all, delete-orphan")


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    parent_id: Mapped[Optional[str]] = mapped_column(ForeignKey("nodes.id"), nullable=True, index=True)
    node_type: Mapped[str] = mapped_column(String(16), index=True)
    depth: Mapped[int] = mapped_column(Integer, default=0, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    active_generation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    path_status: Mapped[str] = mapped_column(String(24), default="active", index=True)
    stopping_status: Mapped[str] = mapped_column(String(24), default="active", index=True)
    stopping_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    materialized_path: Mapped[str] = mapped_column(Text, default="")
    # Phase 7 Task 1: additive JSON home for per-node metadata (e.g. an
    # EVIDENCE node's evidenceKind classification). Mapped-name is
    # `evidence_metadata` -> DB column "metadata" (mirrors
    # ProvenanceRecord.metadata_json's rename pattern, since `metadata` is a
    # reserved attribute name on SQLAlchemy declarative Base subclasses).
    # Nullable/default-safe; see migrations/versions/0010_node_evidence_metadata.py.
    evidence_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    debate: Mapped[Debate] = relationship("Debate", back_populates="nodes")
    parent: Mapped[Optional["Node"]] = relationship("Node", remote_side=[id])
    generations: Mapped[list["Generation"]] = relationship(
        "Generation", back_populates="node", cascade="all, delete-orphan"
    )


class Generation(Base):
    __tablename__ = "generations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), index=True)
    model_id: Mapped[str] = mapped_column(String(120), index=True)
    role: Mapped[str] = mapped_column(String(32), index=True)
    argument: Mapped[str] = mapped_column(Text, default="")
    prompt_version: Mapped[str] = mapped_column(String(40), default="v1")
    prompt_rendered: Mapped[str] = mapped_column(Text, default="")
    tokens_in: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    node: Mapped[Node] = relationship("Node", back_populates="generations")
    worker: Mapped["Worker"] = relationship("Worker")


Index(
    "ux_generations_active_per_node",
    Generation.node_id,
    unique=True,
    sqlite_where=Generation.is_active.is_(True),
)


class Synthesis(Base):
    __tablename__ = "syntheses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    strongest_pro: Mapped[str] = mapped_column(Text, default="")
    strongest_con: Mapped[str] = mapped_column(Text, default="")
    verdict: Mapped[str] = mapped_column(Text, default="")
    upstream_agent_output_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    analyzer_findings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    model_id: Mapped[str] = mapped_column(String(120), index=True)
    worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False)
    capabilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    status: Mapped[str] = mapped_column(String(24), default="online", index=True)
    current_job_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    node_id: Mapped[Optional[str]] = mapped_column(ForeignKey("nodes.id"), nullable=True, index=True)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    job_type: Mapped[str] = mapped_column(String(24), index=True)
    required_role: Mapped[str] = mapped_column(String(32), index=True)
    required_model: Mapped[str] = mapped_column(String(120), index=True)
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    worker_id: Mapped[Optional[str]] = mapped_column(ForeignKey("workers.id"), nullable=True, index=True)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(36), default=uuid_str, unique=True)
    stream_buffer: Mapped[str] = mapped_column(Text, default="")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    # How many of `attempts` ended in a timeout-class outcome (deadline expiry,
    # worker vanished/restarted). Nullable for legacy rows (additive ALTER
    # backfill leaves NULL); readers must treat NULL as 0.
    timeout_attempts: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    # W3: job-type-specific creation context (e.g. v2_expand's parent node id,
    # polarity, lens label, and decision reason). Nullable for legacy rows
    # (additive ALTER backfill leaves NULL); readers must treat NULL as {}.
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    debate: Mapped[Debate] = relationship("Debate", back_populates="jobs")


class DebateBranch(Base):
    __tablename__ = "debate_branches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    parent_branch_id: Mapped[Optional[str]] = mapped_column(ForeignKey("debate_branches.id"), nullable=True, index=True)
    root_node_id: Mapped[Optional[str]] = mapped_column(ForeignKey("nodes.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class SkillDefinition(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="provisional", index=True)
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reuse_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AgentDefinition(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="provisional", index=True)
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reuse_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AnalyzerRun(Base):
    __tablename__ = "analyzer_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    branch_id: Mapped[str] = mapped_column(ForeignKey("debate_branches.id"), index=True)
    analyzer_type: Mapped[str] = mapped_column(String(80), index=True)
    output: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="complete", index=True)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    # Phase 11 Task 1: application-assigned monotonic tiebreak. `id` is a
    # random UUID4 (non-sequential) and `created_at` is coarse wall-clock
    # (especially on Windows), so neither can deterministically order two
    # AnalyzerRun rows written in the same timestamp tick. `seq` is assigned
    # by next_analyzer_run_seq and is the primary sort key at every "latest
    # AnalyzerRun" read site. Nullable at the schema level only for legacy
    # pre-migration rows / SQLite ADD COLUMN safety -- every row written after
    # migration 0011 must carry a real integer seq.
    #
    # Fix-wave correction (see task-11-1-report.md "Fix wave" section): the
    # ORIGINAL docstring here claimed the MAX(seq)+1 read happened "under the
    # process-wide write lock" merely because callers invoked this function
    # before their surrounding flush_write/commit_write call. That claim was
    # FALSE -- flush_write/commit_write only wrap db.flush()/db.commit(); the
    # SELECT MAX(seq) executed during AnalyzerRun(...) construction, i.e.
    # entirely BEFORE the lock was ever acquired. Two concurrent FastAPI
    # BackgroundTasks threads (separate sessions, e.g. un-deduped scoring
    # jobs) could both read MAX=N and both proceed to commit seq=N+1,
    # silently degrading to the old (created_at, id) tie -- exactly the
    # failure mode this column exists to eliminate.
    #
    # Fixed by making next_analyzer_run_seq itself hold
    # app.core.write_lock.hold_write_lock() across BOTH the MAX(seq) read AND
    # this row's db.add()+db.flush() (see that function's body/docstring) --
    # not just around the read, which would still leave a read/commit TOCTOU
    # window open for a second thread. Belt-and-suspenders: seq also carries a
    # partial UNIQUE index (ux_analyzer_runs_seq, WHERE seq IS NOT NULL,
    # migration 0011) so that if this invariant is ever violated by a future
    # call site that bypasses next_analyzer_run_seq's locked flush, the
    # collision fails loudly (IntegrityError) instead of silently degrading.
    seq: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)


def next_analyzer_run_seq(db: Session, run: "AnalyzerRun") -> int:
    """Assign the next monotonic seq value to `run` and flush it atomically.

    This does three things as ONE critical section under
    app.core.write_lock.hold_write_lock() (the same process-wide RLock
    flush_write/commit_write use -- RLock is reentrant, so this function's
    acquisition plus the caller's later flush_write/commit_write on the same
    thread is safe, not a deadlock):

      1. read current_max = MAX(seq)
      2. set run.seq = current_max + 1, db.add(run)
      3. db.flush() -- actually issue the INSERT before releasing the lock

    Lock-around-the-read ALONE would be unsound: thread B could still acquire
    the lock, read MAX, and commit AFTER thread A released the lock following
    its own read but BEFORE thread A's row was actually written -- the read
    and the write must be atomic together, not just the read. Holding the
    lock through db.flush() here closes that window: while thread A holds the
    lock, thread B's call to this same function blocks entirely (it cannot
    even perform its MAX(seq) read) until thread A's row has already been
    flushed to the database, so thread B's subsequent MAX(seq) read is
    guaranteed to observe thread A's row.

    Returns the assigned seq value for convenience (callers may still want it
    for logging), but the primary effect is the mutation of `run` in place.
    """
    with hold_write_lock():
        current_max = db.scalar(select(func.max(AnalyzerRun.seq)))
        run.seq = (current_max or 0) + 1
        db.add(run)
        db.flush()
    return run.seq


# Fix-wave addition (Phase 11 Task 1 fix wave, see task-11-1-report.md):
# defense-in-depth partial UNIQUE index -- the actual race-freedom guarantee
# comes from next_analyzer_run_seq holding app.core.write_lock across the
# read+flush (see that function's docstring), not from this index. But if
# that invariant is ever violated by a future call site, this makes the
# violation fail loudly (IntegrityError) instead of silently degrading back
# to the (created_at, id) tie. Partial (sqlite_where) because legacy rows
# may carry seq=NULL and NULLs must not collide against each other. Mirrors
# migrations/versions/0011_analyzer_run_seq.py's ux_analyzer_runs_seq index
# -- also registered in app.core.db.init_db's explicit index-creation
# allowlist for the create_all() bootstrap path.
Index(
    "ux_analyzer_runs_seq",
    AnalyzerRun.seq,
    unique=True,
    sqlite_where=AnalyzerRun.seq.is_not(None),
)


class EvidenceLifecycleSnapshot(Base):
    """Immutable evidence input presented to the lifecycle v1 mapper.

    ``payload`` preserves the exact JSON-like mapper envelope.  The scalar
    columns are an audit/query projection only; they never repair malformed
    or legacy payload data.  ``identity_sha256`` represents the contract's
    full evidence/run identity and makes repeated byte-equivalent writes
    idempotent while forcing conflicting content to fail loudly.
    """

    __tablename__ = "evidence_lifecycle_snapshots"
    __table_args__ = (
        CheckConstraint(
            "sequence IS NULL OR sequence > 0",
            name="ck_evidence_lifecycle_snapshots_positive_sequence",
        ),
        Index("ix_evidence_lifecycle_snapshots_debate_id", "debate_id"),
        Index("ix_evidence_lifecycle_snapshots_node_id", "node_id"),
        Index("ix_evidence_lifecycle_snapshots_evidence_node_id", "evidence_node_id"),
        Index("ix_evidence_lifecycle_snapshots_verification_status", "verification_status"),
        Index("ix_evidence_lifecycle_snapshots_created_at", "created_at"),
        Index(
            "ux_evidence_lifecycle_snapshots_identity",
            "identity_sha256",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    schema_version: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    debate_id: Mapped[str] = mapped_column(String(36), nullable=False)
    node_id: Mapped[str] = mapped_column(String(36), nullable=False)
    evidence_node_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    claim_node_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    generation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    evidence_kind: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    availability: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    verification_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    unavailability_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_kind: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    source_record_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    run_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    producer: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    observed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    recorded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    payload_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    identity_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class LifecycleDecisionRecord(Base):
    """Immutable, redacted audit record for one lifecycle evaluation."""

    __tablename__ = "lifecycle_decision_records"
    __table_args__ = (
        CheckConstraint(
            "score_run_sequence IS NULL OR score_run_sequence > 0",
            name="ck_lifecycle_decision_records_positive_score_sequence",
        ),
        CheckConstraint(
            "child_spawn_count >= 0",
            name="ck_lifecycle_decision_records_nonnegative_child_count",
        ),
        Index("ix_lifecycle_decision_records_debate_id", "debate_id"),
        Index("ix_lifecycle_decision_records_node_id", "node_id"),
        Index("ix_lifecycle_decision_records_decision", "decision"),
        Index("ix_lifecycle_decision_records_created_at", "created_at"),
        Index(
            "ux_lifecycle_decision_records_idempotency_key",
            "idempotency_key",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    schema_version: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    snapshot_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    debate_id: Mapped[str] = mapped_column(String(36), nullable=False)
    node_id: Mapped[str] = mapped_column(String(36), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    stopping_reason: Mapped[str] = mapped_column(Text, nullable=False)
    path_status: Mapped[str] = mapped_column(String(24), nullable=False)
    stopping_status: Mapped[str] = mapped_column(String(24), nullable=False)
    input_state: Mapped[str] = mapped_column(String(32), nullable=False)
    reason_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    score_availability: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    score_freshness: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    evidence_availability: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    evidence_freshness: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    current_score_input_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    scoring_contract_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    score_record_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    score_run_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    score_run_sequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    evidence_snapshot_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    decision_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    child_spawn_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class CapabilityMatch(Base):
    __tablename__ = "capability_matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    branch_id: Mapped[str] = mapped_column(ForeignKey("debate_branches.id"), index=True)
    capability_kind: Mapped[str] = mapped_column(String(16), index=True)
    capability_id: Mapped[str] = mapped_column(String(36), index=True)
    selection_reason: Mapped[str] = mapped_column(String(32), index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AgentRun(Base):
    __tablename__ = "agent_outputs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    branch_id: Mapped[str] = mapped_column(ForeignKey("debate_branches.id"), index=True)
    skill_id: Mapped[Optional[str]] = mapped_column(ForeignKey("skills.id"), nullable=True, index=True)
    agent_id: Mapped[Optional[str]] = mapped_column(ForeignKey("agents.id"), nullable=True, index=True)
    agent_definition_id: Mapped[Optional[str]] = mapped_column(ForeignKey("agents.id"), nullable=True, index=True)
    selected_skill_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    role: Mapped[str] = mapped_column(String(120), default="")
    lens: Mapped[str] = mapped_column(String(120), default="")
    prompt_input: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    job_id: Mapped[Optional[str]] = mapped_column(ForeignKey("jobs.id"), nullable=True, index=True)
    worker_id: Mapped[Optional[str]] = mapped_column(ForeignKey("workers.id"), nullable=True, index=True)
    model_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    analyzer_run_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    pros: Mapped[list[str]] = mapped_column(JSON, default=list)
    cons: Mapped[list[str]] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


SkillCapability = SkillDefinition
AgentCapability = AgentDefinition
AgentOutput = AgentRun


class ProvenanceRecord(Base):
    __tablename__ = "provenance_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    branch_id: Mapped[Optional[str]] = mapped_column(ForeignKey("debate_branches.id"), nullable=True, index=True)
    artifact_kind: Mapped[str] = mapped_column(String(40), index=True)
    artifact_id: Mapped[str] = mapped_column(String(36), index=True)
    model_id: Mapped[str] = mapped_column(String(120), default="")
    worker_id: Mapped[str] = mapped_column(String(120), default="")
    prompt_id: Mapped[str] = mapped_column(String(120), default="")
    job_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class JudgeOutputArtifact(Base):
    __tablename__ = "judge_output_artifacts"
    __table_args__ = (
        CheckConstraint("parse_status IN ('available', 'unavailable')", name="ck_judge_output_parse_status"),
        UniqueConstraint(
            "debate_id",
            "node_id",
            "input_hash",
            "judge_role",
            "provider",
            "model",
            "raw_output_sha256",
            name="ux_judge_output_artifacts_identity",
        ),
        Index("ix_judge_output_artifacts_debate_id", "debate_id"),
        Index("ix_judge_output_artifacts_node_id", "node_id"),
        Index("ix_judge_output_artifacts_job_id", "job_id"),
        Index("ix_judge_output_artifacts_analyzer_run_id", "analyzer_run_id"),
        Index("ix_judge_output_artifacts_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), nullable=False)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), nullable=False)
    job_id: Mapped[Optional[str]] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    analyzer_run_id: Mapped[Optional[str]] = mapped_column(ForeignKey("analyzer_runs.id"), nullable=True)
    input_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    judge_role: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(120), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    judge_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    judge_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contract_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_version: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    request_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    raw_output: Mapped[str] = mapped_column(Text, nullable=False)
    raw_output_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parse_status: Mapped[str] = mapped_column(String(24), nullable=False)
    parse_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assessment: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    provider_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


@event.listens_for(AnalyzerRun, "after_insert")
def _link_judge_artifacts_to_analyzer_run(_mapper, connection, target: AnalyzerRun) -> None:
    """Link judge artifacts to the analyzer run that actually produced them.

    Provenance precision: linking requires the run's provenance to name the
    scoring job (and, when recorded, the produced node ids). A run without job
    scoping links nothing — old or interrupted-job artifacts must never be
    absorbed by a later run (that would be false provenance).
    """
    if target.analyzer_type != "node_scoring" or target.status != "complete":
        return
    provenance = target.provenance if isinstance(target.provenance, dict) else {}
    if provenance.get("scoring_source") != "judge_outputs":
        return
    job_id = provenance.get("job_id")
    if not isinstance(job_id, str) or not job_id:
        return
    conditions = [
        JudgeOutputArtifact.debate_id == target.debate_id,
        JudgeOutputArtifact.analyzer_run_id.is_(None),
        JudgeOutputArtifact.job_id == job_id,
    ]
    node_ids = provenance.get("node_ids")
    if isinstance(node_ids, list) and node_ids:
        conditions.append(JudgeOutputArtifact.node_id.in_([n for n in node_ids if isinstance(n, str)]))
    connection.execute(
        update(JudgeOutputArtifact).where(*conditions).values(analyzer_run_id=target.id)
    )


class NodeScoringResult(Base):
    __tablename__ = "node_scoring_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), index=True)
    input_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    judge_role: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(120), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    judge_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    judge_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contract_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="unavailable", index=True)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


Index(
    "ux_node_scoring_results_cache_identity",
    NodeScoringResult.debate_id,
    NodeScoringResult.node_id,
    NodeScoringResult.input_hash,
    NodeScoringResult.judge_role,
    NodeScoringResult.provider,
    NodeScoringResult.model,
    NodeScoringResult.contract_hash,
    unique=True,
)


class NodeFeedbackVote(Base):
    __tablename__ = "node_feedback_votes"
    __table_args__ = (
        CheckConstraint("vote IN ('up', 'down')", name="ck_node_feedback_votes_vote"),
        UniqueConstraint(
            "debate_id",
            "node_id",
            "user_identity_hash",
            name="ux_node_feedback_votes_current_identity",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    debate_id: Mapped[str] = mapped_column(ForeignKey("debates.id"), index=True)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), index=True)
    scoring_result_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("node_scoring_results.id"), nullable=True, index=True
    )
    user_identity_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    vote: Mapped[str] = mapped_column(String(4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    @staticmethod
    def hash_user_identity(raw_user_token: str) -> str:
        token = raw_user_token.strip()
        if not token:
            raise ValueError("raw_user_token must not be empty")
        return hashlib.sha256(f"debateai-scoring-feedback:{token}".encode("utf-8")).hexdigest()

    @classmethod
    def upsert(
        cls,
        db: Session,
        *,
        debate_id: str,
        node_id: str,
        raw_user_token: str,
        vote: str,
        scoring_result_id: str | None = None,
    ) -> "NodeFeedbackVote":
        if vote not in {"up", "down"}:
            raise ValueError("vote must be 'up' or 'down'")
        user_identity_hash = cls.hash_user_identity(raw_user_token)
        existing = db.scalars(
            select(cls).where(
                cls.debate_id == debate_id,
                cls.node_id == node_id,
                cls.user_identity_hash == user_identity_hash,
            )
        ).one_or_none()
        if existing is None:
            existing = cls(
                debate_id=debate_id,
                node_id=node_id,
                user_identity_hash=user_identity_hash,
                vote=vote,
                scoring_result_id=scoring_result_id,
            )
            db.add(existing)
            return existing
        existing.vote = vote
        if scoring_result_id is not None:
            existing.scoring_result_id = scoring_result_id
        existing.updated_at = now_utc()
        return existing
