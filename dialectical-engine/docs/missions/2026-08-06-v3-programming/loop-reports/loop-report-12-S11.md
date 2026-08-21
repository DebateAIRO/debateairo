# Loop report 12 — S11 · Staleness and liveness (2026-08-08 night)

## Wall-clock accounting

| Phase | Duration |
|---|---|
| Continuous session claims + builds S11 | ~fast |
| Gate r1: 260/261 — archival assertion empty | 3m |
| Rework: root-caused to a latent S04 model_version defect + made retirement QUERY-event-gated | ~8m |
| Gate r2: 261/261 GREEN | 2m |
| Diamond rev 1: dual APPROVED, 0 blocking (Opus ran real-DB first-hand) | ~30m |
| **Total cycle** | **~45 minutes** |

## The headline: a deep-organ bug surfaced by building the organ

The gate failure looked like staleness timing but root-caused to a LATENT
S04 provenance defect: the provider RESPONSE request-id had been persisted as
model_version since S04 (an S04 Opus non-blocking finding, #17), so 5 model
calls appeared as 4 version changes — and S11's brand-new liveness observer
CORRECTLY fired a staleness trigger on the spurious churn. S11 exists to watch
version identity; building it made a previously-invisible bug visible. Codex
fixed the real root (model_version = response.model in persistence AND return,
with a real RED) rather than silencing the observer, and hardened retirement
to require a recorded QUERY event (no wall-clock/caller-content fallback).

This is the second time a later organ exposed an earlier defect (S02's
immutability triggers caught the S00-era ledger UPDATE at S01; now S11's
liveness observer caught the S04 model_version mislabel). The append-only /
event-derived architecture makes latent defects surface as the system grows,
rather than hide.

## Guardrails holding

The S10 reachability-derived attachment held: S11 surfaces labeled by the
walker, hand-authored ATTACHED literals banned. All three killed classes
(migration-idempotency, stale-ledger, attachment-honesty) stayed dead.

## Cadence

S01 57m · S02 53m · S03 2h15m · S04 2h55m · S05 5.5h · S06 1h40m · S07 1h45m
· S08 30m · S09 40m · S10 1h50m · S11 45m. Board: 30 done, 4 to go
(S12-S15). Six live V rulings stand.

## Next: S12 · Settlement and scorecards (+ DR-089 standing watch)

Notes on the ticket: first-settled-wins with loser recorded as superseded
(ADR-0017 case F); scorecards derived (never mutated authority); the DR-089
standing watch; append-only settlement.
