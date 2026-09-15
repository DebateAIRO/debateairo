# [unassigned] F21 · evaluator-addon-database + evaluator-consumer-database: environmental DB-timeout flakes (T2 F-T2-7)

Source: T2 report/close. Both tests failed in T2's after-run with `timeout exceeded when
trying to connect`, contain no web/ reference, and pass 2/2 in isolation — environmental,
load-coupled, ABSENT from T0's flake union (this lane is first to record them).
IMPACT: same class as F13 — a future round can go red for reasons no diff explains.
DISPOSITION: V DECISIONS PACKET row at closure (test hardening out of scope); named so the
class is never absorbed as a lane failure. D15 batch suites run on a quiet host, which
mitigates.
status: waiting_human (V) · escalation_target: v_packet · created 2026-09-01
