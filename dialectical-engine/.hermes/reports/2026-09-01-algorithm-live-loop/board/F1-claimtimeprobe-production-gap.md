# [unassigned] F1 · claimTimeProbe production gap — carried from T14a-G4

Finding class: carried-forward gap (never a silent residual — protocol §2.2).
Source: T14a evidence report N2/G4 (agent-reports/t14a-evidence.md:216-227, 306-312).

WHAT: `claimTimeProbe` is declared optional at apps/runner/src/index.ts:824 (DR-182 VROW-5)
and supplied in product code only by acceptance/main.ts:519. Production (apps/runner/src/main.ts)
performs no claim-time liveness / model-identity re-check; CLAIM_MODEL_IDENTITY_CHANGED
(index.ts:1377-1381) is unreachable in production.

WHY IT IS NOT T14b: Gate 2's condition ("broken only if the deployment seals non-dev rows")
never governed this gap — it is independent of provenance sealing. T14b is not authorized
(T14a gates), and this mission's Scope law does not cover new production wiring beyond T14b.

DISPOSITION: V DECISIONS PACKET row at mission closure — V decides whether it becomes a task
in a future mission or is accepted as a recorded limitation. CONFIRMED by judge at T14a lane
close (T14a-G4 in mission DECISIONS.md; codex r3 APPROVE; independent of any Gate 2 answer).

status: waiting_human (V) · escalation_target: v_packet · created 2026-09-01
