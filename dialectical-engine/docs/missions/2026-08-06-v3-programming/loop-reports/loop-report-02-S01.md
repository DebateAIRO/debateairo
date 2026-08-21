# Loop report 02 — S01 · Ledger and replay hardening (2026-08-08 morning)

Per DR-123 clause 4. Compare loop-report-01-S00.

## Wall-clock accounting

| Phase | Window (EEST) | Duration |
|---|---|---|
| Codex claims (ITSELF, via board access) | 08:58 | — |
| TDD RED captured | 09:05 | 7m in |
| Build → submitted to review | ~09:20 | ~22m build |
| Orchestrator DB gate round 1 → real finding (append-only trigger vs S00 UPDATE path) | 09:25 → blocked | 5m |
| Codex self-pickup via poll → fix → resubmit | 09:27 → 09:31 | 4m |
| Gate round 2 → second real finding (stale-claim/test pollution) | 09:31 → blocked 09:32 | 1m |
| Codex self-pickup → fix → resubmit | → ~09:37 | ~5m |
| Gate round 3 → 62/62 GREEN | 09:39 | 2m |
| Diamond (Opus + Grok parallel) → DUAL APPROVED, 0 blocking | 09:40 → ~09:55 | ~15m |
| **Total cycle** | **08:58 → 09:55** | **~57 minutes** |

**S00 took a night; S01 took under an hour.** The delta is the loop maturing:
environment solved, board autonomy live, gate-before-diamond standing, thin
directed findings, no wedges.

## What the gates caught (all real, none noise)

1. Gate r1: S01's new immutability trigger rejected an S00-era
   `UPDATE ledger_entry.outcome` — latent S00 defect exposed by S01's own
   hardening; fixed as append-under-later-sequence, verified truthful by both
   reviewers.
2. Gate r2: claim test picked a stale item — root cause was fixture
   pollution, fixed hermetically with ADR-0017 law untouched (reviewer-
   verified unchanged claimNext SQL).
3. Diamond: 0 blocking, 14 non-blocking hygiene items carried (reviews/
   s01-*-rev1.md) — including one item FOR V (FX-WIRE-02 pagination limit
   needs a DR-023 register value or an explicit S1-tail row).

## Loop deltas adopted this cycle

- Watcher v3: persistent comment cursor (no re-firing on stale comments
  across restarts); orchestrator-authored comments excluded from triggers.
- Standing gate order proven: submit → outside-sandbox DB gate (rounds until
  green) → diamond. Diamonds only ever see green suites → rev-1 approvals
  become achievable (S01 got dual approval on rev 1; S00 needed two revs).
- Codex board autonomy verified end-to-end: self-claim, milestone comments,
  self-resubmit, poll-driven fix pickup — zero manual re-dispatches during
  the whole cycle.

## Known inefficiencies remaining

1. A ~16s race: Codex resubmitted while my gate round was already running
   (harmless — the gate re-blocks with the newer finding — but it produced
   one confusing comment interleave). Mitigation not worth complexity yet.
2. Watcher restarts are manual after each firing; a supervisor loop could
   re-arm it automatically (accepted cost: one orchestrator action per event).
3. The orchestrator DB gate is serial with Codex's poll window; if the gate
   is slow the worker session may exhaust its 6 polls and exit (AWAITING
   DIAMOND) — fine, but a fresh dispatch is then needed for the next ticket.

## Next cycle (S02 · Graph and the cycle law)

S02 promoted to ready per DR-123. Dispatch is thin: the standing protocol
file + "poll and claim." Watch items: migration idempotency hygiene (finding
5) and the P13 scheduler mirror (finding 3) intersect S02/S03 scope.
