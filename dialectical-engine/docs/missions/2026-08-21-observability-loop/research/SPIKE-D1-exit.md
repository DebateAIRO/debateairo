# SPIKE-D1 — Hatchet failed-run read contract

**Measured:** 2026-09-08
**Source base:** `7a9765efad4d639ac042179f626573f49efc9784`
**Verdict:** `KILL`
**Live acceptance:** `SKIP_NO_APPROVED_READ_TOKEN`
**Policy slot:** leave `hatchet_ingest` unset; the custodian may record
`DEFERRED_TO_MISSION`. This report does not mutate the policy bundle or claim
RP-2.

## Bounded read-only evidence

| Question | Evidence | Result |
| --- | --- | --- |
| Retention window | `compose.dev.yaml` pins Hatchet Lite but declares no retention setting. No approved read token was available to query an old run. | `UNMEASURED` |
| `runs.list` pagination bounds | The installed Hatchet 1.28.1 REST contract exposes secured `GET /api/v1/tenants/{tenant}/workflows/runs` with integer `offset`/`limit`, status filters, created/finished time bounds, ordering, and a response carrying `current_page`, `next_page`, and `num_pages`. The local contract does not declare server maxima. | `BOUNDABLE_BY_CLIENT_CAP`; server maximum `UNMEASURED` |
| Read-scope token obtainability | Compose contains no ingest token. `dev-hatchet-token.ts` can mint `debateai-local-auth` and attests tenant/workflow access, but it neither requests nor proves a read-only scope. `HATCHET_INGEST_READ_TOKEN` and `HATCHET_INGEST_API_URL` were absent, and no repository-local development token file existed. No token was minted or reused. | `NO_APPROVED_READ_TOKEN` |
| Backlog / heartbeat semantics | The installed SDK has worker heartbeat behavior and failed/cancelled run states, while the run-list contract exposes run records rather than an infrastructure-health contract. Backlog and worker heartbeat remain ObservationAgent-owned and are not accepted as FIX-15 failure records. | `BOUNDARY_CONFIRMED`; live semantics `UNMEASURED` |
| Attempt identity stability | The run-list model exposes stable workflow-run UUID metadata but no run-level attempt. Task summaries expose `attempt`/`retryCount`; durable tasks expose monotonically increasing `invocationCount`. Without an approved read token and repeated live responses, the failed-task attempt selected for `hatchet:<runId>:<attempt>` cannot be proven stable. | `UNMEASURED` |

## Kill application

The frozen kill criterion “no read token” is met. SPIKE-D1 therefore does not
PASS and no live Hatchet request was made. Production dispatch and V’s six live
acceptance steps remain blocked on a custodian-provisioned read-only token,
retention measurement, pagination-cap measurement, and repeated-poll attempt
identity evidence.

Per the 2026-09-08 implementation assignment, fixture-backed local contract
work may continue after this KILL. That exception does not set RP-2, activate
the ingest, place Hatchet on a capture path, or convert skipped live evidence
into acceptance.
