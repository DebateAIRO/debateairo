# Loop report 11 — S10 · Value overlay (2026-08-08 night)

## Wall-clock accounting

| Phase | Duration |
|---|---|
| Continuous session claims + builds S10 | ~fast |
| Gate r1: 249/250 — test-fixture root-node bug (graph invariant correct) | 3m |
| Rework: fixture fix (invariant untouched) → gate 250/250 | ~8m |
| Diamond rev 1: SPLIT — Grok APPROVED / Claude 1 BLOCKING (S07 honesty class recurs: value surface falsely ATTACHED via dead executeValueOverlay) | ~40m |
| Rework: instance fix (option b) + CLASS FIX (reachability-derived attachment) | ~22m |
| Gate: 252/252 GREEN (class fix caught+fixed a stale S06 over-claim too) | 2m |
| Diamond rev 2: dual APPROVED (class fix verified real teeth) | ~30m |
| **Total cycle** | **~1h50m** |

## The headline: the third defect class killed

The attachment-honesty class (false ATTACHED in the orphan-audit) recurred
S07 -> S10. Root fix: attachment is no longer a hand-authored literal — it is
DERIVED from a live reachability walk seeded from the three production entry
files (apps/{api,runner,scheduler}), hand-authored ATTACHED literals are BANNED
in audit:source (lint), and independent reachability oracles in scaffold.test
mean a false ATTACHED fails in-sandbox before submission. It immediately caught
a stale S06 over-claim on landing — the strongest evidence it works.

This is the 3rd class killed by a systemic fix rather than a per-instance
patch: migration-idempotency (-> migration-replay lint), stale-ledger-array
(-> self-updating glob test), attachment-honesty (-> reachability-derived
attachment). Each ends a recurring finding permanently.

## Diamond value, again

Grok approved rev-1 assuming the runner wired the value surface; the Opus
lens's full-tree grep DISPROVED it (executeValueOverlay reachable by nothing).
One lens's reasonable assumption, the other's verification — the exact case
for two independent lenses. (S06 diamond was the mirror: Claude approved,
Grok caught the cannot-score hole.)

## Cadence

S01 57m · S02 53m · S03 2h15m · S04 2h55m · S05 5.5h · S06 1h40m · S07 1h45m
· S08 30m · S09 40m · S10 1h50m. Board: 29 done, 5 to go (S11-S15).

## Next: S11 · Staleness and liveness

Notes on the ticket: staleness = derived/projected over events (no mutated
flag); liveness reads the event stream; thresholds register-supplied;
eviction/stale-marking APPENDS a typed event. The attachment guardrail is now
machine-enforced — the honesty class cannot recur.
