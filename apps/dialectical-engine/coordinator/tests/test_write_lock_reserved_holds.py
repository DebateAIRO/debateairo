"""A write primitive must never hand back SQLite's RESERVED writer while the
process write lock is free.

THIS IS A SECOND INVERSION, distinct from the pool one da3a566 fixed.

`flush_write` releases the RLock but NOT SQLite's RESERVED writer. A session that
flushed and later commits therefore orders the two resources RESERVED -> RLock.
Any thread that takes the RLock and then touches SQLite orders them
RLock -> RESERVED. Two opposite orders again, over a different pair, and
`busy_timeout=30000` is once more the only thing that breaks it:

  * thread A flushes under the lock, releases the lock, keeps RESERVED, and goes
    on reading;
  * thread B takes the RLock and commits ORM-pending work -- the UPDATE is
    emitted by commit(), i.e. inside the lock -- and blocks on A's RESERVED;
  * A finishes reading and calls commit_write, which needs the RLock B is
    sitting on. Neither can proceed until B burns its full busy_timeout and dies
    "database is locked", having held the lock the whole time.

LIVE EVIDENCE (coordinator PID 33417, started 2026-07-26 21:52:19, i.e. running
da3a566). Three post-restart victims, all dying at write_lock.py:85 (`db.commit()`
inside commit_write) and so holding the RLock:

    app/api/workers.py:161 poll -> orchestrator.py:1268 claim_pending_job
        -> app/core/write_lock.py:85 commit_write      UPDATE workers SET last_seen
    app/api/workers.py:150 heartbeat
        -> app/core/write_lock.py:85 commit_write      UPDATE jobs SET deadline

with ZERO `QueuePool limit` errors after the restart and only 9 of 15 pool file
descriptors in use -- so the pool was never the constraint and the inversion
da3a566 fixed is not what produced them. The `UPDATE jobs SET deadline` victim is
a lease refresh for the very job the LM Studio worker then had requeued out from
under it and re-claimed three times: these victims livelock real work.

`claim_pending_job` was the holder. Its `flush_write` took RESERVED and held it
across the pending-jobs SELECT and the whole `worker_can_claim_job` candidate
scan with the RLock free. The hold does not need to be long -- any overlap with
another writer's commit costs that writer a full busy_timeout.
"""
from __future__ import annotations

from datetime import timedelta

from app.models.entities import Debate, Job, Worker, now_utc
from app.core.auth import hash_token
from app.services import orchestrator
from app.services.orchestrator import claim_pending_job


def _online_worker(db) -> Worker:
    worker = Worker(
        name="reserved-probe",
        token_hash=hash_token("reserved-probe-token"),
        capabilities=["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def _pending_job(db, debate: Debate) -> Job:
    job = Job(
        debate_id=debate.id,
        job_type="v2_pov",
        required_role="proposer",
        required_model="mock-local",
        status="pending",
        deadline=now_utc() + timedelta(minutes=10),
    )
    db.add(job)
    db.commit()
    return job


def test_claim_pending_job_holds_no_writer_across_the_candidate_scan(
    db, independent_writer_can_commit, monkeypatch
) -> None:
    """RED before the fix: `flush_write` leaves RESERVED held with the lock free
    for the whole candidate scan, so an independent connection cannot commit.

    Probed at the connection level, which is the only honest probe: the question
    is not whether SQLAlchemy thinks a transaction is open, it is whether the
    rest of the coordinator -- worker heartbeats, lease refreshes -- can still
    write. `independent_writer_can_commit` pins a low busy_timeout on its own
    connection so a held writer fails it in milliseconds.
    """

    debate = Debate(topic="reserved-hold probe", status="generating", config={})
    db.add(debate)
    db.commit()
    worker = _online_worker(db)
    _pending_job(db, debate)
    # The production trigger for pending work at the flush: an expired pending
    # job whose required_model has no capable online worker makes
    # reroute_unavailable_pending_jobs rewrite required_model/deadline, and
    # those dirty rows are what flush_write turns into a held RESERVED writer.
    # Frequent on this deployment, where jobs time out and workers drop out.
    stranded = Job(
        debate_id=debate.id,
        job_type="v2_pov",
        required_role="proposer",
        required_model="model-with-no-online-worker",
        status="pending",
        deadline=now_utc() - timedelta(minutes=5),
    )
    db.add(stranded)
    db.commit()

    observed: list[bool] = []
    real_worker_can_claim_job = orchestrator.worker_can_claim_job

    def probing_worker_can_claim_job(session, worker_arg, candidate, now):
        # Mid-scan: exactly where claim_pending_job used to sit on RESERVED.
        observed.append(independent_writer_can_commit())
        return real_worker_can_claim_job(session, worker_arg, candidate, now)

    monkeypatch.setattr(orchestrator, "worker_can_claim_job", probing_worker_can_claim_job)

    claim_pending_job(db, worker)

    assert observed, "the candidate scan never ran; the probe is not exercising the seam"
    assert all(observed), (
        "claim_pending_job held SQLite's RESERVED writer across the candidate "
        "scan with the process write lock free -- an independent connection "
        "could not commit. Every concurrent short writer that takes the lock "
        "and then reaches SQLite now waits out busy_timeout (30s in production) "
        "and dies 'database is locked' while holding the lock, which in turn "
        "blocks this session from committing and releasing RESERVED"
    )
